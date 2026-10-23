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

async function main() {
  const previous = await readSourceFile('hearings.json', null);
  const overview = await fetchText(OVERVIEW_URL);
  if (!overview) throw new Error(`${OVERVIEW_URL} returned nothing.`);
  const slugs = committeeSlugs(overview);
  if (slugs.length < 15) throw new Error(`Only ${slugs.length} committees found on ${OVERVIEW_URL} — the page layout has probably changed.`);

  const hearings = new Map();
  let notHearings = 0;
  for (const slug of slugs) {
    const urls = await hearingUrlsFor(slug);
    let kept = 0;
    for (const url of urls) {
      const html = await fetchText(url);
      if (!html) continue;
      const parsed = parseHearingPage(html, url);
      if (!parsed?.id) continue;
      if (!parsed.isHearing) {
        notHearings++;
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
  console.log(`${list.length} hearings, ${statements} statements, ${list.filter((h) => h.drucksachen.length).length} with a Drucksache; ${notHearings} ordinary sittings skipped`);

  const before = previous?.hearings?.length ?? 0;
  if (before > 0 && list.length < before * (1 - MAX_SHRINK) && process.env.HEARINGS_ALLOW_SHRINK !== '1') {
    throw new Error(
      `Crawl found ${list.length} hearings against ${before} in the last snapshot. Refusing to overwrite it — ` +
        'check whether a committee listing moved. Re-run with HEARINGS_ALLOW_SHRINK=1 if the drop is real.',
    );
  }

  const generatedAt = new Date().toISOString();
  await writeSourceFile('hearings.json', { generatedAt, source: OVERVIEW_URL, hearings: list });
  await writeMetaFile({ hearingsGeneratedAt: generatedAt });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
