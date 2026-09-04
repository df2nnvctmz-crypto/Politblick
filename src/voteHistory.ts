import { useEffect, useState } from 'react';
import { computeMemberAlignment, type PartyTally, type PollResult, type RealPoll, type VoteChoice } from './polls';
import { fetchLocalJson } from './snapshot';

/**
 * The long-run voting record: every roll-call of the closed Bundestag terms, from
 * public/data/vote-history.json (see scripts/fetch-history.mjs).
 *
 * Why this is loaded separately from useSnapshot() rather than added to it: the archive is
 * ~1.3 MB and only a member profile ever needs it, while useSnapshot() blocks the first paint
 * of every page including the home page. So it is fetched on first use and cached for the
 * session — a visitor who never opens a profile never pays for it.
 *
 * What it is for: a single divergence from the fraction line means nothing without knowing how
 * many votes it is drawn from, and how loyal that member's colleagues were over the same
 * stretch. Ten recent polls cannot answer either question; 338 across eight years can.
 */

/** One character per member, aligned to the period's `members` array. `.` = held no mandate then. */
const CHAR_TO_VOTE: Record<string, VoteChoice> = { y: 'yes', n: 'no', a: 'abstain', x: 'no_show' };
const NO_MANDATE = '.';

interface ArchivedPoll extends RealPoll {
  /** The poll's topics expressed in the CURRENT vocabulary — see data/topic-merge-map.json. */
  currentTopics: string[];
  partyBreakdown: PartyTally[];
  votes: string;
  parties: string;
}

interface ArchivedMember {
  id: number;
  mandateId: number;
  name: string;
  party: string;
}

interface ArchivePeriod {
  id: number;
  label: string;
  start: string;
  end: string;
  parties: { name: string; color: string }[];
  members: ArchivedMember[];
  polls: ArchivedPoll[];
}

interface VoteHistoryFile {
  generatedAt: string;
  periods: ArchivePeriod[];
}

let archivePromise: Promise<VoteHistoryFile> | null = null;

function loadArchive(): Promise<VoteHistoryFile> {
  if (!archivePromise) {
    archivePromise = fetchLocalJson<VoteHistoryFile>('/data/vote-history.json').catch((e) => {
      // Let a later profile view retry rather than caching the failure for the whole session.
      archivePromise = null;
      throw e;
    });
  }
  return archivePromise;
}

export interface TopicDivergence {
  topic: string;
  divergences: number;
  rated: number;
}

/**
 * Not all divergences are the same act, and lumping them together overstates dissent.
 *
 * `opposed`         — the fraction voted yes and the member voted no, or the reverse. Outright
 *                     opposition, and the only one that deserves to be read that way.
 * `abstained`       — the fraction took a side, the member abstained. A registered reservation,
 *                     not a vote against; treating it as one is exactly the kind of overclaim
 *                     this site is supposed to avoid.
 * `brokeAbstention` — the fraction abstained and the member cast a real vote. They took a
 *                     position their fraction declined to take, which is a third thing again.
 *
 * Across the archive these run roughly 61% / 29% / 10%, so the distinction is not a corner case:
 * nearly four in ten "divergences" are not a vote against anything.
 */
export type DivergenceKind = 'opposed' | 'abstained' | 'brokeAbstention';

export interface HistoricDivergence {
  pollId: number;
  title: string;
  date: string;
  topics: string[];
  vote: VoteChoice;
  majority: VoteChoice;
  party: string;
  kind: DivergenceKind;
  termLabel: string;
  url: string;
}

function classify(vote: VoteChoice, majority: VoteChoice): DivergenceKind {
  if (vote === 'abstain') return 'abstained';
  if (majority === 'abstain') return 'brokeAbstention';
  return 'opposed';
}

export interface HistoricAlignment {
  /** Terms this member actually sat in, oldest first. Empty means: no earlier mandate on file. */
  terms: { label: string; ratedCount: number; divergenceCount: number }[];
  ratedCount: number;
  divergenceCount: number;
  /** The divergence count broken out by what the member actually did — see DivergenceKind. */
  opposedCount: number;
  abstainedCount: number;
  brokeAbstentionCount: number;
  /** Every divergent vote, newest first — the detail behind the summary, for the votes tab. */
  divergences: HistoricDivergence[];
  alignmentPct: number | null;
  /**
   * The average loyalty of the member's OWN fraction over exactly the same polls — the number
   * that makes the member's own percentage readable. 97% looks independent next to a fraction
   * average of 99%, and unremarkable next to one of 96%.
   */
  fractionAlignmentPct: number | null;
  /** Topics where this member diverged, most divergences first. */
  topTopics: TopicDivergence[];
  loading: boolean;
  error: boolean;
}

