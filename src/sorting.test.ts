import { describe, expect, it } from 'vitest';
import { compareMultiSortValues, compareSortValues, toggleInSet, toggleMultiSort, toggleSort } from './sorting';
import type { MultiSortState } from './sorting';

describe('compareSortValues', () => {
  it('sorts numbers numerically in both directions', () => {
    expect(compareSortValues(1, 2, 'asc')).toBeLessThan(0);
    expect(compareSortValues(1, 2, 'desc')).toBeGreaterThan(0);
    expect(compareSortValues(2, 2, 'asc')).toBe(0);
  });

  it('sorts strings by German collation, so umlauts land where a reader expects', () => {
    expect(compareSortValues('Ärger', 'Beispiel', 'asc')).toBeLessThan(0);
    expect(compareSortValues('Öl', 'Zucker', 'asc')).toBeLessThan(0);
  });

  it('always sinks missing values to the bottom, whichever way the column is sorted', () => {
    // A null here means "not declared", not "zero". Sorting it as zero would put every
    // undeclared member at one end of a money column and read as a finding about them.
    expect(compareSortValues(null, 5, 'asc')).toBeGreaterThan(0);
    expect(compareSortValues(null, 5, 'desc')).toBeGreaterThan(0);
    expect(compareSortValues(5, null, 'asc')).toBeLessThan(0);
    expect(compareSortValues(5, null, 'desc')).toBeLessThan(0);
    expect(compareSortValues(null, null, 'asc')).toBe(0);
  });
});

describe('toggleSort', () => {
  it('starts ascending on a fresh column', () => {
    expect(toggleSort(null, 'amount')).toEqual({ key: 'amount', dir: 'asc' });
  });

  it('flips direction on the same column', () => {
    expect(toggleSort({ key: 'amount', dir: 'asc' }, 'amount')).toEqual({ key: 'amount', dir: 'desc' });
    expect(toggleSort({ key: 'amount', dir: 'desc' }, 'amount')).toEqual({ key: 'amount', dir: 'asc' });
  });

  it('resets to ascending when switching columns', () => {
    expect(toggleSort({ key: 'amount', dir: 'desc' }, 'donor')).toEqual({ key: 'donor', dir: 'asc' });
  });
});

describe('toggleMultiSort', () => {
  it('cycles one column unsorted -> asc -> desc -> unsorted', () => {
    let state: MultiSortState = [];
    state = toggleMultiSort(state, 'party');
    expect(state).toEqual([{ key: 'party', dir: 'asc' }]);
    state = toggleMultiSort(state, 'party');
    expect(state).toEqual([{ key: 'party', dir: 'desc' }]);
    state = toggleMultiSort(state, 'party');
    expect(state).toEqual([]);
  });

  it('keeps click order as priority order', () => {
    // "Click Partei then Betrag" must group by party and use amount only within a party —
    // not replace the grouping with a competing global sort.
    let state: MultiSortState = [];
    state = toggleMultiSort(state, 'party');
    state = toggleMultiSort(state, 'amount');
    expect(state.map((s) => s.key)).toEqual(['party', 'amount']);
  });

  it('does not disturb other columns when cycling one', () => {
    const state = toggleMultiSort([{ key: 'party', dir: 'asc' }, { key: 'amount', dir: 'asc' }], 'party');
    expect(state).toEqual([{ key: 'party', dir: 'desc' }, { key: 'amount', dir: 'asc' }]);
  });

  it('removes a column without reordering the rest', () => {
    const state = toggleMultiSort([{ key: 'party', dir: 'desc' }, { key: 'amount', dir: 'asc' }], 'party');
    expect(state).toEqual([{ key: 'amount', dir: 'asc' }]);
  });

  it('does not mutate the state it was given', () => {
    const prev: MultiSortState = [{ key: 'party', dir: 'asc' }];
    toggleMultiSort(prev, 'amount');
    expect(prev).toEqual([{ key: 'party', dir: 'asc' }]);
  });
});

describe('compareMultiSortValues', () => {
  const sort: MultiSortState = [{ key: 'party', dir: 'asc' }, { key: 'amount', dir: 'desc' }];

  it('decides on the first key that separates the rows', () => {
    expect(compareMultiSortValues(sort, (k) => (k === 'party' ? ['CDU/CSU', 'SPD'] : [1, 2]))).toBeLessThan(0);
  });

  it('falls through to the next key only on a tie', () => {
    const cmp = compareMultiSortValues(sort, (k) => (k === 'party' ? ['SPD', 'SPD'] : [100, 200]));
    expect(cmp).toBeGreaterThan(0); // amount descending, so the larger sorts first
  });

  it('returns 0 when every key ties', () => {
    expect(compareMultiSortValues(sort, (k) => (k === 'party' ? ['SPD', 'SPD'] : [100, 100]))).toBe(0);
  });

  it('returns 0 for an empty sort, leaving the source order alone', () => {
    expect(compareMultiSortValues([], () => ['a', 'b'])).toBe(0);
  });
});

describe('toggleInSet', () => {
  it('adds a missing value and removes a present one', () => {
    expect([...toggleInSet(new Set(['a']), 'b')].sort()).toEqual(['a', 'b']);
    expect([...toggleInSet(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });

  it('returns a new set, so React sees the change', () => {
    const prev = new Set(['a']);
    const next = toggleInSet(prev, 'b');
    expect(next).not.toBe(prev);
    expect([...prev]).toEqual(['a']);
  });
});
