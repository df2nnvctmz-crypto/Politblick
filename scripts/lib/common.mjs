// Shared helpers for the snapshot-fetch scripts. Plain ESM/JS (no build step) so it runs
// directly under whatever Node the GitHub Actions runner provides — Node 18+ has native fetch.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const API_BASE = 'https://www.abgeordnetenwatch.de/api/v2';
export const BUNDESTAG_PARLIAMENT_ID = 5;

export const LOBBY_API_BASE = 'https://api.lobbyregister.bundestag.de/rest/v2';
export const LOBBY_OPEN_DATA_PAGE =
  'https://www.lobbyregister.bundestag.de/informationen-und-hilfe/open-data-1049716';
/**
 * The Lobbyregister publishes one shared API key openly on its open-data page. It is not a
 * secret, but it *is* rotatable — so this constant is only the first guess. See
 * resolveLobbyApiKey() for how a rotation is recovered from automatically.
 */
export const SHARED_LOBBY_API_KEY = '5bHB2zrUuHR6YdPoZygQhWfg2CBrjUOi';

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
  // Matching bare "BÜNDNIS" here used to also catch BSW's official registered name
  // ("Bündnis Sahra Wagenknecht – Vernunft und Gerechtigkeit"), mislabeling its donations as
  // Grüne — every real "Bündnis 90/Die Grünen" variant already contains "Grünen" and is caught
  // by the first branch, so requiring "90" here is strictly narrower, not weaker.
  if (/GR[UÜ]NEN?/i.test(cleaned) || /B[UÜ]NDNIS\s*90/i.test(cleaned)) return 'Grüne';
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

const HTML_ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '’', '&apos;': '’' };

function decodeHtmlEntities(text) {
  return text.replace(/&(?:nbsp|amp|lt|gt|quot|#39|apos);/g, (m) => HTML_ENTITIES[m] ?? m);
}

export function stripHtml(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, '')).trim();
}

/**
 * abgeordnetenwatch's editorial write-up of a poll (field_intro) — plain-language, a few short
 * paragraphs, usually ending with the vote tally in prose. Unlike stripHtml() above, this keeps
 * paragraph breaks: naively stripping all tags from "...fortgeführt.</p><p>Bei der..." would glue
 * the two sentences together with no space between them.
 */
