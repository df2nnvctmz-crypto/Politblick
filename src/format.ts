/**
 * Formatting and text-matching helpers shared across the views.
 *
 * Pure and side-effect free: no React, no data fetching, no DOM. Everything here is
 * covered by src/format.test.ts.
 */

import type { Lang } from './data';

export function formatWeekRange(range: { start: Date; end: Date }, lang: Lang): string {
  const fmt = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short' });
  return `${fmt.format(range.start)} – ${fmt.format(range.end)}`;
}

export function formatDateTime(iso: string, lang: Lang): string {
  const fmt = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return fmt.format(new Date(iso));
}

/** Whole millions, for stat tiles where a nine-digit euro figure would wrap or crowd out its label. */
export function formatMillions(euro: number, lang: Lang): string {
  return Math.round(euro / 1e6).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');
}

/** Turns an MP's name into a URL-safe, readable slug — German umlauts get their usual ASCII
 * transliteration rather than being stripped, so "Müller" reads as "mueller", not "mller". */
export function slugify(name: string): string {
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

/** A "diverged from fraction majority" flag is true for both a genuine opposite vote (yes vs no)
 * and an abstention that merely didn't join a yes/no majority — those aren't the same thing, so
 * the label has to say which one actually happened rather than always claiming "voted against". */
export function divergenceLabel(vote: 'yes' | 'no' | 'abstain' | 'no_show', against: string, abstained: string): string {
  return vote === 'yes' || vote === 'no' ? against : abstained;
}

/** Distinct values with occurrence counts, biggest first — feeds MultiSelectFilter option lists. */
export function countOptions(values: string[]): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'de'));
}

/**
 * The "voted despite own tie" table is real signal, but as 34 rows of text it takes reading
 * every row to notice where it clusters. This turns party × policy-area into a small heatmap
 * so a concentration (e.g. one party, one topic, several rows) is visible at a glance — and
 * clicking a cell filters the table below to just that slice.
 */
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function truncateLabel(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/** First paragraph of a `\n\n`-separated text block, for a collapsed preview that never cuts off mid-sentence. */
export function firstParagraph(text: string): string {
  return text.split(/\n{2,}/)[0];
}

export function normalizeSearchText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Substring match first (so "cdu" hits "CDU/CSU" outright), falling back to an in-order
 * subsequence match (so "kwhitt" still hits "Kai Whittaker") — cheap enough for the list sizes
 * these searches run over, no need for a scored fuzzy library.
 *
 * The subsequence fallback is capped to a tight span (query length + slack) — an uncapped
 * subsequence match against long prose (an org's name plus its lobbying demand) turns almost
 * any short query into a hit, since 4-5 letters are near-certain to appear somewhere in order
 * across a long string. Real near-misses (a typo, a skipped letter) still fit the cap; unrelated
 * matches scattered across a whole sentence don't.
 */
export function fuzzyMatch(query: string, target: string): boolean {
  const q = normalizeSearchText(query.trim());
  if (!q) return true;
  const t = normalizeSearchText(target);
  if (t.includes(q)) return true;
  if (q.length < 3) return false;
  let qi = 0;
  let firstIndex = -1;
  let lastIndex = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstIndex === -1) firstIndex = ti;
      lastIndex = ti;
      qi++;
    }
  }
  if (qi !== q.length) return false;
  return lastIndex - firstIndex + 1 <= q.length + 4;
}
