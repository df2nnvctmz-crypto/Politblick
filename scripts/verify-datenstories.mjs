#!/usr/bin/env node
/**
 * Checks the Datenstories against the raw data, in two layers (the verify-stories.mjs pattern):
 *
 * 1. Recount: public/data/datenstories/<slug>.json is re-derived from the snapshots and the
 *    curated files, sharing no code with build-datenstories.mjs. Any disagreement FAILS.
 * 2. Claims: every claim a story's text declares (`claims` in src/datenstories/<slug>/story.ts)
 *    is evaluated against the recounted numbers. A claim the data no longer supports FAILS; a
 *    claim that still holds but now reads differently from the research (and the Reddit slides
 *    built from it) WARNS.
 * Plus review items (WARN): register entries with a US address nobody has classified yet, votes
 * with US lobbyists that the story has no short label for.
 *
 * Exit code: 1 on any FAIL, 0 otherwise (warnings are printed only).
 * Imports story.ts directly: Node 22.18+/24 strips the type annotations itself.
 */
import { readFile } from 'node:fs/promises';
import { readJsonFile } from './lib/common.mjs';

const fails = [];
const warns = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);
const ok = (m) => console.log(`  ok   ${m}`);

const curated = async (rel) => JSON.parse(await readFile(new URL(`../data/datenstories/${rel}`, import.meta.url), 'utf-8'));
const midpoint = (o) => (o?.expensesEuro ? (o.expensesEuro.from + o.expensesEuro.to) / 2 : 0);
const close = (a, b) => Math.abs(a - b) < 0.01;

// Independent copy of the fraction words — deliberately not imported from story.ts.
const FRACTIONS = { 'die Hälfte': 1 / 2, 'ein Drittel': 1 / 3, 'ein Viertel': 1 / 4, 'ein Fünftel': 1 / 5, 'ein Sechstel': 1 / 6, 'ein Siebtel': 1 / 7, 'ein Achtel': 1 / 8 };

const [directory, mandatesFile, polls, pollResults, lobbyLinks, parents] = await Promise.all([
  readJsonFile('lobby-directory.json', null),
  readJsonFile('lobby-mandates.json', null),
  readJsonFile('polls.json', []),
  readJsonFile('poll-results.json', {}),
  readJsonFile('lobby-links.json', null),
  curated('us-lobby/us-parents.json'),
]);
if (!directory?.orgs?.length) {
  console.log('No lobby-directory.json — nothing to verify.');
  process.exit(0);
}
const byId = new Map(directory.orgs.map((o) => [o.id, o]));
const usIds = new Set(parents.counted.map((r) => r.id));
const mandates = mandatesFile?.orgs ?? {};

/** Is `name` listed as a former office holder for US entry `usId`, on either side of a mandate? Independent restatement. */
function namedFor(name, usId) {
  const has = (list) => (list ?? []).some((f) => f.name === name);
  const own = mandates[usId];
  if (own && (has(own.formerOfficials) || (own.agencies ?? []).some((a) => has(a.formerOfficials)))) return true;
  return Object.values(mandates).some((o) => (o.clients ?? []).some((c) => c.id === usId && has(c.formerOfficials)));
}

function checkUsEntries(tag, c) {
  const bad = c.ids.filter((id) => !byId.has(id) || !usIds.has(id));
  if (bad.length) fail(`${tag} ${c.says}: no longer a US entry in the register: ${bad.join(', ')}`);
  else ok(`${tag} ${c.ids.length} named US entries still registered`);
}

// ---- us-lobby ------------------------------------------------------------------------------------

