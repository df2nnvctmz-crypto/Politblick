// Generates public/sitemap.xml from the committed data snapshots — no network calls, so it runs
// as part of every build (see package.json's `build` script) and stays in sync with roster/poll/
// org/committee churn without a separate schedule of its own.
//
// URL construction here must mirror src/router.ts's routeToPath and src/App.tsx's
// buildMpUrlParam/slugify exactly, or the sitemap will point at URLs the app doesn't actually
// serve.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SITE_URL = 'https://politblick.de';
const DATA_DIR = 'public/data';

function readJson(name) {
  const path = `${DATA_DIR}/${name}`;
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// Mirrors src/App.tsx's slugify() — German umlauts get their usual ASCII transliteration.
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function xmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const urls = [];
function add(path, { changefreq, priority } = {}) {
  urls.push({ loc: `${SITE_URL}${path}`, changefreq, priority });
}

// Static pages.
add('/', { changefreq: 'hourly', priority: '1.0' });
add('/abgeordnete', { changefreq: 'daily', priority: '0.8' });
add('/abstimmungen', { changefreq: 'daily', priority: '0.8' });
add('/parteien', { changefreq: 'weekly', priority: '0.7' });
add('/ausschuesse', { changefreq: 'weekly', priority: '0.6' });
add('/lobby-finanzen', { changefreq: 'daily', priority: '0.8' });
add('/daten', { changefreq: 'monthly', priority: '0.3' });
add('/hinweis-zu-den-daten', { changefreq: 'monthly', priority: '0.3' });
add('/impressum', { changefreq: 'yearly', priority: '0.1' });
add('/datenschutz', { changefreq: 'yearly', priority: '0.1' });

// MP profile pages — /abgeordnete/<id>-<name-slug>, one per current member.
const roster = readJson('roster.json');
for (const m of roster?.members ?? []) {
  add(`/abgeordnete/${m.id}-${slugify(m.name)}`, { changefreq: 'weekly', priority: '0.6' });
}

// Bill/vote pages — /gesetze/<poll id>.
const polls = readJson('polls.json');
for (const p of polls ?? []) {
  add(`/gesetze/${p.id}`, { changefreq: 'monthly', priority: '0.5' });
}

// Committee pages — /ausschuesse/<committee id>.
const committees = readJson('committees.json');
for (const c of committees?.committees ?? []) {
  add(`/ausschuesse/${c.id}`, { changefreq: 'monthly', priority: '0.3' });
}

// Party pages — /parteien/<name> — only the sitting fractions that actually get a page (see
// App.tsx's routablePartyNames), sourced from lobby-links' partyLobbySummary rather than the
// roster's raw party list so "Fraktionslos" and any oddities never produce a 404'ing URL.
const lobbyLinks = readJson('lobby-links.json');
for (const s of lobbyLinks?.partyLobbySummary ?? []) {
  add(`/parteien/${encodeURIComponent(s.party)}`, { changefreq: 'weekly', priority: '0.5' });
}

// Organisation pages — /organisationen/<org id>.
for (const org of Object.values(lobbyLinks?.orgs ?? {})) {
  add(`/organisationen/${encodeURIComponent(org.id)}`, { changefreq: 'monthly', priority: '0.4' });
}

const body = urls
  .map(
    (u) =>
      `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
  )
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

writeFileSync(`${DATA_DIR.replace('/data', '')}/sitemap.xml`, xml);
console.log(`Wrote ${urls.length} URLs to public/sitemap.xml`);
