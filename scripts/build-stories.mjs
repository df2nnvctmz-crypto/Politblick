#!/usr/bin/env node
/**
 * Builds the "Sitzungswochen-Briefing": one detail page per sitting week, plus a compact index.
 * Derived entirely from the committed snapshots (polls, poll-results, party-donations,
 * lobby-links). No network.
 *
 * A *Sitzungswoche* here is an ISO calendar week (keyed by its Monday) in which at least one
 * roll-call vote took place — read straight off polls.json, not a hand-kept sitting calendar.
 *
 * Donations are partitioned across the weeks by publication date: week i owns every donation
 * published in [Monday(i), Monday(i+1)), and the most recent week owns everything from its
 * Monday onward. Nothing published between two sitting weeks is lost — it lands in the next
 * week. Donations published before the term's first sitting week belong to no week.
 *
 * HARD RULE, inherited from build-vote-history-summary.mjs: this file writes NO prose. The
 * briefing sentences are templates with number slots in src/data.ts (TRANSLATIONS, the
 * "SITZUNGSWOCHE" block) — the value of the page is that every number is checkable against a
 * source. This file emits numbers, ids and labels that are themselves data.
 *
 * IMPORTANT — the divergence rule (a member voting against their own fraction's majority) is
 * owned by src/polls.ts (computeDivergences). It is restated here in Node.
 * scripts/verify-stories.mjs recomputes every week from the raw inputs, sharing no code with
 * this file, and fails the build on any disagreement.
 *
 * generatedAt is inherited from the input snapshots — identical inputs produce byte-identical
 * output, so a rebuild of unchanged data is an empty diff.
 *
 * Output:
 *   public/data/stories.json          — compact index of every sitting week, newest first.
 *                                        Rides in the blocking snapshot; powers the landing-page
 *                                        tiles and the "Briefing anzeigen" buttons on /abstimmungen.
 *   public/data/stories/<montag>.json  — the full briefing for one week; lazy-loaded by its page.
 */
import { pathToFileURL } from 'node:url';
import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from './lib/common.mjs';

const NO_FRACTION = 'Fraktionslos';
const STORIES_DIR = 'stories';

export function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dayIndex = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayIndex);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO-8601 week number of a date (the week containing its Thursday). */
function isoWeekNumber(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return 1 + Math.round((d - firstThursday) / (7 * 86400000));
}

function roundCents(euro) {
  return Math.round(euro * 100) / 100;
}

/** CDU and CSU file separately and stay apart; the Greens' and Left's registered names read awkwardly next to the fraction labels used elsewhere. */
function cleanPartyLabel(party) {
  if (/gr[üu]ne/i.test(party)) return 'Grüne';
  if (/^die linke$/i.test(party)) return 'Linke';
  return party;
}

function donationDate(d) {
  return d.publishedOn || d.receivedOn;
}

function monthsBetween(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / (1000 * 60 * 60 * 24 * 30.44));
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Restates src/polls.ts's computeDivergences: skip non-voters and Fraktionslos, compare against the fraction's stored majority. */
function divergenceCount(result) {
  let n = 0;
  for (const v of result.votes) {
    if (v.vote === 'no_show' || v.party === NO_FRACTION) continue;
    const tally = result.partyBreakdown.find((p) => p.party === v.party);
    if (!tally || !tally.majority) continue;
    if (v.vote !== tally.majority) n++;
  }
  return n;
}

/** Fraktionsgeschlossenheit across a set of polls: per fraction, the share of cast votes that went with the fraction majority. */
function weekCohesion(results) {
  const acc = new Map();
  for (const r of results) {
    for (const pb of r.partyBreakdown) {
      if (pb.party === NO_FRACTION || !pb.majority) continue;
      const cast = pb.yes + pb.no + pb.abstain;
      if (cast === 0) continue;
      const withMajority = pb.majority === 'yes' ? pb.yes : pb.majority === 'no' ? pb.no : pb.abstain;
      const entry = acc.get(pb.party) ?? { party: pb.party, color: pb.color, cast: 0, withMajority: 0 };
      entry.cast += cast;
      entry.withMajority += withMajority;
      acc.set(pb.party, entry);
    }
  }
  return [...acc.values()]
    .map((e) => ({ ...e, pct: Math.round((e.withMajority / e.cast) * 1000) / 10 }))
    .sort((a, b) => b.pct - a.pct || a.party.localeCompare(b.party, 'de'));
}

