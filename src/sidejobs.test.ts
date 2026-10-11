import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from './data';
import { buildMpMetaDescription, formatIncomeEuro, type SidejobRecord } from './sidejobs';

const rec = (over: Partial<SidejobRecord>): SidejobRecord => ({
  id: 1, title: 'Job', jobTitleExtra: null, organization: null, categoryLabel: '',
  income: null, incomeLevel: null, interval: null, topics: [], additionalInfo: null, ...over,
});

describe('formatIncomeEuro', () => {
  it('uses German grouping in German', () => {
    expect(formatIncomeEuro(1234567.4, 'de')).toBe('1.234.567 €');
  });
});

describe('buildMpMetaDescription', () => {
  const de = TRANSLATIONS.de;

  it('falls back to the generic text without exact amounts', () => {
    const records = [rec({ incomeLevel: '3' }), rec({})];
    expect(buildMpMetaDescription('Erika Muster', 'SPD', records, de, 'de')).toBe(
      'Abstimmungen, Nebeneinkünfte und Lobbykontakte von Erika Muster (SPD) im Bundestag.',
    );
  });

  it('sums exact amounts only and counts only those activities', () => {
    const records = [
      rec({ income: 1000, interval: 'monthly' }),
      rec({ income: 500, interval: 'once' }),
      rec({ incomeLevel: '10' }),
    ];
    expect(buildMpMetaDescription('Erika Muster', 'SPD', records, de, 'de')).toBe(
      'Erika Muster (SPD) meldet 12.500 € Nebeneinkünfte aus 2 bezahlten Tätigkeiten. Dazu Abstimmungen und Lobbykontakte im Überblick.',
    );
  });

  it('uses the singular for one activity', () => {
    expect(buildMpMetaDescription('A', 'B', [rec({ income: 100 })], de, 'de')).toContain('aus einer bezahlten Tätigkeit.');
  });

  it('describes the Nebentätigkeiten page in its finance variant', () => {
    expect(buildMpMetaDescription('Erika Muster', 'SPD', [rec({ income: 500 })], de, 'de', true)).toBe(
      'Erika Muster (SPD) meldet 500 € Nebeneinkünfte aus einer bezahlten Tätigkeit. Alle Einträge mit Organisation und Betrag.',
    );
    expect(buildMpMetaDescription('Erika Muster', 'SPD', [rec({ incomeLevel: '2' })], de, 'de', true)).toBe(
      'Gemeldete Nebentätigkeiten von Erika Muster (SPD): Organisationen, Funktionen und Beträge im Überblick.',
    );
  });

  it('drops the suffix rather than exceeding 155 characters', () => {
    const out = buildMpMetaDescription('Dr. Hans-Joachim Mustermann-Beispielhausen', 'BÜNDNIS 90/DIE GRÜNEN', [rec({ income: 123456789 })], de, 'de');
    expect(out.length).toBeLessThanOrEqual(155);
    expect(out).not.toContain('Überblick');
  });
});
