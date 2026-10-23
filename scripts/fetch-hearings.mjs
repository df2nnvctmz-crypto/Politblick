#!/usr/bin/env node
// Scrapes the public hearings of every Bundestag committee into data/hearings.json.
//
// There is no API for this. Each committee publishes its hearings as articles on bundestag.de,
// listed through the same ajax "filterlist" the site's own pagination uses. Each article has a
// sidebar with the written statements submitted for the hearing ("Stellungnahmen") and, on most
// committees, the Drucksachen it dealt with ("Dokumente"). See scripts/lib/hearings.mjs for what
// is read off a page and — more importantly — what is deliberately not.
//
// This writes the parsed pages only. Matching statement authors to the Lobbyregister happens in
// build-hearings.mjs, with no network, so a matching-rule change is a two-second re-run.
//
// It runs on the same 4-hour schedule as the core data, because a bill is sometimes heard and
// voted on within the same week. To keep that polite, runs are incremental: the committee
// listings are read every time (that is how new and removed hearings are found), but a hearing
// page is only re-read when it is new, upcoming, undated or at most RECENT_DAYS old — older ones
// no longer change and are reused from the last snapshot. Once a week (or with HEARINGS_FULL=1)
// every page is re-read, to catch late corrections. Nothing is written when nothing changed, so a
// quiet run makes no data commit.
//
// It fails rather than writes when the crawl looks broken. A committee renaming its listing
// page, or bundestag.de changing its markup, does not throw by itself — it just returns fewer
// hearings — and committing that would silently delete hearings from bill pages. So any failed
// request aborts, and so does a result that shrinks against the previous snapshot by more than
// MAX_SHRINK. Set HEARINGS_ALLOW_SHRINK=1 to accept a genuine drop (e.g. a new term).
import { makePacer, readSourceFile, writeMetaFile, writeSourceFile } from './lib/common.mjs';
import { parseHearingPage } from './lib/hearings.mjs';

const BASE = 'https://www.bundestag.de';
const OVERVIEW_URL = `${BASE}/ausschuesse`;
/** Links on the overview that are not committees holding hearings. */
const NOT_COMMITTEES = new Set(['weitere_gremien', 'gemeinsamer-ausschuss', 'vermittlungsausschuss']);
/** Fraction of the previous snapshot's hearings a new crawl may lose before it is treated as broken. */
const MAX_SHRINK = 0.15;
const PAGE_SIZE = 10;
/** Upper bound on listing pages per committee — a safety stop, not an expected size (the busiest has ~4). */
const MAX_LIST_PAGES = 60;
/** A hearing dated within this many days (or later) is re-read on every run; older ones are reused. */
const RECENT_DAYS = 30;
/** An incremental run turns into a full re-crawl once the last full one is this old. */
const FULL_CRAWL_EVERY_MS = 7 * 86_400_000;

const pace = makePacer(700);

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    await pace();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'politblick-bot' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/** Committee slugs from the overview — "a09_wirtschaft", "inneres", … (the naming is not uniform). */
function committeeSlugs(html) {
  const slugs = [...html.matchAll(/href="\/ausschuesse\/([A-Za-z][A-Za-z0-9_-]*)"/g)].map((m) => m[1]);
  return [...new Set(slugs)].filter((s) => !NOT_COMMITTEES.has(s));
}

/**
 * The committee's listing pages for hearings. Their paths differ per committee
 * ("wp21_a09_Anhoerungen", "anhoerungen", "sitzungen", "OeffentlicheSitzungen", …), so they are
 * read off the committee's own page: any sub-path that has article children, plus any linked
 * sub-path whose name says hearing or sitting.
 */
function listingPaths(slug, html) {
  const subs = new Set();
  for (const m of html.matchAll(new RegExp(`href="/ausschuesse/${slug}/([^"/?#]+)/\\d+-\\d+"`, 'g'))) subs.add(m[1]);
  for (const m of html.matchAll(new RegExp(`href="/ausschuesse/${slug}/([^"/?#]*(?:nhoer|ffentlich|itzung)[^"/?#]*)"`, 'gi'))) subs.add(m[1]);
  return [...subs];
}

async function hearingUrlsFor(slug) {
  const page = await fetchText(`${BASE}/ausschuesse/${slug}`);
  if (page === null) throw new Error(`Committee page /ausschuesse/${slug} is gone (404) — check the overview.`);
  const urls = new Set();
  for (const sub of listingPaths(slug, page)) {
    const listing = await fetchText(`${BASE}/ausschuesse/${slug}/${sub}`);
    const loader = listing?.match(/data-dataloader-url="(\/ajax\/filterlist\/[^"]+)"/)?.[1];
    if (!loader) continue; // a linked sub-page that is not a list (e.g. a single article)
    for (let pageNo = 0; pageNo < MAX_LIST_PAGES; pageNo++) {
      const chunk = await fetchText(`${BASE}${loader}?limit=${PAGE_SIZE}&offset=${pageNo * PAGE_SIZE}&noFilterSet=true`);
      const links = [...(chunk ?? '').matchAll(/href="(https:\/\/www\.bundestag\.de\/ausschuesse\/[^"]+\/\d+-\d+)"/g)].map((m) => m[1]);
      if (links.length === 0) break;
      links.forEach((l) => urls.add(l));
    }
  }
  return [...urls];
}