const EMPTY: HistoricAlignment = {
  terms: [],
  ratedCount: 0,
  divergenceCount: 0,
  opposedCount: 0,
  abstainedCount: 0,
  brokeAbstentionCount: 0,
  divergences: [],
  alignmentPct: null,
  fractionAlignmentPct: null,
  topTopics: [],
  loading: false,
  error: false,
};

/**
 * Rebuilds an ordinary PollResult from an archived poll, carrying only the one member's vote.
 *
 * The point of going back through PollResult rather than comparing characters directly is that
 * computeMemberAlignment() — the single definition of "voted against their own fraction",
 * including its Fraktionslos and no_show exclusions — then applies to an eight-year-old vote
 * exactly as it does to last week's. The stored `partyBreakdown.majority` comes from the same
 * majorityOf() that writes poll-results.json, so both sides of that comparison agree too.
 */
function pollResultForMember(poll: ArchivedPoll, slot: number, member: ArchivedMember, period: ArchivePeriod): PollResult | null {
  // `partyBreakdown` was added to the archive after the first backfill. Without it there is no
  // majority line, so alignment is not merely unknown — it is unanswerable, and the poll is
  // skipped rather than counted as loyal. The data files are refreshed by a scheduled job, not
  // by the deploy, so the frontend can legitimately meet an older archive than it was built for.
  if (!poll.partyBreakdown) return null;
  const voteChar = poll.votes[slot];
  if (!voteChar || voteChar === NO_MANDATE) return null;
  const vote = CHAR_TO_VOTE[voteChar];
  if (!vote) return null;
  const partyChar = poll.parties[slot];
  // The fraction the member sat in ON THE DAY of this vote, not their final one — members change
  // fraction mid-term, and loyalty is only meaningful against the whip they were under then.
  const party = partyChar && partyChar !== NO_MANDATE ? (period.parties[parseInt(partyChar, 36)]?.name ?? member.party) : member.party;
  return {
    poll,
    totalYes: 0,
    totalNo: 0,
    totalAbstain: 0,
    totalNoShow: 0,
    yesPct: 0,
    partyBreakdown: poll.partyBreakdown,
    votes: [{ mandateId: member.mandateId, name: member.name, party, vote }],
  };
}

/** A fraction's own loyalty on one poll, straight from the stored tally: how many of its members voted its majority line, out of those who voted at all. */
function fractionLoyaltyOn(poll: ArchivedPoll, party: string): { aligned: number; rated: number } | null {
  const tally = poll.partyBreakdown.find((p) => p.party === party);
  if (!tally || !tally.majority) return null;
  const rated = tally.yes + tally.no + tally.abstain;
  if (rated === 0) return null;
  const aligned = tally.majority === 'yes' ? tally.yes : tally.majority === 'no' ? tally.no : tally.abstain;
  return { aligned, rated };
}