export function stripIntroHtml(html) {
  if (!html) return null;
  const withBreaks = String(html)
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

export function initialsOf(name) {
  return name.split(' ').map((w) => w[0]).filter(Boolean).join('').slice(0, 3);
}

/**
 * Fetch with retry (429/5xx get a real backoff, respecting Retry-After) — this runs
 * sequentially from a single CI job, so it doesn't need the concurrency/rate-limit machinery
 * the browser app has; `paced()` below is what actually keeps us under 30 req/min.
 *
 * `fetch()` has no default timeout, so a single stalled connection among the ~70 calls a run
 * makes would otherwise hang indefinitely instead of hitting the retry loop below — the same
 * failure mode fetchLobbyPage() already guards against with AbortSignal.timeout.
 */
export async function fetchJson(url, attempts = 5, init = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
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

/**
 * Member portrait, resolved via abgeordnetenwatch's qid_wikidata → Wikidata's P18 (image)
 * claim → a Commons Special:FilePath URL. No upload/hosting of our own. This used to run live
 * per-visitor in the browser (throttled 4-at-a-time), which was too slow to ever resolve more
 * than the first few rows of a 630-member roster — resolving it once here at fetch time instead
 * means every member's photo is just a static field in roster.json.
 */
export async function resolvePoliticianPhotoUrl(politicianId) {
  const politician = await fetchJson(`${API_BASE}/politicians/${politicianId}`);
  const qid = politician.data?.qid_wikidata;
  if (!qid) return null;
  const entity = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, 5, {
    headers: { 'User-Agent': 'politblick-bot (https://github.com/df2nnvctmz-crypto/Politblick)' },
  });
  const filename = entity.entities?.[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!filename) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=300`;
}

/**
 * Works out a usable Lobbyregister API key, in order of preference:
 *   1. LOBBY_API_KEY (an individual key requested from lobbyregister@bundestag.de, set as an
 *      Actions secret) — preferred, because it is ours and won't be rotated out from under us.
 *   2. The shared key baked in above.
 *   3. The shared key scraped fresh off the open-data page.
 *
 * Each candidate is probed against the real endpoint before being accepted, so a rotation of
 * the shared key self-heals on the next scheduled run instead of failing the workflow: the
 * page states it as "Der aktuell gültige API-Key lautet: <32 chars>", and it is the only
 * 32-character token on that page.
 */
export async function resolveLobbyApiKey() {
  const candidates = [];
  if (process.env.LOBBY_API_KEY) candidates.push(['LOBBY_API_KEY secret', process.env.LOBBY_API_KEY.trim()]);
  candidates.push(['built-in shared key', SHARED_LOBBY_API_KEY]);

  const tried = new Set();
  for (const [source, key] of candidates) {
    if (tried.has(key)) continue;
    tried.add(key);
    if (await lobbyKeyWorks(key)) {
      console.log(`  using Lobbyregister API key from ${source}`);
      return key;
    }
    console.warn(`  ${source} was rejected by the API — trying the next candidate…`);
  }

  const scraped = await scrapeLobbyApiKey();
  if (scraped && !tried.has(scraped) && (await lobbyKeyWorks(scraped))) {
    console.log('  using Lobbyregister API key freshly scraped from the open-data page');
    console.log(`  NOTE: the shared key appears to have rotated to ${scraped} — update SHARED_LOBBY_API_KEY.`);
    return scraped;
  }

  throw new Error(
    'No working Lobbyregister API key. The shared key has likely rotated and could not be ' +
      `re-read from ${LOBBY_OPEN_DATA_PAGE}. Set the LOBBY_API_KEY secret to an individual key ` +
      '(request one from lobbyregister@bundestag.de).',
  );
}

async function lobbyKeyWorks(key) {
  try {
    const res = await fetch(`${LOBBY_API_BASE}/registerentries`, {
      headers: { Authorization: `ApiKey ${key}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function scrapeLobbyApiKey() {
  try {
    const res = await fetch(LOBBY_OPEN_DATA_PAGE, { headers: { 'User-Agent': 'politblick-bot' } });
    if (!res.ok) return null;
    const text = stripHtml(await res.text());
    // Prefer a token that directly follows the sentence announcing the key; fall back to the
    // only 32-char token on the page.
    const labelled = text.match(/API-Key lautet:?\s*([A-Za-z0-9]{32})\b/);
    if (labelled) return labelled[1];
    const all = [...new Set([...text.matchAll(/\b([A-Za-z0-9]{32})\b/g)].map((m) => m[1]))];
    return all.length === 1 ? all[0] : null;
  } catch {
    return null;
  }
}

/**
 * One page of register entries. The API is cursor-paginated at a fixed 50 per page.
 *
 * `fetch()` has no default timeout — a single stalled connection blocks forever with nothing
 * thrown, which previously hung a ~140-page crawl for hours before the OS eventually tore down
 * the socket. AbortSignal.timeout turns that into an ordinary, retryable error instead.
 */
export async function fetchLobbyPage(apiKey, cursor, attempts = 3) {
  const url = cursor
    ? `${LOBBY_API_BASE}/registerentries?cursor=${encodeURIComponent(cursor)}`
    : `${LOBBY_API_BASE}/registerentries`;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `ApiKey ${apiKey}` }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Lobbyregister HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (e) {
      lastError = e;
      if (attempt < attempts - 1) await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unknown fetch error');
}

/**
 * Bundestag printed-matter ("Drucksache") numbers referenced in a chunk of HTML, normalised to
 * the `21/5921` form the Lobbyregister uses in printedMatters[].printingNumber. The document
 * URLs look like .../btd/21/059/2105921.pdf, where the filename encodes term (21) + a
 * five-digit, zero-padded number (05921).
 */
export function extractDrucksachen(html) {
  const out = new Set();
  for (const m of String(html || '').matchAll(/dserver\.bundestag\.de\/btd\/(\d+)\/\d+\/(\d+)\.pdf/g)) {
    const term = m[1];
    const number = Number(m[2].slice(term.length));
    if (Number.isFinite(number) && number > 0) out.add(`${term}/${number}`);
  }
  return [...out];
}

/**
 * Aggressive normalisation for matching organisation names across sources that spell them
 * differently (a member's declared sidejob employer vs. the same body's register entry vs. a
 * donor line on bundestag.de). Drops legal-form suffixes and every non-alphanumeric character,
 * so "Stiftung Lesen e. V." and "Stiftung Lesen e.V." collapse to the same key.
 */
export function normalizeOrgName(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[.,()/&+-]/g, ' ')
    .replace(/\b(e\s?v|gmbh|mbh|ggmbh|ag|kgaa|kg|ohg|se|eg|mbb|partg|gbr)\b/g, ' ')
    .replace(/[^a-z0-9äöüß]/g, '');
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
    // The Drucksachen the poll's intro links to. This is the join key to the Lobbyregister,
    // which records the printed matter each interest group declares it lobbied on. Free —
    // field_intro already comes back with the polls list, so this costs no extra request.
    drucksachen: extractDrucksachen(raw.field_intro),
    // Plain-language write-up of what the vote was actually about, from the same field_intro
    // blob — real poll titles are dense Bundestag phrasing (e.g. "Gebäudemodernisierungsgesetz"),
    // this is what explains it. Also free: no extra request beyond the polls list already fetched.
    summary: stripIntroHtml(raw.field_intro),
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

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
/** Served to the browser and copied into dist/ — keep only what the site actually loads. */
const DATA_DIR = path.join(REPO_ROOT, 'public', 'data');
/**
 * Not served. Holds bulky fetch output that only the build-lobby-links.mjs derive step reads
 * (the full 5 MB Lobbyregister snapshot) plus hand-curated input. Keeping it out of public/
 * means it isn't shipped in the production bundle.
 */
const SOURCE_DIR = path.join(REPO_ROOT, 'data');

export async function readJsonFile(name, fallback) {
  return readFrom(DATA_DIR, name, fallback);
}

export async function writeJsonFile(name, data) {
  // Minified — this is served to every visitor, so bytes matter more than readability.
  await writeTo(DATA_DIR, name, data, `public/data/${name}`, 0);
}

export async function readSourceFile(name, fallback) {
  return readFrom(SOURCE_DIR, name, fallback);
}

export async function writeSourceFile(name, data) {
  // Pretty-printed, and not for bandwidth reasons: this file is committed on every run, and a
  // 5 MB snapshot minified onto one line makes each weekly refresh a whole-file delta. One
  // field per line means git only stores the entries that actually changed.
  await writeTo(SOURCE_DIR, name, data, `data/${name}`, 1);
}

async function readFrom(dir, name, fallback) {
  try {
    const text = await readFile(path.join(dir, name), 'utf-8');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeTo(dir, name, data, label, indent) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), JSON.stringify(data, null, indent), 'utf-8');
  console.log(`  wrote ${label}`);
}
