/**
 * The site-wide search: one function that matches a query against every kind of page the site
 * has (MPs, votes, organisations, parties, committees, Sitzungswochen-Briefings) and ranks the
 * hits. Shared by the header dropdown and the /suche results page, so both always agree on what
 * matches and in which order.
 *
 * Ranking is by how well the NAME matches first — typing "Springer" must put "Axel Springer SE"
 * above an organisation that merely contains the word somewhere — and only then by each type's
 * own tie-breaker (organisations: linked to parliament first, then lobby spend).
 */
import { fuzzyIncludes } from '../helpers';

const COMBINING_MARKS_RE = new RegExp('[\\u0300-\\u036f]', 'g');
const fold = (s: string) => s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(COMBINING_MARKS_RE, '');

/**
 * How well `text` matches `query`, lower is better; null = no match.
 *   0 exact · 1 starts with · 2 a word starts with · 3 contains · 4 typo-tolerant (fuzzyIncludes)
 */
export function matchRank(text: string, query: string): number | null {
  const q = fold(query.trim());
  if (!q) return null;
  const t = fold(text);
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q))) return 2;
  if (t.includes(q)) return 3;
  // Typos only from five letters on: at four, one wrong letter already turns "bahn" into "Hahn".
  return q.length >= 5 && fuzzyIncludes(text, query) ? 4 : null;
}

/** Best rank over several fields (e.g. an MP's name and constituency); null if none match. */
function bestRank(fields: (string | null | undefined)[], query: string): number | null {
  let best: number | null = null;
  for (const f of fields) {
    if (!f) continue;
    const r = matchRank(f, query);
    if (r !== null && (best === null || r < best)) best = r;
  }
  return best;
}

export interface SearchMp {
  id: number;
  name: string;
  party: string;
  constituency: string;
  color: string;
}
export interface SearchBill {
  id: number;
  title: string;
  date: string;
  topic: string;
  topics: string[];
  /** Set only for archived votes from closed terms. */
  term: string | null;
  accepted?: boolean;
}
export interface SearchOrg {
  id: string;
  name: string;
  city: string | null;
  /** The reported annual lobby spend range (the register only reports ranges), if any. */
  spendFrom: number | null;
  spendTo: number | null;
  /** Tied to an MP, a vote or a donation on this site. */
  linked: boolean;
}
export interface SearchParty {
  name: string;
  color: string;
}
export interface SearchCommittee {
  id: string;
  name: string;
  memberCount: number;
}
export interface SearchBriefing {
  week: string;
  start: string;
  end: string;
  isoWeek: number;
  pollCount: number;
}

export interface SearchSources {
  mps: SearchMp[];
  bills: SearchBill[];
  orgs: SearchOrg[];
  parties: SearchParty[];
  committees: SearchCommittee[];
  briefings: SearchBriefing[];
}

export type SearchGroup = 'mps' | 'bills' | 'orgs' | 'parties' | 'committees' | 'briefings';
export const SEARCH_GROUPS: SearchGroup[] = ['mps', 'bills', 'orgs', 'parties', 'committees', 'briefings'];

export interface SearchResults {
  mps: SearchMp[];
  bills: SearchBill[];
  orgs: SearchOrg[];
  parties: SearchParty[];
  committees: SearchCommittee[];
  /** Briefings matched by their week ("KW 41", a date) or because one of their votes matched. */
  briefings: SearchBriefing[];
  total: number;
  /** Groups with hits, best-matching first: typing "afd" leads with the party, "springer" with the MP. */
  groupOrder: SearchGroup[];
}

export const MIN_QUERY_LENGTH = 2;