async function verifyUsLobby() {
  const built = await readJsonFile('datenstories/us-lobby.json', null);
  if (!built) return fail('[us-lobby] public/data/datenstories/us-lobby.json missing; run node scripts/build-datenstories.mjs');
  const [door, { claims }] = await Promise.all([curated('us-lobby/revolving-door.json'), import('../src/datenstories/us-lobby/claims.ts')]);

  // 1. Recount the treemap.
  const recount = { seat: { n: 0, sum: 0 }, subsidiary: { n: 0, sum: 0 } };
  for (const r of parents.counted) {
    const o = byId.get(r.id);
    if (!o) {
      fail(`[us-lobby] curated US entry ${r.id} (${r.name}) is no longer in the register`);
      continue;
    }
    // "Sitz in den USA" is what makes an entry visible as American; a subsidiary must not have it.
    if (r.zone === 'seat' && o.country !== 'US') fail(`[us-lobby] ${r.id} is curated as US seat but the register now says country ${o.country}`);
    if (r.zone === 'subsidiary' && o.country === 'US') fail(`[us-lobby] ${r.id} is curated as German subsidiary but the register now gives a US address`);
    recount[r.zone].n++;
    recount[r.zone].sum += midpoint(o);
  }
  const z = built.treemap.zones;
  for (const zone of ['seat', 'subsidiary']) {
    if (z[zone].count !== recount[zone].n) fail(`[us-lobby] ${zone} count ${z[zone].count} != recount ${recount[zone].n}`);
    if (!close(z[zone].sumEuro, recount[zone].sum)) fail(`[us-lobby] ${zone} sum ${z[zone].sumEuro} != recount ${recount[zone].sum}`);
    const groupSum = z[zone].groups.reduce((s, g) => s + g.valueEuro, 0);
    if (!close(groupSum, recount[zone].sum)) fail(`[us-lobby] ${zone} groups add up to ${groupSum}, not ${recount[zone].sum}`);
  }
  const total = recount.seat.sum + recount.subsidiary.sum;
  if (!close(built.treemap.totalEuro, total)) fail(`[us-lobby] totalEuro ${built.treemap.totalEuro} != recount ${total}`);

  // Revolving door: every named person must still be named for at least one of their US entries.
  for (const p of door.people) {
    const still = p.usIds.some((id) => namedFor(p.name, id));
    const builtP = built.revolvingDoor.people.find((x) => x.name === p.name);
    if (!still) fail(`[us-lobby] revolving door: the register no longer names ${p.name} for ${p.usIds.join(', ')}`);
    if (builtP?.stillNamed !== still) fail(`[us-lobby] revolving door: built stillNamed for ${p.name} (${builtP?.stillNamed}) != recount (${still})`);
  }

  // 2. Claims.
  const metrics = { usTotalEuro: total, usVisibleShare: recount.seat.sum / total };
  for (const c of claims) {
    const tag = `[us-lobby:${c.id}]`;
    if (c.kind === 'justBelowRound') {
      const v = metrics[c.metric];
      const rounded = Math.round(v / c.unit) * c.unit;
      if (!(v < rounded)) fail(`${tag} ${c.says}: total ${(v / c.unit).toFixed(2)} is not below ${rounded / c.unit}, so "Fast" is wrong`);
      else if ((rounded - v) / rounded > c.maxGap) fail(`${tag} ${c.says}: total ${(v / c.unit).toFixed(2)} is too far below ${rounded / c.unit} for "Fast"`);
      else ok(`${tag} ${(v / c.unit).toFixed(2)} Mio. -> „Fast ${rounded / c.unit}“`);
    } else if (c.kind === 'fractionWord') {
      const v = metrics[c.metric];
      const [word, value] = Object.entries(FRACTIONS).reduce((b, f) => (Math.abs(f[1] - v) < Math.abs(b[1] - v) ? f : b));
      const err = Math.abs(v - value) / value;
      if (err > c.maxRelError) fail(`${tag} ${c.says}: share ${(v * 100).toFixed(1)} % is ${(err * 100).toFixed(0)} % off "${word}"`);
      else ok(`${tag} ${(v * 100).toFixed(1)} % -> „${word}“ (${(err * 100).toFixed(1)} % off)`);
      if (word !== c.researchWord) warn(`${tag} headline now reads „${word}“; research and Reddit slides say „${c.researchWord}“`);
    } else if (c.kind === 'officialNamed') {
      if (!usIds.has(c.usId) || !namedFor(c.name, c.usId)) fail(`${tag} ${c.says}: the register no longer names ${c.name} for ${c.usId}`);
      else ok(`${tag} ${c.name} still named for ${c.usId}`);
    } else if (c.kind === 'usEntries') checkUsEntries(tag, c);
    else fail(`${tag} unknown claim kind ${c.kind}`);
  }

  // Review.
  const reviewed = new Set([...usIds, ...parents.excluded.map((r) => r.id)]);
  for (const o of directory.orgs.filter((x) => x.country === 'US' && !reviewed.has(x.id))) {
    warn(`[us-lobby] new register entry with a US address, not yet classified: ${o.id} ${o.name} (${Math.round(midpoint(o) / 1000)} Tsd. €); add it to us-parents.json, counted or excluded`);
  }
}

// ---- us-gesetze ----------------------------------------------------------------------------------

