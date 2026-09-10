/**
 * The "Sitzungswochen-Briefing".
 *
 * - `public/data/stories.json` is a compact index of every sitting week (newest first). It
 *   rides in useSnapshot() (~2 KB gzipped) and powers the landing-page tiles and the "Briefing
 *   anzeigen" buttons on /abstimmungen.
 * - `public/data/stories/<montag>.json` is one week's full briefing. Its detail page
 *   (/sitzungswoche/<montag>) lazy-loads it on first use and caches it for the session.
 *
 * No prose lives in the data: every sentence is assembled from a `t.sw*` template in
 * src/data.ts. See scripts/build-stories.mjs for why.
 */
import { useEffect, useState } from 'react';
import { fetchLocalJson } from './snapshot';

export interface StoryPartyTally {
  party: string;
  color: string;
  yes: number;
  no: number;
  abstain: number;
  noShow: number;
  majority: 'yes' | 'no' | 'abstain' | null;
}

export interface StoryPoll {
  id: number;
  slug: string;
  title: string;
  date: string;
  topic: string;
  accepted: boolean;
  totals: { yes: number; no: number; abstain: number; noShow: number };
  /** Per-fraction breakdown — shown when the poll row is expanded. */
  partyBreakdown: StoryPartyTally[];
  divergingCount: number;
  lobbyingOrgCount: number;
  /** The first three organisations that reported lobbying on this bill. */
  lobbyingOrgs: { id: string; name: string }[];
  conflictCount: number;
}

export interface StoryCohesionRow {
  party: string;
  color: string;
  cast: number;
  withMajority: number;
  pct: number;
}

export interface StoryDonationMarker {
  party: string;
  allTime: boolean;
  months?: number;
}

export interface StoryDonation {
  amountEuro: number;
  party: string;
  /** The fraction the party belongs to — the key its donations page is routed by. */
  fraction: string;
  donor: string | null;
  donorCity: string | null;
  receivedOn: string | null;
  publishedOn: string | null;
  alsoGivesToParties: string[];
  largestSince: StoryDonationMarker | null;
}

export interface StoryRef {
  id: number;
  slug: string;
  title: string;
}

/** One sitting week's full briefing — public/data/stories/<montag>.json. */
export interface StoryIssue {
  week: string;
  generatedAt: string | null;
  /** 1-based position in the term (oldest sitting week = 1). */
  number: number;
  /** ISO-8601 calendar week number. */
  isoWeek: number;
  dateRange: { start: string; end: string };
  prevWeek: string | null;
  nextWeek: string | null;
  pollCount: number;
  polls: StoryPoll[];
  divergingTotal: number;
  mostDivergent: (StoryRef & { divergingCount: number }) | null;
  closest: (StoryRef & { margin: number; yes: number; no: number }) | null;
  cohesion: { top: StoryCohesionRow; bottom: StoryCohesionRow } | null;
  cohesionAll: StoryCohesionRow[];
  absence: { total: number; byParty: { party: string; color: string; noShow: number }[]; topParty: { party: string; color: string; noShow: number } | null };
  donations: {
    count: number;
    sumEuro: number;
    largest: StoryDonation | null;
    multiPartyDonor: { donor: string; parties: string[] } | null;
    all: StoryDonation[];
  };
  donationYearToDate: { fraction: string; sumEuro: number; count: number; year: number }[];
  ytdLeader: { fraction: string; sumEuro: number; count: number; year: number } | null;
  topics: { label: string; count: number }[];
}

/** One row of the index — public/data/stories.json. */
export interface StoryIndexEntry {
  week: string;
  dateRange: { start: string; end: string };
  pollCount: number;
  acceptedCount: number;
  divergingTotal: number;
  donationCount: number;
  donationSumEuro: number;
  /** The four totals of each vote in the week, for the landing-page band strip. */
  pollTotals: { yes: number; no: number; abstain: number; noShow: number }[];
  /** Closest vote of the week (the sole vote when there was only one). */
  closest: (StoryRef & { margin: number; yes: number; no: number }) | null;
  topics: string[];
  headline: StoryRef | null;
}

export interface StoriesIndex {
  generatedAt: string | null;
  /** Newest week first. */
  issues: StoryIndexEntry[];
}

const detailPromises = new Map<string, Promise<StoryIssue>>();

function loadDetail(week: string): Promise<StoryIssue> {
  let p = detailPromises.get(week);
  if (!p) {
    p = fetchLocalJson<StoryIssue>(`/data/stories/${week}.json`).catch((e) => {
      detailPromises.delete(week);
      throw e;
    });
    detailPromises.set(week, p);
  }
  return p;
}

export interface StoryDetailState {
  issue: StoryIssue | null;
  loading: boolean;
  error: string | null;
}

/** One week's full briefing, by its Monday — lazy-loaded and cached for the session. */
export function useStoryDetail(week: string | null): StoryDetailState {
  const [issue, setIssue] = useState<StoryIssue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!week) {
      setIssue(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setIssue(null);
    setError(null);
    loadDetail(week)
      .then((data) => !cancelled && setIssue(data))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Sitzungswoche konnte nicht geladen werden'));
    return () => {
      cancelled = true;
    };
  }, [week]);

  return { issue, loading: !!week && !issue && !error, error };
}
