import { useCallback, useEffect, useRef, useState } from 'react';

export const API_BASE = 'https://www.abgeordnetenwatch.de/api/v2';
const BUNDESTAG_PARLIAMENT_ID = 5;
const POLL_INTERVAL_MS = 10 * 60 * 1000;

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

interface ApiFractionMembership {
  valid_until: string | null;
  fraction: { label: string };
}

interface ApiMandate {
  id: number;
  politician: { id: number; label: string; abgeordnetenwatch_url: string } | null;
  fraction_membership: ApiFractionMembership[] | null;
  electoral_data: {
    constituency: { label: string } | null;
    electoral_list: { label: string } | null;
  } | null;
}

interface ApiParliamentPeriod {
  id: number;
  type: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * abgeordnetenwatch's server hard-fails requests (connection refused — a plain
 * "TypeError: Failed to fetch", not even a clean 429) once too many land on it at once:
 * measured 6 concurrent = fine, 8 = 3 failures, 10 = all failed. This app can easily burst
 * past that — roster + polls + weekly results load together, and opening a profile adds
 * votes + sidejobs + a two-step portrait lookup on top. A per-origin queue caps how many
 * requests are actually in flight at once, regardless of how many hooks ask for data
 * simultaneously.
 */
const MAX_CONCURRENT_PER_ORIGIN = 4;
const activeByOrigin = new Map<string, number>();
const queueByOrigin = new Map<string, (() => void)[]>();

function runThrottled<T>(origin: string, fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeByOrigin.set(origin, (activeByOrigin.get(origin) ?? 0) + 1);
      fn()
        .then(resolve, reject)
        .finally(() => {
          activeByOrigin.set(origin, (activeByOrigin.get(origin) ?? 1) - 1);
          const queue = queueByOrigin.get(origin);
          const next = queue?.shift();
          if (next) next();
        });
    };
    if ((activeByOrigin.get(origin) ?? 0) < MAX_CONCURRENT_PER_ORIGIN) {
      run();
    } else {
      const queue = queueByOrigin.get(origin) ?? [];
      queue.push(run);
      queueByOrigin.set(origin, queue);
    }
  });
}

/**
 * abgeordnetenwatch's documented fair-use policy: 30 requests/minute per IP, and on 429 the
 * client should back off and retry after a pause (they suggest ~60s). Rather than wait to
 * get 429'd, we proactively cap ourselves under the limit with a sliding window — that's
 * the "fair" behavior they're asking for, and it also means an interactive session (browse
 * a few profiles) basically never hits the reactive 429 path below at all. Only applied to
 * abgeordnetenwatch's own origin — Wikidata/Commons (for portraits) aren't covered by this
 * policy and have their own, much more generous limits.
 */
const RATE_LIMITED_ORIGIN = 'https://www.abgeordnetenwatch.de';
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 27; // small safety margin under the documented 30/min
const requestTimestamps: number[] = [];

async function waitForRateLimitSlot(origin: string): Promise<void> {
  if (origin !== RATE_LIMITED_ORIGIN) return;
  for (;;) {
    const now = Date.now();
    while (requestTimestamps.length && now - requestTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
      requestTimestamps.shift();
    }
    if (requestTimestamps.length < RATE_LIMIT_MAX_PER_WINDOW) {
      requestTimestamps.push(now);
      return;
    }
    await sleep(RATE_LIMIT_WINDOW_MS - (now - requestTimestamps[0]) + 100);
  }
}

function parseRetryAfterMs(res: Response): number {
  const header = res.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (!Number.isNaN(seconds)) return seconds * 1000;
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  return 60_000; // abgeordnetenwatch's own suggested default when no header is present
}

