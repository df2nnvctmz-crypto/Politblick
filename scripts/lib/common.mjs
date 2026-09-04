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

/**
 * The fraction a single vote record was cast under, canonicalised — or 'Fraktionslos'.
 *
 * Not inlined as `v.fraction ? canonicalPartyName(v.fraction.label) : 'Fraktionslos'`, which is
 * the obvious spelling and is wrong: abgeordnetenwatch serialises "no fraction" as an empty
 * ARRAY (`"fraction": []`), and `[]` is truthy in JavaScript. That check therefore takes the
 * fraction branch and throws on `.label` of an array. Real example: Joana Cotar's no_show in
 * poll 4828 (Atomkraft-Weiterbetrieb, 11.11.2022), recorded after she left the AfD fraction.
 * Testing the label rather than the container is what makes this safe.
 */
export function fractionNameFromVote(rawVote) {
  const label = rawVote.fraction?.label;
  return label ? canonicalPartyName(label) : 'Fraktionslos';
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

/**
 * The Lobbyregister's free-text "Beschreibung der Tätigkeit" — plain text (no HTML), but with
 * `\r\n` line breaks and often double-blank-line paragraph separation. Collapses that down to
 * the same `\n\n`-paragraph convention stripIntroHtml() produces, so the UI can treat both the
 * same way.
 */
export function normalizeRegisterText(text) {
  if (!text) return null;
  const normalized = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized || null;
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
  // 429s get their own, more generous budget: rate-limiting is an expected, recoverable
  // condition on a 630-request run, not a hard failure — exhausting the same small `attempts`
  // count used for genuine errors would give up on a rate-limit storm just as it's clearing.
  const maxRateLimitRetries = 10;
  let rateLimitRetries = 0;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (res.status === 429) {
        rateLimitRetries++;
        lastError = new Error(`HTTP 429 (rate limited) for ${url}`);
        if (rateLimitRetries > maxRateLimitRetries) break;
        const header = res.headers.get('retry-after');
        const waitMs = header && !Number.isNaN(Number(header)) ? Number(header) * 1000 : 60_000;
        console.warn(`  429 rate-limited, waiting ${Math.round(waitMs / 1000)}s… (${rateLimitRetries}/${maxRateLimitRetries})`);
        await sleep(waitMs);
        attempt--; // doesn't count against the generic-error attempt budget
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
    // Every topic the poll carries, not just the first. 71% of polls are tagged with more than
    // one. The first is the dominant topic, but not the only substantive one — six labels (Verkehr,
    // Wirtschaft, Staat und Verwaltung, Soziale Sicherung, Innere Sicherheit, Wissenschaft) never
    // appear first at all, so keying anything off
    // `topic` alone silently loses the rest. That cost real signal: the topical-tie lookup and
    // the committee boost in build-lobby-links.mjs both matched on `topic`, so a bill tagged
    // ["Wirtschaft", "Energie"] produced no energy ties and no boost for members on the energy
    // committee. `topic` is kept as the primary label for display; `topics` is what matching
    // should use.
    topics: (raw.field_topics || []).map((t) => t.label),
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

/**
 * A fraction's majority line on one vote. Exported because fetch-history.mjs must produce the
 * SAME `partyBreakdown[].majority` that computePollResult() writes into poll-results.json — the
 * frontend decides "voted against their own fraction" off that field, and a second, subtly
 * different majority rule for archived polls would make the same member's loyalty read
 * differently depending only on which term the vote fell in.
 */
export function majorityOf(yes, no, abstain) {
  if (yes === 0 && no === 0 && abstain === 0) return null;
  if (yes >= no && yes >= abstain) return 'yes';
  if (no >= yes && no >= abstain) return 'no';
  return 'abstain';
}

function mandateNameFromLabel(label) {
  return label.replace(/\s*\(Bundestag[^)]*\)/, '').trim();
}

/**
 * One vote record per mandate.
 *
 * abgeordnetenwatch sometimes returns several rows for the same mandate on the same poll —
 * six identical "no" rows for Karin Maag on poll 4119, and occasionally contradictory ones
 * (Karin Maag again on poll 4140: one "yes" and one "no"). They cluster around members who
 * left their fraction mid-term. Counting every row inflates that fraction's tally, and on a
 * close vote that can move its majority line — which is the very thing "voted against their
 * own fraction" is measured against, for every member of that fraction, not just the
 * duplicated one.
 *
 * Resolution: a cast vote (yes/no/abstain) beats a no_show, because an absence row recorded
 * alongside an actual ballot is the less credible of the two. Two DIFFERENT cast votes are
 * genuinely unresolvable, so the mandate is dropped from that poll rather than guessed at —
 * one silent wrong vote on a member's record is worse than one acknowledged gap.
 *
 * The current term has no such rows (0 of 63 polls); the 2017-2021 archive has a handful.
 */
export function dedupeVotesByMandate(rawVotes) {
  const byMandate = new Map();
  const conflicted = new Set();
  for (const v of rawVotes) {
    const mandateId = v.mandate?.id;
    if (mandateId == null) continue;
    const existing = byMandate.get(mandateId);
    if (!existing) {
      byMandate.set(mandateId, v);
      continue;
    }
    if (existing.vote === v.vote) continue;
    const existingCast = existing.vote !== 'no_show';
    const incomingCast = v.vote !== 'no_show';
    if (incomingCast && !existingCast) byMandate.set(mandateId, v);
    else if (incomingCast && existingCast) conflicted.add(mandateId);
  }
  for (const mandateId of conflicted) byMandate.delete(mandateId);
  return { votes: [...byMandate.values()], duplicateCount: rawVotes.length - byMandate.size - conflicted.size, conflictCount: conflicted.size };
}

export function computePollResult(rawVotes) {
  const votes = dedupeVotesByMandate(rawVotes).votes.map((v) => ({
    mandateId: v.mandate.id,
    name: mandateNameFromLabel(v.mandate.label),
    party: fractionNameFromVote(v),
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

/**
 * Five separate fetch-*.mjs scripts each read meta.json, add their own `<thing>GeneratedAt`
 * key, and write it back — and their scheduled runs push to main close enough together that
 * two can legitimately need to reconcile in the same window (see commit-data's own comment on
 * this). A minified, single-line meta.json makes that reconciliation impossible: git's rebase
 * is line-based, so two commits that touch *any* key on that one line conflict, even when the
 * keys themselves are disjoint. Sorted, one-key-per-line output means two jobs adding different
 * keys touch different lines, so git can merge them automatically instead of failing loudly.
 */
export async function writeMetaFile(patch) {
  const meta = await readJsonFile('meta.json', {});
  const merged = { ...meta, ...patch };
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  await writeTo(DATA_DIR, 'meta.json', sorted, 'public/data/meta.json', 2);
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
