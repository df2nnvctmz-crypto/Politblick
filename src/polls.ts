import { useCallback, useEffect, useRef, useState } from 'react';
import {
  API_BASE,
  FALLBACK_PARTY_COLOR,
  REAL_PARTY_COLORS,
  canonicalPartyName,
  fetchCurrentLegislaturePeriodId,
  fetchJson,
} from './bundestag';

const POLL_INTERVAL_MS = 10 * 60 * 1000;

export type VoteChoice = 'yes' | 'no' | 'abstain' | 'no_show';

export interface RealPoll {
  id: number;
  title: string;
  date: string;
  topic: string;
  accepted: boolean;
  url: string;
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

interface ApiPoll {
  id: number;
  label: string;
  field_poll_date: string;
  field_accepted: boolean;
  field_topics: { label: string }[] | null;
  abgeordnetenwatch_url: string;
}

interface ApiVote {
  mandate: { id: number; label: string };
  vote: VoteChoice;
  fraction: { label: string } | null;
}

interface ApiMandateVote {
  poll: { id: number };
  vote: VoteChoice;
}

async function fetchAllPolls(periodId: number): Promise<ApiPoll[]> {
  const pageSize = 1000;
  let rangeStart = 0;
  const all: ApiPoll[] = [];
  for (;;) {
    const json = await fetchJson<{ data: ApiPoll[]; meta: { result: { total: number } } }>(
      `${API_BASE}/polls?field_legislature=${periodId}&range_start=${rangeStart}&range_end=${rangeStart + pageSize}&sort_by=field_poll_date&sort_direction=desc`,
    );
    all.push(...json.data);
    const total = json.meta?.result?.total ?? all.length;
    rangeStart += pageSize;
    if (all.length >= total || json.data.length === 0) break;
  }
  return all;
}

function transformPoll(raw: ApiPoll): RealPoll {
  return {
    id: raw.id,
    title: raw.label,
    date: raw.field_poll_date,
    topic: raw.field_topics?.[0]?.label ?? '',
    accepted: !!raw.field_accepted,
    url: raw.abgeordnetenwatch_url,
  };
}

function mandateNameFromLabel(label: string): string {
  return label.replace(/\s*\(Bundestag[^)]*\)/, '').trim();
}

async function fetchAllVotesForPoll(pollId: number): Promise<ApiVote[]> {
  const pageSize = 1000;
  let rangeStart = 0;
  const all: ApiVote[] = [];
  for (;;) {
    const json = await fetchJson<{ data: ApiVote[]; meta: { result: { total: number } } }>(
      `${API_BASE}/votes?poll=${pollId}&range_start=${rangeStart}&range_end=${rangeStart + pageSize}`,
    );
    all.push(...json.data);
    const total = json.meta?.result?.total ?? all.length;
    rangeStart += pageSize;
    if (all.length >= total || json.data.length === 0) break;
  }
  return all;
}

/** MPs whose vote on this poll differs from their own fraction's majority — a plain statistical fact, not an accusation. */
export function computeDivergences(result: PollResult): { poll: RealPoll; member: MemberVote; majorityVote: VoteChoice }[] {
  const out: { poll: RealPoll; member: MemberVote; majorityVote: VoteChoice }[] = [];
  for (const v of result.votes) {
    if (v.vote === 'no_show') continue;
    const partyTally = result.partyBreakdown.find((p) => p.party === v.party);
    if (!partyTally || !partyTally.majority) continue;
    if (v.vote !== partyTally.majority) {
      out.push({ poll: result.poll, member: v, majorityVote: partyTally.majority });
    }
  }
  return out;
}

function majorityOf(yes: number, no: number, abstain: number): VoteChoice | null {
  if (yes === 0 && no === 0 && abstain === 0) return null;
  if (yes >= no && yes >= abstain) return 'yes';
  if (no >= yes && no >= abstain) return 'no';
  return 'abstain';
}

