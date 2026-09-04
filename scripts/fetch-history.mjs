#!/usr/bin/env node
/**
 * Backfills PAST Bundestag legislature periods — roster, polls and every poll's full roll-call —
 * into one compact archive at public/data/vote-history.json.
 *
 * Why this exists: a single overlap between a member's declared role and a vote is noise. The
 * same member breaking with their fraction on the fourth energy bill in eight years is a
 * pattern. Only the archive can tell those apart, and only the archive gives a base rate to
 * measure any one vote against.
 *
 * Why it is a separate script from fetch-core.mjs: closed legislature periods are immutable.
 * This runs once (~350 requests, ~9 minutes), the result is committed, and the every-4h core
 * job keeps touching only the current period forever after. Re-running is safe but pointless.
 *
 * Why the output is not shaped like poll-results.json: that format repeats each member's name
 * and party inside every single vote row, which costs 2.9 MB for 63 polls. Scaled to 338 it
 * would be ~17 MB. Here each poll instead carries two strings aligned to the period's member
 * index — one character per member for the vote, one for the fraction they held at the time —
 * which is ~1 KB per poll regardless of how many members voted. Nothing is lost: every
 * aggregate (tallies, fraction majorities, divergences) is derivable from those two strings.
 */
import {
  API_BASE,
  BUNDESTAG_PARLIAMENT_ID,
  FALLBACK_PARTY_COLOR,
  REAL_PARTY_COLORS,
  dedupeVotesByMandate,
  fetchAllPaginated,
  fetchCurrentLegislaturePeriod,
  fetchJson,
  fractionNameFromVote,
  majorityOf,
  makePacer,
  readSourceFile,
  transformMandate,
  transformPoll,
  writeJsonFile,
  writeMetaFile,
} from './lib/common.mjs';

/**
 * Closed periods to archive, newest first — every Bundestag term abgeordnetenwatch has.
 *
 * 161 is deliberately absent: it is the *current* term, still changing, and already fetched
 * every four hours by fetch-core.mjs.
 *
 * 67 (2005-2009) is the oldest that exists. abgeordnetenwatch's Bundestag coverage begins with
 * the 16th Bundestag — there is no 2002-2005 period in the API, so this is the full extent of
 * the record, not a budget decision. Roll-call votes thin out going back (50 in 2005-2009
 * against 176 in 2017-2021), which is a real change in parliamentary practice rather than
 * missing data, and it is why a long-run rate must always be shown with its denominator.
 */
const HISTORY_PERIOD_IDS = [132, 111, 97, 83, 67];

/** One character per vote. `.` means the member held no mandate at the time of this poll. */
const VOTE_CHARS = { yes: 'y', no: 'n', abstain: 'a', no_show: 'x' };
const NO_MANDATE = '.';

const pace = makePacer(1500); // one request per 1.5s — well under the 30/min fair-use limit

/**
 * The full set of topic labels the current legislature uses — read live from the API rather
 * than from the committed public/data/polls.json, because that file records only each poll's
 * *first* topic (transformPoll takes field_topics[0]). 71% of current polls carry more than
 * one, so the committed file knows 17 labels where the vocabulary actually has 23: Verkehr,
 * Wirtschaft, Staat und Verwaltung, Soziale Sicherung, Innere Sicherheit and Wissenschaft,
 * Forschung und Technologie never appear in it at all. Validating a merge map against that
 * narrower set would reject perfectly correct targets.
 */
async function fetchCurrentVocabulary() {
  const period = await fetchCurrentLegislaturePeriod();
  await pace();
  const polls = await fetchAllPaginated(
    (start, end) => `${API_BASE}/polls?field_legislature=${period.id}&range_start=${start}&range_end=${end}`,
    pace,
  );
  const vocab = new Set();
  for (const poll of polls) for (const t of poll.field_topics || []) vocab.add(t.label);
  return vocab;
}

/**
 * Guards the merge map against silent rot: every target it names must be a label the *current*
 * legislature actually uses. If abgeordnetenwatch coarsens the vocabulary again, a now-invalid
 * target fails the run loudly here instead of quietly producing a topic key that matches
 * nothing in the UI.
 */