function summarise(archive: VoteHistoryFile, politicianId: number): HistoricAlignment {
  const terms: HistoricAlignment['terms'] = [];
  let ratedCount = 0;
  let divergenceCount = 0;
  let fractionAligned = 0;
  let fractionRated = 0;
  let opposedCount = 0;
  let abstainedCount = 0;
  let brokeAbstentionCount = 0;
  const divergences: HistoricDivergence[] = [];
  const byTopic = new Map<string, TopicDivergence>();

  // Oldest term first, so the profile reads as a timeline.
  const periods = [...archive.periods].sort((a, b) => a.start.localeCompare(b.start));
  for (const period of periods) {
    // The politician id is the ONLY key stable across terms — mandateId is issued per term, so
    // matching on it would silently find nobody in an earlier period.
    const slot = period.members.findIndex((m) => m.id === politicianId);
    if (slot === -1) continue;
    const member = period.members[slot];

    const results: PollResult[] = [];
    for (const poll of period.polls) {
      const result = pollResultForMember(poll, slot, member, period);
      if (result) results.push(result);
    }
    const alignment = computeMemberAlignment(member.mandateId, results);
    const termDivergences = alignment.ratedCount - alignment.alignedCount;
    terms.push({ label: period.label, ratedCount: alignment.ratedCount, divergenceCount: termDivergences });
    ratedCount += alignment.ratedCount;
    divergenceCount += termDivergences;

    for (const point of alignment.points) {
      if (point.aligned === null) continue;
      const loyalty = fractionLoyaltyOn(point.poll as ArchivedPoll, point.party);
      if (loyalty) {
        fractionAligned += loyalty.aligned;
        fractionRated += loyalty.rated;
      }
      const archived = point.poll as ArchivedPoll;
      if (point.aligned === false) {
        // The majority line is read back off the stored tally rather than recomputed, so the
        // classification rests on exactly the value computeMemberAlignment() just judged against.
        const majority = archived.partyBreakdown.find((p) => p.party === point.party)?.majority;
        if (majority) {
          const kind = classify(point.vote, majority);
          if (kind === 'opposed') opposedCount++;
          else if (kind === 'abstained') abstainedCount++;
          else brokeAbstentionCount++;
          divergences.push({
            pollId: archived.id,
            title: archived.title,
            date: archived.date,
            topics: archived.currentTopics ?? [],
            vote: point.vote,
            majority,
            party: point.party,
            kind,
            termLabel: period.label,
            url: archived.url,
          });
        }
      }
      // Counted per topic, and a poll tagged with several counts under each of them — a bill is
      // genuinely about all its topics, and the denominator is what keeps that honest.
      for (const topic of archived.currentTopics ?? []) {
        const entry = byTopic.get(topic) ?? { topic, divergences: 0, rated: 0 };
        entry.rated++;
        if (point.aligned === false) entry.divergences++;
        byTopic.set(topic, entry);
      }
    }
  }

  divergences.sort((a, b) => b.date.localeCompare(a.date));

  const topTopics = [...byTopic.values()]
    .filter((t) => t.divergences > 0)
    .sort((a, b) => b.divergences - a.divergences || b.rated - a.rated);

  return {
    terms,
    ratedCount,
    divergenceCount,
    opposedCount,
    abstainedCount,
    brokeAbstentionCount,
    divergences,
    alignmentPct: ratedCount > 0 ? Math.round(((ratedCount - divergenceCount) / ratedCount) * 1000) / 10 : null,
    fractionAlignmentPct: fractionRated > 0 ? Math.round((fractionAligned / fractionRated) * 1000) / 10 : null,
    topTopics,
    loading: false,
    error: false,
  };
}

export interface DividedVote {
  pollId: number;
  title: string;
  date: string;
  url: string;
  topics: string[];
  termLabel: string;
  deviators: number;
  rated: number;
  /** The fraction's own tally on this poll — what the line actually was, and how the rest fell. */
  /** Who departed from the line on this vote, grouped by how they voted. */
  deviatorList: { politicianId: number; name: string; vote: VoteChoice }[];
  majority: VoteChoice;
  yes: number;
  no: number;
  abstain: number;
  noShow: number;
  /**
   * Share of the fraction that departed from its own majority. Reported as the plain fact it is
   * and left to the reader.
   *
   * An earlier version guessed from this share whether the whip had been lifted, labelled the
   * vote accordingly, and excluded it from the deviator counts. That was an unsourced claim
   * about parliamentary procedure: nothing in the data records whether a fraction released its
   * members, and the guess got the 2015 Greek bailout backwards — a whipped vote and the
   * defining rebellion of the fraction's euro-sceptic wing, labelled a free vote and deleted
   * from the rebels' own totals. The site does not infer the Lobbyregister's missing for/against
   * direction either (see README); this is the same rule. A share of 47.7% speaks for itself.
   */
  sharePct: number;
}

export interface PartyDissent {
  /** Share of all this fraction's cast votes that followed its own majority line. */
  cohesionPct: number | null;
  ratedCount: number;
  /** Polls this fraction actually voted on — the denominator for "how often were they divided". */
  pollCount: number;
  dividedVotes: DividedVote[];
  topDeviators: { politicianId: number; name: string; count: number }[];
  loading: boolean;
  error: boolean;
}

const EMPTY_PARTY: PartyDissent = { cohesionPct: null, ratedCount: 0, pollCount: 0, dividedVotes: [], topDeviators: [], loading: false, error: false };


