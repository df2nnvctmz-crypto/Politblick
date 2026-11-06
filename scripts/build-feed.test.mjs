import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFeed, publishedAt } from './build-feed.mjs';
import { TRANSLATIONS } from '../src/data.ts';

const index = JSON.parse(readFileSync('public/data/stories.json', 'utf-8'));
const issues = index.issues.map((i) => JSON.parse(readFileSync(`public/data/stories/${i.week}.json`, 'utf-8')));
const t = TRANSLATIONS.de;
const latest = [...issues].sort((a, b) => b.week.localeCompare(a.week))[0];

describe('publishedAt', () => {
  it('is the Saturday 07:00 UTC after the sitting week, when the newsletter goes out', () => {
    expect(publishedAt('2026-10-12').toISOString()).toBe('2026-10-17T07:00:00.000Z');
  });
});

describe('buildFeed', () => {
  it('leaves a week out until it has ended, so no reader keeps a mid-week item with partial numbers', () => {
    const before = buildFeed(issues, t, new Date(publishedAt(latest.week).getTime() - 1));
    const after = buildFeed(issues, t, publishedAt(latest.week));
    expect(before).not.toContain(`/sitzungswoche/${latest.week}/`);
    expect(after).toContain(`<guid isPermaLink="true">https://politblick.de/sitzungswoche/${latest.week}/</guid>`);
  });

  it('lists the newest week first', () => {
    const xml = buildFeed(issues, t, new Date('2100-01-01'));
    const weeks = [...xml.matchAll(/<guid[^>]*>[^<]*\/sitzungswoche\/([\d-]+)\/<\/guid>/g)].map((m) => m[1]);
    expect(weeks.length).toBeGreaterThan(0);
    expect(weeks).toEqual([...weeks].sort().reverse());
  });

  it('is well-formed: every & outside markup starts an entity', () => {
    const xml = buildFeed(issues, t, new Date('2100-01-01'));
    expect(xml).not.toMatch(/&(?!(amp|lt|gt|quot|apos|#\d+);)/);
    expect(xml.match(/<item>/g)?.length).toBe(xml.match(/<\/item>/g)?.length);
  });

  it('is a teaser that links to the full briefing, with every on-site link in the slash form', () => {
    const xml = buildFeed([latest], t, new Date('2100-01-01'));
    expect(xml).toContain('Vollständiges Briefing auf politblick.de');
    expect(xml).not.toContain(t.swBlockCohesion);
    const hrefs = [...xml.matchAll(/https:\/\/politblick\.de\/[^&"<\s]*/g)].map((m) => m[0]);
    for (const h of hrefs) expect(h === 'https://politblick.de/feed.xml' || h.endsWith('/')).toBe(true);
  });
});
