#!/usr/bin/env node
/**
 * Builds the data behind the Datenstories (/datenstories/<slug>/): one small JSON per story,
 * joining curated, committed research files (data/datenstories/<slug>/*.json) with the live
 * snapshots. No network.
 *
 * Same HARD RULE as build-stories.mjs: this file writes NO prose. The story text is hand-written
 * and lives in the story definition (src/datenstories/<slug>/story.ts) as templates with number
 * slots; this file only emits numbers, ids and labels that are themselves data. That way a weekly
 * data update moves the numbers in text and chart together, and scripts/verify-datenstories.mjs
 * can tell when a sentence no longer holds.
 *
 * Stories:
 *   us-lobby    — overview treemap of US lobbying + revolving door
 *   us-gesetze  — Bundestag votes with US lobbyists + the sugar levy
 *
 * What is live and what is frozen:
 *   - Spending comes from lobby-directory.json, mandates and former officials from
 *     lobby-mandates.json, vote results from polls.json/poll-results.json and who lobbied on a
 *     vote from lobby-links.json — all live.
 *   - Which entries count as "US" is curated research (data/datenstories/us-lobby/us-parents.json),
 *     shared by both stories. New register entries with a US address are NOT added automatically;
 *     they are reported in `review.newUsSeatEntries` for a human to classify.
 *   - Who is named in the revolving-door chart and the sugar-levy camps are curated; the camps are
 *     a frozen finding (wording of the entries on 6.11.2026).
 *
 * generatedAt is inherited from the inputs, so a rebuild of unchanged data is an empty diff.
 *
 * Output: public/data/datenstories/<slug>.json — lazy-loaded by the story page. Each carries
 * `orgPaths`, every org page the story links to; build-sitemap.mjs prerenders them.
 */
import { pathToFileURL } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import { REAL_PARTY_COLORS, FALLBACK_PARTY_COLOR, readJsonFile, slugify, writeJsonFile } from './lib/common.mjs';

const GKV_POLL_ID = 6601;
const REGISTER_ENTRY_URL = (id) => `https://www.lobbyregister.bundestag.de/suche/${id}`;

async function readCurated(rel) {
  return JSON.parse(await readFile(new URL(`../data/datenstories/${rel}`, import.meta.url), 'utf-8'));
}

const mid = (o) => (o?.expensesEuro ? (o.expensesEuro.from + o.expensesEuro.to) / 2 : 0);
const roundEuro = (n) => Math.round(n * 100) / 100;
const newest = (...dates) => dates.filter(Boolean).sort().at(-1) ?? null;

/**
 * The politblick page of a register entry, in the exact form the app writes to the address bar
 * (App.tsx orgHref): orgs in lobby-links get id + name slug, directory-only orgs the bare id.
 * Null for entries not in the register at all (e.g. natural persons, inactive agencies).
 */
function orgPathFor(id, ctx) {
  if (!id) return null;
  const org = ctx.lobbyOrgs.get(id);
  if (org) return `/organisationen/${org.id}-${slugify(org.name)}`;
  return ctx.byId.has(id) ? `/organisationen/${id}` : null;
}

const collectOrgPaths = (paths) => [...new Set(paths.filter(Boolean))].sort();

/** Register entries by id from data/lobby-register.json (source file of build-lobby-links.mjs): carries each org's regulatory-project headlines. */
async function readRegisterById() {
  try {
    const raw = JSON.parse(await readFile(new URL('../data/lobby-register.json', import.meta.url), 'utf-8'));
    return new Map(Object.values(raw).map((o) => [o.id, o]));
  } catch {
    return new Map();
  }
}

async function loadContext() {
  const [directory, mandates, polls, pollResults, lobbyLinks, parents, registerById, donations, roster] = await Promise.all([
    readJsonFile('lobby-directory.json', null),
    readJsonFile('lobby-mandates.json', null),
    readJsonFile('polls.json', []),
    readJsonFile('poll-results.json', {}),
    readJsonFile('lobby-links.json', null),
    readCurated('us-lobby/us-parents.json'),
    readRegisterById(),
    readJsonFile('party-donations.json', []),
    readJsonFile('roster.json', { members: [] }),
  ]);
  if (!directory?.orgs?.length) throw new Error('lobby-directory.json missing — run fetch-lobbyregister first');
  return {
    directory,
    mandates: mandates?.orgs ?? {},
    mandatesGeneratedAt: mandates?.generatedAt ?? null,
    polls,
    pollResults,
    lobbyLinks,
    parents,
    registerById,
    donations,
    roster,
    byId: new Map(directory.orgs.map((o) => [o.id, o])),
    lobbyOrgs: new Map(Object.values(lobbyLinks?.orgs ?? {}).map((o) => [o.id, o])),
    usById: new Map(parents.counted.map((r) => [r.id, r])),
  };
}

