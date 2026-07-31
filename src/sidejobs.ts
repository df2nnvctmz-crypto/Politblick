import { useSnapshot } from './snapshot';

export type SidejobInterval = 'once' | 'monthly' | 'annual';

export interface SidejobRecord {
  id: number;
  title: string;
  jobTitleExtra: string | null;
  organization: string | null;
  categoryLabel: string;
  income: number | null;
  incomeLevel: string | null;
  interval: SidejobInterval | null;
  topics: string[];
  additionalInfo: string | null;
}

export interface SidejobsState {
  records: SidejobRecord[];
  loading: boolean;
  error: string | null;
}

/** A member's disclosed outside income/activities — from the static snapshot (see scripts/fetch-sidejobs.mjs, updated daily). */
export function useSidejobs(mandateId: number | null): SidejobsState {
  const { snapshot, loading, error } = useSnapshot();
  if (mandateId === null || !snapshot) return { records: [], loading, error };
  return { records: snapshot.sidejobsByMandate.get(mandateId) ?? [], loading, error };
}

/**
 * Official Bundestag "Stufe" (income level) midpoints, in euros — used only where a sidejob
 * discloses a bracket instead of an exact figure (Verhaltensregeln für Mitglieder des
 * Deutschen Bundestages, Anlage 1). Sort-ranking input only: never shown to the reader as a
 * real amount, since it's an estimate of a range, not a disclosed number.
 */
const INCOME_LEVEL_MIDPOINT: Record<string, number> = {
  '1': 2250, '2': 5250, '3': 11000, '4': 22500, '5': 40000,
  '6': 62500, '7': 87500, '8': 125000, '9': 200000, '10': 300000,
};

/** Rough per-member ranking score for "highest outside income" sorting — sums annualized exact incomes and bracket midpoints. Never rendered as a euro figure. */
export function estimateIncomeScore(records: SidejobRecord[]): number {
  let total = 0;
  for (const r of records) {
    if (r.income !== null) total += r.interval === 'monthly' ? r.income * 12 : r.income;
    else if (r.incomeLevel !== null) total += INCOME_LEVEL_MIDPOINT[r.incomeLevel] ?? 0;
  }
  return total;
}

/** Income scores for every member with disclosed sidejobs, keyed by mandate — powers the roster income sort. */
export function buildMemberIncomeScores(sidejobsByMandate: Map<number, SidejobRecord[]>): Map<number, number> {
  const scores = new Map<number, number>();
  for (const [mandateId, records] of sidejobsByMandate) scores.set(mandateId, estimateIncomeScore(records));
  return scores;
}