/** ISO week number of a YYYY-MM-DD date (UTC). */
export function isoWeekOf(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // the week's Thursday decides the ISO year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

const byRankThen = <T>(rank: Map<T, number>, then: (a: T, b: T) => number) => (a: T, b: T) => rank.get(a)! - rank.get(b)! || then(a, b);

export function searchAll(query: string, src: SearchSources): SearchResults {
  const q = query.trim();
  const empty: SearchResults = { mps: [], bills: [], orgs: [], parties: [], committees: [], briefings: [], total: 0, groupOrder: [] };
  if (q.length < MIN_QUERY_LENGTH) return empty;

  const rankAll = <T>(items: T[], fields: (item: T) => (string | null | undefined)[]) => {
    const ranks = new Map<T, number>();
    for (const item of items) {
      const r = bestRank(fields(item), q);
      if (r !== null) ranks.set(item, r);
    }
    // Typo tolerance is a fallback: once a group has real matches, near-misses ("Spinder" for
    // "Springer") only add noise, so they are dropped.
    if ([...ranks.values()].some((r) => r < 4)) for (const [item, r] of ranks) if (r >= 4) ranks.delete(item);
    return ranks;
  };

  // Typo tolerance on names only: "Lahn-Dill" is one letter from "Bahn", and a constituency that
  // merely resembles the query is noise, not a lead.
  const mpRanks = rankAll(src.mps, (m) => [m.name, matchRank(m.constituency, q) === 4 ? null : m.constituency]);
  // A name match beats an equally good constituency match: "han" must list Hanna Steinmüller
  // before an MP from "Hannover-Land".
  for (const m of mpRanks.keys()) if (matchRank(m.name, q) !== mpRanks.get(m)) mpRanks.set(m, mpRanks.get(m)! + 0.5);
  const mps = [...mpRanks.keys()].sort(byRankThen(mpRanks, (a, b) => a.name.localeCompare(b.name, 'de')));

  // Topics count, but never beat a title match: a vote titled "…Verkehr…" outranks one that is
  // only tagged with the topic.
  const billRanks = new Map<SearchBill, number>();
  for (const b of src.bills) {
    const titleRank = matchRank(b.title, q);
    const topicRank = bestRank(b.topics, q);
    const r = titleRank ?? (topicRank !== null ? 5 + topicRank : null);
    if (r !== null) billRanks.set(b, r);
  }
  const bills = [...billRanks.keys()].sort(byRankThen(billRanks, (a, b) => b.date.localeCompare(a.date)));

  const orgRanks = rankAll(src.orgs, (o) => [o.name]);
  const orgs = [...orgRanks.keys()].sort(
    byRankThen(orgRanks, (a, b) => Number(b.linked) - Number(a.linked) || (b.spendFrom ?? -1) - (a.spendFrom ?? -1) || a.name.localeCompare(b.name, 'de')),
  );

  const partyRanks = rankAll(src.parties, (p) => [p.name]);
  const parties = [...partyRanks.keys()].sort(byRankThen(partyRanks, (a, b) => a.name.localeCompare(b.name, 'de')));

  const committeeRanks = rankAll(src.committees, (c) => [c.name]);
  const committees = [...committeeRanks.keys()].sort(byRankThen(committeeRanks, (a, b) => a.name.localeCompare(b.name, 'de')));

  // A briefing matches on its own label ("KW 41", "Sitzungswoche", a date) or because a vote it
  // covers matched — searching "Bahnstrecke" should also offer the week that vote was in.
  const billWeeks = new Set(bills.filter((b) => b.term === null).map((b) => b.date));
  const briefingRanks = new Map<SearchBriefing, number>();
  for (const w of src.briefings) {
    const own = bestRank([`KW ${w.isoWeek}`, `Sitzungswoche ${w.start}`, `Briefing ${w.end}`, w.start, w.end], q);
    const viaVote = [...billWeeks].some((d) => d >= w.start && d <= w.end) ? 6 : null;
    const r = own ?? viaVote;
    if (r !== null) briefingRanks.set(w, r);
  }
  const briefings = [...briefingRanks.keys()].sort(byRankThen(briefingRanks, (a, b) => b.week.localeCompare(a.week)));

  const best = (ranks: Map<unknown, number>) => (ranks.size ? Math.min(...ranks.values()) : Infinity);
  const groupRank: Record<SearchGroup, number> = {
    mps: best(mpRanks),
    bills: best(billRanks),
    orgs: best(orgRanks),
    parties: best(partyRanks),
    committees: best(committeeRanks),
    briefings: best(briefingRanks),
  };
  // Stable sort: equally good groups keep the default order above.
  const groupOrder = SEARCH_GROUPS.filter((g) => groupRank[g] !== Infinity).sort((a, b) => groupRank[a] - groupRank[b]);

  return {
    groupOrder,
    mps,
    bills,
    orgs,
    parties,
    committees,
    briefings,
    total: mps.length + bills.length + orgs.length + parties.length + committees.length + briefings.length,
  };
}
