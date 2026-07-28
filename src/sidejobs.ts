import { useEffect, useState } from 'react';
import { API_BASE, fetchJson } from './bundestag';

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

interface ApiSidejob {
  id: number;
  label: string;
  job_title_extra: string | null;
  category: string | null;
  income_level: string | null;
  income: number | null;
  interval: string | null;
  sidejob_organization: { label: string } | null;
  field_topics: { label: string }[] | null;
  additional_information: string | null;
}

/**
 * Bundestag disclosure categories per the "Verhaltensregeln für Mitglieder des Deutschen
 * Bundestages" (Anlage 1). This is the members' own outside income/activities — not
 * campaign donations or lobby-organization data, which are separate, real datasets not
 * yet wired in (see the lobby-register and party-donations phases of the roadmap).
 */
const CATEGORY_LABELS: Record<string, string> = {
  '29228': 'Unternehmensfunktion',
  '29229': 'Funktion in einer öffentlich-rechtlichen Körperschaft',
  '29230': 'Vereins- oder Stiftungsfunktion',
  '29231': 'Kapital- oder Gesellschaftsanteile',
  '29232': 'Politische Spende/Zuwendung',
  '29233': 'Zusage für eine Tätigkeit nach dem Mandat',
  '29234': 'Berufliche Tätigkeit vor dem Mandat',
  '29647': 'Vergütete Tätigkeit neben dem Mandat',
};

const INTERVAL_MAP: Record<string, SidejobInterval> = {
  '0': 'once',
  '1': 'monthly',
  '2': 'annual',
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

async function fetchAllSidejobs(mandateId: number): Promise<ApiSidejob[]> {
  const pageSize = 1000;
  let rangeStart = 0;
  const all: ApiSidejob[] = [];
  for (;;) {
    const json = await fetchJson<{ data: ApiSidejob[]; meta: { result: { total: number } } }>(
      `${API_BASE}/sidejobs?mandates=${mandateId}&range_start=${rangeStart}&range_end=${rangeStart + pageSize}`,
    );
    all.push(...json.data);
    const total = json.meta?.result?.total ?? all.length;
    rangeStart += pageSize;
    if (all.length >= total || json.data.length === 0) break;
  }
  return all;
}

function transformSidejob(raw: ApiSidejob): SidejobRecord {
  return {
    id: raw.id,
    title: raw.label,
    jobTitleExtra: raw.job_title_extra,
    organization: raw.sidejob_organization?.label ?? null,
    categoryLabel: (raw.category && CATEGORY_LABELS[raw.category]) || 'Sonstige Angabe',
    income: raw.income,
    incomeLevel: raw.income_level,
    interval: raw.interval ? (INTERVAL_MAP[raw.interval] ?? null) : null,
    topics: (raw.field_topics || []).map((t) => t.label),
    additionalInfo: raw.additional_information ? stripHtml(raw.additional_information) : null,
  };
}

const sidejobsCache = new Map<number, Promise<SidejobRecord[]>>();

export interface SidejobsState {
  records: SidejobRecord[];
  loading: boolean;
  error: string | null;
}

/** A member's disclosed outside income/activities — fetched lazily when their profile's tab is opened. */
export function useSidejobs(mandateId: number | null): SidejobsState {
  const [records, setRecords] = useState<SidejobRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mandateId === null) {
      setRecords([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    let cached = sidejobsCache.get(mandateId);
    if (!cached) {
      cached = fetchAllSidejobs(mandateId).then((raw) => raw.map(transformSidejob));
      sidejobsCache.set(mandateId, cached);
      cached.catch(() => sidejobsCache.delete(mandateId));
    }
    cached
      .then((resolved) => {
        if (!cancelled) {
          setRecords(resolved);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unbekannter Fehler beim Laden der Nebeneinkünfte');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mandateId]);

  return { records, loading, error };
}