function assertMergeTargetsAreCurrent(mergeMap, currentVocab) {
  if (currentVocab.size === 0) throw new Error('The current legislature returned no poll topics — aborting rather than validating against nothing');
  const bad = [...new Set(Object.values(mergeMap))].filter((t) => !currentVocab.has(t));
  if (bad.length) {
    throw new Error(
      `data/topic-merge-map.json maps onto ${bad.length} label(s) the current legislature no longer uses: ` +
        `${bad.join(', ')}. Update the map against the ${currentVocab.size} labels actually in use.`,
    );
  }
}

/**
 * One topic expressed in the *current* vocabulary, or null where the retired label was split
 * rather than renamed (see the `unmapped` section of the merge map — guessing there would file
 * a real vote under a topic it was never about). The original label is always kept next to the
 * result, so the mapping is auditable rather than a rewrite.
 */
function currentTopicFor(topic, mergeMap, currentVocab) {
  if (!topic) return null;
  if (currentVocab.has(topic)) return topic;
  return mergeMap[topic] ?? null;
}

/**
 * Every topic a poll carries, mapped into the current vocabulary — not just the first one.
 * A poll tagged "Energie" *and* "Wirtschaft" is exactly the cross-cutting kind the topic
 * filter most needs to find, and keeping only field_topics[0] would hide it under whichever
 * label happened to be listed first.
 */
function currentTopicsFor(topics, mergeMap, currentVocab) {
  const mapped = topics.map((t) => currentTopicFor(t, mergeMap, currentVocab)).filter(Boolean);
  return [...new Set(mapped)];
}

async function fetchPeriod(periodId) {
  const json = await fetchJson(`${API_BASE}/parliament-periods/${periodId}`);
  const p = json.data;
  if (p.parliament?.id !== BUNDESTAG_PARLIAMENT_ID) {
    throw new Error(`period ${periodId} is not a Bundestag period (${p.parliament?.label})`);
  }
  return { id: p.id, label: p.label, start: p.start_date_period, end: p.end_date_period };
}

/**
 * Encodes one poll's roll-call as two strings aligned to the period's member index: the vote
 * itself, and the fraction the member sat in *at the time of this vote*. The second string is
 * not redundant with the member's roster party — members change fraction mid-term, and
 * "voted against their own fraction" is only meaningful against the fraction they actually
 * held on the day. The vote record's own `fraction` field is the authority for that.
 */
function encodeRollCall(slimVotes, mandateIndex, partyIndex) {
  const votes = new Array(mandateIndex.size).fill(NO_MANDATE);
  const parties = new Array(mandateIndex.size).fill(NO_MANDATE);
  const tallies = new Map();
  let unknownMandates = 0;
  for (const v of slimVotes) {
    const slot = mandateIndex.get(v.mandateId);
    if (slot === undefined) {
      unknownMandates++;
      continue;
    }
    votes[slot] = VOTE_CHARS[v.vote] ?? NO_MANDATE;
    if (!partyIndex.has(v.party)) partyIndex.set(v.party, partyIndex.size);
    parties[slot] = partyIndex.get(v.party).toString(36);

    const tally = tallies.get(v.party) || { yes: 0, no: 0, abstain: 0, noShow: 0 };
    if (v.vote === 'yes') tally.yes++;
    else if (v.vote === 'no') tally.no++;
    else if (v.vote === 'abstain') tally.abstain++;
    else tally.noShow++;
    tallies.set(v.party, tally);
  }
  // Same shape, and the same majority rule, as computePollResult() writes into poll-results.json.
  // Storing it rather than deriving it in the browser is what lets the frontend build an ordinary
  // PollResult out of an archived poll and reuse computeMemberAlignment() unchanged — so a vote
  // from 2019 and a vote from last week are judged by one definition, not two.
  const partyBreakdown = [...tallies.entries()]
    .map(([party, tally]) => ({
      party,
      color: REAL_PARTY_COLORS[party] || FALLBACK_PARTY_COLOR,
      ...tally,
      majority: majorityOf(tally.yes, tally.no, tally.abstain),
    }))
    .sort((a, b) => b.yes + b.no + b.abstain + b.noShow - (a.yes + a.no + a.abstain + a.noShow));

  return { votes: votes.join(''), parties: parties.join(''), partyBreakdown, unknownMandates };
}

