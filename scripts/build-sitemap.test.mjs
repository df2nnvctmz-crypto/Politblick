import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRoutes } from './build-sitemap.mjs';
import { DEFAULT_ROUTE, pathToRoute, routeToPath } from '../src/router.ts';
import { buildMpUrlParam } from '../src/urlParams.ts';

const roster = JSON.parse(readFileSync('public/data/roster.json', 'utf-8'));
const sidejobs = JSON.parse(readFileSync('public/data/sidejobs.json', 'utf-8'));

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
    expect(financePaths).toEqual(appPaths);
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
