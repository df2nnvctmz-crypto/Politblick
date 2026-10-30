// Checks the finished dist/ for internal links a crawler would get a 404 from. GitHub Pages is a
// plain static file server, so an <a href> whose path has no file behind it is a genuine 404 for
// anything that doesn't run public/404.html's JS — and Search Console reports every one of them.
//
// Runs as the last build step and fails the build: a dead link in the prerendered HTML is cheap to
// fix now and slow to get out of Google's reports later.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SITE_ORIGIN = 'https://politblick.de';

const ENTITIES = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };

/** Every href of an <a> in an HTML string, entities decoded. Only <a>: canonical and asset links are not crawl paths a reader can follow. */
export function extractHrefs(html) {
  const hrefs = [];
  for (const [tag] of html.matchAll(/<a\s[^>]*>/gi)) {
    const match = tag.match(/\shref=(?:"([^"]*)"|'([^']*)')/i);
    if (!match) continue;
    hrefs.push((match[1] ?? match[2]).replace(/&(?:amp|quot|#39|lt|gt);/g, (e) => ENTITIES[e]));
  }
  return hrefs;
}

/** The site-relative pathname of an href, or null if it leaves the site or isn't a page link. */
export function internalPath(href) {
  if (/^(mailto|tel|javascript|data):/i.test(href) || href.startsWith('#')) return null;
  const url = new URL(href, `${SITE_ORIGIN}/`);
  return url.origin === SITE_ORIGIN ? url.pathname : null;
}

/** Whether a static file server would answer this pathname from dist: an exact file, or a directory holding index.html. */
export function resolves(pathname, distDir) {
  // Same decoding the server does before it touches the filesystem — see prerender.mjs's decodeRoutePath.
  const onDisk = join(distDir, decodeURIComponent(pathname));
  if (!existsSync(onDisk)) return false;
  return statSync(onDisk).isDirectory() ? existsSync(join(onDisk, 'index.html')) : true;
}

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name === 'index.html' ? [path] : [];
  });
}

/** Maps each dead pathname to the pages linking to it. */
export function findDeadLinks(distDir) {
  const dead = new Map();
  const files = htmlFiles(distDir);
  // Most pages share the same nav and member links, and a filesystem check per link adds up fast.
  const checked = new Map();
  for (const file of files) {
    const from = `/${file.slice(distDir.length + 1).split(sep).join('/').replace(/index\.html$/, '')}`;
    for (const href of new Set(extractHrefs(readFileSync(file, 'utf-8')))) {
      const pathname = internalPath(href);
      if (pathname === null) continue;
      if (!checked.has(pathname)) checked.set(pathname, resolves(pathname, distDir));
      if (checked.get(pathname)) continue;
      if (!dead.has(pathname)) dead.set(pathname, new Set());
      dead.get(pathname).add(from);
    }
  }
  return { dead, pageCount: files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const distDir = process.argv[2] ?? 'dist';
  const { dead, pageCount } = findDeadLinks(distDir);
  if (dead.size === 0) {
    console.log(`Link audit: ${pageCount} pages, no internal link without a built page.`);
  } else {
    console.error(`Link audit: ${dead.size} internal URL(s) without a built page, across ${pageCount} pages:`);
    for (const [pathname, from] of [...dead].sort(([a], [b]) => a.localeCompare(b))) {
      console.error(`  ${pathname}  (from ${from.size} page(s), e.g. ${[...from][0]})`);
    }
    process.exit(1);
  }
}
