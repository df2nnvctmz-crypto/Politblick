import { useSnapshot } from './snapshot';

export type VoteChoice = 'yes' | 'no' | 'abstain' | 'no_show';

export interface RealPoll {
  id: number;
  title: string;
  date: string;
  /** The poll's primary topic — abgeordnetenwatch's first `field_topics` entry. For display. */
  topic: string;
  /**
   * Every topic the poll carries. 71% of polls have more than one, and six labels (Verkehr,
   * Wirtschaft, Staat und Verwaltung, Soziale Sicherung, Innere Sicherheit, Wissenschaft) never
   * appear first at all, so anything that *matches* on topic (search, policy-area ties,
   * committee relevance) must use this rather than `topic`. Normalised in snapshot.ts, so it is always a
   * non-empty array even for a snapshot written before this field existed.
   */
  topics: string[];
  accepted: boolean;
  url: string;
  /** Drucksache(n) ("21/6278") this poll's own intro text links to — see drucksacheUrl() in lobby.ts for the source-document link. */
  drucksachen: string[];
  /** Plain-language write-up of the vote, from abgeordnetenwatch's own editorial field_intro — null if they never wrote one for this poll. */
  summary: string | null;
}

export interface MemberVote {
  mandateId: number;
  name: string;
  party: string;
  vote: VoteChoice;
}

export interface PartyTally {
  party: string;
  color: string;
  yes: number;
  no: number;
  abstain: number;
  noShow: number;
  majority: VoteChoice | null;
}

export interface PollResult {
  poll: RealPoll;
  totalYes: number;
  totalNo: number;
  totalAbstain: number;
  totalNoShow: number;
  yesPct: number;
  partyBreakdown: PartyTally[];
  votes: MemberVote[];
}

export interface Divergence {
  poll: RealPoll;
  member: MemberVote;
  majorityVote: VoteChoice;
}

/**
 * "Fraktionslos" ("no fraction") is the bucket abgeordnetenwatch assigns to independent MPs —
 * it groups together members with no whip and often no relation to one another at all. It is
 * not a fraction with a line to hold, so a "majority" computed across that bucket describes
 * nothing about any individual member's expected behaviour. Every place below that measures
 * "voted against their own fraction" must treat Fraktionslos as unrated, never as a fraction.
 */
const NO_FRACTION = 'Fraktionslos';

/** MPs whose vote on this poll differs from their own fraction's majority — a plain statistical fact, not an accusation. Independents (Fraktionslos) have no fraction line to diverge from, so they're excluded. */
export function computeDivergences(result: PollResult): Divergence[] {
  const out: Divergence[] = [];
  for (const v of result.votes) {
    if (v.vote === 'no_show' || v.party === NO_FRACTION) continue;
    const partyTally = result.partyBreakdown.find((p) => p.party === v.party);
    if (!partyTally || !partyTally.majority) continue;
    if (v.vote !== partyTally.majority) {
      out.push({ poll: result.poll, member: v, majorityVote: partyTally.majority });
    }
  }
  return out;
}

export function isoWeekRange(dateStr: string): { start: Date; end: Date } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dayIndex = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dayIndex);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday, end: sunday };
}