function weekAbsence(results) {
  let total = 0;
  const byParty = new Map();
  for (const r of results) {
    total += r.totalNoShow;
    for (const pb of r.partyBreakdown) {
      if (pb.noShow === 0) continue;
      const e = byParty.get(pb.party) ?? { party: pb.party, color: pb.color, noShow: 0 };
      e.noShow += pb.noShow;
      byParty.set(pb.party, e);
    }
  }
  const list = [...byParty.values()].sort((a, b) => b.noShow - a.noShow);
  return { total, byParty: list, topParty: list[0] ?? null };
}

function weekTopics(polls) {
  const counts = new Map();
  for (const p of polls) {
    for (const label of p.topics?.length ? p.topics : p.topic ? [p.topic] : []) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
    .map(([label, count]) => ({ label, count }));
}

export function buildStories({ polls, pollResults, donations, lobbyLinks, sourceGeneratedAt }) {
  const weeks = new Map();
  for (const poll of polls) {
    const key = mondayOf(poll.date);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(poll);
  }
  const weekKeys = [...weeks.keys()].sort();

  const partiesByDonor = new Map();
  for (const d of donations) {
    if (!d.donor) continue;
    const set = partiesByDonor.get(d.donor) ?? new Set();
    set.add(d.party);
    partiesByDonor.set(d.donor, set);
  }
  const donationsByParty = new Map();
  for (const d of [...donations].sort((a, b) => (donationDate(a) ?? '').localeCompare(donationDate(b) ?? ''))) {
    const list = donationsByParty.get(d.party) ?? [];
    list.push(d);
    donationsByParty.set(d.party, list);
  }

  const sittingFractions = new Set();
  for (const r of pollResults.values()) {
    for (const pb of r.partyBreakdown) if (pb.party !== NO_FRACTION) sittingFractions.add(pb.party);
  }
  const latestYear = Math.max(...donations.map((d) => d.year));

  const pollLobbying = lobbyLinks?.pollLobbying ?? {};
  const conflicts = lobbyLinks?.conflicts ?? [];
  const orgsById = lobbyLinks?.orgs ?? {};

  const issues = weekKeys.map((weekKey, i) => {
    const weekPolls = [...weeks.get(weekKey)].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const results = weekPolls.map((p) => pollResults.get(p.id)).filter(Boolean);
    const isLast = i === weekKeys.length - 1;
    const donationHi = isLast ? '9999-12-31' : weekKeys[i + 1];

    const pollBlocks = weekPolls.map((poll) => {
      const r = pollResults.get(poll.id);
      const orgIds = [...new Set((pollLobbying[String(poll.id)] ?? []).map((e) => e.orgId))];
      return {
        id: poll.id,
        slug: `${poll.id}-${slugify(poll.title)}`,
        title: poll.title,
        date: poll.date,
        topic: poll.topic,
        accepted: poll.accepted,
        totals: r ? { yes: r.totalYes, no: r.totalNo, abstain: r.totalAbstain, noShow: r.totalNoShow } : { yes: 0, no: 0, abstain: 0, noShow: 0 },
        // Per-fraction breakdown, shown when a poll row is expanded — same shape as poll-results.json.
        partyBreakdown: r
          ? r.partyBreakdown.map((pb) => ({ party: pb.party, color: pb.color, yes: pb.yes, no: pb.no, abstain: pb.abstain, noShow: pb.noShow, majority: pb.majority }))
          : [],
        divergingCount: r ? divergenceCount(r) : 0,
        lobbyingOrgCount: orgIds.length,
        // The first three registered organisations that reported lobbying on this bill — the rest is on the bill page.
        lobbyingOrgs: orgIds.slice(0, 3).map((id) => ({ id, name: orgsById[id]?.name ?? id })),
        conflictCount: conflicts.filter((c) => c.pollId === poll.id).length,
      };
    });
    const divergingTotal = pollBlocks.reduce((n, p) => n + p.divergingCount, 0);
    const mostDivergent = [...pollBlocks].filter((p) => p.divergingCount > 0).sort((a, b) => b.divergingCount - a.divergingCount)[0] ?? null;

    let closest = null;
    if (results.length > 1) {
      const c = [...results].sort((a, b) => Math.abs(a.totalYes - a.totalNo) - Math.abs(b.totalYes - b.totalNo))[0];
      closest = { id: c.poll.id, slug: `${c.poll.id}-${slugify(c.poll.title)}`, title: c.poll.title, margin: Math.abs(c.totalYes - c.totalNo), yes: c.totalYes, no: c.totalNo };
    }

    const cohesion = weekCohesion(results);
    const cohesionRange = cohesion.length ? { top: cohesion[0], bottom: cohesion[cohesion.length - 1] } : null;

    const issueDonations = donations
      .filter((d) => {
        const when = donationDate(d);
        return when && when >= weekKey && when < donationHi;
      })
      .sort((a, b) => b.amountEuro - a.amountEuro || (donationDate(a) ?? '').localeCompare(donationDate(b) ?? ''));

    const donationRows = issueDonations.map((d) => {
      const alsoParties = [...new Set([...(partiesByDonor.get(d.donor) ?? new Set())].filter((p) => p !== d.party).map(cleanPartyLabel))].sort();
      const history = donationsByParty.get(d.party) ?? [];
      const idx = history.indexOf(d);
      const earlier = history.slice(0, idx);
      const lastAsLarge = [...earlier].reverse().find((h) => h.amountEuro >= d.amountEuro);
      let largestSince = null;
      if (earlier.length > 0) {
        if (!lastAsLarge) {
          const months = monthsBetween(donationDate(earlier[0]), donationDate(d));
          if (months >= 6) largestSince = { party: cleanPartyLabel(d.party), allTime: true };
        } else {
          const months = monthsBetween(donationDate(lastAsLarge), donationDate(d));
          if (months >= 3) largestSince = { party: cleanPartyLabel(d.party), allTime: false, months };
        }
      }
      return {
        amountEuro: d.amountEuro,
        party: cleanPartyLabel(d.party),
        // The fraction the party belongs to — the key its donations page is routed by. Non-sitting
        // parties (SSW, Volt, …) keep their own name and simply won't be linked in the frontend.
        fraction: d.fraction,
        donor: d.donor,
        donorCity: d.donorCity,
        receivedOn: d.receivedOn,
        publishedOn: d.publishedOn,
        alsoGivesToParties: alsoParties,
        largestSince,
      };
    });

    let multiPartyDonor = null;
    const byIssueDonor = new Map();
    for (const d of issueDonations) {
      if (!d.donor) continue;
      const set = byIssueDonor.get(d.donor) ?? new Set();
      set.add(cleanPartyLabel(d.party));
      byIssueDonor.set(d.donor, set);
    }
    for (const [donor, set] of byIssueDonor) {
      if (set.size > 1) {
        multiPartyDonor = { donor, parties: [...set].sort() };
        break;
      }
    }

    const ytd = new Map();
    for (const d of donations) {
      if (d.year !== latestYear || !sittingFractions.has(d.fraction)) continue;
      const when = donationDate(d);
      if (!when || when >= donationHi) continue;
      const e = ytd.get(d.fraction) ?? { fraction: d.fraction, sumEuro: 0, count: 0 };
      e.sumEuro += d.amountEuro;
      e.count += 1;
      ytd.set(d.fraction, e);
    }
    const donationYearToDate = [...ytd.values()].map((e) => ({ ...e, sumEuro: roundCents(e.sumEuro), year: latestYear })).sort((a, b) => b.sumEuro - a.sumEuro);

    return {
      week: weekKey,
      generatedAt: sourceGeneratedAt,
      // 1-based, oldest sitting week of the term is No. 1 — the briefing reads as a numbered series.
      number: i + 1,
      isoWeek: isoWeekNumber(weekKey),
      dateRange: { start: weekKey, end: addDays(weekKey, 6) },
      prevWeek: weekKeys[i - 1] ?? null,
      nextWeek: weekKeys[i + 1] ?? null,
      pollCount: weekPolls.length,
      polls: pollBlocks,
      divergingTotal,
      mostDivergent: mostDivergent
        ? { id: mostDivergent.id, slug: mostDivergent.slug, title: mostDivergent.title, divergingCount: mostDivergent.divergingCount }
        : null,
      closest,
      cohesion: cohesionRange,
      cohesionAll: cohesion,
      absence: weekAbsence(results),
      donations: {
        count: issueDonations.length,
        sumEuro: roundCents(issueDonations.reduce((s, d) => s + d.amountEuro, 0)),
        largest: donationRows[0] ?? null,
        multiPartyDonor,
        all: donationRows,
      },
      donationYearToDate,
      ytdLeader: donationYearToDate[0] ?? null,
      topics: weekTopics(weekPolls),
    };
  });

  issues.sort((a, b) => b.week.localeCompare(a.week));

  const index = {
    generatedAt: sourceGeneratedAt,
    issues: issues.map((s) => {
      // The closest vote of the week — the sole vote when there was only one.
      const closest =
        s.closest ??
        (s.polls[0]
          ? {
              id: s.polls[0].id,
              slug: s.polls[0].slug,
              title: s.polls[0].title,
              margin: Math.abs(s.polls[0].totals.yes - s.polls[0].totals.no),
              yes: s.polls[0].totals.yes,
              no: s.polls[0].totals.no,
            }
          : null);
      return {
        week: s.week,
        dateRange: s.dateRange,
        pollCount: s.pollCount,
        acceptedCount: s.polls.filter((p) => p.accepted).length,
        divergingTotal: s.divergingTotal,
        donationCount: s.donations.count,
        donationSumEuro: s.donations.sumEuro,
        // Just the four totals per vote — enough for a stacked band strip on the landing page.
        pollTotals: s.polls.map((p) => p.totals),
        closest,
        topics: s.topics.slice(0, 3).map((x) => x.label),
        headline: s.mostDivergent
          ? { id: s.mostDivergent.id, slug: s.mostDivergent.slug, title: s.mostDivergent.title }
          : closest
            ? { id: closest.id, slug: closest.slug, title: closest.title }
            : null,
      };
    }),
  };

  return { issues, index };
}

async function main() {
  const [pollsRaw, pollResultsRaw, donations, lobbyLinks, meta] = await Promise.all([
    readJsonFile('polls.json', null),
    readJsonFile('poll-results.json', null),
    readJsonFile('party-donations.json', []),
    readJsonFile('lobby-links.json', null),
    readJsonFile('meta.json', {}),
  ]);

  if (!Array.isArray(pollsRaw) || pollsRaw.length === 0) {
    console.log('No polls.json — nothing to build.');
    return;
  }
  if (!pollResultsRaw || typeof pollResultsRaw !== 'object') {
    throw new Error('public/data/poll-results.json is missing or malformed — run scripts/fetch-core.mjs first');
  }

  const polls = [...pollsRaw].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const pollResults = new Map();
  for (const [idStr, raw] of Object.entries(pollResultsRaw)) {
    const poll = polls.find((p) => p.id === Number(idStr));
    if (poll) pollResults.set(poll.id, { poll, ...raw });
  }

  const sourceGeneratedAt =
    [meta.coreGeneratedAt, meta.partyDonationsGeneratedAt, lobbyLinks?.generatedAt].filter(Boolean).sort().at(-1) ?? null;

  const { issues, index } = buildStories({ polls, pollResults, donations, lobbyLinks, sourceGeneratedAt });

  const dir = path.join('public', 'data', STORIES_DIR);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const issue of issues) await writeJsonFile(`${STORIES_DIR}/${issue.week}.json`, issue);
  await writeJsonFile('stories.json', index);

  const empty = issues.filter((s) => s.pollCount === 0);
  console.log(`${issues.length} Sitzungswochen (${issues.at(-1)?.week} … ${issues[0]?.week})`);
  console.log(`  ${issues.reduce((n, s) => n + s.pollCount, 0)} Abstimmungen, ${issues.reduce((n, s) => n + s.donations.count, 0)} Spenden zugeordnet`);
  if (empty.length) throw new Error(`${empty.length} week(s) have no polls — a Sitzungswoche is defined by having at least one`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
