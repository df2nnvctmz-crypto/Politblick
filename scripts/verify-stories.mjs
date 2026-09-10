#!/usr/bin/env node
/**
 * Checks public/data/stories.json + stories/*.json against a from-scratch recount of the raw
 * inputs.
 *
 * build-stories.mjs restates the divergence rule that src/polls.ts owns and partitions the
 * donations across the weeks by hand — the kind of logic that looks right whether it is or not.
 * This shares no code with the builder: it re-tallies every poll's fraction majorities straight
 * from poll-results.json's vote rows and re-buckets every donation from party-donations.json,
 * then fails the build (exit non-zero) on any disagreement.
 *
 * Exits 0 when there is no polls.json, so a data-less checkout never blocks a deploy.
 *
 * Run after touching build-stories.mjs, the poll-results format, or computeDivergences().
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { readJsonFile } from './lib/common.mjs';

const NO_FRACTION = 'Fraktionslos';
const STORIES_DIR = path.join('public', 'data', 'stories');

function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dayIndex = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayIndex);
  return d.toISOString().slice(0, 10);
}

/** Independent copy of the majority rule — deliberately not imported. */
function majorityOf(yes, no, abstain) {
  if (yes === 0 && no === 0 && abstain === 0) return null;
  if (yes >= no && yes >= abstain) return 'yes';
  if (no >= yes && no >= abstain) return 'no';
  return 'abstain';
}

function recount(result) {
  const tallies = new Map();
  for (const v of result.votes) {
    if (v.party === NO_FRACTION) continue;
    const t = tallies.get(v.party) ?? { yes: 0, no: 0, abstain: 0 };
    if (v.vote === 'yes') t.yes++;
    else if (v.vote === 'no') t.no++;
    else if (v.vote === 'abstain') t.abstain++;
    tallies.set(v.party, t);
  }
  const majorities = new Map();
  for (const [party, t] of tallies) majorities.set(party, majorityOf(t.yes, t.no, t.abstain));
  let diverging = 0;
  for (const v of result.votes) {
    if (v.vote === 'no_show' || v.party === NO_FRACTION) continue;
    const m = majorities.get(v.party);
    if (m && v.vote !== m) diverging++;
  }
  const cohesion = new Map();
  for (const [party, t] of tallies) {
    const m = majorities.get(party);
    if (!m) continue;
    const cast = t.yes + t.no + t.abstain;
    if (cast === 0) continue;
    cohesion.set(party, { cast, withMajority: m === 'yes' ? t.yes : m === 'no' ? t.no : t.abstain });
  }
  return { diverging, cohesion };
}

const donationDate = (d) => d.publishedOn || d.receivedOn;

const fail = [];
const check = (cond, msg) => {
  if (!cond) fail.push(msg);
};

const polls = await readJsonFile('polls.json', null);
if (!Array.isArray(polls) || polls.length === 0) {
  console.log('No polls.json — nothing to verify.');
  process.exit(0);
}

const [pollResultsRaw, donations, lobbyLinks, meta] = await Promise.all([
  readJsonFile('poll-results.json', {}),
  readJsonFile('party-donations.json', []),
  readJsonFile('lobby-links.json', null),
  readJsonFile('meta.json', {}),
]);

const index = await readJsonFile('stories.json', null);
if (!index?.issues?.length) {
  console.error('polls.json exists but public/data/stories.json is missing or empty.');
  console.error('Run: node scripts/build-stories.mjs');
  process.exit(1);
}

let files;
try {
  files = (await readdir(STORIES_DIR)).filter((f) => f.endsWith('.json'));
} catch {
  console.error('polls.json exists but public/data/stories/ is missing.');
  process.exit(1);
}

const weekKeys = [...new Set(polls.map((p) => mondayOf(p.date)))].sort();
const expectedGeneratedAt =
  [meta.coreGeneratedAt, meta.partyDonationsGeneratedAt, lobbyLinks?.generatedAt].filter(Boolean).sort().at(-1) ?? null;

check(index.generatedAt === expectedGeneratedAt, `stories.json generatedAt ${index.generatedAt} != inherited ${expectedGeneratedAt} (stale build)`);
check(files.length === weekKeys.length, `${files.length} detail files, expected ${weekKeys.length} sitting weeks`);
check(
  JSON.stringify(index.issues.map((s) => s.week)) === JSON.stringify([...weekKeys].reverse()),
  `index weeks do not match the sitting weeks newest-first`,
);

