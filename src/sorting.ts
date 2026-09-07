/**
 * Table sort state and comparators — single-column (`SortState`) and click-to-add
 * multi-column (`MultiSortState`).
 *
 * Pure and side-effect free. Covered by src/sorting.test.ts.
 */

export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

export function toggleSort(prev: SortState, key: string): SortState {
  if (prev?.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: 'asc' };
}

export function compareSortValues(a: string | number | null, b: string | number | null, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const factor = dir === 'asc' ? 1 : -1;
  if (typeof a === 'string' && typeof b === 'string') return factor * a.localeCompare(b, 'de');
  return factor * ((a as number) - (b as number));
}

/** An ordered list of sort keys — click order is priority order, so "click Partei then Betrag"
 * sorts by Partei first and uses Betrag only to break ties within a party, not as a competing
 * global sort. A single-key SortState can't express that: clicking a second column would just
 * replace the first, losing the grouping. */
export type MultiSortState = { key: string; dir: 'asc' | 'desc' }[];

/** Click cycles a column through three states — unsorted → asc → desc → unsorted (removed) —
 * without disturbing any other column's position in the priority list, so building up "Partei,
 * then Betrag" is just clicking each header once in that order. */
export function toggleMultiSort(prev: MultiSortState, key: string): MultiSortState {
  const existing = prev.find((s) => s.key === key);
  if (!existing) return [...prev, { key, dir: 'asc' }];
  if (existing.dir === 'asc') return prev.map((s) => (s.key === key ? { key, dir: 'desc' } : s));
  return prev.filter((s) => s.key !== key);
}

export function compareMultiSortValues(sort: MultiSortState, valueOf: (key: string) => [string | number | null, string | number | null]): number {
  for (const { key, dir } of sort) {
    const [a, b] = valueOf(key);
    const cmp = compareSortValues(a, b, dir);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

export function toggleInSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