// ---- us-lobby: treemap + revolving door ----------------------------------------------------------

/**
 * Every former office holder the register names for a US entry: on the US entry itself, on one of
 * its agencies' mandates (client side), or on an agency's mandate for that US client (agency side).
 * One row per person and US entry.
 */
function formerOfficialsForUs(ctx) {
  const rows = new Map();
  const add = (f, usId, viaName) => {
    const key = `${f.name}|${usId}`;
    if (!rows.has(key)) rows.set(key, { name: f.name, gov: f.gov, usId, viaName });
  };
  for (const [id, o] of Object.entries(ctx.mandates)) {
    if (ctx.usById.has(id)) {
      for (const f of o.formerOfficials ?? []) add(f, id, null);
      for (const a of o.agencies ?? []) for (const f of a.formerOfficials ?? []) add(f, id, a.name);
    }
    for (const c of o.clients ?? []) {
      if (!ctx.usById.has(c.id)) continue;
      for (const f of c.formerOfficials ?? []) add(f, c.id, ctx.byId.get(id)?.name ?? id);
    }
  }
  return [...rows.values()];
}

/** The mandate between a US client and its agency (spending range, project headlines), from either side of the register. */
function mandateInfo(ctx, usId, viaId, viaName) {
  const c = viaId ? ctx.mandates[viaId]?.clients?.find((x) => x.id === usId) : null;
  if (c) return { euro: c.euro ?? null, projects: c.projects ?? [] };
  const a = ctx.mandates[usId]?.agencies?.find((x) => (viaId && x.id === viaId) || (viaName && x.name === viaName));
  return { euro: a?.euro ?? null, projects: a?.projects ?? [] };
}

/**
 * What the person's lobbying was about, as the register words it: the agency mandate's projects
 * where listed, else the US client's own regulatory-project headlines ("client"), else nothing.
 */
function personTopics(ctx, p, mandates) {
  const dedupe = (xs) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  const fromMandate = dedupe(mandates.flatMap((m) => m.projects));
  if (fromMandate.length) return { kind: 'mandate', items: fromMandate.slice(0, 6) };
  const fromClient = dedupe(p.usIds.flatMap((id) => (ctx.registerById.get(id)?.lobbiedProjects ?? []).map((x) => x.demand ?? '')));
  return fromClient.length ? { kind: 'client', items: fromClient.slice(0, 5) } : { kind: null, items: [] };
}

function buildRevolvingDoor(ctx, curated) {
  const all = formerOfficialsForUs(ctx);
  const people = curated.people.map((p) => {
    const hits = all.filter((r) => r.name === p.name && p.usIds.includes(r.usId));
    const gov = hits[0]?.gov ?? null;
    const direct = !p.viaId && !p.viaName;
    const mandatesOf = direct ? [] : p.usIds.map((id) => mandateInfo(ctx, id, p.viaId, p.viaName));
    return {
      name: p.name,
      roleLabel: p.roleLabel,
      note: p.note ?? null,
      cardLabel: p.cardLabel,
      cardNote: p.cardNote ?? null,
      // Live from the register; null when the register no longer names this person for these entries.
      endDate: gov?.endDate ?? null,
      position: gov?.position ?? null,
      authority: gov?.authority ?? null,
      kind: gov?.kind ?? null,
      stillNamed: hits.length > 0,
      direct,
      via: direct ? null : { id: p.viaId, name: p.viaName, orgPath: orgPathFor(p.viaId, ctx), registerUrl: p.viaId ? REGISTER_ENTRY_URL(p.viaId) : null },
      topics: personTopics(ctx, p, mandatesOf),
      clients: p.usIds.map((id, i) => {
        const us = ctx.usById.get(id);
        return {
          id,
          name: ctx.byId.get(id)?.name ?? us?.name ?? id,
          label: us?.parentShort ?? id,
          zone: us?.zone ?? null,
          euro: direct ? (ctx.byId.get(id)?.expensesEuro ?? null) : mandatesOf[i].euro,
          orgPath: orgPathFor(id, ctx),
          registerUrl: REGISTER_ENTRY_URL(id),
        };
      }),
    };
  });
  // Totals over every person, named or not. Bundestag staff are private persons: counted only.
  const persons = new Map();
  for (const r of all) if (!persons.has(r.name)) persons.set(r.name, r.gov);
  const totals = { persons: persons.size, exMps: 0, government: 0, staff: 0 };
  for (const gov of persons.values()) {
    if (gov?.kind === 'HOUSE_OF_REPRESENTATIVES' && gov.role === 'MEMBER') totals.exMps++;
    else if (gov?.kind === 'HOUSE_OF_REPRESENTATIVES') totals.staff++;
    else totals.government++;
  }
  return { checkedOn: curated.checkedOn, people, totals };
}

