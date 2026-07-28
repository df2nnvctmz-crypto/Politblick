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