async function computePollResult(poll: RealPoll): Promise<PollResult> {
  const rawVotes = await fetchAllVotesForPoll(poll.id);
  const votes: MemberVote[] = rawVotes.map((v) => ({
    mandateId: v.mandate.id,
    name: mandateNameFromLabel(v.mandate.label),
    party: v.fraction ? canonicalPartyName(v.fraction.label) : 'Fraktionslos',
    vote: v.vote,
  }));

  const partyMap = new Map<string, { yes: number; no: number; abstain: number; noShow: number }>();
  let totalYes = 0;
  let totalNo = 0;
  let totalAbstain = 0;
  let totalNoShow = 0;
  for (const v of votes) {
    const bucket = partyMap.get(v.party) || { yes: 0, no: 0, abstain: 0, noShow: 0 };
    if (v.vote === 'yes') {
      bucket.yes++;
      totalYes++;
    } else if (v.vote === 'no') {
      bucket.no++;
      totalNo++;
    } else if (v.vote === 'abstain') {
      bucket.abstain++;
      totalAbstain++;
    } else {
      bucket.noShow++;
      totalNoShow++;
    }
    partyMap.set(v.party, bucket);
  }
  const partyBreakdown: PartyTally[] = [...partyMap.entries()]
    .map(([party, tally]) => ({
      party,
      color: REAL_PARTY_COLORS[party] || FALLBACK_PARTY_COLOR,
      ...tally,
      majority: majorityOf(tally.yes, tally.no, tally.abstain),
    }))
    .sort((a, b) => b.yes + b.no + b.abstain + b.noShow - (a.yes + a.no + a.abstain + a.noShow));
  const validTotal = totalYes + totalNo + totalAbstain;
  const yesPct = validTotal > 0 ? Math.round((totalYes / validTotal) * 100) : 0;

  return { poll, totalYes, totalNo, totalAbstain, totalNoShow, yesPct, partyBreakdown, votes };
}

const pollResultCache = new Map<number, Promise<PollResult>>();
function getPollResult(poll: RealPoll): Promise<PollResult> {
  let cached = pollResultCache.get(poll.id);
  if (!cached) {
    cached = computePollResult(poll);
    pollResultCache.set(poll.id, cached);
    cached.catch(() => pollResultCache.delete(poll.id));
  }
  return cached;
}