export async function fetchJson<T>(url: string, attempts = 3): Promise<T> {
  const origin = new URL(url).origin;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await waitForRateLimitSlot(origin);
      const res = await runThrottled(origin, () => fetch(url));
      if (res.status === 429) {
        const waitMs = parseRetryAfterMs(res);
        if (attempt < attempts - 1) {
          await sleep(waitMs);
          continue;
        }
        throw new Error('abgeordnetenwatch API error 429 (rate limited)');
      }
      if (!res.ok) throw new Error(`abgeordnetenwatch API error ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastError = e;
      if (attempt < attempts - 1) {
        await sleep(400 * 2 ** attempt + Math.random() * 200);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unknown fetch error');
}

export function canonicalPartyName(rawLabel: string): string {
  const cleaned = rawLabel
    .replace(/\s*\(Bundestag[^)]*\)/, '')
    .replace(/­/g, '')
    .trim();
  if (/GR[UÜ]NEN?/i.test(cleaned) || /B[UÜ]NDNIS/i.test(cleaned)) return 'Grüne';
  if (/^Die Linke$/i.test(cleaned)) return 'Linke';
  if (/fraktionslos/i.test(cleaned)) return 'Fraktionslos';
  return cleaned;
}

function stripLabelPrefix(label: string): string {
  return label
    .replace(/\s*\(Bundestag[^)]*\)/, '')
    .replace(/^\d+\s*-\s*/, '')
    .trim();
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 3);
}

export async function fetchCurrentLegislaturePeriodId(): Promise<number> {
  const json = await fetchJson<{ data: ApiParliamentPeriod[] }>(
    `${API_BASE}/parliament-periods?parliament=${BUNDESTAG_PARLIAMENT_ID}&range_end=5&sort_by=id&sort_direction=desc`,
  );
  const legislature = json.data.find((p) => p.type === 'legislature');
  if (!legislature) throw new Error('Keine aktuelle Wahlperiode gefunden');
  return legislature.id;
}

async function fetchAllMandates(periodId: number): Promise<ApiMandate[]> {
  const pageSize = 1000;
  let rangeStart = 0;
  const all: ApiMandate[] = [];
  for (;;) {
    const json = await fetchJson<{ data: ApiMandate[]; meta: { result: { total: number } } }>(
      `${API_BASE}/candidacies-mandates?parliament_period=${periodId}&range_start=${rangeStart}&range_end=${rangeStart + pageSize}`,
    );
    all.push(...json.data);
    const total = json.meta?.result?.total ?? all.length;
    rangeStart += pageSize;
    if (all.length >= total || json.data.length === 0) break;
  }
  return all;
}

function transformMandate(raw: ApiMandate): RealMp | null {
  const politician = raw.politician;
  if (!politician?.label) return null;
  const activeFraction = (raw.fraction_membership || []).find((f) => !f.valid_until);
  const party = activeFraction ? canonicalPartyName(activeFraction.fraction.label) : 'Fraktionslos';
  const constituencyLabel = raw.electoral_data?.constituency?.label;
  const listLabel = raw.electoral_data?.electoral_list?.label;
  const constituency = stripLabelPrefix(constituencyLabel || listLabel || '');
  return {
    id: politician.id,
    mandateId: raw.id,
    name: politician.label,
    party,
    color: REAL_PARTY_COLORS[party] || FALLBACK_PARTY_COLOR,
    constituency,
    initials: initialsOf(politician.label),
    profileUrl: politician.abgeordnetenwatch_url,
  };
}

export interface BundestagRosterState {
  members: RealMp[];
  parties: RealParty[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function useBundestagRoster(): BundestagRosterState {
  const [members, setMembers] = useState<RealMp[]>([]);
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
      const raw = await fetchAllMandates(periodId);
      const transformed = raw
        .map(transformMandate)
        .filter((m): m is RealMp => m !== null)
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
      setMembers(transformed);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler beim Laden der Abgeordnetenliste');
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

  const partyCounts = new Map<string, number>();
  for (const m of members) partyCounts.set(m.party, (partyCounts.get(m.party) || 0) + 1);
  const parties: RealParty[] = [...partyCounts.entries()]
    .map(([name, seats]) => ({ name, seats, color: REAL_PARTY_COLORS[name] || FALLBACK_PARTY_COLOR }))
    .sort((a, b) => b.seats - a.seats);

  return { members, parties, loading, error, lastUpdated, refresh: load };
}