export interface AllPollsState {
  polls: RealPoll[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

/** All roll-call votes ("Namentliche Abstimmungen") of the current Bundestag term — from the static snapshot. */
export function useAllPolls(): AllPollsState {
  const { snapshot, loading, error, refresh } = useSnapshot();
  return {
    polls: snapshot?.polls ?? [],
    loading,
    error,
    lastUpdated: snapshot?.meta.coreGeneratedAt ? new Date(snapshot.meta.coreGeneratedAt) : null,
    refresh,
  };
}

export interface WeeklyResultsState {
  results: PollResult[];
  weekRange: { start: Date; end: Date } | null;
  divergences: Divergence[];
  loading: boolean;
  error: string | null;
}

/** Full vote breakdowns for the most recent sitting week that actually had roll-call votes (handles recess gracefully). Pure derivation from the snapshot — no fetching. */
export function useWeeklyResults(polls: RealPoll[]): WeeklyResultsState {
  const { snapshot, loading, error } = useSnapshot();
  if (!snapshot || polls.length === 0) {
    return { results: [], weekRange: null, divergences: [], loading, error };
  }
  const range = isoWeekRange(polls[0].date);
  const results = polls
    .filter((p) => {
      const d = new Date(`${p.date}T00:00:00Z`);
      return d >= range.start && d <= range.end;
    })
    .map((p) => snapshot.pollResults.get(p.id))
    .filter((r): r is PollResult => r !== undefined)
    .sort((a, b) => b.poll.date.localeCompare(a.poll.date));
  const divergences: Divergence[] = results.flatMap(computeDivergences);
  return { results, weekRange: range, divergences, loading, error };
}

export interface PollDetailState {
  result: PollResult | null;
  loading: boolean;
  error: string | null;
}

/** One poll's full vote breakdown — used by the bill detail view. Pure lookup in the snapshot. */
export function usePollResult(pollId: number | null): PollDetailState {
  const { snapshot, loading, error } = useSnapshot();
  if (pollId === null) return { result: null, loading: false, error: null };
  const result = snapshot?.pollResults.get(pollId) ?? null;
  return { result, loading, error: !loading && !result ? error : error };
}

export interface MandateVoteRecord {
  poll: RealPoll;
  vote: VoteChoice;
}

export interface MandateVotesState {
  votes: MandateVoteRecord[];
  loading: boolean;
  error: string | null;
}

/** One member's full voting record across the term — derived by scanning the snapshot's poll results for their mandate id. */
export function useMandateVotes(mandateId: number | null): MandateVotesState {
  const { snapshot, loading, error } = useSnapshot();
  if (mandateId === null || !snapshot) return { votes: [], loading, error };
  const votes: MandateVoteRecord[] = [];
  for (const result of snapshot.pollResults.values()) {
    const entry = result.votes.find((v) => v.mandateId === mandateId);
    if (entry) votes.push({ poll: result.poll, vote: entry.vote });
  }
  votes.sort((a, b) => b.poll.date.localeCompare(a.poll.date));
  return { votes, loading, error };
}

export interface PartyVoteRecord {
  poll: RealPoll;
  tally: PartyTally;
}

export interface PartyVotesState {
  votes: PartyVoteRecord[];
  loading: boolean;
  error: string | null;
}

/** One party's full voting record across the term — its tally on every poll it appears in, derived by scanning the snapshot's poll results for that party's name. */
export function usePartyVotes(party: string | null): PartyVotesState {
  const { snapshot, loading, error } = useSnapshot();
  if (party === null || !snapshot) return { votes: [], loading, error };
  const votes: PartyVoteRecord[] = [];
  for (const result of snapshot.pollResults.values()) {
    const tally = result.partyBreakdown.find((p) => p.party === party);
    if (tally) votes.push({ poll: result.poll, tally });
  }
  votes.sort((a, b) => b.poll.date.localeCompare(a.poll.date));
  return { votes, loading, error };
}

/**
 * How many of the most recent legislature-wide polls to use for "Parteitreue". Now that all
 * poll results are already in the static snapshot, using the full term would be just as
 * cheap — this stays a bounded recent window because it's a more meaningful "how are they
 * voting lately" signal than a term-long average would be, not because of fetch cost anymore.
 */
export const RECENT_POLLS_COUNT = 10;

export interface AlignmentPoint {
  poll: RealPoll;
  vote: VoteChoice;
  party: string;
  aligned: boolean | null;
}

export interface AlignmentSummary {
  points: AlignmentPoint[];
  alignedCount: number;
  ratedCount: number;
  alignmentPct: number | null;
  windowSize: number;
}

const EMPTY_ALIGNMENT: AlignmentSummary = { points: [], alignedCount: 0, ratedCount: 0, alignmentPct: null, windowSize: 0 };

/**
 * Pure — no network. Derives one member's alignment from the shared recent-poll results.
 * Independents (Fraktionslos) are always unrated (`aligned: null`) — see NO_FRACTION above.
 */
export function computeMemberAlignment(mandateId: number, recentResults: PollResult[]): AlignmentSummary {
  if (recentResults.length === 0) return EMPTY_ALIGNMENT;
  const points: AlignmentPoint[] = [];
  for (const result of recentResults) {
    const entry = result.votes.find((mv) => mv.mandateId === mandateId);
    if (!entry || entry.vote === 'no_show') continue;
    const majority =
      entry.party === NO_FRACTION ? null : (result.partyBreakdown.find((p) => p.party === entry.party)?.majority ?? null);
    points.push({ poll: result.poll, vote: entry.vote, party: entry.party, aligned: majority ? entry.vote === majority : null });
  }
  points.sort((a, b) => a.poll.date.localeCompare(b.poll.date));
  const rated = points.filter((p) => p.aligned !== null);
  const alignedCount = rated.filter((p) => p.aligned).length;
  return {
    points,
    alignedCount,
    ratedCount: rated.length,
    alignmentPct: rated.length > 0 ? Math.round((alignedCount / rated.length) * 100) : null,
    windowSize: recentResults.length,
  };
}

/**
 * Same as computeMemberAlignment, but for every member found in the results at once — a
 * single pass over the (small) recent-results set instead of one pass per member. Use this
 * for the search list (up to 630 rows) rather than calling computeMemberAlignment per row,
 * which would redo the same O(polls × votes) scan hundreds of times per render.
 */
export function computeAllAlignments(recentResults: PollResult[]): Map<number, AlignmentSummary> {
  const byMandate = new Map<number, AlignmentPoint[]>();
  for (const result of recentResults) {
    for (const entry of result.votes) {
      if (entry.vote === 'no_show') continue;
      const majority =
        entry.party === NO_FRACTION ? null : (result.partyBreakdown.find((p) => p.party === entry.party)?.majority ?? null);
      const list = byMandate.get(entry.mandateId) ?? [];
      list.push({ poll: result.poll, vote: entry.vote, party: entry.party, aligned: majority ? entry.vote === majority : null });
      byMandate.set(entry.mandateId, list);
    }
  }
  const summaries = new Map<number, AlignmentSummary>();
  for (const [mandateId, points] of byMandate) {
    points.sort((a, b) => a.poll.date.localeCompare(b.poll.date));
    const rated = points.filter((p) => p.aligned !== null);
    const alignedCount = rated.filter((p) => p.aligned).length;
    summaries.set(mandateId, {
      points,
      alignedCount,
      ratedCount: rated.length,
      alignmentPct: rated.length > 0 ? Math.round((alignedCount / rated.length) * 100) : null,
      windowSize: recentResults.length,
    });
  }
  return summaries;
}

export interface RecentPollResultsState {
  results: PollResult[];
  loading: boolean;
  error: string | null;
}

/** The N most recent polls' full vote breakdowns — pure lookup in the snapshot, no fetching. */
export function useRecentPollResults(polls: RealPoll[], count: number = RECENT_POLLS_COUNT): RecentPollResultsState {
  const { snapshot, loading, error } = useSnapshot();
  if (!snapshot) return { results: [], loading, error };
  const results = polls
    .slice(0, count)
    .map((p) => snapshot.pollResults.get(p.id))
    .filter((r): r is PollResult => r !== undefined);
  return { results, loading, error };
}

export interface AllPollResultsState {
  results: PollResult[];
  loading: boolean;
  error: string | null;
}

/** Every poll's full vote breakdown, most recent first — pure lookup in the snapshot, no fetching. Backs the "all polls" list view. */
export function useAllPollResults(polls: RealPoll[]): AllPollResultsState {
  const { snapshot, loading, error } = useSnapshot();
  if (!snapshot) return { results: [], loading, error };
  const results = polls
    .map((p) => snapshot.pollResults.get(p.id))
    .filter((r): r is PollResult => r !== undefined);
  return { results, loading, error };
}
