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

await verifyUsLobby();
await verifyUsGesetze();
for (const w of warns) console.warn(`  WARN ${w}`);
if (fails.length) {
  console.error(`${fails.length} FAIL(S):`);
  for (const f of fails) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`Datenstories OK${warns.length ? ` (${warns.length} warning(s))` : ''}.`);
