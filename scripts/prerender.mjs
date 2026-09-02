// After `vite build` produces dist/, GitHub Pages still can't serve a real HTTP 200 for any of
// the ~1130 client-routed URLs in the sitemap (every MP/bill/org/committee/party page, plus every
// static list page) — GitHub Pages is a plain static file server, so any path without a matching
// file on disk returns a genuine 404, the JS redirect trick in public/404.html notwithstanding
// (that trick only runs *after* a real browser already has the 404 response — a crawler records
// the 404 before any JS ever executes). That leaves essentially the whole site unindexed besides
// the homepage.
//
// This script closes that gap directly: for every route scripts/build-sitemap.mjs already knows
// about, boot the real app in a headless browser against the just-built dist/, wait for it to
// finish loading its data and rendering, and save the resulting DOM as dist/<route>/index.html.
// GitHub Pages then finds a real file at every one of those paths and serves a genuine 200 with
// real content already baked in — no reliance on Google's separate, slower, budget-limited
// JS-rendering pass. Real visitors still get the full interactive app: main.tsx boots with
// createRoot(...).render(...) (not hydrateRoot), which fully replaces whatever was in #root,
// prerendered content included, so there's no hydration-mismatch risk.
//
// public/404.html's redirect trick stays in place as a fallback for anything *not* covered here
// (e.g. an MP who has since left office and lost their page).

import { preview } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildRoutes } from './build-sitemap.mjs';

const CONCURRENCY = 8;
const PORT = 4173;

// encodeURIComponent() on a party name can produce %2F (e.g. "CDU/CSU" -> "CDU%2FCSU"). Verified
// empirically (a plain static server, no SPA fallback, standing in for GitHub Pages) that a
// request for .../CDU%2FCSU/ only resolves against a *decoded*, actually-nested dist/.../CDU/CSU/
// directory — not one literally named "CDU%2FCSU" — so despite RFC 3986 treating %2F as special,
// the standard static-file-server behavior is to decode it like any other escape before matching
// the filesystem. That's harmless for the app itself: the browser's own location.pathname always
// keeps %2F literally encoded (never collapses it into an extra path segment), so router.ts's
// pathToRoute — which reads location.pathname, not this on-disk layout — parses the party name
// back out correctly regardless of how the matching file happens to be laid out on disk.
function decodeRoutePath(routePath) {
  return decodeURIComponent(routePath);
}

function outputPath(routePath) {
  const decoded = decodeRoutePath(routePath);
  const relative = decoded === '/' ? '/index.html' : `${decoded}/index.html`;
  return join('dist', relative);
}

async function renderRoute(browser, baseUrl, route, stats) {
  const page = await browser.newPage();
  try {
    const url = `${baseUrl}${route.path}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // App.tsx's document-head effect sets a page-specific <title> once its data has loaded and
    // rendered — waiting for that to move off the static "Politblick" default is a more direct
    // "is this page actually done" signal than a fixed delay, since the fetch + React re-render
    // finishes well within a single networkidle window but isn't otherwise observable from
    // outside the page. Best-effort: if a route's title genuinely never changes (data that failed
    // to resolve), fall through and capture whatever's there rather than failing the whole run.
    await page
      .waitForFunction(() => document.title !== 'Politblick' || location.pathname === '/', { timeout: 10000 })
      .catch(() => {});
    const html = await page.content();
    const outPath = outputPath(route.path);
    mkdirSync(dirname(outPath), { recursive: true });
    // dist/index.html (the '/' route) is being actively served to every other in-flight request
    // this whole run — write-then-rename instead of a direct write so no concurrent request can
    // ever see a half-written file.
    const tmpPath = `${outPath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmpPath, html);
    renameSync(tmpPath, outPath);
    stats.done += 1;
  } catch (err) {
    stats.failed += 1;
    console.error(`  FAILED ${route.path}: ${err instanceof Error ? err.message : err}`);
  } finally {
    await page.close();
  }
}

async function main() {
  const routes = buildRoutes();
  console.log(`Prerendering ${routes.length} routes…`);

  const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'error' });
  const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('vite preview did not resolve a local URL');

  const browser = await chromium.launch();
  const stats = { done: 0, failed: 0 };

  // Simple fixed-size worker pool over a shared cursor — no new dependency for something this
  // small; CONCURRENCY pages open in parallel against the one preview server.
  let cursor = 0;
  async function worker() {
    while (cursor < routes.length) {
      const route = routes[cursor];
      cursor += 1;
      await renderRoute(browser, baseUrl, route, stats);
      const total = stats.done + stats.failed;
      if (total % 100 === 0) console.log(`  ${total}/${routes.length} (${stats.failed} failed so far)`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  await browser.close();
  await server.close();

  console.log(`Prerendered ${stats.done}/${routes.length} routes (${stats.failed} failed).`);
  if (stats.failed > 0) {
    console.error(`${stats.failed} route(s) failed to prerender — see errors above.`);
    process.exit(1);
  }
}

main();
