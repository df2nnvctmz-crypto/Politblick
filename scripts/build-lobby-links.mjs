#!/usr/bin/env node
// Joins the separately-fetched snapshots into the small file the browser actually loads.
//
// This step makes NO network requests. That is deliberate: the matching rules below (name
// normalisation, which links count as a conflict, how a curated stance is applied) are the
// part most likely to change, and keeping them in a pure derive step means a rule change is a
// two-second local re-run against committed inputs — not a fresh 140-request crawl — and shows
// up as a reviewable diff.
//
// Inputs   data/lobby-register.json     full register snapshot   (fetch-lobbyregister.mjs)
//          data/lobby-positions.json    hand-curated stances     (edited by humans)
//          data/lobby-topic-map.json    hand-curated topic map   (edited by humans)
//          public/data/polls.json       polls + their Drucksachen (fetch-core.mjs)
//          public/data/poll-results.json per-mandate votes        (fetch-core.mjs)
//          public/data/sidejobs.json    declared outside roles    (fetch-sidejobs.mjs)
// Output   public/data/lobby-links.json
import { normalizeOrgName, readJsonFile, readSourceFile, writeJsonFile } from './lib/common.mjs';

/** 'Fraktionslos' independents share no whip, so no majority computed across them is a real fraction line. See both usages below. */
const NO_FRACTION = 'Fraktionslos';

/**
 * Declared sidejob categories that represent a *current* tie to an organisation — a position,
 * a shareholding, a donation received, or an agreed job after the mandate. The category is
 * carried through to the UI rather than flattened, because "sits on the board of" and "was
 * given a donation by" are very different kinds of connection and shouldn't be shown alike.
 *
 * 'Berufliche Tätigkeit vor dem Mandat' is deliberately excluded: a job someone held before
 * being elected is biography, not an ongoing interest, and counting it would badly overstate
 * the number of ties.
 */
const AFFILIATION_CATEGORIES = new Set([
  'Unternehmensfunktion',
  'Funktion in einer öffentlich-rechtlichen Körperschaft',
  'Vereins- oder Stiftungsfunktion',
  'Vergütete Tätigkeit neben dem Mandat',
  'Kapital- oder Gesellschaftsanteile',
  'Politische Spende/Zuwendung',
  'Zusage für eine Tätigkeit nach dem Mandat',
]);

