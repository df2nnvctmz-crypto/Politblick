import { useSnapshot } from './snapshot';

export interface RealParty {
  name: string;
  color: string;
  seats: number;
}

export interface RealMp {
  id: number;
  mandateId: number;
  name: string;
  party: string;
  color: string;
  constituency: string;
  initials: string;
  profileUrl: string;
  // Wikidata portrait (via Commons Special:FilePath), resolved once at fetch time in
  // fetch-core.mjs. null if the member has no qid_wikidata or no P18 image claim.
  photoUrl: string | null;
}

export const REAL_PARTY_COLORS: Record<string, string> = {
  SPD: 'oklch(52% 0.16 25)',
  'CDU/CSU': 'oklch(25% 0.01 90)',
  Grüne: 'oklch(52% 0.1 150)',
  FDP: 'oklch(75% 0.15 100)',
  AfD: 'oklch(55% 0.11 240)',
  Linke: 'oklch(45% 0.15 340)',
  BSW: 'oklch(45% 0.08 290)',
  Fraktionslos: 'oklch(55% 0.01 260)',
};
export const FALLBACK_PARTY_COLOR = 'oklch(55% 0.01 260)';

export interface BundestagRosterState {
  members: RealMp[];
  parties: RealParty[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function useBundestagRoster(): BundestagRosterState {
  const { snapshot, loading, error, refresh } = useSnapshot();
  return {
    members: snapshot?.members ?? [],
    parties: snapshot?.parties ?? [],
    loading,
    error,
    lastUpdated: snapshot?.meta.coreGeneratedAt ? new Date(snapshot.meta.coreGeneratedAt) : null,
    refresh,
  };
}
