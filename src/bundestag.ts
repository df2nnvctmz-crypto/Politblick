import { useSnapshot } from './snapshot';

export const API_BASE = 'https://www.abgeordnetenwatch.de/api/v2';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The roster/polls/votes/sidejobs data all comes from the pre-fetched static snapshot now
 * (see snapshot.ts) — the browser no longer talks to abgeordnetenwatch live for those. The
 * one thing that's still live per-visitor is portraits (portraits.ts): a small
 * abgeordnetenwatch lookup for each politician's qid_wikidata, plus a Wikidata call. This
 * retry/throttle/rate-limit machinery exists to keep *that* well-behaved — it's total volume
 * is tiny compared to what the old live roster/votes fetching used to generate.
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
  return 60_000;
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
