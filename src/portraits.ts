import { useEffect, useRef, useState, type RefObject } from 'react';
import { API_BASE, fetchJson } from './bundestag';

interface ApiPoliticianDetail {
  qid_wikidata: string | null;
}

interface WikidataClaim {
  mainsnak: { datavalue?: { value: string } };
}

interface WikidataEntityResponse {
  entities: Record<string, { claims?: { P18?: WikidataClaim[] } }>;
}

async function fetchQid(politicianId: number): Promise<string | null> {
  const json = await fetchJson<{ data: ApiPoliticianDetail }>(`${API_BASE}/politicians/${politicianId}`);
  return json.data.qid_wikidata;
}

async function fetchPortraitFilename(qid: string): Promise<string | null> {
  const json = await fetchJson<WikidataEntityResponse>(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  return json.entities[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value ?? null;
}

function commonsFilePathUrl(filename: string, width = 300): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${width}`;
}

/**
 * Portrait comes from Wikidata's P18 (image) claim, linked via the politician's
 * qid_wikidata — real photo, no upload/hosting of our own. Concurrency across all rows
 * scrolled into view is throttled centrally in fetchJson's per-origin queue, not here.
 */
async function loadPortrait(politicianId: number): Promise<string | null> {
  const qid = await fetchQid(politicianId);
  if (!qid) return null;
  const filename = await fetchPortraitFilename(qid);
  return filename ? commonsFilePathUrl(filename) : null;
}

const portraitCache = new Map<number, Promise<string | null>>();

export interface PortraitState {
  url: string | null;
  loading: boolean;
}

/** Resolves a politician's portrait once `politicianId` is non-null. Pair with `useOnScreen` to only pass a non-null id once the element is actually visible, so a long list doesn't resolve everything at once. */
export function usePortrait(politicianId: number | null): PortraitState {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (politicianId === null) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    let cached = portraitCache.get(politicianId);
    if (!cached) {
      cached = loadPortrait(politicianId).catch(() => null);
      portraitCache.set(politicianId, cached);
    }
    cached.then((resolved) => {
      if (!cancelled) {
        setUrl(resolved);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [politicianId]);

  return { url, loading };
}

/** True once the referenced element has scrolled into view at least once (then stays true). */
export function useOnScreen<T extends Element>(rootMargin = '200px'): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen || !ref.current) return;
    const node = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen, rootMargin]);

  return [ref, seen];
}