async function main() {
  const register = await readSourceFile('lobby-register.json', []);
  const positionsFile = await readSourceFile('lobby-positions.json', { positions: [] });
  const polls = await readJsonFile('polls.json', []);
  const pollResults = await readJsonFile('poll-results.json', {});
  const sidejobs = await readJsonFile('sidejobs.json', {});
  const donations = await readJsonFile('party-donations.json', []);

  if (register.length === 0) {
    console.warn('data/lobby-register.json is empty or missing — run fetch-lobbyregister.mjs first. Nothing to derive.');
    return;
  }

  const orgById = new Map(register.map((o) => [o.id, o]));

  // ---- index: Drucksache -> orgs that declared lobbying on it -------------------------------
  const orgsByDrucksache = new Map();
  for (const org of register) {
    for (const project of org.lobbiedProjects) {
      for (const number of project.printingNumbers) {
        const list = orgsByDrucksache.get(number) ?? [];
        list.push({ orgId: org.id, demand: project.demand, project: project.number });
        orgsByDrucksache.set(number, list);
      }
    }
  }
  console.log(`${orgsByDrucksache.size} distinct Drucksachen cited across the register`);

  // ---- index: normalised org name -> register entry ------------------------------------------
  const orgByName = new Map();
  for (const org of register) {
    const key = normalizeOrgName(org.name);
    // Names are matched exactly (after normalisation) rather than fuzzily: a false positive
    // here would attach a lobbying tie to the wrong member, which is far worse than a miss.
    if (key.length > 4 && !orgByName.has(key)) orgByName.set(key, org);
  }

  // ---- which orgs lobbied which poll ---------------------------------------------------------
  const pollLobbying = {};
  const referenced = new Set();
  let pollsWithLobbying = 0;
  for (const poll of polls) {
    const byOrg = new Map();
    for (const number of poll.drucksachen ?? []) {
      for (const hit of orgsByDrucksache.get(number) ?? []) {
        const entry = byOrg.get(hit.orgId) ?? { orgId: hit.orgId, demands: [], drucksachen: [] };
        if (hit.demand && !entry.demands.includes(hit.demand)) entry.demands.push(hit.demand);
        if (!entry.drucksachen.includes(number)) entry.drucksachen.push(number);
        byOrg.set(hit.orgId, entry);
      }
    }
    if (byOrg.size === 0) continue;
    pollsWithLobbying++;
    for (const id of byOrg.keys()) referenced.add(id);
    pollLobbying[poll.id] = [...byOrg.values()].sort((a, b) =>
      (orgById.get(a.orgId)?.name ?? '').localeCompare(orgById.get(b.orgId)?.name ?? '', 'de'),
    );
  }
  console.log(`${pollsWithLobbying}/${polls.length} polls have at least one registered lobbyist on record`);

  // ---- which members hold a role at a registered lobbyist --------------------------------------
  const affiliations = {};
  for (const [mandateId, records] of Object.entries(sidejobs)) {
    const seen = new Map();
    for (const record of records) {
      if (!record.organization || !AFFILIATION_CATEGORIES.has(record.categoryLabel)) continue;
      const org = orgByName.get(normalizeOrgName(record.organization));
      if (!org) continue;
      const entry = seen.get(org.id) ?? { orgId: org.id, roles: [], categories: [] };
      const role = record.jobTitleExtra || record.title;
      if (role && !entry.roles.includes(role)) entry.roles.push(role);
      if (!entry.categories.includes(record.categoryLabel)) entry.categories.push(record.categoryLabel);
      seen.set(org.id, entry);
      referenced.add(org.id);
    }
    if (seen.size > 0) affiliations[mandateId] = [...seen.values()];
  }
  console.log(`${Object.keys(affiliations).length} members hold a role at a registered lobbyist`);

  // ---- the cross-reference: member voted on a bill their own organisation lobbied ---------------
  //
  // A curated stance (data/lobby-positions.json) is what turns this into a directional "voted
  // against the organisation's position". Without one, `position` stays null and the site shows
  // the organisation's own demand verbatim next to the vote instead of asserting a direction.
  const curated = new Map();
  for (const p of positionsFile.positions ?? []) {
    curated.set(`${p.org}|${p.drucksache}`, p);
  }

  const conflicts = [];
  for (const poll of polls) {
    const lobbying = pollLobbying[poll.id];
    if (!lobbying) continue;
    const result = pollResults[poll.id];
    if (!result) continue;
    const majorityByParty = new Map(result.partyBreakdown.map((p) => [p.party, p.majority]));
    const voteByMandate = new Map(result.votes.map((v) => [String(v.mandateId), v]));

    for (const [mandateId, orgLinks] of Object.entries(affiliations)) {
      const vote = voteByMandate.get(mandateId);
      if (!vote || vote.vote === 'no_show') continue;
      for (const link of orgLinks) {
        const lobbied = lobbying.find((l) => l.orgId === link.orgId);
        if (!lobbied) continue;

        const stance = lobbied.drucksachen.map((d) => curated.get(`${link.orgId}|${d}`)).find(Boolean) ?? null;
        const fractionMajority = vote.party === NO_FRACTION ? null : majorityByParty.get(vote.party) ?? null;
        conflicts.push({
          mandateId: Number(mandateId),
          pollId: poll.id,
          orgId: link.orgId,
          roles: link.roles,
          categories: link.categories,
          vote: vote.vote,
          demands: lobbied.demands,
          // Statistical fact: differs from their own fraction's majority on this poll.
          againstFraction: fractionMajority ? vote.vote !== fractionMajority : null,
          // Only ever set from a curated, sourced stance — never inferred.
          position: stance ? stance.position : null,
          againstPosition: stance ? isAgainst(vote.vote, stance.position) : null,
          positionSource: stance ? stance.source : null,
          positionNote: stance ? stance.note : null,
        });
      }
    }
  }
  conflicts.sort((a, b) => a.pollId - b.pollId || a.mandateId - b.mandateId);
  const withCuratedStance = conflicts.filter((c) => c.position !== null).length;
  console.log(
    `${conflicts.length} member/bill cross-references ` +
      `(${conflicts.filter((c) => c.againstFraction).length} against own fraction, ` +
      `${withCuratedStance} with a curated stance)`,
  );

  // ---- topical ties: same policy area, but no declared Drucksache match ---------------------------
  //
  // Weaker than `conflicts` above, and it must stay visibly weaker. A `conflicts` entry means the
  // organisation itself declared lobbying on this exact bill. A topical tie only means the member's
  // organisation lists a field of interest that data/lobby-topic-map.json curates as genuinely
  // on-topic for this poll — no document ties the org to this specific vote. Never merge the two;
  // the frontend must label them differently and this array must never reuse the `conflicts` shape.
  //
  // The topic map is intentionally narrow (see its _readme): matching on a poll's whole topic
  // against every field an org might list produces enormous noise. A one-topic test run (just
  // "Energie", including generic fields like "Allgemeine Energiepolitik") produced 3,171 hits, the
  // first several of which were a student-services union and two party economic forums flagged on
  // a building-energy-retrofit bill — neither has any real stake in it, they'd simply ticked a
  // generic interest box. Only specific fields belong in the topic map for exactly this reason.
  //
  // Even with a narrow topic map, one failure mode survives: a "generalist" org that ticks a huge
  // spread of unrelated fields. In production this was "Wirtschaftsforum der SPD e.V." — a
  // party-internal economic forum registered under 85 different fields of interest (nuclear
  // energy, foreign policy, care, labour market, integration, ...), which alone produced 1,813 of
  // 5,006 topical ties, because it also has 35 affiliated MPs. Across the full register,
  // fieldsOfInterest length is: median 8, p75 14, p90 22, p95 28 (max 132) — so a generalist org
  // like that sits far out in the tail, not in the normal range a genuinely specialised interest
  // group (a banking association, a farmers' union) occupies. Excluding orgs above this breadth
  // cuts the failure mode at its structural cause instead of denylisting specific organisations,
  // which wouldn't generalise to the next one like it.
  const GENERALIST_FIELD_COUNT_THRESHOLD = 25;
  const topicMapFile = await readSourceFile('lobby-topic-map.json', { topics: {} });
  const orgIdsByField = new Map();
  for (const org of register) {
    if (org.fieldsOfInterest.length > GENERALIST_FIELD_COUNT_THRESHOLD) continue;
    for (const field of org.fieldsOfInterest) {
      const list = orgIdsByField.get(field) ?? [];
      list.push(org.id);
      orgIdsByField.set(field, list);
    }
  }
  // A pair already covered by a declared-Drucksache conflict must not also appear as a (weaker)
  // topical tie — the stronger signal wins and the weaker one would just be redundant noise.
  const conflictKeys = new Set(conflicts.map((c) => `${c.mandateId}|${c.pollId}|${c.orgId}`));

  const topicalTies = [];
  for (const poll of polls) {
    const fields = topicMapFile.topics?.[poll.topic];
    if (!fields || fields.length === 0) continue;
    const result = pollResults[poll.id];
    if (!result) continue;
    const majorityByParty = new Map(result.partyBreakdown.map((p) => [p.party, p.majority]));
    const voteByMandate = new Map(result.votes.map((v) => [String(v.mandateId), v]));

    const matchedFieldByOrgId = new Map();
    for (const field of fields) {
      for (const orgId of orgIdsByField.get(field) ?? []) {
        if (!matchedFieldByOrgId.has(orgId)) matchedFieldByOrgId.set(orgId, field);
      }
    }
    if (matchedFieldByOrgId.size === 0) continue;

    for (const [mandateId, orgLinks] of Object.entries(affiliations)) {
      const vote = voteByMandate.get(mandateId);
      if (!vote || vote.vote === 'no_show') continue;
      for (const link of orgLinks) {
        const matchedField = matchedFieldByOrgId.get(link.orgId);
        if (!matchedField) continue;
        if (conflictKeys.has(`${mandateId}|${poll.id}|${link.orgId}`)) continue;

        const fractionMajority = vote.party === NO_FRACTION ? null : majorityByParty.get(vote.party) ?? null;
        topicalTies.push({
          mandateId: Number(mandateId),
          pollId: poll.id,
          orgId: link.orgId,
          roles: link.roles,
          categories: link.categories,
          vote: vote.vote,
          matchedField,
          againstFraction: fractionMajority ? vote.vote !== fractionMajority : null,
        });
        referenced.add(link.orgId);
      }
    }
  }
  topicalTies.sort((a, b) => a.pollId - b.pollId || a.mandateId - b.mandateId);
  console.log(`${topicalTies.length} member/bill topical ties (same policy area, no declared Drucksache match)`);

  // ---- donors that are themselves registered lobbyists -------------------------------------------
  const donorLinks = {};
  for (const donation of donations) {
    if (!donation.donor) continue;
    const org = orgByName.get(normalizeOrgName(donation.donor));
    if (!org) continue;
    donorLinks[donation.donor] = org.id;
    referenced.add(org.id);
  }
  console.log(`${Object.keys(donorLinks).length} large-donation donors are themselves in the Lobbyregister`);

  // ---- ship only the orgs something actually points at ---------------------------------------------
  const orgs = {};
  for (const id of referenced) {
    const org = orgById.get(id);
    if (!org) continue;
    orgs[id] = {
      id: org.id,
      name: org.name.trim(),
      legalForm: org.legalForm,
      city: org.city,
      url: org.url,
      expensesEuro: org.expensesEuro,
      staffFte: org.staffFte,
      // Capped, but generously: a topical tie's matchedField must show up in the org's own
      // fieldsOfInterest list on screen, or the UI's "matched because they list X" claim would
      // point at a field the reader can't find on the org's card.
      fieldsOfInterest: org.fieldsOfInterest.slice(0, 20),
    };
  }

  const output = {
    orgs,
    pollLobbying,
    affiliations,
    conflicts,
    topicalTies,
    donorLinks,
    generatedAt: new Date().toISOString(),
    registerEntryCount: register.length,
  };
  await writeJsonFile('lobby-links.json', output);
  console.log(`  ${Object.keys(orgs).length} organisations referenced (of ${register.length} in the register)`);
}

/** A 'pro' stance is voted against by voting no; a 'contra' stance by voting yes. */
function isAgainst(vote, position) {
  if (vote !== 'yes' && vote !== 'no') return null;
  return position === 'pro' ? vote === 'no' : vote === 'yes';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
