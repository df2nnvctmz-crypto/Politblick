import { useEffect, useState } from 'react';
import type { RealMp, RealParty } from './bundestag';
import type { PartyTally, MemberVote, RealPoll, PollResult } from './polls';
import type { SidejobRecord } from './sidejobs';
import { EMPTY_LOBBY_LINKS, type LobbyLinks, type PartyDonation } from './lobby';

/**
 * All real data (roster, polls, vote breakdowns, sidejobs) is pre-fetched by the
 * scripts/fetch-*.mjs jobs on a schedule (GitHub Actions) and published as static JSON
 * under public/data/ — the browser never calls abgeordnetenwatch's API directly for this.
 * That's what keeps the site from hitting their fair-use limits regardless of how many
 * visitors it has, at the cost of the data being "as of the last scheduled run" rather than
 * live. Portraits (Wikidata) are the one exception and stay live — see portraits.ts.
 */

export interface SnapshotMeta {
  legislaturePeriodId: number | null;
  legislatureLabel: string | null;
  coreGeneratedAt: string | null;
  sidejobsGeneratedAt: string | null;
  lobbyRegisterGeneratedAt: string | null;
  partyDonationsGeneratedAt: string | null;
}

export interface Snapshot {
  members: RealMp[];
  parties: RealParty[];
  polls: RealPoll[];
  pollResults: Map<number, PollResult>;
  sidejobsByMandate: Map<number, SidejobRecord[]>;
  lobbyLinks: LobbyLinks;
  partyDonations: PartyDonation[];
  meta: SnapshotMeta;
}

interface RawPollResult {
  totalYes: number;
  totalNo: number;
  totalAbstain: number;
  totalNoShow: number;
  yesPct: number;
  partyBreakdown: PartyTally[];
  votes: MemberVote[];
}

async function fetchLocalJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Datensatz nicht gefunden: ${path} (${res.status})`);
  return (await res.json()) as T;
}

async function buildSnapshot(): Promise<Snapshot> {
  // Roster, polls and results are required — without them there is no site. Everything else
  // degrades to empty, so a member's profile still renders fully before the first
  // fetch-lobbyregister run has ever landed.
  const [roster, polls, pollResultsRaw, sidejobsRaw, lobbyLinks, partyDonations, meta] = await Promise.all([
    fetchLocalJson<{ members: RealMp[]; parties: RealParty[] }>('/data/roster.json'),
    fetchLocalJson<RealPoll[]>('/data/polls.json'),
    fetchLocalJson<Record<string, RawPollResult>>('/data/poll-results.json'),
    fetchLocalJson<Record<string, SidejobRecord[]>>('/data/sidejobs.json').catch(() => ({})),
    fetchLocalJson<LobbyLinks>('/data/lobby-links.json').catch(() => EMPTY_LOBBY_LINKS),
    fetchLocalJson<PartyDonation[]>('/data/party-donations.json').catch(() => []),
    fetchLocalJson<SnapshotMeta>('/data/meta.json').catch(() => ({
      legislaturePeriodId: null,
      legislatureLabel: null,
      coreGeneratedAt: null,
      sidejobsGeneratedAt: null,
      lobbyRegisterGeneratedAt: null,
      partyDonationsGeneratedAt: null,
    })),
  ]);

  const pollsById = new Map(polls.map((p) => [p.id, p]));
  const pollResults = new Map<number, PollResult>();
  for (const [idStr, raw] of Object.entries(pollResultsRaw)) {
    const poll = pollsById.get(Number(idStr));
    if (poll) pollResults.set(poll.id, { poll, ...raw });
  }

  const sidejobsByMandate = new Map<number, SidejobRecord[]>();
  for (const [idStr, records] of Object.entries(sidejobsRaw)) {
    sidejobsByMandate.set(Number(idStr), records);
  }

  return {
    members: roster.members,
    parties: roster.parties,
    polls,
    pollResults,
    sidejobsByMandate,
    lobbyLinks,
    partyDonations,
    meta,
  };
}

let snapshotPromise: Promise<Snapshot> | null = null;

function loadSnapshot(force = false): Promise<Snapshot> {
  if (force || !snapshotPromise) snapshotPromise = buildSnapshot();
  return snapshotPromise;
}

export interface SnapshotState {
  snapshot: Snapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Loads (once, cached for the session) the whole static data snapshot. Every other real-data hook derives from this — none of them hit the network individually. */
export function useSnapshot(): SnapshotState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadSnapshot(nonce > 0)
      .then((s) => {
        if (!cancelled) {
          setSnapshot(s);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unbekannter Fehler beim Laden der Daten');
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return {
    snapshot,
    loading: !snapshot && !error,
    error,
    refresh: () => setNonce((n) => n + 1),
  };
}
