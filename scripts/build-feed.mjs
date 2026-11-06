// Generates public/feed.xml: the Sitzungswochen-Briefing as an RSS 2.0 feed, one item per week.
//
// Like build-sitemap.mjs it reads only the committed snapshots (no network) and runs on every
// build, so the feed refreshes with each data deploy.
//
// An item is a teaser, not the whole briefing: the email's lead sentences, "Die Woche in Zahlen"
// and the list of votes. The sections that need charts — Fraktionsgeschlossenheit, Abwesenheit,
// the donation list and the Jahresstand — stay on the briefing page the item links to. All
// wording comes from scripts/send-newsletter.mjs (which in turn uses the site's own `sw*`
// templates), so the feed can never say something the email or the briefing page doesn't.
//
// When a week enters the feed: build-stories.mjs creates a week as soon as its first vote is in,
// i.e. mid-week, with numbers that keep moving until Friday's votes arrive. Feed readers
// generally don't re-fetch an item they already have, so a mid-week item would be stuck with
// partial numbers. A week is therefore published at the moment the newsletter goes out
// (Saturday 07:00 UTC, .github/workflows/send-newsletter.yml), and that is its pubDate.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { briefingSubject, billUrl, esc, int, moneyHeadline, range, shortDay, votesLead } from './send-newsletter.mjs';

export const SITE_URL = 'https://politblick.de';
export const FEED_PATH = '/feed.xml';
const DATA_DIR = 'public/data';
const MAX_ITEMS = 30;

/** Saturday 07:00 UTC after the sitting week that starts on `week` (a Monday, YYYY-MM-DD). */
export function publishedAt(week) {
  const d = new Date(`${week}T07:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 5);
  return d;
}

const briefingUrl = (week) => `${SITE_URL}/sitzungswoche/${week}/`;

/** The item body as HTML (escaped once more by the caller for <description>). */
export function itemHtml(issue, t) {
  const stats = [
    [t.swStatPollsLong, issue.pollCount],
    [t.swStatDivergenceLong, issue.divergingTotal],
    [t.swStatAbsenceLong, issue.absence.total],
    [t.swStatDonationsLong, issue.donations.count],
  ];
  const polls = issue.polls.map(
    (p) =>
      `<li><a href="${esc(billUrl(p))}">${esc(p.title)}</a> (${esc(shortDay(p.date))}): ` +
      `${esc(p.accepted ? t.swAccepted : t.swRejected)}, ${int(p.totals.yes)} ${esc(t.swColYes)} / ${int(p.totals.no)} ${esc(t.swColNo)}</li>`,
  );
  return [
    `<p><strong>${esc(range(issue.dateRange.start, issue.dateRange.end))}</strong></p>`,
    `<p>${votesLead(issue, t)}</p>`,
    `<p>${moneyHeadline(issue, t)}</p>`,
    `<h3>${esc(t.swWeekInNumbers)}</h3>`,
    `<ul>${stats.map(([label, n]) => `<li>${esc(label)}: <strong>${int(n)}</strong></li>`).join('')}</ul>`,
    `<h3>${esc(t.swBlockVotes)}</h3>`,
    `<ul>${polls.join('')}</ul>`,
    `<p>Wie geschlossen die Fraktionen abgestimmt haben, wer gefehlt hat und alle neuen Großspenden: ` +
      `<a href="${esc(briefingUrl(issue.week))}">Vollständiges Briefing auf politblick.de →</a></p>`,
  ].join('\n');
}

/**
 * The whole feed. `issues` are full per-week briefings (public/data/stories/<montag>.json); only
 * weeks whose publish time has passed by `now` are included, newest first.
 */
export function buildFeed(issues, t, now = new Date()) {
  const published = issues
    .filter((i) => publishedAt(i.week) <= now)
    .sort((a, b) => b.week.localeCompare(a.week))
    .slice(0, MAX_ITEMS);

  const items = published.map(
    (issue) => `    <item>
      <title>${esc(briefingSubject(issue, t))}</title>
      <link>${briefingUrl(issue.week)}</link>
      <guid isPermaLink="true">${briefingUrl(issue.week)}</guid>
      <pubDate>${publishedAt(issue.week).toUTCString()}</pubDate>
      <description>${esc(itemHtml(issue, t))}</description>
    </item>`,
  );
  const lastBuild = published[0] ? `\n    <lastBuildDate>${publishedAt(published[0].week).toUTCString()}</lastBuildDate>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Politblick – Sitzungswochen-Briefing</title>
    <link>${SITE_URL}/</link>
    <atom:link href="${SITE_URL}${FEED_PATH}" rel="self" type="application/rss+xml" />
    <description>Nach jeder Sitzungswoche im Bundestag: die wichtigsten Abstimmungen, wer von der eigenen Fraktion abgewichen ist, und neue Großspenden an Parteien. Aus öffentlichen Quellen.</description>
    <language>de</language>${lastBuild}
${items.join('\n')}
  </channel>
</rss>
`;
}

function readJson(name) {
  const file = path.join(DATA_DIR, name);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : null;
}

async function writeFeed() {
  const index = readJson('stories.json');
  const issues = (index?.issues ?? []).map((i) => readJson(`stories/${i.week}.json`)).filter(Boolean);
  const { TRANSLATIONS } = await import(pathToFileURL(path.resolve('src', 'data.ts')).href);
  const xml = buildFeed(issues, TRANSLATIONS.de);
  writeFileSync('public/feed.xml', xml);
  console.log(`Wrote ${(xml.match(/<item>/g) ?? []).length} briefings to public/feed.xml`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFeed();
}