/** The article id in a hearing URL — the same id parseHearingPage() reads, known before fetching. */
function articleId(url) {
  return url.match(/\/(\d+)-\1(?:$|[?#])/)?.[1] ?? url.match(/\/(\d+)-\d+/)?.[1] ?? null;
}

/**
 * Whether a hearing from the last snapshot must be read again. Statements are posted in the days
 * around a hearing, and an upcoming hearing gets its expert list and statements later; a hearing
 * well in the past no longer changes, so it is reused until the weekly full crawl.
 */
function needsRefresh(record, today) {
  if (!record.date) return true;
  const ageDays = (Date.parse(today) - Date.parse(record.date)) / 86_400_000;
  return ageDays <= RECENT_DAYS;
}

async function main() {
  const previous = await readSourceFile('hearings.json', null);
  const today = new Date().toISOString().slice(0, 10);
  const lastFull = previous?.fullCrawlAt ? Date.parse(previous.fullCrawlAt) : 0;
  const full = process.env.HEARINGS_FULL === '1' || !previous?.hearings?.length || Date.now() - lastFull > FULL_CRAWL_EVERY_MS;
  const known = new Map((previous?.hearings ?? []).map((h) => [h.id, h]));
  const knownNotHearings = new Set(previous?.notHearings ?? []);
  console.log(full ? 'Full crawl.' : `Incremental crawl (last full crawl ${previous.fullCrawlAt}).`);

  const overview = await fetchText(OVERVIEW_URL);
  if (!overview) throw new Error(`${OVERVIEW_URL} returned nothing.`);
  const slugs = committeeSlugs(overview);
  if (slugs.length < 15) throw new Error(`Only ${slugs.length} committees found on ${OVERVIEW_URL} — the page layout has probably changed.`);

  const hearings = new Map();
  const notHearings = new Set();
  let read = 0;
  let reused = 0;
  for (const slug of slugs) {
    // The listings are read on every run, incremental or not: they are how a new hearing is
    // found, and how one the Bundestag took down drops out of the snapshot.
    const urls = await hearingUrlsFor(slug);
    let kept = 0;
    for (const url of urls) {
      const id = articleId(url);
      if (!full && id) {
        // An ordinary sitting stays one; it is re-checked on the weekly full crawl.
        if (knownNotHearings.has(id)) {
          notHearings.add(id);
          continue;
        }
        const old = known.get(id);
        if (old && !needsRefresh(old, today)) {
          if (!hearings.has(id)) {
            hearings.set(id, old);
            kept++;
            reused++;
          }
          continue;
        }
      }
      const html = await fetchText(url);
      read++;
      if (!html) continue;
      const parsed = parseHearingPage(html, url);
      if (!parsed?.id) continue;
      if (!parsed.isHearing) {
        notHearings.add(parsed.id);
        continue;
      }
      if (!hearings.has(parsed.id)) {
        // Authors are not stored: build-hearings.mjs derives them from the labels, so the naming
        // rules live in one place and a change to them needs no re-crawl.
        const { isHearing: _isHearing, statements, ...record } = parsed;
        hearings.set(parsed.id, { ...record, statements: statements.map(({ author: _author, ...st }) => st) });
        kept++;
      }
    }
    console.log(`  ${slug}: ${kept} hearings (${urls.length} listed articles)`);
  }

  const list = [...hearings.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
  const statements = list.reduce((n, h) => n + h.statements.length, 0);
  console.log(
    `${list.length} hearings (${read} pages read, ${reused} reused), ${statements} statements, ` +
      `${list.filter((h) => h.drucksachen.length).length} with a Drucksache; ${notHearings.size} ordinary sittings skipped`,
  );

  const before = previous?.hearings?.length ?? 0;
  if (before > 0 && list.length < before * (1 - MAX_SHRINK) && process.env.HEARINGS_ALLOW_SHRINK !== '1') {
    throw new Error(
      `Crawl found ${list.length} hearings against ${before} in the last snapshot. Refusing to overwrite it — ` +
        'check whether a committee listing moved. Re-run with HEARINGS_ALLOW_SHRINK=1 if the drop is real.',
    );
  }

  // Written only when something changed: this runs every 4 hours, and a fresh timestamp on
  // identical content would mean a data commit six times a day for nothing. A full crawl always
  // writes, so the snapshot records when the last one happened — but keeps its generatedAt (and
  // the site's "updated" date) when the content itself is unchanged.
  const sortedNotHearings = [...notHearings].sort();
  const unchanged =
    JSON.stringify(list) === JSON.stringify(previous?.hearings ?? null) &&
    JSON.stringify(sortedNotHearings) === JSON.stringify(previous?.notHearings ?? null);
  if (unchanged && !full) {
    console.log('No change since the last snapshot — nothing written.');
    return;
  }
  const now = new Date().toISOString();
  const generatedAt = unchanged ? previous.generatedAt : now;
  await writeSourceFile('hearings.json', {
    generatedAt,
    fullCrawlAt: full ? now : previous.fullCrawlAt,
    source: OVERVIEW_URL,
    hearings: list,
    notHearings: sortedNotHearings,
  });
  if (!unchanged) await writeMetaFile({ hearingsGeneratedAt: generatedAt });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