function summariseParty(archive: VoteHistoryFile, party: string): PartyDissent {
  let aligned = 0;
  let rated = 0;
  let pollCount = 0;
  const dividedVotes: DividedVote[] = [];
  const deviatorCounts = new Map<number, { politicianId: number; name: string; count: number }>();

  for (const period of archive.periods) {
    const partyIndex = period.parties.findIndex((p) => p.name === party);
    if (partyIndex === -1) continue;
    const partyChar = partyIndex.toString(36);

    for (const poll of period.polls) {
      if (!poll.partyBreakdown) continue;
      const tally = poll.partyBreakdown.find((p) => p.party === party);
      if (!tally?.majority) continue;
      const pollRated = tally.yes + tally.no + tally.abstain;
      if (pollRated === 0) continue;
      const pollAligned = tally.majority === 'yes' ? tally.yes : tally.majority === 'no' ? tally.no : tally.abstain;
      const deviators = pollRated - pollAligned;
      aligned += pollAligned;
      rated += pollRated;
      pollCount++;
      if (deviators === 0) continue;

      const sharePct = Math.round((deviators / pollRated) * 1000) / 10;
      // Declared here and filled by the member loop below — the same array object goes into the
      // record, so the loop's pushes land in it.
      const divergedMembers: { politicianId: number; name: string; vote: VoteChoice }[] = [];
      dividedVotes.push({
        pollId: poll.id,
        title: poll.title,
        date: poll.date,
        url: poll.url,
        topics: poll.currentTopics ?? [],
        termLabel: period.label,
        deviators,
        rated: pollRated,
        majority: tally.majority,
        yes: tally.yes,
        no: tally.no,
        abstain: tally.abstain,
        noShow: tally.noShow,
        sharePct,
        deviatorList: divergedMembers,
      });

      for (let slot = 0; slot < period.members.length; slot++) {
        if (poll.parties[slot] !== partyChar) continue;
        const vote = CHAR_TO_VOTE[poll.votes[slot]];
        if (!vote || vote === 'no_show' || vote === tally.majority) continue;
        const member = period.members[slot];
        const entry = deviatorCounts.get(member.id) ?? { politicianId: member.id, name: member.name, count: 0 };
        entry.count++;
        deviatorCounts.set(member.id, entry);
        // Named, not just counted: on a one-member divergence the whole story is who it was, and
        // even on a 103-way split the names are what let a reader recognise a wing.
        divergedMembers.push({ politicianId: member.id, name: member.name, vote });
      }
      // Grouped so the reader sees the shape of the split — all the Ja voters together where the
      // line was Nein — rather than an alphabetical mix of two different positions.
      divergedMembers.sort((a, b) => a.vote.localeCompare(b.vote) || a.name.localeCompare(b.name, 'de'));
    }
  }

  dividedVotes.sort((a, b) => b.deviators - a.deviators || b.date.localeCompare(a.date));
  const topDeviators = [...deviatorCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8);

  return {
    cohesionPct: rated > 0 ? Math.round((aligned / rated) * 1000) / 10 : null,
    ratedCount: rated,
    pollCount,
    dividedVotes,
    topDeviators,
    loading: false,
    error: false,
  };
}

/** A fraction's internal dissent across the archived terms. Same lazy-loaded archive as profiles. */
export function usePartyVoteHistory(party: string | null): PartyDissent {
  const [state, setState] = useState<PartyDissent>(EMPTY_PARTY);

  useEffect(() => {
    // "Fraktionslos" is a residual bucket, not a fraction — it has no line to hold, so measuring
    // its cohesion would describe nothing.
    if (!party || party === 'Fraktionslos') {
      setState(EMPTY_PARTY);
      return;
    }
    let cancelled = false;
    setState({ ...EMPTY_PARTY, loading: true });
    loadArchive()
      .then((archive) => {
        if (!cancelled) setState(summariseParty(archive, party));
      })
      .catch(() => {
        if (!cancelled) setState({ ...EMPTY_PARTY, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [party]);

  return state;
}

/**
 * One member's record across the archived terms. Returns empty (not an error) for the 37% of
 * current members with no earlier mandate — "nothing on file" is a fact about them, not a
 * failure, and the UI says so rather than showing a misleading zero.
 */
export function useMemberVoteHistory(politicianId: number | null): HistoricAlignment {
  const [state, setState] = useState<HistoricAlignment>(EMPTY);

  useEffect(() => {
    if (politicianId == null) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    setState({ ...EMPTY, loading: true });
    loadArchive()
      .then((archive) => {
        if (!cancelled) setState(summarise(archive, politicianId));
      })
      .catch(() => {
        if (!cancelled) setState({ ...EMPTY, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [politicianId]);

  return state;
}