export async function buildUsLobby(ctx) {
  const curatedDoor = await readCurated('us-lobby/revolving-door.json');
  const { byId, parents } = ctx;
  const reviewedIds = new Set([...ctx.usById.keys(), ...parents.excluded.map((r) => r.id)]);

  const zones = {};
  const missingEntries = [];
  for (const zone of ['seat', 'subsidiary']) {
    const groups = new Map();
    let count = 0;
    let sumEuro = 0;
    for (const r of parents.counted.filter((x) => x.zone === zone)) {
      const o = byId.get(r.id);
      if (!o) {
        missingEntries.push(r.id);
        continue;
      }
      const m = mid(o);
      count++;
      sumEuro += m;
      const g = groups.get(r.parent) ?? { parent: r.parent, label: r.parentShort, valueEuro: 0, entries: [] };
      g.valueEuro += m;
      g.entries.push({ id: r.id, name: o.name, midEuro: m, registerUrl: REGISTER_ENTRY_URL(r.id), orgPath: orgPathFor(r.id, ctx), evidenceType: r.evidenceType, evidenceUrl: r.evidenceUrl });
      groups.set(r.parent, g);
    }
    zones[zone] = {
      count,
      sumEuro: roundEuro(sumEuro),
      groups: [...groups.values()]
        .map((g) => ({ ...g, valueEuro: roundEuro(g.valueEuro), entries: g.entries.sort((a, b) => b.midEuro - a.midEuro) }))
        .sort((a, b) => b.valueEuro - a.valueEuro || a.label.localeCompare(b.label)),
    };
  }

  const revolvingDoor = buildRevolvingDoor(ctx, curatedDoor);
  const totalEuro = roundEuro(zones.seat.sumEuro + zones.subsidiary.sumEuro);
  const newUsSeatEntries = ctx.directory.orgs
    .filter((o) => o.country === 'US' && !reviewedIds.has(o.id))
    .map((o) => ({ id: o.id, name: o.name, midEuro: mid(o) }));

  return {
    slug: 'us-lobby',
    generatedAt: newest(ctx.directory.generatedAt, ctx.lobbyLinks?.generatedAt, ctx.mandatesGeneratedAt),
    curatedCheckedOn: parents.checkedOn,
    treemap: {
      zones,
      totalEuro,
      entryCount: zones.seat.count + zones.subsidiary.count,
      registerTotalEuro: roundEuro(ctx.directory.orgs.reduce((s, o) => s + mid(o), 0)),
      registerEntryCount: ctx.directory.orgs.length,
      excludedCount: parents.excluded.length,
    },
    revolvingDoor,
    orgPaths: collectOrgPaths([
      ...Object.values(zones).flatMap((z) => z.groups.flatMap((g) => g.entries.map((e) => e.orgPath))),
      ...revolvingDoor.people.flatMap((p) => [p.via?.orgPath, ...p.clients.map((c) => c.orgPath)]),
    ]),
    // Things a human has to look at before the story's text can be trusted again.
    review: { newUsSeatEntries, missingEntries },
  };
}