async function archivePeriod(periodId, mergeMap, currentVocab) {
  const period = await fetchPeriod(periodId);
  console.log(`\n=== ${period.label} (id ${period.id}) ===`);

  console.log('Fetching roster…');
  const rawMandates = await fetchAllPaginated(
    (start, end) => `${API_BASE}/candidacies-mandates?parliament_period=${period.id}&range_start=${start}&range_end=${end}`,
    pace,
  );
  // No photo lookups here: they cost one Wikidata request per member (~1,400 across both
  // periods) and the archive is a record of votes, not a directory. The current roster already
  // carries a photo for anyone still in office.
  const membersByMandate = new Map();
  for (const raw of rawMandates) {
    const member = transformMandate(raw);
    if (member) membersByMandate.set(member.mandateId, member);
  }
  console.log(`  ${membersByMandate.size} members from the period roster`);

  console.log('Fetching polls…');
  const rawPolls = await fetchAllPaginated(
    (start, end) =>
      `${API_BASE}/polls?field_legislature=${period.id}&range_start=${start}&range_end=${end}&sort_by=field_poll_date&sort_direction=desc`,
    pace,
  );
  // transformPoll keeps only field_topics[0]; `topics` restores the rest alongside it, without
  // changing the shape fetch-core.mjs and the frontend already rely on.
  const polls = rawPolls
    .map((raw) => ({ ...transformPoll(raw), topics: (raw.field_topics || []).map((t) => t.label) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  console.log(`  ${polls.length} polls`);

  // Pass 1 — fetch every roll-call before encoding any of them, because the member index is not
  // knowable until all of them have been seen (see the mandate reconciliation below). Only the
  // three fields the encoder needs are kept, so holding 338 polls' worth of votes in memory
  // stays cheap.
  console.log('Fetching roll-calls…');
  const rollCalls = new Map();
  const votingMandateIds = new Set();
  let duplicateTotal = 0;
  let conflictTotal = 0;
  for (const [i, poll] of polls.entries()) {
    const rawVotes = await fetchAllPaginated(
      (start, end) => `${API_BASE}/votes?poll=${poll.id}&range_start=${start}&range_end=${end}`,
      pace,
    );
    // Deduplicated before anything counts it, so the vote strings and the party tallies derived
    // below are built from exactly the same set and cannot disagree. See dedupeVotesByMandate().
    const { votes: uniqueVotes, duplicateCount, conflictCount } = dedupeVotesByMandate(rawVotes);
    duplicateTotal += duplicateCount;
    conflictTotal += conflictCount;
    const slim = [];
    for (const v of uniqueVotes) {
      const mandateId = v.mandate.id;
      votingMandateIds.add(mandateId);
      slim.push({ mandateId, party: fractionNameFromVote(v), vote: v.vote });
    }
    rollCalls.set(poll.id, slim);
    if ((i + 1) % 25 === 0 || i === polls.length - 1) console.log(`  ${i + 1}/${polls.length} roll-calls fetched`);
  }
  if (duplicateTotal > 0 || conflictTotal > 0) {
    console.log(`  source data: ${duplicateTotal} duplicate vote row(s) collapsed, ${conflictTotal} mandate(s) dropped for contradictory rows`);
  }

  // Reconcile: `candidacies-mandates?parliament_period=` returns a SNAPSHOT of the term, not
  // everyone who ever held a seat in it — members who left mid-term (to the EU Parliament, to
  // the Bundesbank, or who simply resigned) are absent from it while their votes are still in
  // the record. Indexing on the roster alone silently dropped ~3.5% of all votes.
  //
  // That is not a harmless omission. A member whose votes vanish shows zero divergences and so
  // reads as perfectly loyal — biasing the archive against exactly the mid-term movers this is
  // meant to surface. Worse, fraction majority is computed per poll from the votes present, so
  // missing ballots can flip a party's majority line and thereby mislabel members who were
  // never missing at all. Each unknown mandate is therefore resolved individually (the API
  // rejects bulk `id[in]` filtering with a 500).
  const missingMandateIds = [...votingMandateIds].filter((id) => !membersByMandate.has(id));
  if (missingMandateIds.length > 0) {
    console.log(`Resolving ${missingMandateIds.length} mandate(s) that voted but are absent from the period roster…`);
    let resolved = 0;
    for (const mandateId of missingMandateIds) {
      await pace();
      try {
        const raw = await fetchJson(`${API_BASE}/candidacies-mandates/${mandateId}`);
        const member = transformMandate(raw.data);
        if (member) {
          membersByMandate.set(member.mandateId, member);
          resolved++;
        }
      } catch (e) {
        console.warn(`  could not resolve mandate ${mandateId}: ${e.message}`);
      }
    }
    console.log(`  resolved ${resolved}/${missingMandateIds.length}`);
  }

  const members = [...membersByMandate.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const mandateIndex = new Map(members.map((m, i) => [m.mandateId, i]));
  console.log(`  ${members.length} members total after reconciliation`);

  // Pass 2 — encode. No network.
  const partyIndex = new Map();
  const archived = [];
  let unknownTotal = 0;
  for (const poll of polls) {
    const { votes, parties, partyBreakdown, unknownMandates } = encodeRollCall(rollCalls.get(poll.id) ?? [], mandateIndex, partyIndex);
    unknownTotal += unknownMandates;
    archived.push({
      ...poll,
      currentTopic: currentTopicFor(poll.topic, mergeMap, currentVocab),
      currentTopics: currentTopicsFor(poll.topics, mergeMap, currentVocab),
      partyBreakdown,
      votes,
      parties,
    });
  }
  if (unknownTotal > 0) {
    // Should be zero after reconciliation. Anything left means a mandate lookup failed outright,
    // which would silently bias the result — so it is reported loudly rather than swallowed.
    console.warn(`  WARNING: ${unknownTotal} vote(s) still could not be placed against a member`);
  }

  const parties = [...partyIndex.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => ({ name, color: REAL_PARTY_COLORS[name] || FALLBACK_PARTY_COLOR }));

  return { ...period, parties, members, polls: archived };
}

async function main() {
  const mergeFile = await readSourceFile('topic-merge-map.json', null);
  if (!mergeFile?.merge) throw new Error('data/topic-merge-map.json is missing or has no `merge` section');
  console.log('Reading the current legislature\'s topic vocabulary…');
  const currentVocab = await fetchCurrentVocabulary();
  assertMergeTargetsAreCurrent(mergeFile.merge, currentVocab);
  console.log(`Merge map OK — ${Object.keys(mergeFile.merge).length} retired labels map onto ${currentVocab.size} current ones`);

  const periods = [];
  for (const id of HISTORY_PERIOD_IDS) {
    periods.push(await archivePeriod(id, mergeFile.merge, currentVocab));
  }

  await writeJsonFile('vote-history.json', {
    generatedAt: new Date().toISOString(),
    // Spelled out in the file itself so the archive is readable without reading this script.
    voteChars: { y: 'yes', n: 'no', a: 'abstain', x: 'no_show', '.': 'kein Mandat zu diesem Zeitpunkt' },
    periods,
  });
  await writeMetaFile({
    voteHistoryGeneratedAt: new Date().toISOString(),
    voteHistoryPeriodIds: HISTORY_PERIOD_IDS,
  });

  const allPolls = periods.flatMap((p) => p.polls);
  const mapped = allPolls.filter((p) => p.currentTopics.length > 0).length;
  const unmapped = [...new Set(allPolls.filter((p) => p.currentTopics.length === 0).map((p) => p.topic))];
  console.log(`\nDone: ${allPolls.length} polls across ${periods.length} periods.`);
  console.log(`  ${mapped} carry at least one current-vocabulary topic, ${allPolls.length - mapped} carry none.`);
  if (unmapped.length) console.log(`  unreachable by a current-vocabulary filter: ${unmapped.join(' | ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
