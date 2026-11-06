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
import { readJsonFile, slugify, writeJsonFile } from './lib/common.mjs';

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
  const [directory, mandates, polls, pollResults, lobbyLinks, parents, registerById] = await Promise.all([
    readJsonFile('lobby-directory.json', null),
    readJsonFile('lobby-mandates.json', null),
    readJsonFile('polls.json', []),
    readJsonFile('poll-results.json', {}),
    readJsonFile('lobby-links.json', null),
    readCurated('us-lobby/us-parents.json'),
    readRegisterById(),
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
  console.log(`datenstories/us-gesetze.json: ${usGesetze.votes.length} votes with US lobbyists, ${usGesetze.sugarLevy.entries.length} sugar-levy entries`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
