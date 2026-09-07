import { describe, expect, it } from 'vitest';
import { countOptions, escapeXml, firstParagraph, fuzzyMatch, normalizeSearchText, slugify, truncateLabel } from './format';

describe('slugify', () => {
  it('transliterates umlauts rather than dropping them', () => {
    // Names are the whole point of these URLs. "Grüne" must not become "grne".
    expect(slugify('Anna Lührmann')).toBe('anna-luehrmann');
    expect(slugify('Gökay Akbulut')).toBe('goekay-akbulut');
    expect(slugify('Weiß')).toBe('weiss');
  });

  it('strips remaining diacritics instead of emitting them raw', () => {
    expect(slugify('Macit Karaahmetoğlu')).toBe('macit-karaahmetoglu');
  });

  it('collapses punctuation and trims the separators to the edges', () => {
    expect(slugify('Dr. Franziska Brantner')).toBe('dr-franziska-brantner');
    expect(slugify('  Hans-Peter  ')).toBe('hans-peter');
    expect(slugify('!!!')).toBe('');
  });
});

describe('normalizeSearchText', () => {
  it('folds case and diacritics so a search without umlauts still finds the name', () => {
    expect(normalizeSearchText('Lührmann')).toBe('luhrmann');
    expect(normalizeSearchText('GÖKAY')).toBe('gokay');
  });
});

describe('fuzzyMatch', () => {
  it('matches a plain substring', () => {
    expect(fuzzyMatch('merz', 'Friedrich Merz')).toBe(true);
    expect(fuzzyMatch('MERZ', 'Friedrich Merz')).toBe(true);
  });

  it('matches across the umlaut a searcher probably will not type', () => {
    expect(fuzzyMatch('luhrmann', 'Anna Lührmann')).toBe(true);
  });

  it('treats an empty query as matching everything, so a cleared box shows the full list', () => {
    expect(fuzzyMatch('', 'anything')).toBe(true);
    expect(fuzzyMatch('   ', 'anything')).toBe(true);
  });

  it('allows a tight gapped match but keeps the span bounded', () => {
    // "annal" is not a substring of "anna luhrmann" — the space breaks it — but the letters sit
    // close enough together to be what the searcher meant.
    expect(fuzzyMatch('annal', 'Anna Lührmann')).toBe(true);
    // The same letters spread across an unrelated name must not match: without the span limit,
    // subsequence matching alone returns half the Bundestag for any query.
    expect(fuzzyMatch('merz', 'Melanie Bernstein zu Reutlingen')).toBe(false);
    expect(fuzzyMatch('frmerz', 'Friedrich Merz')).toBe(false);
  });

  it('does not gap-match a query under three characters', () => {
    expect(fuzzyMatch('mz', 'Merz')).toBe(false);
    expect(fuzzyMatch('me', 'Merz')).toBe(true); // substring, not a gap match
  });

  it('rejects a query whose letters are not all present', () => {
    expect(fuzzyMatch('scholz', 'Friedrich Merz')).toBe(false);
  });
});

describe('escapeXml', () => {
  it('escapes the characters that would break an exported SVG', () => {
    // Chart exports build SVG by string concatenation, so an unescaped organisation name
    // containing & or < produces a file that will not open.
    expect(escapeXml('Wirtschaft & Handel')).toBe('Wirtschaft &amp; Handel');
    expect(escapeXml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes the ampersand first, so escapes are not double-escaped', () => {
    expect(escapeXml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves quotes alone, which is safe only in element content', () => {
    // Every call site interpolates the result between <text> tags, never into an attribute
    // value. If that ever changes, quotes have to start being escaped too — this test is the
    // record of the assumption, so a future attribute call site is a deliberate decision.
    expect(escapeXml(`Bündnis "Pro Bahn" e.V.`)).toBe(`Bündnis "Pro Bahn" e.V.`);
  });
});

describe('truncateLabel', () => {
  it('leaves a label that fits untouched', () => {
    expect(truncateLabel('Umwelt', 10)).toBe('Umwelt');
  });

  it('marks a shortened label as shortened', () => {
    const out = truncateLabel('Öffentliche Finanzen, Steuern und Abgaben', 12);
    expect(out.length).toBeLessThanOrEqual(13);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('firstParagraph', () => {
  it('takes only the leading paragraph of a register free-text field', () => {
    expect(firstParagraph('Erste Zeile.\n\nZweite Zeile.')).toBe('Erste Zeile.');
  });

  it('returns the whole text when there is only one paragraph', () => {
    expect(firstParagraph('Nur eine Zeile.')).toBe('Nur eine Zeile.');
  });
});

describe('countOptions', () => {
  it('counts occurrences and puts the commonest first', () => {
    expect(countOptions(['SPD', 'CDU/CSU', 'SPD', 'Grüne', 'SPD', 'CDU/CSU'])).toEqual([
      { value: 'SPD', label: 'SPD', count: 3 },
      { value: 'CDU/CSU', label: 'CDU/CSU', count: 2 },
      { value: 'Grüne', label: 'Grüne', count: 1 },
    ]);
  });

  it('breaks ties by German collation, so the order is stable between renders', () => {
    expect(countOptions(['Ökologie', 'Bildung', 'Arbeit']).map((o) => o.value)).toEqual(['Arbeit', 'Bildung', 'Ökologie']);
  });

  it('returns nothing for no values', () => {
    expect(countOptions([])).toEqual([]);
  });
});
