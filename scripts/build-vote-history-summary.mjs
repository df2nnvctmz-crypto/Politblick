#!/usr/bin/env node
/**
 * Derives a small per-member summary of the long-run voting record from public/data/vote-history.json.
 *
 * Why this file exists at all: the archive is 2.6 MB (410 KB gzipped) and only a member profile
 * needs the vote-by-vote detail, so it is lazy-loaded there. But the landing page wants one line
 * of long-run context per member, and pulling 2.6 MB into the first page every visitor sees —
 * most of whom never scroll to that section — would be a real regression for a single sentence
 * of text. This file is ~1/20th the size and carries exactly the aggregates that sentence needs.
 *
 * No network: like build-lobby-links.mjs it reads committed input and re-runs in a couple of
 * seconds, so it is cheap to regenerate whenever the archive changes.
 *
 * IMPORTANT — this reimplements the alignment rule that src/polls.ts owns
 * (computeMemberAlignment: skip no_show, skip Fraktionslos, compare against the member's own
 * fraction's stored majority). Two implementations of a rule that decides whether a named person
 * "voted against their party" is a real hazard, so scripts/verify-vote-history-summary.mjs
 * recomputes every member from the archive independently and fails if the two ever disagree.
 * Run it after changing either side.
 */
import { pathToFileURL } from 'node:url';
import { readJsonFile, writeJsonFile } from './lib/common.mjs';

const CHAR_TO_VOTE = { y: 'yes', n: 'no', a: 'abstain', x: 'no_show' };
const NO_MANDATE = '.';
const NO_FRACTION = 'Fraktionslos';

/** Field order of each member's compact array — spelled out in the output so it reads without this file. */
const FIELDS = ['ratedCount', 'divergenceCount', 'opposedCount', 'abstainedCount', 'brokeAbstentionCount', 'alignmentPct', 'fractionAlignmentPct', 'termCount'];

function round1(value) {
  return Math.round(value * 1000) / 10;
}

export function summariseArchive(archive) {
  /** politicianId -> running totals */
  const acc = new Map();

  for (const period of archive.periods) {
    for (let slot = 0; slot < period.members.length; slot++) {
      const member = period.members[slot];
      let entry = acc.get(member.id);
      if (!entry) {
        entry = { rated: 0, diverged: 0, opposed: 0, abstained: 0, broke: 0, fracAligned: 0, fracRated: 0, terms: new Set() };
        acc.set(member.id, entry);
      }

      for (const poll of period.polls) {
        if (!poll.partyBreakdown) continue;
        const voteChar = poll.votes[slot];
        if (!voteChar || voteChar === NO_MANDATE) continue;
        const vote = CHAR_TO_VOTE[voteChar];
        // Non-participation is not a position, so it is never counted for or against anyone.
        if (!vote || vote === 'no_show') continue;

        const partyChar = poll.parties[slot];
        if (!partyChar || partyChar === NO_MANDATE) continue;
        const party = period.parties[parseInt(partyChar, 36)]?.name;
        // Independents have no whip to break, so they are unrated rather than perfectly loyal.
        if (!party || party === NO_FRACTION) continue;

        const tally = poll.partyBreakdown.find((p) => p.party === party);
        if (!tally || !tally.majority) continue;

        entry.terms.add(period.id);
        entry.rated++;
        if (vote !== tally.majority) {
          entry.diverged++;
          if (vote === 'abstain') entry.abstained++;
          else if (tally.majority === 'abstain') entry.broke++;
          else entry.opposed++;
        }
        // The fraction's own loyalty on this same vote — the comparison that makes the member's
        // percentage readable — read straight off the stored tally.
        entry.fracAligned += tally.majority === 'yes' ? tally.yes : tally.majority === 'no' ? tally.no : tally.abstain;
        entry.fracRated += tally.yes + tally.no + tally.abstain;
      }
    }
  }

  const members = {};
  for (const [politicianId, e] of acc) {
    // A member who never cast a rated vote (only no_shows, or only ever independent) carries no
    // information here, and an entry of zeroes would render as flawless loyalty.
    if (e.rated === 0) continue;
    members[politicianId] = [
      e.rated,
      e.diverged,
      e.opposed,
      e.abstained,
      e.broke,
      round1((e.rated - e.diverged) / e.rated),
      e.fracRated > 0 ? round1(e.fracAligned / e.fracRated) : null,
      e.terms.size,
    ];
  }
  return members;
}

async function main() {
  const archive = await readJsonFile('vote-history.json', null);
  if (!archive?.periods?.length) {
    throw new Error('public/data/vote-history.json is missing or empty — run scripts/fetch-history.mjs first');
  }

  const members = summariseArchive(archive);
  const sorted = [...archive.periods].sort((a, b) => a.start.localeCompare(b.start));
  const pollCount = archive.periods.reduce((n, p) => n + p.polls.length, 0);

  await writeJsonFile('vote-history-summary.json', {
    // Inherited from the archive, not `new Date()`. This output is a pure function of its input,
    // so stamping the run time would make every rebuild a diff even when nothing changed — and
    // that noise is what stops a rebuild from being usable as a CI guard. Identical input now
    // produces byte-identical output.
    generatedAt: archive.generatedAt,
    fields: FIELDS,
    coverage: {
      fromDate: sorted[0].start,
      toDate: sorted.at(-1).end,
      firstTerm: sorted[0].label,
      lastTerm: sorted.at(-1).label,
      termCount: sorted.length,
      pollCount,
    },
    members,
  });

  console.log(`${Object.keys(members).length} members summarised across ${sorted.length} terms / ${pollCount} polls`);
  console.log(`  coverage ${sorted[0].start} – ${sorted.at(-1).end}`);
}

// Only run when invoked directly, so the verifier can import summariseArchive() without side effects.
// pathToFileURL rather than string concatenation: on Windows process.argv[1] is a drive path, and
// the naive `file://${path}` form yields two slashes where the real URL has three — the guard then
// silently never matches and the script exits having done nothing.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