function isoWeekRange(dateStr: string): { start: Date; end: Date } {
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

/** All roll-call votes ("Namentliche Abstimmungen") of the current Bundestag term — small, fetched in full. */
export function useAllPolls(): AllPollsState {
  const [polls, setPolls] = useState<RealPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const periodId = await fetchCurrentLegislaturePeriodId();
      const raw = await fetchAllPolls(periodId);
      const transformed = raw.map(transformPoll).sort((a, b) => b.date.localeCompare(a.date));
      setPolls(transformed);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler beim Laden der Abstimmungen');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  return { polls, loading, error, lastUpdated, refresh: load };
}

export interface WeeklyResultsState {
  results: PollResult[];
  weekRange: { start: Date; end: Date } | null;
  divergences: Divergence[];
  loading: boolean;
  error: string | null;
}

/** Full vote breakdowns for the most recent sitting week that actually had roll-call votes (handles recess gracefully). */
export function useWeeklyResults(polls: RealPoll[]): WeeklyResultsState {
  const [results, setResults] = useState<PollResult[]>([]);
  const [weekRange, setWeekRange] = useState<{ start: Date; end: Date } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (polls.length === 0) return;
    let cancelled = false;
    setLoading(true);
    const range = isoWeekRange(polls[0].date);
    const weekPolls = polls.filter((p) => {
      const d = new Date(`${p.date}T00:00:00Z`);
      return d >= range.start && d <= range.end;
    });
    Promise.allSettled(weekPolls.map((p) => getPollResult(p))).then((settled) => {
      if (cancelled) return;
      const pollResults = settled
        .filter((s): s is PromiseFulfilledResult<PollResult> => s.status === 'fulfilled')
        .map((s) => s.value);
      const failedCount = settled.length - pollResults.length;
      pollResults.sort((a, b) => b.poll.date.localeCompare(a.poll.date));
      setResults(pollResults);
      setWeekRange(range);
      // Partial failures (e.g. one flaky request among several) still show whatever loaded;
      // only surface an error when nothing came back at all.
      setError(failedCount > 0 && pollResults.length === 0 ? 'Unbekannter Fehler beim Laden der Abstimmungsergebnisse' : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [polls]);

  const divergences: Divergence[] = results.flatMap(computeDivergences);

  return { results, weekRange, divergences, loading, error };
}

export interface PollDetailState {
  result: PollResult | null;
  loading: boolean;
  error: string | null;
}

/** Fetches (or reuses the cached) full vote breakdown for one poll — used by the bill detail view. */
export function usePollResult(pollId: number | null, polls: RealPoll[]): PollDetailState {
  const [result, setResult] = useState<PollResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pollId === null) {
      setResult(null);
      return;
    }
    const poll = polls.find((p) => p.id === pollId);
    if (!poll) return;
    let cancelled = false;
    setLoading(true);
    setResult(null);
    getPollResult(poll)
      .then((r) => {
        if (!cancelled) {
          setResult(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pollId, polls]);

  return { result, loading, error };
}

export interface MandateVoteRecord {
  poll: RealPoll;
  vote: VoteChoice;
}

const mandateVotesCache = new Map<number, Promise<ApiMandateVote[]>>();
async function fetchMandateVotesRaw(mandateId: number): Promise<ApiMandateVote[]> {
  let cached = mandateVotesCache.get(mandateId);
  if (!cached) {
    cached = (async () => {
      const pageSize = 1000;
      let rangeStart = 0;
      const all: ApiMandateVote[] = [];
      for (;;) {
        const json = await fetchJson<{ data: ApiMandateVote[]; meta: { result: { total: number } } }>(
          `${API_BASE}/votes?mandate=${mandateId}&range_start=${rangeStart}&range_end=${rangeStart + pageSize}`,
        );
        all.push(...json.data);
        const total = json.meta?.result?.total ?? all.length;
        rangeStart += pageSize;
        if (all.length >= total || json.data.length === 0) break;
      }
      return all;
    })();
    mandateVotesCache.set(mandateId, cached);
    cached.catch(() => mandateVotesCache.delete(mandateId));
  }
  return cached;
}

export interface MandateVotesState {
  votes: MandateVoteRecord[];
  loading: boolean;
  error: string | null;
}

/** One member's full voting record across the term — fetched lazily when their profile's Votes tab is opened. */
export function useMandateVotes(mandateId: number | null, polls: RealPoll[]): MandateVotesState {
  const [votes, setVotes] = useState<MandateVoteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mandateId === null || polls.length === 0) {
      setVotes([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const pollsById = new Map(polls.map((p) => [p.id, p]));
    fetchMandateVotesRaw(mandateId)
      .then((raw) => {
        if (cancelled) return;
        const resolved = raw
          .map((v) => {
            const poll = pollsById.get(v.poll.id);
            return poll ? { poll, vote: v.vote } : null;
          })
          .filter((r): r is MandateVoteRecord => r !== null)
          .sort((a, b) => b.poll.date.localeCompare(a.poll.date));
        setVotes(resolved);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unbekannter Fehler beim Laden der Abstimmungen');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mandateId, polls]);

  return { votes, loading, error };
}

/**
 * How many of the most recent legislature-wide polls to use for "Parteitreue". Computing
 * this per member across their *entire* term would mean fetching every poll each of them
 * voted on individually — for 630 people that's not viable. Instead we fetch this fixed,
 * shared set of recent polls ONCE (each already contains all 630 members' votes, since
 * that's how the API returns them), then derive every member's alignment from that same
 * cached data with zero extra network calls. That's what makes it cheap enough to show in
 * the 630-row search list, not just one profile at a time.
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

/** Pure — no network. Derives one member's alignment from the shared recent-poll results. */
export function computeMemberAlignment(mandateId: number, recentResults: PollResult[]): AlignmentSummary {
  if (recentResults.length === 0) return EMPTY_ALIGNMENT;
  const points: AlignmentPoint[] = [];
  for (const result of recentResults) {
    const entry = result.votes.find((mv) => mv.mandateId === mandateId);
    if (!entry || entry.vote === 'no_show') continue;
    const majority = result.partyBreakdown.find((p) => p.party === entry.party)?.majority ?? null;
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
      const majority = result.partyBreakdown.find((p) => p.party === entry.party)?.majority ?? null;
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

/** Fetches (or reuses the cache for) the N most recent polls' full vote breakdowns, once, for the whole app. */
export function useRecentPollResults(polls: RealPoll[], count: number = RECENT_POLLS_COUNT): RecentPollResultsState {
  const [results, setResults] = useState<PollResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recentPolls = polls.slice(0, count);
  const key = recentPolls.map((p) => p.id).join(',');

  useEffect(() => {
    if (recentPolls.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.allSettled(recentPolls.map((p) => getPollResult(p))).then((settled) => {
      if (cancelled) return;
      const resolved = settled.filter((s): s is PromiseFulfilledResult<PollResult> => s.status === 'fulfilled').map((s) => s.value);
      setResults(resolved);
      setError(resolved.length === 0 ? 'Unbekannter Fehler beim Laden der Parteitreue-Daten' : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { results, loading, error };
}