async function verifyUsGesetze() {
  const built = await readJsonFile('datenstories/us-gesetze.json', null);
  if (!built) return fail('[us-gesetze] public/data/datenstories/us-gesetze.json missing; run node scripts/build-datenstories.mjs');
  const [levy, { claims }, { pollNotes }] = await Promise.all([curated('us-gesetze/sugar-levy-camps.json'), import('../src/datenstories/us-gesetze/claims.ts'), import('../src/datenstories/us-gesetze/notes.ts')]);

  // 1. Recount the votes straight from lobby-links + poll-results.
  const expected = new Map();
  for (const [pollId, entries] of Object.entries(lobbyLinks?.pollLobbying ?? {})) {
    const us = entries.filter((e) => usIds.has(e.orgId)).map((e) => e.orgId).sort();
    if (us.length && polls.some((p) => p.id === Number(pollId)) && pollResults[pollId]) expected.set(Number(pollId), { us, total: entries.length });
  }
  const builtIds = built.votes.map((v) => v.id).sort((a, b) => a - b);
  const expIds = [...expected.keys()].sort((a, b) => a - b);
  if (JSON.stringify(builtIds) !== JSON.stringify(expIds)) fail(`[us-gesetze] votes ${builtIds} != recount ${expIds}`);
  for (const v of built.votes) {
    const e = expected.get(v.id);
    const r = pollResults[String(v.id)];
    if (!e || !r) continue;
    if (JSON.stringify(v.usOrgs.map((o) => o.id).sort()) !== JSON.stringify(e.us)) fail(`[us-gesetze] vote ${v.id}: US orgs != recount`);
    if (v.lobbyCount !== e.total) fail(`[us-gesetze] vote ${v.id}: lobbyCount ${v.lobbyCount} != ${e.total}`);
    if (v.totals.yes !== r.totalYes || v.totals.no !== r.totalNo || v.totals.abstain !== r.totalAbstain) fail(`[us-gesetze] vote ${v.id}: totals != poll-results.json`);
    // Party results shown in the expanded row must be the raw ones.
    const rawParties = JSON.stringify((r.partyBreakdown ?? []).map((b) => [b.party, b.yes, b.no, b.abstain, b.noShow]));
    if (JSON.stringify(v.parties.map((b) => [b.party, b.yes, b.no, b.abstain, b.noShow])) !== rawParties) fail(`[us-gesetze] vote ${v.id}: party breakdown != poll-results.json`);
    // A direction (dafür/dagegen) may only be shown where the curated camps give one, and only on the GKV-Reform.
    const campById = new Map(levy.entries.filter((e) => e.camp !== 'agency').map((e) => [e.id, e.camp]));
    for (const o of v.usOrgs) {
      const want = v.id === 6601 ? campById.get(o.id) ?? null : null;
      if ((o.stance?.camp ?? null) !== want) fail(`[us-gesetze] vote ${v.id}: ${o.name} shows stance ${o.stance?.camp ?? 'none'}, curated camps say ${want ?? 'none'}`);
    }
    if (!pollNotes[v.id]) warn(`[us-gesetze] vote ${v.id} (${v.title}) has US lobbyists but no short label in pollNotes; it shows its plain title`);
  }
  const levyCounts = { against: 0, for: 0, shape: 0, agency: 0 };
  for (const e of levy.entries) levyCounts[e.camp]++;
  if (JSON.stringify(levyCounts) !== JSON.stringify(built.sugarLevy.counts)) fail(`[us-gesetze] sugar-levy counts ${JSON.stringify(built.sugarLevy.counts)} != curated ${JSON.stringify(levyCounts)}`);

  // 2. Claims.
  for (const c of claims) {
    const tag = `[us-gesetze:${c.id}]`;
    if (c.kind === 'votesHaveUs') {
      const bad = c.pollIds.filter((id) => !expected.has(id));
      if (bad.length) fail(`${tag} ${c.says}: no US lobbyists any more on vote(s) ${bad.join(', ')}`);
      else ok(`${tag} ${c.pollIds.length} headline votes still have US lobbyists`);
    } else if (c.kind === 'stanceOnVote') {
      const onVote = expected.get(c.pollId)?.us.includes(c.orgId);
      const camp = levy.entries.find((e) => e.id === c.orgId)?.camp;
      if (!onVote) fail(`${tag} ${c.says}: ${c.orgId} no longer lobbies on vote ${c.pollId} as a US entry`);
      else if (camp !== c.camp) fail(`${tag} ${c.says}: curated camp for ${c.orgId} is now "${camp}", not "${c.camp}"`);
      else ok(`${tag} ${c.orgId} on vote ${c.pollId}: ${camp}`);
    } else if (c.kind === 'usEntries') checkUsEntries(tag, c);
    else fail(`${tag} unknown claim kind ${c.kind}`);
  }
}

