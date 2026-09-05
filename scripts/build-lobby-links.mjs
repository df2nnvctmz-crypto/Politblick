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
//          public/data/roster.json      members + party          (fetch-core.mjs)
//          public/data/polls.json       polls + their Drucksachen (fetch-core.mjs)
//          public/data/poll-results.json per-mandate votes        (fetch-core.mjs)
//          public/data/sidejobs.json    declared outside roles    (fetch-sidejobs.mjs)
//          public/data/committees.json  committee assignments     (fetch-committees.mjs)
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
  const roster = await readJsonFile('roster.json', { members: [] });
  const committeesFile = await readJsonFile('committees.json', { committees: [], memberships: [] });

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

  // ---- committee-level lobby influence: which orgs have the most tied members on a committee ----
  //
  // Same shape as partyLobbySummary's topOrgs below, but grouped by committee membership instead
  // of party — "does the committee that actually handles this policy area have members tied to
  // the organisations lobbying it" is a sharper, more actionable signal than the party-wide
  // summary alone.
  const membersByCommittee = new Map();
  for (const m of committeesFile.memberships) {
    const list = membersByCommittee.get(m.committeeId) ?? [];
    list.push(String(m.mandateId));
    membersByCommittee.set(m.committeeId, list);
  }
  const committeeLobbySummary = {};
  for (const [committeeId, mandateIds] of membersByCommittee) {
    const memberSetByOrg = new Map();
    for (const mandateId of mandateIds) {
      for (const link of affiliations[mandateId] ?? []) {
        const set = memberSetByOrg.get(link.orgId) ?? new Set();
        set.add(mandateId);
        memberSetByOrg.set(link.orgId, set);
      }
    }
    if (memberSetByOrg.size === 0) continue;
    const topOrgs = [...memberSetByOrg.entries()]
      .map(([orgId, members]) => ({ orgId, memberCount: members.size }))
      .sort((a, b) => b.memberCount - a.memberCount)
      .slice(0, 10);
    committeeLobbySummary[committeeId] = topOrgs;
    for (const { orgId } of topOrgs) referenced.add(orgId);
  }
  console.log(`${Object.keys(committeeLobbySummary).length} committees have at least one member tied to a registered lobbyist`);

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
          drucksachen: lobbied.drucksachen,
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

  // ---- committee assignments: an official, verifiable fact that can strengthen a topical tie -----
  //
  // Each committee already carries abgeordnetenwatch's own field_topics — the SAME topic
  // vocabulary used to tag polls (Finanzausschuss lists "Öffentliche Finanzen, Steuern und
  // Abgaben" verbatim). So "is this member on the committee actually responsible for this poll's
  // policy area" comes for free from the API, with no hand-curation, unlike the topic map above.
  // A topical tie where the member also sits on the relevant committee is materially stronger
  // evidence than the field-of-interest match alone — it's not just "their org is in a related
  // industry", it's "they personally sit on the body that handles bills like this one".
  const committeeById = new Map(committeesFile.committees.map((c) => [c.id, c]));
  const committeesByMandate = new Map();
  for (const m of committeesFile.memberships) {
    const committee = committeeById.get(m.committeeId);
    if (!committee) continue;
    const list = committeesByMandate.get(String(m.mandateId)) ?? [];
    list.push(committee);
    committeesByMandate.set(String(m.mandateId), list);
  }
  if (committeesFile.committees.length === 0) {
    console.warn('public/data/committees.json is empty or missing — run fetch-committees.mjs first. Topical ties will not be enriched with committee membership.');
  }
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
    // Match on EVERY topic the poll carries, not just field_topics[0]. 71% of polls carry more
    // than one, and six labels never appear first at all — matching on the first alone
    // meant a bill tagged ["Wirtschaft", "Energie"] was tested against the (unmapped) Wirtschaft
    // fields and produced no energy ties at all. The `poll.topic` fallback keeps this working
    // against a polls.json written before `topics` existed.
    const pollTopics = poll.topics?.length ? poll.topics : poll.topic ? [poll.topic] : [];
    const fields = [...new Set(pollTopics.flatMap((t) => topicMapFile.topics?.[t] ?? []))];
    if (fields.length === 0) continue;
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
        const memberCommittees = committeesByMandate.get(mandateId) ?? [];
        // Same reasoning as the field lookup above: a member sitting on the committee actually
        // responsible for the bill is the strongest non-document signal there is, and testing
        // it against only the poll's first topic threw most of those matches away.
        const relevantCommittees = memberCommittees.filter((c) => c.topics.some((t) => pollTopics.includes(t)));
        topicalTies.push({
          mandateId: Number(mandateId),
          pollId: poll.id,
          orgId: link.orgId,
          roles: link.roles,
          categories: link.categories,
          vote: vote.vote,
          matchedField,
          againstFraction: fractionMajority ? vote.vote !== fractionMajority : null,
          // Only ever populated from abgeordnetenwatch's own committee/topic data — never guessed.
          onRelevantCommittee: relevantCommittees.length > 0,
          relevantCommitteeNames: relevantCommittees.map((c) => c.name),
        });
        referenced.add(link.orgId);
      }
    }
  }
  topicalTies.sort((a, b) => a.pollId - b.pollId || a.mandateId - b.mandateId);
  const committeeBoosted = topicalTies.filter((t) => t.onRelevantCommittee).length;
  console.log(
    `${topicalTies.length} member/bill topical ties (same policy area, no declared Drucksache match), ` +
      `${committeeBoosted} where the member also sits on the responsible committee`,
  );

  // ---- donors that are themselves registered lobbyists -------------------------------------------
  //
  // Matching is by normalised name, plus a small hand-curated alias file for the cases normalising
  // cannot reach: where the two sources use genuinely different forms of a company's name rather
  // than different punctuation of the same words ("Deutsche Vermögensberatung AG" against the
  // register's "Deutsche Vermögensberatung Aktiengesellschaft DVAG"). Fuzzy matching is deliberately
  // not used — a wrong link here asserts that a named company lobbies the parliament it donated to,
  // and that claim has to be one a human checked, not one a similarity score guessed.
  const aliasFile = await readSourceFile('donor-aliases.json', { aliases: [] });
  const donorAliases = new Map();
  for (const alias of aliasFile.aliases ?? []) {
    if (!alias?.donor || !alias?.orgId) continue;
    // A typo'd register id would silently drop the link it was added to create, so refuse to build.
    if (!orgById.has(alias.orgId)) {
      throw new Error(`data/donor-aliases.json: "${alias.donor}" points at unknown register id ${alias.orgId}`);
    }
    donorAliases.set(alias.donor, alias.orgId);
  }

  const donorLinks = {};
  const unmatchedDonors = new Map();
  for (const donation of donations) {
    if (!donation.donor) continue;
    const org = orgByName.get(normalizeOrgName(donation.donor)) ?? orgById.get(donorAliases.get(donation.donor));
    if (!org) {
      unmatchedDonors.set(donation.donor, (unmatchedDonors.get(donation.donor) ?? 0) + (donation.amountEuro ?? 0));
      continue;
    }
    donorLinks[donation.donor] = org.id;
    referenced.add(org.id);
  }
  console.log(
    `${new Set(Object.values(donorLinks)).size} large-donation donors are themselves in the Lobbyregister ` +
      `(${Object.keys(donorLinks).length} spellings, ${donorAliases.size} via curated alias)`,
  );

  // Surface donors that matched nothing but whose normalised name is a prefix of a register entry's
  // (or vice versa) — the shape every alias so far has had. These are candidates for a human to
  // check, never links: printing them is what stops this from silently rotting as the Bundestag
  // publishes new spellings.
  const candidates = [];
  for (const [donor, amount] of [...unmatchedDonors.entries()].sort((a, b) => b[1] - a[1])) {
    const key = normalizeOrgName(donor);
    if (!key) continue;
    const hits = register.filter((o) => {
      const k = normalizeOrgName(o.name);
      return k && k !== key && (k.startsWith(key) || key.startsWith(k));
    });
    if (hits.length) candidates.push({ donor, amount, hits: hits.slice(0, 3) });
  }
  if (candidates.length) {
    console.log(`  ${candidates.length} unmatched donor(s) look like a register entry — review, then add to data/donor-aliases.json:`);
    for (const c of candidates) {
      console.log(`    "${c.donor}" (${Math.round(c.amount).toLocaleString('de-DE')} €)`);
      for (const h of c.hits) console.log(`        ${h.id} "${h.name.trim()}" (${h.city ?? '—'})`);
    }
  }

  // ---- party-level summary: which fields of interest are the orgs tied to each party's members
  // active in, and roughly how much declared lobbying spend sits behind them -----------------------
  //
  // This is a new lens on data already joined above (affiliations), not a new fetch: for each
  // party, take every org a member of that party holds a declared role at, and group those orgs
  // by their own declared fields of interest. An org tied to several members of the same party is
  // counted once per field, never once per member — otherwise a party with one well-connected MP
  // at a five-seat board would look identical to a party with five separately-tied MPs.
  const partyByMandate = new Map(roster.members.map((m) => [String(m.mandateId), m.party]));
  const partyOrgMemberCount = new Map(); // party -> Map<orgId, memberCount>
  for (const [mandateId, orgLinks] of Object.entries(affiliations)) {
    const party = partyByMandate.get(mandateId);
    if (!party) continue;
    const orgCounts = partyOrgMemberCount.get(party) ?? new Map();
    for (const link of orgLinks) {
      orgCounts.set(link.orgId, (orgCounts.get(link.orgId) ?? 0) + 1);
    }
    partyOrgMemberCount.set(party, orgCounts);
  }

  const partyLobbySummary = [...partyOrgMemberCount.entries()]
    .map(([party, orgCounts]) => {
      const orgIds = [...orgCounts.keys()];
      const fieldOrgSets = new Map(); // field -> Set<orgId>
      for (const id of orgIds) {
        const org = orgById.get(id);
        if (!org) continue;
        for (const field of org.fieldsOfInterest) {
          const set = fieldOrgSets.get(field) ?? new Set();
          set.add(id);
          fieldOrgSets.set(field, set);
        }
      }
      const byField = [...fieldOrgSets.entries()]
        .map(([field, orgSet]) => ({ field, orgCount: orgSet.size }))
        .sort((a, b) => b.orgCount - a.orgCount)
        .slice(0, 25);
      const topOrgs = [...orgCounts.entries()]
        .map(([id, memberCount]) => ({ orgId: id, memberCount }))
        .sort((a, b) => b.memberCount - a.memberCount)
        .slice(0, 10);
      return {
        party,
        orgCount: orgIds.length,
        memberCount: Object.entries(affiliations).filter(([mid]) => partyByMandate.get(mid) === party).length,
        byField,
        topOrgs,
      };
    })
    .sort((a, b) => b.orgCount - a.orgCount);
  console.log(`Party lobbying summary computed for ${partyLobbySummary.length} parties/fractions`);

  // ---- ship only the orgs something actually points at ---------------------------------------------
  const orgs = {};
  for (const id of referenced) {
    const org = orgById.get(id);
    if (!org) continue;
    orgs[id] = {
      id: org.id,
      name: org.name.trim(),
      legalForm: org.legalForm,
      actorType: org.actorType,
      city: org.city,
      url: org.url,
      description: org.description,
      expensesEuro: org.expensesEuro,
      staffFte: org.staffFte,
      // Capped, but generously: a topical tie's matchedField must show up in the org's own
      // fieldsOfInterest list on screen, or the UI's "matched because they list X" claim would
      // point at a field the reader can't find on the org's card.
      fieldsOfInterest: org.fieldsOfInterest.slice(0, 20),
    };
  }

  // ---- register-wide spending, aggregated only where an aggregate means something -------------
  //
  // `expensesEuro` is an attribute of an organisation and of nothing else. The register never
  // attaches a euro to a bill, a member or a party, and each declaration covers that
  // organisation's own last financial year with no date recorded — so there is no time axis here
  // either, and no legislature can be sliced out of it.
  //
  // It may therefore only be summed over a partition every organisation belongs to exactly once:
  // `actorType` (the register's own classification of what kind of interest representative this
  // is) and the register as a whole. It must never be summed by field of interest — organisations
  // declare 11.9 fields on average and each field would receive the organisation's entire budget,
  // which overstates the true total by ~17x.
  //
  // Both scopes are reported: the whole register, and the subset this site links to parliament,
  // so a reader can see for themselves how unrepresentative that subset is.
  const spendSummary = (() => {
    const scopeOf = (list) => {
      const declaring = list.filter((o) => o.expensesEuro && o.expensesEuro.to > 0);
      const byActorType = new Map();
      for (const o of list) {
        const key = o.actorType ?? 'Ohne Angabe';
        const cur = byActorType.get(key) ?? { actorType: key, orgCount: 0, declaringCount: 0, from: 0, to: 0 };
        cur.orgCount += 1;
        if (o.expensesEuro && o.expensesEuro.to > 0) {
          cur.declaringCount += 1;
          cur.from += o.expensesEuro.from;
          cur.to += o.expensesEuro.to;
        }
        byActorType.set(key, cur);
      }
      const ranked = [...declaring].sort((a, b) => b.expensesEuro.to - a.expensesEuro.to);
      return {
        orgCount: list.length,
        declaringCount: declaring.length,
        from: declaring.reduce((sum, o) => sum + o.expensesEuro.from, 0),
        to: declaring.reduce((sum, o) => sum + o.expensesEuro.to, 0),
        staffFte: Math.round(list.reduce((sum, o) => sum + (o.staffFte ?? 0), 0)),
        byActorType: [...byActorType.values()].sort((a, b) => b.to - a.to),
        concentration: [10, 25, 50, 100, 250, 500]
          .filter((n) => n < ranked.length)
          .map((n) => ({ n, to: ranked.slice(0, n).reduce((sum, o) => sum + o.expensesEuro.to, 0) })),
      };
    };
    const active = register.filter((o) => o.active);
    return {
      // Every bracket the register reports is exactly this wide, so the from/to spread on a total
      // is just accumulated bracket width — not uncertainty about the order of magnitude.
      bracketWidthEuro: 9999,
      all: scopeOf(active),
      linked: scopeOf(active.filter((o) => referenced.has(o.id))),
    };
  })();
  console.log(
    `Spend summary: ${spendSummary.all.declaringCount} of ${spendSummary.all.orgCount} active organisations declare a lobbying budget`,
  );

  // ---- the browsable register directory --------------------------------------------------------
  //
  // Every active entry, not only the few hundred this site points at from somewhere. Descriptions
  // are deliberately left out: they average about a thousand characters and would take the file
  // from ~400 KB to ~2.3 MB gzipped, for prose that is only ever read one organisation at a time.
  // An organisation outside `orgs` therefore shows what the register lists about it and links to
  // its own register entry for the rest.
  const directory = {
    generatedAt: new Date().toISOString(),
    orgs: register
      .filter((o) => o.active)
      .map((o) => ({
        id: o.id,
        name: o.name.trim(),
        actorType: o.actorType,
        city: o.city,
        url: o.url,
        expensesEuro: o.expensesEuro,
        staffFte: o.staffFte,
        fieldsOfInterest: o.fieldsOfInterest,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de')),
  };
  await writeJsonFile('lobby-directory.json', directory);
  console.log(`  ${directory.orgs.length} active organisations in the browsable directory`);

  const output = {
    orgs,
    pollLobbying,
    affiliations,
    conflicts,
    topicalTies,
    donorLinks,
    partyLobbySummary,
    committeeLobbySummary,
    spendSummary,
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
