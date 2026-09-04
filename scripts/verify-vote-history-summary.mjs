#!/usr/bin/env node
/**
 * Checks public/data/vote-history-summary.json against a from-scratch recount of the archive.
 *
 * Why it exists: build-vote-history-summary.mjs necessarily restates the alignment rule that
 * src/polls.ts owns, because one runs in Node at build time and the other in the browser. Two
 * implementations of a rule that decides whether a named person "voted against their party" will
 * drift eventually, and the failure is silent — a wrong percentage looks exactly like a right one.
 *
 * So this deliberately shares no code with either. It rebuilds every fraction's majority line from
 * the raw vote/party strings rather than trusting the archive's stored partyBreakdown, then
 * recomputes each member from those. A disagreement means one of the three is wrong, and it exits
 * non-zero so it can gate a commit.
 *
 * Run after touching the summary builder, the archive format, or computeMemberAlignment().
 */
import { readJsonFile } from './lib/common.mjs';

const CHAR_TO_VOTE = { y: 'yes', n: 'no', a: 'abstain', x: 'no_show' };
const NO_MANDATE = '.';
const NO_FRACTION = 'Fraktionslos';

/** Independent majority rule — deliberately a separate copy of the same logic, not an import. */
function majorityOf(yes, no, abstain) {
  if (yes === 0 && no === 0 && abstain === 0) return null;
  if (yes >= no && yes >= abstain) return 'yes';
  if (no >= yes && no >= abstain) return 'no';
  return 'abstain';
}

function recount(archive) {
  const acc = new Map();

  for (const period of archive.periods) {
    // Rebuild every poll's per-party tally from the strings, ignoring poll.partyBreakdown entirely.
    const majoritiesByPoll = new Map();
    const talliesByPoll = new Map();
    for (const poll of period.polls) {
      const tallies = new Map();
      for (let i = 0; i < period.members.length; i++) {
        const partyChar = poll.parties[i];
        if (!partyChar || partyChar === NO_MANDATE) continue;
        const party = period.parties[parseInt(partyChar, 36)]?.name;
        if (!party) continue;
        const vote = CHAR_TO_VOTE[poll.votes[i]];
        const tally = tallies.get(party) ?? { yes: 0, no: 0, abstain: 0 };
        if (vote === 'yes') tally.yes++;
        else if (vote === 'no') tally.no++;
        else if (vote === 'abstain') tally.abstain++;
        tallies.set(party, tally);
      }
      const majorities = new Map();
      for (const [party, tally] of tallies) majorities.set(party, majorityOf(tally.yes, tally.no, tally.abstain));
      majoritiesByPoll.set(poll.id, majorities);
      talliesByPoll.set(poll.id, tallies);
    }

    for (let slot = 0; slot < period.members.length; slot++) {
      const member = period.members[slot];
      let e = acc.get(member.id);
      if (!e) {
        e = { rated: 0, diverged: 0, opposed: 0, abstained: 0, broke: 0, fracAligned: 0, fracRated: 0, terms: new Set() };
        acc.set(member.id, e);
      }
      for (const poll of period.polls) {
        const vote = CHAR_TO_VOTE[poll.votes[slot]];
        if (!vote || vote === 'no_show') continue;
        const partyChar = poll.parties[slot];
        if (!partyChar || partyChar === NO_MANDATE) continue;
        const party = period.parties[parseInt(partyChar, 36)]?.name;
        if (!party || party === NO_FRACTION) continue;
        const majority = majoritiesByPoll.get(poll.id).get(party);
        if (!majority) continue;

        e.terms.add(period.id);
        e.rated++;
        if (vote !== majority) {
          e.diverged++;
          if (vote === 'abstain') e.abstained++;
          else if (majority === 'abstain') e.broke++;
          else e.opposed++;
        }
        const tally = talliesByPoll.get(poll.id).get(party);
        e.fracAligned += majority === 'yes' ? tally.yes : majority === 'no' ? tally.no : tally.abstain;
        e.fracRated += tally.yes + tally.no + tally.abstain;
      }
    }
  }
  return acc;
}

const round1 = (v) => Math.round(v * 1000) / 10;

const archive = await readJsonFile('vote-history.json', null);
const summary = await readJsonFile('vote-history-summary.json', null);
// Absent archive is not a failure: this runs as a build gate, and a checkout without the data
// files must not block a deploy. A PRESENT archive with a missing summary is a failure, though —
// that is exactly the drift this exists to catch.
if (!archive?.periods?.length) {
  console.log('No vote-history.json — nothing to verify.');
  process.exit(0);
}
if (!summary?.members) {
  console.error('vote-history.json exists but vote-history-summary.json is missing or empty.');
  console.error('Run: node scripts/build-vote-history-summary.mjs');
  process.exit(1);
}
if (summary.generatedAt !== archive.generatedAt) {
  // The summary carries the archive's own timestamp, so a mismatch means it was derived from a
  // different archive than the one committed — stale numbers that would otherwise look fine.
  console.error(`Summary is stale: built from archive ${summary.generatedAt}, but the committed archive is ${archive.generatedAt}.`);
  console.error('Run: node scripts/build-vote-history-summary.mjs');
  process.exit(1);
}

const recounted = recount(archive);
const mismatches = [];
let checked = 0;

for (const [politicianId, e] of recounted) {
  const expected = e.rated === 0 ? null : [
    e.rated,
    e.diverged,
    e.opposed,
    e.abstained,
    e.broke,
    round1((e.rated - e.diverged) / e.rated),
    e.fracRated > 0 ? round1(e.fracAligned / e.fracRated) : null,
    e.terms.size,
  ];
  const actual = summary.members[politicianId] ?? null;
  if (expected === null && actual === null) continue;
  checked++;
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    mismatches.push({ politicianId, expected, actual });
  }
}

// A member present in the summary but absent from the recount would mean invented data.
for (const politicianId of Object.keys(summary.members)) {
  if (!recounted.has(Number(politicianId))) mismatches.push({ politicianId, expected: null, actual: summary.members[politicianId] });
}

console.log(`${checked} members cross-checked against an independent recount of ${archive.periods.reduce((n, p) => n + p.polls.length, 0)} polls`);
if (mismatches.length === 0) {
  console.log('OK — every summarised member matches.');
} else {
  console.error(`${mismatches.length} MISMATCH(ES):`);
  for (const m of mismatches.slice(0, 10)) {
    console.error(`  politician ${m.politicianId}`);
    console.error(`    summary : ${JSON.stringify(m.actual)}`);
    console.error(`    recount : ${JSON.stringify(m.expected)}`);
  }
  process.exit(1);
}
