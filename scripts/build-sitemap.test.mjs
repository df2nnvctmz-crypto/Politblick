import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRoutes } from './build-sitemap.mjs';
import { DEFAULT_ROUTE, indexablePath, pathToRoute, routeToPath } from '../src/router.ts';
import { buildMpUrlParam } from '../src/urlParams.ts';

const roster = JSON.parse(readFileSync('public/data/roster.json', 'utf-8'));
const sidejobs = JSON.parse(readFileSync('public/data/sidejobs.json', 'utf-8'));

describe('routeToPath', () => {
  it('always links to the slash form, the only one that returns 200', () => {
    // A slash-less internal link is a 301 for every crawler that follows it, and it splits a page's
    // signals across two URLs: in 2026-10, 140 pages showed up in Search Console in both forms.
    const routes = [
      { view: 'search' },
      { view: 'profile', mpId: '123-a-b' },
      { view: 'profile', mpId: '123-a-b', profileTab: 'finance' },
      { view: 'bill', billId: '6601-gkv-reform' },
      { view: 'org', orgId: 'R000123-x' },
      { view: 'party', party: 'CDU/CSU' },
      { view: 'crossref', lobbyTab: 'orgs' },
      { view: 'impressum' },
      { view: 'results' },
    ];
    for (const r of routes) expect(routeToPath({ ...DEFAULT_ROUTE, ...r })).toMatch(/[^/]\/$/);
    expect(routeToPath({ ...DEFAULT_ROUTE, view: 'home' })).toBe('/');
  });

  it('still parses links shared before the slash form', () => {
    expect(pathToRoute('/gesetze/6601-gkv-reform')).toEqual(pathToRoute('/gesetze/6601-gkv-reform/'));
    expect(pathToRoute('/abgeordnete/123-a-b/finanzen')).toEqual(pathToRoute('/abgeordnete/123-a-b/finanzen/'));
  });
});

describe('buildRoutes — Nebentätigkeiten tab', () => {
  const routes = buildRoutes();
  const financePaths = routes.filter((r) => r.path.endsWith('/finanzen')).map((r) => r.path);

  it('lists exactly the members with at least one disclosed entry', () => {
    const expected = roster.members.filter((m) => (sidejobs[m.mandateId] ?? []).length > 0).length;
    expect(financePaths).toHaveLength(expected);
  });

  it('uses the very path the app links to', () => {
    // The sitemap mirrors the router by hand (it cannot import TS) — this is what keeps it honest.
    const appPaths = roster.members
      .filter((m) => (sidejobs[m.mandateId] ?? []).length > 0)
      .map((m) => routeToPath({ ...DEFAULT_ROUTE, view: 'profile', mpId: buildMpUrlParam(String(m.id), roster.members), profileTab: 'finance' }));
    expect(financePaths.map(indexablePath)).toEqual(appPaths);
  });

  it('parses back to the finance tab', () => {
    for (const p of financePaths) expect(pathToRoute(p)).toMatchObject({ view: 'profile', profileTab: 'finance' });
  });

  it('ranks below the profile overview', () => {
    const finance = routes.find((r) => r.path.endsWith('/finanzen'));
    const overview = routes.find((r) => `${r.path}/finanzen` === finance.path);
    expect(Number(finance.priority)).toBeLessThan(Number(overview.priority));
    expect(finance.waitFor).toBe('[data-sidejob-list]');
  });
});

describe('buildRoutes — tabs the site links to from other pages', () => {
  const paths = buildRoutes().map((r) => r.path);
  // A built page answers in both URL forms, so which of them the router writes doesn't matter here.
  const appPath = (r) => routeToPath({ ...DEFAULT_ROUTE, ...r }).replace(/\/$/, '');

  it('builds the Spenden tab of every party page, on the path the app links to', () => {
    const parties = paths.filter((p) => /^\/parteien\/[^/]+$/.test(p));
    expect(parties.length).toBeGreaterThan(0);
    for (const p of parties) {
      const { party } = pathToRoute(p);
      expect(paths).toContain(appPath({ view: 'party', party, partyTab: 'donations' }));
    }
  });

  it('builds the Verflechtungen page the home page links to', () => {
    expect(paths).toContain(appPath({ view: 'crossref', lobbyTab: 'ties' }));
  });

  it('leaves the member vote and lobby tabs unbuilt, as SubTabBar assumes', () => {
    expect(paths.filter((p) => /\/abgeordnete\/.*\/(stimmen|lobby)$/.test(p))).toEqual([]);
  });
});
