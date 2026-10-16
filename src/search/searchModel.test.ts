import { describe, expect, it } from 'vitest';
import { isoWeekOf, matchRank, searchAll, type SearchSources } from './searchModel';

const src = (over: Partial<SearchSources> = {}): SearchSources => ({
  mps: [],
  bills: [],
  orgs: [],
  parties: [],
  committees: [],
  briefings: [],
  ...over,
});

describe('matchRank', () => {
  it('orders exact < starts-with < word-start < contains < typo', () => {
    expect(matchRank('Springer', 'springer')).toBe(0);
    expect(matchRank('Springer Nature', 'springer')).toBe(1);
    expect(matchRank('Axel Springer SE', 'springer')).toBe(2);
    expect(matchRank('Frühlingsspringerei', 'springer')).toBe(3);
    expect(matchRank('Axel Sprinegr SE', 'springer')).toBe(4);
    expect(matchRank('Bertelsmann', 'springer')).toBeNull();
  });

  it('ignores case and umlauts', () => {
    expect(matchRank('Ströer', 'stroer')).toBe(0);
    expect(matchRank('Coße', 'cosse')).toBe(0);
  });
});

describe('searchAll', () => {
  it('finds unlinked register organisations and ranks name matches before spend', () => {
    const r = searchAll(
      'springer',
      src({
        orgs: [
          { id: 'R1', name: 'Fachverband Frühlingsspringerei', city: null, spendFrom: 900_000, spendTo: null, linked: true },
          { id: 'R2', name: 'Axel Springer SE', city: 'Berlin', spendFrom: 300_001, spendTo: null, linked: false },
          { id: 'R3', name: 'Axel Springer Freedom Foundation', city: 'Berlin', spendFrom: 1, spendTo: null, linked: false },
        ],
      }),
    );
    expect(r.orgs.map((o) => o.id)).toEqual(['R2', 'R3', 'R1']);
  });

  it('matches constituencies only for real, names also with typos', () => {
    const mps = [
      { id: 1, name: 'Dagmar Schmidt', party: 'SPD', constituency: 'Lahn-Dill', color: '' },
      { id: 2, name: 'Max Bahnmüller', party: 'SPD', constituency: 'Fulda', color: '' },
    ];
    expect(searchAll('bahn', src({ mps })).mps.map((m) => m.id)).toEqual([2]);
    expect(searchAll('schmiedt', src({ mps })).mps.map((m) => m.id)).toEqual([1]);
  });

  it('ranks a name match before an equally good constituency match', () => {
    const mps = [
      { id: 1, name: 'Dirk Brandes', party: 'AfD', constituency: 'Hannover-Land I', color: '' },
      { id: 2, name: 'Hanna Steinmüller', party: 'Grüne', constituency: 'Berlin-Mitte', color: '' },
    ];
    expect(searchAll('han', src({ mps })).mps.map((m) => m.id)).toEqual([2, 1]);
  });

  it('drops typo-only hits once a group has real matches, but keeps them as a fallback', () => {
    const orgs = [
      { id: 'R2', name: 'Axel Springer SE', city: 'Berlin', spendFrom: 300_001, spendTo: null, linked: false },
      { id: 'R9', name: 'Winkhardt + Spinder GmbH', city: 'Stuttgart', spendFrom: 1, spendTo: null, linked: false },
    ];
    expect(searchAll('springer', src({ orgs })).orgs.map((o) => o.id)).toEqual(['R2']);
    expect(searchAll('sprinder', src({ orgs: [orgs[1]] })).orgs.map((o) => o.id)).toEqual(['R9']);
  });

  it('keeps the Bertelsmann company and the Bertelsmann Stiftung apart but finds both', () => {
    const r = searchAll(
      'bertels',
      src({
        orgs: [
          { id: 'R003651', name: 'Bertelsmann Stiftung', city: 'Gütersloh', spendFrom: 220_001, spendTo: null, linked: true },
          { id: 'R002001', name: 'Bertelsmann SE & Co. KGaA', city: 'Gütersloh', spendFrom: 260_001, spendTo: null, linked: false },
        ],
      }),
    );
    expect(r.orgs.map((o) => o.id)).toEqual(['R003651', 'R002001']);
  });

  it('ranks a title match above a topic-only match', () => {
    const r = searchAll(
      'verkehr',
      src({
        bills: [
          { id: 1, title: 'Neubau Bahnstrecke', date: '2026-10-08', topic: 'Bau', topics: ['Bau', 'Verkehr'], term: null },
          { id: 2, title: 'Verkehrswegeplan', date: '2025-01-01', topic: 'Verkehr', topics: ['Verkehr'], term: null },
        ],
      }),
    );
    expect(r.bills.map((b) => b.id)).toEqual([2, 1]);
  });

  it('offers the briefing of a week whose vote matched, and briefings by KW', () => {
    const briefings = [
      { week: '2026-10-05', start: '2026-10-05', end: '2026-10-11', isoWeek: 41, pollCount: 10 },
      { week: '2026-09-21', start: '2026-09-21', end: '2026-09-27', isoWeek: 39, pollCount: 4 },
    ];
    const bills = [{ id: 6728, title: 'Neubau Bahnstrecke Hannover – Hamburg', date: '2026-10-08', topic: 'Verkehr', topics: ['Verkehr'], term: null }];
    expect(searchAll('bahnstrecke', src({ bills, briefings })).briefings.map((b) => b.week)).toEqual(['2026-10-05']);
    expect(searchAll('kw 39', src({ bills, briefings })).briefings.map((b) => b.week)).toEqual(['2026-09-21']);
  });

  it('orders groups by their best hit, so an exact party match leads', () => {
    const r = searchAll(
      'afd',
      src({
        parties: [{ name: 'AfD', color: '' }],
        bills: [{ id: 1, title: 'AfD-Antrag: Keine Impfpflicht', date: '2022-04-07', topic: 'Gesundheit', topics: ['Gesundheit'], term: '2021 - 2025' }],
      }),
    );
    expect(r.groupOrder).toEqual(['parties', 'bills']);
  });

  it('returns nothing below two characters', () => {
    expect(searchAll('a', src({ parties: [{ name: 'AfD', color: '' }] })).total).toBe(0);
  });
});

describe('isoWeekOf', () => {
  it('matches the ISO calendar', () => {
    expect(isoWeekOf('2026-10-05')).toBe(41);
    expect(isoWeekOf('2025-12-29')).toBe(1);
    expect(isoWeekOf('2027-01-01')).toBe(53);
  });
});