// ---- lobby-geld + parteispenden ------------------------------------------------------------------

const donations = await readJsonFile('party-donations.json', []);
const roster = await readJsonFile('roster.json', { members: [] });

/** Largest-first sums per key, restated here without any code from the builder. */
function sumBy(rows, keyOf, valueOf) {
  const m = new Map();
  for (const r of rows) m.set(keyOf(r), (m.get(keyOf(r)) ?? 0) + valueOf(r));
  return m;
}

async function verifyLobbyGeld() {
  const built = await readJsonFile('datenstories/lobby-geld.json', null);
  if (!built) return fail('[lobby-geld] public/data/datenstories/lobby-geld.json missing; run node scripts/build-datenstories.mjs');
  const { claims } = await import('../src/datenstories/lobby-geld/claims.ts');

  // 1. Recount.
  const declaring = directory.orgs.filter((o) => o.expensesEuro && o.expensesEuro.to > 0);
  const spend = declaring.reduce((s, o) => s + midpoint(o), 0);
  if (!close(built.spend.totalEuro, spend)) fail(`[lobby-geld] spending total ${built.spend.totalEuro} != recount ${spend}`);
  if (built.spend.declaringCount !== declaring.length) fail(`[lobby-geld] declaring count ${built.spend.declaringCount} != ${declaring.length}`);
  const typeSums = sumBy(declaring, (o) => o.actorType, midpoint);
  const typeSum = [...typeSums.values()].reduce((a, b) => a + b, 0);
  if (!close(typeSum, spend)) fail('[lobby-geld] actor types do not add up to the total');
  const shownType = built.spend.byType.reduce((s, t) => s + t.midEuro, 0);
  if (shownType > spend + 0.01) fail('[lobby-geld] shown actor types exceed the total');
  const don = donations.reduce((s, d) => s + d.amountEuro, 0);
  if (!close(built.donations.totalEuro, don) || built.donations.count !== donations.length) fail(`[lobby-geld] donations ${built.donations.totalEuro}/${built.donations.count} != recount ${don}/${donations.length}`);
  const mandateIds = new Set((roster.members ?? []).map((m) => String(m.mandateId)));
  const withFn = Object.keys(lobbyLinks?.affiliations ?? {}).filter((k) => mandateIds.has(k)).length;
  if (built.overlap.withFunction !== withFn || built.overlap.memberCount !== (roster.members ?? []).length) fail(`[lobby-geld] MdB with function ${built.overlap.withFunction}/${built.overlap.memberCount} != recount ${withFn}/${(roster.members ?? []).length}`);
  const links = lobbyLinks?.donorLinks ?? {};
  const linked = new Set(donations.map((d) => links[d.donor]).filter(Boolean));
  if (built.overlap.donors.length !== linked.size) fail(`[lobby-geld] donors in the register ${built.overlap.donors.length} != recount ${linked.size}`);
  for (const d of built.overlap.donors) {
    const own = donations.filter((x) => links[x.donor] === d.id).reduce((s, x) => s + x.amountEuro, 0);
    if (!close(d.donatedEuro, own)) fail(`[lobby-geld] donor ${d.id} ${d.donatedEuro} != recount ${own}`);
  }

  // 2. Claims.
  for (const c of claims) {
    const tag = `[lobby-geld:${c.id}]`;
    if (c.kind === 'ratioAtLeast') {
      const ratio = spend / don;
      if (ratio < c.min) fail(`${tag} ${c.says}: yearly lobby spending is only ${ratio.toFixed(1)}x the donations (need ${c.min}x)`);
      else ok(`${tag} lobby spending is ${ratio.toFixed(1)}x the donations`);
    } else if (c.kind === 'topType') {
      const labels = { 'Sonstiges Unternehmen': 'Unternehmen' };
      const top = [...typeSums.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if ((labels[top] ?? top) !== c.label) fail(`${tag} ${c.says}: the largest actor type is now "${top}"`);
      else ok(`${tag} largest actor type is still ${c.label}`);
    } else fail(`${tag} unknown claim kind ${c.kind}`);
  }
}

async function verifyParteispenden() {
  const built = await readJsonFile('datenstories/parteispenden.json', null);
  if (!built) return fail('[parteispenden] public/data/datenstories/parteispenden.json missing; run node scripts/build-datenstories.mjs');
  const { claims } = await import('../src/datenstories/parteispenden/claims.ts');

  // 1. Recount per party.
  const parties = new Map();
  for (const d of donations) {
    const p = parties.get(d.fraction) ?? { sum: 0, donors: new Map() };
    p.sum += d.amountEuro;
    p.donors.set(d.donor, (p.donors.get(d.donor) ?? 0) + d.amountEuro);
    parties.set(d.fraction, p);
  }
  const stats = (name) => {
    const p = parties.get(name);
    if (!p) return null;
    const donors = [...p.donors.values()].sort((a, b) => b - a);
    return { sum: p.sum, donors: donors.length, top3: donors.slice(0, 3).reduce((a, b) => a + b, 0) / p.sum };
  };
  const total = donations.reduce((s, d) => s + d.amountEuro, 0);
  if (!close(built.totalEuro, total)) fail(`[parteispenden] total ${built.totalEuro} != recount ${total}`);
  for (const row of built.parties) {
    const s = stats(row.party);
    if (!s) fail(`[parteispenden] ${row.party} has no donations any more`);
    else if (!close(row.sumEuro, s.sum) || row.donorCount !== s.donors || Math.abs(row.top3Share - s.top3) > 0.001) fail(`[parteispenden] ${row.party}: ${row.sumEuro}/${row.donorCount}/${row.top3Share} != recount ${s.sum}/${s.donors}/${s.top3.toFixed(3)}`);
  }
  const shown = new Set(built.parties.map((p) => p.party));
  const othersSum = [...parties.entries()].filter(([k]) => !shown.has(k)).reduce((s, [, v]) => s + v.sum, 0);
  if (!close(built.others.sumEuro, othersSum)) fail(`[parteispenden] other parties ${built.others.sumEuro} != recount ${othersSum}`);

  // Bitpanda, by register id through the donor-name links.
  const links = lobbyLinks?.donorLinks ?? {};
  const bp = donations.filter((d) => links[d.donor] === 'R007203');
  const bpSum = bp.reduce((s, d) => s + d.amountEuro, 0);
  const bpDates = new Set(bp.map((d) => d.receivedOn ?? d.publishedOn));
  if (built.bitpanda && !close(built.bitpanda.totalEuro, bpSum)) fail(`[parteispenden] Bitpanda ${built.bitpanda.totalEuro} != recount ${bpSum}`);

  // 2. Claims.
  for (const c of claims) {
    const tag = `[parteispenden:${c.id}]`;
    if (c.kind === 'fewDonors') {
      const s = stats(c.party);
      if (!s || s.donors > c.max) fail(`${tag} ${c.says}: ${c.party} now has ${s?.donors ?? 0} donors (max ${c.max})`);
      else ok(`${tag} ${c.party} has ${s.donors} donors`);
    } else if (c.kind === 'manyDonors') {
      const s = stats(c.party);
      if (!s || s.donors < c.min) fail(`${tag} ${c.says}: ${c.party} has only ${s?.donors ?? 0} donors (need ${c.min})`);
      else ok(`${tag} ${c.party} has ${s.donors} donors`);
    } else if (c.kind === 'top3AtLeast') {
      const s = stats(c.party);
      if (!s || s.top3 < c.min) fail(`${tag} ${c.says}: top-3 share of ${c.party} is ${s ? (s.top3 * 100).toFixed(1) : 0} % (need ${c.min * 100} %)`);
      else ok(`${tag} top-3 share of ${c.party} is ${(s.top3 * 100).toFixed(1)} %`);
    } else if (c.kind === 'bitpandaOneDay') {
      if (bp.length === 0 || bpDates.size !== 1) fail(`${tag} ${c.says}: Bitpanda donations carry ${bpDates.size} different dates`);
      else ok(`${tag} all Bitpanda donations on ${[...bpDates][0]}`);
    } else if (c.kind === 'bitpandaRatio') {
      const budget = midpoint(byId.get('R007203'));
      const ratio = budget ? bpSum / budget : 0;
      if (ratio < c.min) fail(`${tag} ${c.says}: donations are ${ratio.toFixed(1)}x the lobby budget (need ${c.min}x)`);
      else ok(`${tag} donations are ${ratio.toFixed(1)}x the lobby budget`);
    } else fail(`${tag} unknown claim kind ${c.kind}`);
  }
}

await verifyUsLobby();
await verifyUsGesetze();
await verifyLobbyGeld();
await verifyParteispenden();
for (const w of warns) console.warn(`  WARN ${w}`);
if (fails.length) {
  console.error(`${fails.length} FAIL(S):`);
  for (const f of fails) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`Datenstories OK${warns.length ? ` (${warns.length} warning(s))` : ''}.`);