for (let i = 0; i < weekKeys.length; i++) {
  const weekKey = weekKeys[i];
  const w = `[${weekKey}]`;
  const issue = await readJsonFile(`stories/${weekKey}.json`, null);
  if (!issue) {
    fail.push(`${w} detail file missing`);
    continue;
  }
  const idx = index.issues.find((s) => s.week === weekKey);

  check(issue.generatedAt === expectedGeneratedAt, `${w} generatedAt ${issue.generatedAt} != inherited ${expectedGeneratedAt}`);

  const weekPolls = polls.filter((p) => mondayOf(p.date) === weekKey);
  const expectedIds = weekPolls.map((p) => p.id).sort((a, b) => a - b);
  check(JSON.stringify(issue.polls.map((p) => p.id).sort((a, b) => a - b)) === JSON.stringify(expectedIds), `${w} poll set != ${expectedIds}`);
  check(issue.pollCount === expectedIds.length && idx?.pollCount === expectedIds.length, `${w} pollCount drift`);
  check(issue.polls.length > 0, `${w} no polls`);

  // Landing-page index carries a compact copy of each week's numbers.
  const acceptedRecount = weekPolls.filter((p) => p.accepted).length;
  check(idx?.acceptedCount === acceptedRecount, `${w} index acceptedCount ${idx?.acceptedCount} != ${acceptedRecount}`);
  check(
    JSON.stringify(idx?.pollTotals) === JSON.stringify(issue.polls.map((p) => p.totals)),
    `${w} index pollTotals != the detail file's poll totals`,
  );
  check(
    JSON.stringify(idx?.closest ?? null) === JSON.stringify(issue.closest ?? (issue.polls.length === 1 ? { id: issue.polls[0].id, slug: issue.polls[0].slug, title: issue.polls[0].title, margin: Math.abs(issue.polls[0].totals.yes - issue.polls[0].totals.no), yes: issue.polls[0].totals.yes, no: issue.polls[0].totals.no } : null)),
    `${w} index closest mismatch`,
  );

  let divergingTotal = 0;
  let maxDiv = 0;
  const cohAcc = new Map();
  for (const pb of issue.polls) {
    const raw = pollResultsRaw[String(pb.id)];
    if (!raw) {
      fail.push(`${w} poll ${pb.id} missing from poll-results.json`);
      continue;
    }
    const { diverging, cohesion } = recount(raw);
    check(pb.divergingCount === diverging, `${w} poll ${pb.id} divergingCount ${pb.divergingCount} != recount ${diverging}`);
    check(
      pb.totals.yes === raw.totalYes && pb.totals.no === raw.totalNo && pb.totals.abstain === raw.totalAbstain && pb.totals.noShow === raw.totalNoShow,
      `${w} poll ${pb.id} totals != raw`,
    );
    const src = polls.find((p) => p.id === pb.id);
    check(src && pb.title === src.title && pb.accepted === src.accepted && pb.date === src.date, `${w} poll ${pb.id} title/date/accepted drift`);
    // Party breakdown is copied straight from poll-results.json — check it round-trips.
    check(
      JSON.stringify(pb.partyBreakdown) === JSON.stringify(raw.partyBreakdown),
      `${w} poll ${pb.id} partyBreakdown != poll-results.json`,
    );
    check(pb.lobbyingOrgs.length <= 3 && pb.lobbyingOrgs.length <= pb.lobbyingOrgCount, `${w} poll ${pb.id} lobbyingOrgs list inconsistent with count`);
    divergingTotal += diverging;
    maxDiv = Math.max(maxDiv, diverging);
    for (const [party, c] of cohesion) {
      const e = cohAcc.get(party) ?? { cast: 0, withMajority: 0 };
      e.cast += c.cast;
      e.withMajority += c.withMajority;
      cohAcc.set(party, e);
    }
  }
  check(issue.divergingTotal === divergingTotal && idx?.divergingTotal === divergingTotal, `${w} divergingTotal ${issue.divergingTotal} != recount ${divergingTotal}`);
  if (issue.mostDivergent) check(issue.mostDivergent.divergingCount === maxDiv && maxDiv > 0, `${w} mostDivergent ${issue.mostDivergent.divergingCount} != max ${maxDiv}`);
  else check(maxDiv === 0, `${w} no mostDivergent but a poll had ${maxDiv}`);

  if (issue.cohesion && cohAcc.size) {
    const pcts = [...cohAcc.values()].map((e) => Math.round((e.withMajority / e.cast) * 1000) / 10);
    check(Math.abs(issue.cohesion.top.pct - Math.max(...pcts)) < 1e-9, `${w} cohesion top ${issue.cohesion.top.pct} != recount max ${Math.max(...pcts)}`);
    check(Math.abs(issue.cohesion.bottom.pct - Math.min(...pcts)) < 1e-9, `${w} cohesion bottom ${issue.cohesion.bottom.pct} != recount min ${Math.min(...pcts)}`);
  }

  if (issue.closest) {
    let realMin = Infinity;
    for (const pb of issue.polls) {
      const r = pollResultsRaw[String(pb.id)];
      realMin = Math.min(realMin, Math.abs(r.totalYes - r.totalNo));
    }
    check(issue.closest.margin === realMin, `${w} closest margin ${issue.closest.margin} != real min ${realMin}`);
  } else {
    check(issue.polls.length <= 1, `${w} no closest but ${issue.polls.length} polls`);
  }

  const hi = i + 1 < weekKeys.length ? weekKeys[i + 1] : '9999-12-31';
  const bucket = donations.filter((d) => {
    const when = donationDate(d);
    return when && when >= weekKey && when < hi;
  });
  check(issue.donations.count === bucket.length && issue.donations.all.length === bucket.length && idx?.donationCount === bucket.length, `${w} donation count ${issue.donations.count} != recount ${bucket.length}`);
  const expectedSum = Math.round(bucket.reduce((s, d) => s + d.amountEuro, 0) * 100) / 100;
  const listedSum = Math.round(issue.donations.all.reduce((s, d) => s + d.amountEuro, 0) * 100) / 100;
  check(issue.donations.sumEuro === expectedSum && listedSum === expectedSum && idx?.donationSumEuro === expectedSum, `${w} donation sum ${issue.donations.sumEuro} != recount ${expectedSum}`);
  if (issue.donations.largest) check(issue.donations.largest.amountEuro === Math.max(...bucket.map((d) => d.amountEuro)), `${w} largest donation != real max`);
  else check(bucket.length === 0, `${w} no largest but ${bucket.length} donations`);

  if (i > 0) check(issue.donations.count > 0, `${w} no donations, but only the term's first sitting week may be donation-less`);
}

console.log(`${weekKeys.length} weeks cross-checked against an independent recount of ${polls.length} polls and ${donations.length} donations`);
if (fail.length === 0) {
  console.log('OK — every week matches.');
} else {
  console.error(`${fail.length} MISMATCH(ES):`);
  for (const m of fail.slice(0, 20)) console.error(`  ${m}`);
  process.exit(1);
}
