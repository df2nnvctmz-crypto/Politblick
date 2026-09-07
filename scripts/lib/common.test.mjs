import { describe, expect, it } from 'vitest';
import { canonicalPartyName, extractDrucksachen, fractionNameFromVote, normalizeOrgName } from './common.mjs';

/**
 * These cover the join keys — the strings that decide whether a donation, a declared role or a
 * lobbying filing gets attached to a named person. A silent change here does not throw; it
 * attaches a tie to the wrong politician, or drops a real one, and the page looks fine either
 * way. Most cases below are regressions: each one shipped wrong at some point.
 */

describe('normalizeOrgName', () => {
  it('collapses both spellings of "e. V."', () => {
    // The bug: the legal-form pattern used `\s?`, but the preceding rule turns every '.' into a
    // space, so "e.V." arrives as "e v" and "e. V." as "e  v" — two spaces. The second spelling
    // kept its legal form and never matched the first. It silently cost 19 donation rows.
    expect(normalizeOrgName('Stiftung Lesen e.V.')).toBe(normalizeOrgName('Stiftung Lesen e. V.'));
    expect(normalizeOrgName('Stiftung Lesen e.V.')).toBe('stiftunglesen');
  });

  it('drops legal forms so one body matches across sources', () => {
    expect(normalizeOrgName('Beispiel GmbH')).toBe(normalizeOrgName('Beispiel'));
    expect(normalizeOrgName('Beispiel AG')).toBe('beispiel');
    expect(normalizeOrgName('Beispiel gGmbH')).toBe('beispiel');
  });

  it('keeps German letters, which carry the distinction between real names', () => {
    expect(normalizeOrgName('Gesundheitsförderung')).toBe('gesundheitsförderung');
    expect(normalizeOrgName('Bäckerinnung')).not.toBe(normalizeOrgName('Backerinnung'));
  });

  it('does not fold two genuinely different organisations together', () => {
    expect(normalizeOrgName('Deutscher Bauernverband')).not.toBe(normalizeOrgName('Deutscher Brauerverband'));
  });

  it('is total — never throws on absent or non-string input', () => {
    expect(normalizeOrgName(null)).toBe('');
    expect(normalizeOrgName(undefined)).toBe('');
    expect(normalizeOrgName('')).toBe('');
  });
});

describe('canonicalPartyName', () => {
  it('maps every Grüne spelling onto one name', () => {
    expect(canonicalPartyName('BÜNDNIS 90/DIE GRÜNEN')).toBe('Grüne');
    expect(canonicalPartyName('Bündnis 90/Die Grünen (Bundestag 2021 - 2025)')).toBe('Grüne');
    expect(canonicalPartyName('DIE GRÜNEN')).toBe('Grüne');
  });

  it('does not swallow BSW, whose registered name also starts with "Bündnis"', () => {
    // The bug: matching a bare "BÜNDNIS" also caught "Bündnis Sahra Wagenknecht — Vernunft und
    // Gerechtigkeit" and filed BSW's donations under Grüne. Requiring "90" is strictly narrower:
    // every real Grüne variant contains "Grünen" and is already caught by the first branch.
    expect(canonicalPartyName('Bündnis Sahra Wagenknecht – Vernunft und Gerechtigkeit')).not.toBe('Grüne');
    expect(canonicalPartyName('BSW')).toBe('BSW');
  });

  it('normalises Linke and Fraktionslos', () => {
    expect(canonicalPartyName('Die Linke')).toBe('Linke');
    expect(canonicalPartyName('fraktionslos')).toBe('Fraktionslos');
  });

  it('passes other parties through, minus the term suffix', () => {
    expect(canonicalPartyName('SPD (Bundestag 2021 - 2025)')).toBe('SPD');
    expect(canonicalPartyName('CDU/CSU')).toBe('CDU/CSU');
  });
});

describe('fractionNameFromVote', () => {
  it('reads Fraktionslos from the empty-ARRAY spelling of "no fraction"', () => {
    // The bug: abgeordnetenwatch serialises "no fraction" as `"fraction": []`, and `[]` is truthy
    // in JavaScript. The obvious `v.fraction ? ... : 'Fraktionslos'` therefore took the fraction
    // branch and threw on `.label` of an array. Real case: Joana Cotar's no_show in poll 4828
    // (Atomkraft-Weiterbetrieb, 11.11.2022), recorded after she left the AfD fraction.
    expect(fractionNameFromVote({ fraction: [] })).toBe('Fraktionslos');
    expect(() => fractionNameFromVote({ fraction: [] })).not.toThrow();
  });

  it('reads Fraktionslos from every other absent spelling', () => {
    expect(fractionNameFromVote({})).toBe('Fraktionslos');
    expect(fractionNameFromVote({ fraction: null })).toBe('Fraktionslos');
    expect(fractionNameFromVote({ fraction: { label: '' } })).toBe('Fraktionslos');
  });

  it('canonicalises a real fraction label', () => {
    expect(fractionNameFromVote({ fraction: { label: 'BÜNDNIS 90/DIE GRÜNEN (Bundestag 2021 - 2025)' } })).toBe('Grüne');
  });
});

describe('extractDrucksachen', () => {
  it('rebuilds the register\'s printingNumber form from a document URL', () => {
    // The filename encodes term (21) + a five-digit zero-padded number (05921); the register
    // writes that as "21/5921". This is the string the whole lobby join hangs off.
    const html = '<a href="https://dserver.bundestag.de/btd/21/059/2105921.pdf">Drucksache</a>';
    expect(extractDrucksachen(html)).toEqual(['21/5921']);
  });

  it('deduplicates repeated references and keeps distinct ones', () => {
    const html = `
      <a href="https://dserver.bundestag.de/btd/21/059/2105921.pdf">a</a>
      <a href="https://dserver.bundestag.de/btd/21/059/2105921.pdf">again</a>
      <a href="https://dserver.bundestag.de/btd/20/012/2001234.pdf">other term</a>`;
    expect(extractDrucksachen(html).sort()).toEqual(['20/1234', '21/5921']);
  });

  it('returns nothing rather than guessing when no document is linked', () => {
    expect(extractDrucksachen('<p>Kein Link</p>')).toEqual([]);
    expect(extractDrucksachen('')).toEqual([]);
    expect(extractDrucksachen(null)).toEqual([]);
  });
});