// ---- us-gesetze: votes with US lobbyists + sugar levy ---------------------------------------------

function pollPath(poll) {
  return `/gesetze/${poll.id}-${slugify(poll.title)}`;
}

export async function buildUsGesetze(ctx) {
  const levy = await readCurated('us-gesetze/sugar-levy-camps.json');

  // Every vote on which at least one curated US entry reported lobbying (lobby-links' link of
  // register entry to bill), newest first. Fully live: a new vote with US lobbyists appears here
  // on the next data update, with its plain title until the story gives it a short label.
  const votes = [];
  for (const [pollId, entries] of Object.entries(ctx.lobbyLinks?.pollLobbying ?? {})) {
    const usEntries = entries.filter((e) => ctx.usById.has(e.orgId));
    if (!usEntries.length) continue;
    const poll = ctx.polls.find((p) => p.id === Number(pollId));
    const result = ctx.pollResults[pollId];
    if (!poll || !result) continue;
    votes.push({
      id: poll.id,
      title: poll.title,
      date: poll.date,
      accepted: poll.accepted,
      path: pollPath(poll),
      totals: { yes: result.totalYes, no: result.totalNo, abstain: result.totalAbstain, noShow: result.totalNoShow },
      lobbyCount: entries.length,
      usOrgs: usEntries
        .map((e) => {
          const us = ctx.usById.get(e.orgId);
          return { id: e.orgId, label: us.parentShort, name: ctx.byId.get(e.orgId)?.name ?? us.name, demands: e.demands ?? [], orgPath: orgPathFor(e.orgId, ctx), registerUrl: REGISTER_ENTRY_URL(e.orgId) };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    });
  }
  votes.sort((a, b) => b.date.localeCompare(a.date) || a.id - b.id);

  // The only direction the site may claim is a curated one (see data/lobby-positions.json's README).
  // Here: the hand-read sugar-levy camps (register wording, 6.11.2026), applied to the GKV-Reform
  // because that law announces the levy. Other votes carry no direction, only the register's headline.
  const campById = new Map(levy.entries.filter((e) => e.camp !== 'agency').map((e) => [e.id, e]));
  for (const v of votes) {
    const poll = ctx.polls.find((p) => p.id === v.id);
    const result = ctx.pollResults[String(v.id)];
    v.topics = poll.topics ?? (poll.topic ? [poll.topic] : []);
    v.drucksachen = poll.drucksachen ?? [];
    v.abgeordnetenwatchUrl = poll.url ?? null;
    // First paragraph of abgeordnetenwatch's own summary, copied as is (the page shortens it for display).
    v.summary = (poll.summary ?? '').split(/\n\s*\n/)[0].trim() || null;
    v.parties = (result.partyBreakdown ?? []).map((b) => ({ party: b.party, color: b.color, yes: b.yes, no: b.no, abstain: b.abstain, noShow: b.noShow }));
    for (const o of v.usOrgs) {
      const camp = v.id === GKV_POLL_ID ? campById.get(o.id) : null;
      o.stance = camp ? { camp: camp.camp, note: camp.note, checkedOn: levy.checkedOn } : null;
    }
  }

  const levyEntries = levy.entries.map((e) => ({
    id: e.id,
    // quellen.md marks US actors with "(US)" in the name; the page shows that with isUs instead.
    label: e.label.replace(/\s*\(US\)$/, ''),
    camp: e.camp,
    note: e.note,
    isUs: ctx.usById.has(e.id),
    inRegister: ctx.byId.has(e.id),
    registerUrl: REGISTER_ENTRY_URL(e.id),
    orgPath: orgPathFor(e.id, ctx),
  }));
  const campCounts = { against: 0, for: 0, shape: 0, agency: 0 };
  for (const e of levyEntries) campCounts[e.camp]++;
  const gkv = ctx.polls.find((p) => p.id === GKV_POLL_ID);

  return {
    slug: 'us-gesetze',
    generatedAt: newest(ctx.directory.generatedAt, ctx.lobbyLinks?.generatedAt),
    curatedCheckedOn: levy.checkedOn,
    usEntryCount: ctx.parents.counted.length,
    votes,
    sugarLevy: {
      checkedOn: levy.checkedOn,
      counts: campCounts,
      entries: levyEntries,
      gkvBill: gkv ? { id: gkv.id, title: gkv.title, date: gkv.date, path: pollPath(gkv) } : null,
    },
    orgPaths: collectOrgPaths([...votes.flatMap((v) => v.usOrgs.map((o) => o.orgPath)), ...levyEntries.map((e) => e.orgPath)]),
  };
}

// ---- lobby-geld: lobby spending vs. party donations, and where the two overlap ---------------------

/** Short labels for the register's actor types (the register's own wording is long). */
const TYPE_LABELS = {
  'Sonstiges Unternehmen': 'Unternehmen',
  'Wirtschaftsverband oder Gewerbeverband/-verein': 'Wirtschafts- und Gewerbeverbände',
  'Privatrechtliche Organisation mit Anerkennung der Gemeinnützigkeit nach Abgabenordnung': 'Gemeinnützige Organisationen',
  'Privatrechtliche Organisation': 'Sonstige private Organisationen',
  Berufsverband: 'Berufsverbände',
  'Nichtregierungsorganisation (NGO)': 'NGOs',
  'Beratungsunternehmen, selbständige Beraterin oder selbständiger Berater': 'Beratungsunternehmen',
};

/** Donations are filed under many spellings of a party; the scraper already normalises them to `fraction`. */
const donationDate = (d) => d.receivedOn ?? d.publishedOn ?? null;

function donationTotals(donations) {
  // The window is the publication window: that is the date the Bundestag lists a donation under.
  const dates = donations.map((d) => d.publishedOn ?? d.receivedOn).filter(Boolean).sort();
  return {
    totalEuro: roundEuro(donations.reduce((sum, d) => sum + d.amountEuro, 0)),
    count: donations.length,
    firstDate: dates[0] ?? null,
    firstYear: donations.length ? Math.min(...donations.map((d) => d.year)) : null,
    lastDate: dates.at(-1) ?? null,
  };
}

function buildLobbyGeld(ctx) {
  const orgs = ctx.directory.orgs;
  const declaring = orgs.filter((o) => o.expensesEuro && o.expensesEuro.to > 0);
  const totalEuro = declaring.reduce((sum, o) => sum + mid(o), 0);
  const byTypeMap = new Map();
  for (const o of declaring) {
    const row = byTypeMap.get(o.actorType) ?? { type: o.actorType, orgCount: 0, midEuro: 0, orgs: [] };
    row.orgCount++;
    row.midEuro += mid(o);
    row.orgs.push(o);
    byTypeMap.set(o.actorType, row);
  }
  const byType = [...byTypeMap.values()]
    .filter((r) => TYPE_LABELS[r.type])
    .map((r) => ({
      label: TYPE_LABELS[r.type],
      orgCount: r.orgCount,
      midEuro: roundEuro(r.midEuro),
      top: r.orgs
        .sort((a, b) => mid(b) - mid(a) || a.id.localeCompare(b.id))
        .slice(0, 5)
        .map((o) => ({ id: o.id, name: o.name, midEuro: mid(o), orgPath: orgPathFor(o.id, ctx), registerUrl: REGISTER_ENTRY_URL(o.id) })),
    }))
    .sort((a, b) => b.midEuro - a.midEuro);

  const donations = donationTotals(ctx.donations);
  const years = donations.firstDate && donations.lastDate ? (new Date(donations.lastDate) - new Date(donations.firstDate)) / (365.25 * 864e5) : 0;

  // Politicians with a function at a registered organisation (affiliations are keyed by mandate id).
  const mandateIds = new Set(ctx.roster.members.map((m) => String(m.mandateId)));
  const affiliations = Object.entries(ctx.lobbyLinks?.affiliations ?? {}).filter(([mandateId]) => mandateIds.has(mandateId));
  const perOrg = new Map();
  for (const [, list] of affiliations) for (const a of new Set(list.map((x) => x.orgId))) perOrg.set(a, (perOrg.get(a) ?? 0) + 1);
  const topOrgs = [...perOrg.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([id, mdbCount]) => ({ id, name: ctx.byId.get(id)?.name ?? ctx.lobbyOrgs.get(id)?.name ?? id, mdbCount, orgPath: orgPathFor(id, ctx), registerUrl: REGISTER_ENTRY_URL(id) }));

  // Donors that are also registered lobbyists (donor names are matched to register ids in lobby-links).
  const links = ctx.lobbyLinks?.donorLinks ?? {};
  const donorMap = new Map();
  for (const d of ctx.donations) {
    const id = links[d.donor];
    if (!id) continue;
    const row = donorMap.get(id) ?? { id, donatedEuro: 0, parties: new Map(), count: 0 };
    row.donatedEuro += d.amountEuro;
    row.count++;
    row.parties.set(d.fraction, (row.parties.get(d.fraction) ?? 0) + d.amountEuro);
    donorMap.set(id, row);
  }
  const donors = [...donorMap.values()]
    .sort((a, b) => b.donatedEuro - a.donatedEuro)
    .map((r) => {
      const org = ctx.byId.get(r.id);
      return {
        id: r.id,
        name: org?.name ?? ctx.lobbyOrgs.get(r.id)?.name ?? r.id,
        orgPath: orgPathFor(r.id, ctx),
        registerUrl: REGISTER_ENTRY_URL(r.id),
        donatedEuro: roundEuro(r.donatedEuro),
        donationCount: r.count,
        parties: [...r.parties.entries()].sort((a, b) => b[1] - a[1]).map(([party, euro]) => ({ party, euro: roundEuro(euro) })),
        budget: org?.expensesEuro ?? null,
      };
    });

  return {
    slug: 'lobby-geld',
    generatedAt: newest(ctx.directory.generatedAt, ctx.lobbyLinks?.generatedAt),
    curatedCheckedOn: null,
    spend: { totalEuro: roundEuro(totalEuro), orgCount: orgs.length, declaringCount: declaring.length, byType },
    donations: { ...donations, years: Math.round(years * 10) / 10 },
    overlap: { memberCount: ctx.roster.members.length, withFunction: affiliations.length, topOrgs, donors },
    partyPaths: partyPaths(ctx),
    orgPaths: collectOrgPaths([...topOrgs.map((o) => o.orgPath), ...donors.map((d) => d.orgPath), ...byType.flatMap((t) => t.top.map((o) => o.orgPath))]),
  };
}

// ---- parteispenden: who finances the parties ------------------------------------------------------

/** Donation page of every sitting fraction (the only parties with a politblick page), keyed by the name the donation list uses. */
function partyPaths(ctx) {
  const paths = {};
  for (const p of ctx.roster.parties ?? []) if (p.name !== 'Fraktionslos') paths[p.name] = `/parteien/${encodeURIComponent(p.name)}/spenden`;
  return paths;
}

/** The parties shown in the chart (everything else is summed as "weitere Parteien"). */
const SHOWN_PARTIES = ['CDU/CSU', 'BSW', 'FDP', 'AfD', 'SPD', 'Grüne', 'Linke'];
const BITPANDA_ID = 'R007203';

function buildParteispenden(ctx) {
  const donations = ctx.donations;
  const totals = donationTotals(donations);
  const byParty = new Map();
  for (const d of donations) {
    const row = byParty.get(d.fraction) ?? { party: d.fraction, sumEuro: 0, donationCount: 0, donors: new Map() };
    row.sumEuro += d.amountEuro;
    row.donationCount++;
    row.donors.set(d.donor, (row.donors.get(d.donor) ?? 0) + d.amountEuro);
    byParty.set(d.fraction, row);
  }
  const links = ctx.lobbyLinks?.donorLinks ?? {};
  const shape = (row) => {
    const donors = [...row.donors.entries()].sort((a, b) => b[1] - a[1]);
    const top3 = donors.slice(0, 3).reduce((sum, d) => sum + d[1], 0);
    return {
      party: row.party,
      color: REAL_PARTY_COLORS[row.party] ?? FALLBACK_PARTY_COLOR,
      sumEuro: roundEuro(row.sumEuro),
      donorCount: donors.length,
      donationCount: row.donationCount,
      top3Share: Math.round((top3 / row.sumEuro) * 1000) / 1000,
      topDonors: donors.slice(0, 3).map(([name, euro]) => ({ name, euro: roundEuro(euro), orgPath: orgPathFor(links[name], ctx) })),
    };
  };
  const parties = SHOWN_PARTIES.filter((p) => byParty.has(p)).map((p) => shape(byParty.get(p))).sort((a, b) => b.sumEuro - a.sumEuro);
  const others = [...byParty.values()].filter((r) => !SHOWN_PARTIES.includes(r.party));

  // Bitpanda: one donor, several parties, one day.
  const bp = donations.filter((d) => links[d.donor] === BITPANDA_ID);
  const org = ctx.byId.get(BITPANDA_ID);
  const dates = [...new Set(bp.map(donationDate))].sort();
  const bpTotal = bp.reduce((sum, d) => sum + d.amountEuro, 0);
  const bpParts = new Map();
  for (const d of bp) bpParts.set(d.fraction, (bpParts.get(d.fraction) ?? 0) + d.amountEuro);
  const bitpanda = bp.length
    ? {
        orgId: BITPANDA_ID,
        name: org?.name ?? 'Bitpanda GmbH',
        orgPath: orgPathFor(BITPANDA_ID, ctx),
        registerUrl: REGISTER_ENTRY_URL(BITPANDA_ID),
        dates,
        sameDay: dates.length === 1,
        partyNames: [...new Set(bp.map((d) => d.party))].sort(),
        totalEuro: roundEuro(bpTotal),
        parts: [...bpParts.entries()].sort((a, b) => b[1] - a[1]).map(([party, euro]) => ({ party, color: REAL_PARTY_COLORS[party] ?? FALLBACK_PARTY_COLOR, euro: roundEuro(euro) })),
        budget: org?.expensesEuro ?? null,
      }
    : null;

  return {
    slug: 'parteispenden',
    generatedAt: newest(ctx.directory.generatedAt, ctx.lobbyLinks?.generatedAt),
    curatedCheckedOn: null,
    ...totals,
    parties,
    partyPaths: partyPaths(ctx),
    others: { partyCount: others.length, sumEuro: roundEuro(others.reduce((sum, r) => sum + r.sumEuro, 0)) },
    bitpanda,
    orgPaths: collectOrgPaths([...parties.flatMap((p) => p.topDonors.map((d) => d.orgPath)), bitpanda?.orgPath]),
  };
}

async function main() {
  const ctx = await loadContext();
  await mkdir('public/data/datenstories', { recursive: true });
  const usLobby = await buildUsLobby(ctx);
  await writeJsonFile('datenstories/us-lobby.json', usLobby);
  const { zones, totalEuro } = usLobby.treemap;
  console.log(
    `datenstories/us-lobby.json: ${zones.seat.count} + ${zones.subsidiary.count} US entries, ${(totalEuro / 1e6).toFixed(2)} Mio. €; ` +
      `revolving door ${usLobby.revolvingDoor.people.filter((p) => p.stillNamed).length}/${usLobby.revolvingDoor.people.length} named, ${usLobby.revolvingDoor.totals.persons} persons in total; ` +
      `${usLobby.review.newUsSeatEntries.length} new US-address entries to review, ${usLobby.review.missingEntries.length} curated entries gone`,
  );
  const usGesetze = await buildUsGesetze(ctx);
  await writeJsonFile('datenstories/us-gesetze.json', usGesetze);
  const lobbyGeld = buildLobbyGeld(ctx);
  await writeJsonFile('datenstories/lobby-geld.json', lobbyGeld);
  console.log(`datenstories/lobby-geld.json: ${(lobbyGeld.spend.totalEuro / 1e6).toFixed(1)} Mio. € Lobbyausgaben, ${(lobbyGeld.donations.totalEuro / 1e6).toFixed(1)} Mio. € Großspenden, ${lobbyGeld.overlap.withFunction} MdB mit Funktion, ${lobbyGeld.overlap.donors.length} Spender im Register`);
  const parteispenden = buildParteispenden(ctx);
  await writeJsonFile('datenstories/parteispenden.json', parteispenden);
  console.log(`datenstories/parteispenden.json: ${parteispenden.parties.length} Parteien, Bitpanda ${parteispenden.bitpanda ? parteispenden.bitpanda.totalEuro : '-'} €`);
  console.log(`datenstories/us-gesetze.json: ${usGesetze.votes.length} votes with US lobbyists, ${usGesetze.sugarLevy.entries.length} sugar-levy entries`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
