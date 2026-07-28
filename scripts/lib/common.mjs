// Shared helpers for the snapshot-fetch scripts. Plain ESM/JS (no build step) so it runs
// directly under whatever Node the GitHub Actions runner provides — Node 18+ has native fetch.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const API_BASE = 'https://www.abgeordnetenwatch.de/api/v2';
export const BUNDESTAG_PARLIAMENT_ID = 5;

export const REAL_PARTY_COLORS = {
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

export const CATEGORY_LABELS = {
  29228: 'Unternehmensfunktion',
  29229: 'Funktion in einer öffentlich-rechtlichen Körperschaft',
  29230: 'Vereins- oder Stiftungsfunktion',
  29231: 'Kapital- oder Gesellschaftsanteile',
  29232: 'Politische Spende/Zuwendung',
  29233: 'Zusage für eine Tätigkeit nach dem Mandat',
  29234: 'Berufliche Tätigkeit vor dem Mandat',
  29647: 'Vergütete Tätigkeit neben dem Mandat',
};

export const INTERVAL_MAP = { 0: 'once', '0': 'once', 1: 'monthly', '1': 'monthly', 2: 'annual', '2': 'annual' };

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function canonicalPartyName(rawLabel) {
  const cleaned = rawLabel
    .replace(/\s*\(Bundestag[^)]*\)/, '')
    .replace(/­/g, '')
    .trim();
  if (/GR[UÜ]NEN?/i.test(cleaned) || /B[UÜ]NDNIS/i.test(cleaned)) return 'Grüne';
  if (/^Die Linke$/i.test(cleaned)) return 'Linke';
  if (/fraktionslos/i.test(cleaned)) return 'Fraktionslos';
  return cleaned;
}

export function stripLabelPrefix(label) {
  return label
    .replace(/\s*\(Bundestag[^)]*\)/, '')
    .replace(/^\d+\s*-\s*/, '')
    .trim();
}

export function stripHtml(html) {
  return html.replace(/<[^>]+>/g, '').trim();
}

export function initialsOf(name) {
  return name.split(' ').map((w) => w[0]).filter(Boolean).join('').slice(0, 3);
}

/**
 * Fetch with retry (429/5xx get a real backoff, respecting Retry-After) — this runs
 * sequentially from a single CI job, so it doesn't need the concurrency/rate-limit machinery
 * the browser app has; `paced()` below is what actually keeps us under 30 req/min.
 */
export async function fetchJson(url, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const header = res.headers.get('retry-after');
        const waitMs = header && !Number.isNaN(Number(header)) ? Number(header) * 1000 : 60_000;
        console.warn(`  429 rate-limited, waiting ${Math.round(waitMs / 1000)}s…`);
        await sleep(waitMs);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (e) {
      lastError = e;
      if (attempt < attempts - 1) {
        await sleep(1000 * 2 ** attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unknown fetch error');
}

/** Enforces a minimum gap between successive calls — the actual rate-limit compliance mechanism. */
export function makePacer(minGapMs) {
  let last = 0;
  return async () => {
    const wait = last + minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  };
}

export async function fetchCurrentLegislaturePeriod() {
  const json = await fetchJson(
    `${API_BASE}/parliament-periods?parliament=${BUNDESTAG_PARLIAMENT_ID}&range_end=5&sort_by=id&sort_direction=desc`,
  );
  const legislature = json.data.find((p) => p.type === 'legislature');
  if (!legislature) throw new Error('No current Bundestag legislature period found');
  return legislature;
}

export async function fetchAllPaginated(urlBuilder, pace) {
  const pageSize = 1000;
  let rangeStart = 0;
  const all = [];
  for (;;) {
    await pace();
    const json = await fetchJson(urlBuilder(rangeStart, rangeStart + pageSize));
    all.push(...json.data);
    const total = json.meta?.result?.total ?? all.length;
    rangeStart += pageSize;
    if (all.length >= total || json.data.length === 0) break;
  }
  return all;
}

export function transformMandate(raw) {
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

export function transformPoll(raw) {
  return {
    id: raw.id,
    title: raw.label,
    date: raw.field_poll_date,
    topic: raw.field_topics?.[0]?.label ?? '',
    accepted: !!raw.field_accepted,
    url: raw.abgeordnetenwatch_url,
  };
}

function majorityOf(yes, no, abstain) {
  if (yes === 0 && no === 0 && abstain === 0) return null;
  if (yes >= no && yes >= abstain) return 'yes';
  if (no >= yes && no >= abstain) return 'no';
  return 'abstain';
}

function mandateNameFromLabel(label) {
  return label.replace(/\s*\(Bundestag[^)]*\)/, '').trim();
}

export function computePollResult(rawVotes) {
  const votes = rawVotes.map((v) => ({
    mandateId: v.mandate.id,
    name: mandateNameFromLabel(v.mandate.label),
    party: v.fraction ? canonicalPartyName(v.fraction.label) : 'Fraktionslos',
    vote: v.vote,
  }));
  const partyMap = new Map();
  let totalYes = 0;
  let totalNo = 0;
  let totalAbstain = 0;
  let totalNoShow = 0;
  for (const v of votes) {
    const bucket = partyMap.get(v.party) || { yes: 0, no: 0, abstain: 0, noShow: 0 };
    if (v.vote === 'yes') {
      bucket.yes++;
      totalYes++;
    } else if (v.vote === 'no') {
      bucket.no++;
      totalNo++;
    } else if (v.vote === 'abstain') {
      bucket.abstain++;
      totalAbstain++;
    } else {
      bucket.noShow++;
      totalNoShow++;
    }
    partyMap.set(v.party, bucket);
  }
  const partyBreakdown = [...partyMap.entries()]
    .map(([party, tally]) => ({
      party,
      color: REAL_PARTY_COLORS[party] || FALLBACK_PARTY_COLOR,
      ...tally,
      majority: majorityOf(tally.yes, tally.no, tally.abstain),
    }))
    .sort((a, b) => b.yes + b.no + b.abstain + b.noShow - (a.yes + a.no + a.abstain + a.noShow));
  const validTotal = totalYes + totalNo + totalAbstain;
  const yesPct = validTotal > 0 ? Math.round((totalYes / validTotal) * 100) : 0;
  return { totalYes, totalNo, totalAbstain, totalNoShow, yesPct, partyBreakdown, votes };
}

export function transformSidejob(raw) {
  return {
    id: raw.id,
    title: raw.label,
    jobTitleExtra: raw.job_title_extra ?? null,
    organization: raw.sidejob_organization?.label ?? null,
    categoryLabel: (raw.category && CATEGORY_LABELS[raw.category]) || 'Sonstige Angabe',
    income: raw.income ?? null,
    incomeLevel: raw.income_level ?? null,
    interval: raw.interval != null ? (INTERVAL_MAP[raw.interval] ?? null) : null,
    topics: (raw.field_topics || []).map((t) => t.label),
    additionalInfo: raw.additional_information ? stripHtml(raw.additional_information) : null,
  };
}

const DATA_DIR = path.resolve(import.meta.dirname, '..', '..', 'public', 'data');

export async function readJsonFile(name, fallback) {
  try {
    const text = await readFile(path.join(DATA_DIR, name), 'utf-8');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(name, data) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, name), JSON.stringify(data), 'utf-8');
  console.log(`  wrote public/data/${name}`);
}
