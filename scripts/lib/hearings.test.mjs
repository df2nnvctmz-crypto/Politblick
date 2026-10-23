import { describe, expect, it } from 'vitest';
import { buildRegisterNameIndex, matchRegisterOrg, parseGermanDate, parseHearingPage, statementAuthor, stripSharedTopic } from './hearings.mjs';

/**
 * What these pin is the honesty of the hearings join: which written statement gets shown as
 * coming from a *registered lobbying organisation*. A wrong link does not throw — it puts a
 * register entry's name next to a bill it never commented on — so every rule that can make a
 * link is tested for the case where it must refuse.
 */

const register = [
  { id: 'R1', name: 'BDEW Bundesverband der Energie- und Wasserwirtschaft e.V.', city: 'Berlin' },
  { id: 'R2', name: 'Deutscher Gewerkschaftsbund', city: 'Berlin' },
  { id: 'R3', name: 'Verband forschender Arzneimittelhersteller e.V.', city: 'Berlin' },
  { id: 'R4', name: 'Stadtwerke Beispiel GmbH', city: 'Köln' },
  { id: 'R5', name: 'Stadtwerke Beispiel', city: 'Bonn' },
  { id: 'R6', name: 'Naturschutzbund', city: 'Berlin' },
];
const index = buildRegisterNameIndex(register);
const byId = new Map(register.map((o) => [o.id, o]));
const match = (author, aliases) => matchRegisterOrg(author, index, aliases, byId);

describe('statementAuthor', () => {
  it('reads each committee format seen in the wild', () => {
    expect(statementAuthor('21(9)333 Stellungnahme des BDEW Bundesverband der Energie- und Wasserwirtschaft e.V.')).toBe(
      'BDEW Bundesverband der Energie- und Wasserwirtschaft e.V.',
    );
    expect(statementAuthor('Schriftliche Stellungnahme - Deutscher Gewerkschaftsbund (DGB)')).toBe('Deutscher Gewerkschaftsbund (DGB)');
    expect(statementAuthor('21(11)45 - Prof. Dr. Martin Werding')).toBe('Prof. Dr. Martin Werding');
    expect(statementAuthor('01 - Malmendier, Prof. Dr. Ulrike, University of California, Berkeley (noch nicht barrierefrei)')).toBe(
      'Malmendier, Prof. Dr. Ulrike, University of California, Berkeley',
    );
    expect(statementAuthor('21(9)338 Stellungnahme Greenpeace e. V.')).toBe('Greenpeace e. V.');
  });

  it('drops the Innenausschuss letter suffix and its trailing Drucksache reference', () => {
    expect(statementAuthor('21(4)208 - Stellungnahme - Deutscher Anwaltverein - Nachrichtendienstrecht - BT-Drucksache 21/7868')).toBe(
      'Deutscher Anwaltverein - Nachrichtendienstrecht',
    );
    expect(statementAuthor('21(4)233 A - Stellungnahme Prof. Dr. Markus Löffelmann - Hochschule des Bundes - BT-Drucksachen 21/7868, 21/8295')).toBe(
      'Prof. Dr. Markus Löffelmann - Hochschule des Bundes',
    );
    expect(statementAuthor('21(4)100 - Stellungnahme - Pro Asyl - 21/3051')).toBe('Pro Asyl');
  });

  it('drops the Digitalausschuss sitting suffix', () => {
    expect(statementAuthor('Stellungnahme Susanne Dehmel (Bitkom e.V.) zur 33. Sitzung am 6. Oktober 2026 (Öffentliche Anhörung) "DIdG"')).toBe(
      'Susanne Dehmel (Bitkom e.V.)',
    );
  });

  it('strips a lower-case article but never a capitalised one, which is part of the name', () => {
    expect(statementAuthor('21(4)091 - Stellungnahme Der Paritätische Gesamtverband')).toBe('Der Paritätische Gesamtverband');
    expect(statementAuthor('21(9)368 Stellungnahme des Sachverständigen Prof. Dr. Sven-Joachim Otto')).toBe('Prof. Dr. Sven-Joachim Otto');
    expect(statementAuthor('21(9)403 gemeinsame Stellungnahme BDI und BDA')).toBe('BDI und BDA');
    expect(statementAuthor('Stiftung Deutsche Sporthilfe - Stellungnahme')).toBe('Stiftung Deutsche Sporthilfe');
  });

  it('returns null for bundles, which are by nobody', () => {
    expect(statementAuthor('Zusammenstellung der Schriftlichen Stellungnahmen')).toBeNull();
    expect(statementAuthor('')).toBeNull();
  });
});

describe('matchRegisterOrg', () => {
  it('links on an exact normalised name', () => {
    expect(match('BDEW Bundesverband der Energie- und Wasserwirtschaft e. V.')).toEqual({ orgId: 'R1', rule: 'exact' });
  });

  it('drops a trailing acronym, but only a real acronym', () => {
    expect(match('Deutscher Gewerkschaftsbund (DGB)')).toEqual({ orgId: 'R2', rule: 'acronym' });
    // A parenthetical qualifier names a different body — the federal association is not its state branch.
    expect(match('Naturschutzbund (Landesverband Bayern)')).toBeNull();
  });

  it('drops a trailing city only when the register entry sits in that city', () => {
    expect(match('Verband forschender Arzneimittelhersteller (vfa), Berlin')).toBeNull(); // "vfa" is lower-case: not stripped
    expect(match('Verband forschender Arzneimittelhersteller, Berlin')).toEqual({ orgId: 'R3', rule: 'city' });
    expect(match('Verband forschender Arzneimittelhersteller, München')).toBeNull();
  });

  it('never links a person to the institution named beside them', () => {
    // The expert's affiliation is not the institution speaking.
    expect(match('Prof. Dr. Erika Muster, Deutscher Gewerkschaftsbund')).toBeNull();
    expect(match('Muster, Erika - Deutscher Gewerkschaftsbund')).toBeNull();
    expect(match('Dr. Deutscher Gewerkschaftsbund')).toBeNull();
  });

  it('refuses a name two register entries share', () => {
    // "Stadtwerke Beispiel GmbH" and "Stadtwerke Beispiel" normalise alike: which one wrote this is unknowable.
    expect(match('Stadtwerke Beispiel')).toBeNull();
  });

  it('lets a reviewed alias win, including a reviewed "do not link"', () => {
    expect(match('DGB-Bundesvorstand', { 'DGB-Bundesvorstand': 'R2' })).toEqual({ orgId: 'R2', rule: 'alias' });
    expect(match('Deutscher Gewerkschaftsbund', { 'Deutscher Gewerkschaftsbund': null })).toBeNull();
  });

  it('does not match on a fragment', () => {
    expect(match('Gewerkschaftsbund')).toBeNull();
    expect(match('Deutscher Gewerkschaftsbund Landesbezirk Nord')).toBeNull();
  });
});

describe('stripSharedTopic', () => {
  it("removes the hearing's topic when most statements end in it", () => {
    const authors = ['Deutscher Anwaltverein - Vereinsgesetz', 'Prof. Dr. A - Uni X - Vereinsgesetz', 'Pro Asyl - vereinsgesetz', 'Dr. B - Vereinsgesetz'];
    expect(stripSharedTopic(authors)).toEqual(['Deutscher Anwaltverein', 'Prof. Dr. A - Uni X', 'Pro Asyl', 'Dr. B']);
  });

  it('keeps an affiliation only a few experts share', () => {
    // ver.di on 2 of 42 GKV statements is where two people work, not what the hearing was about.
    const authors = ['Dr. A - ver.di', 'Dr. B - ver.di', 'X', 'Y', 'Z', 'W', 'V'];
    expect(stripSharedTopic(authors)).toEqual(authors);
  });

  it('never strips on a two-statement hearing, where "half" would be a single coincidence', () => {
    // Stripping here would turn two state branches into the federal body and link the wrong entry.
    const authors = ['Naturschutzbund - Landesverband Bayern', 'Naturschutzbund - Landesverband Bayern'];
    expect(stripSharedTopic(authors)).toEqual(authors);
  });

  it('passes bundles (null) through untouched', () => {
    expect(stripSharedTopic([null, 'Verband A - Thema', 'Verband B - Thema', 'Verband C - Thema'])).toEqual([null, 'Verband A', 'Verband B', 'Verband C']);
  });

  it('keeps the name whole if stripping would leave almost nothing', () => {
    expect(stripSharedTopic(['A - Thema', 'B - Thema', 'C - Thema'])).toEqual(['A - Thema', 'B - Thema', 'C - Thema']);
  });
});

describe('parseGermanDate', () => {
  it('reads the hearing time line', () => {
    expect(parseGermanDate('Dienstag, 8. September 2026, 8 bis 9.30 Uhr')).toBe('2026-09-08');
    expect(parseGermanDate('Mittwoch, 4. März 2026')).toBe('2026-03-04');
  });
  it('is null rather than a guess when the date is incomplete', () => {
    expect(parseGermanDate('September 2026')).toBeNull();
    expect(parseGermanDate('8. Septober 2026')).toBeNull();
  });
});

describe('parseHearingPage', () => {
  const page = `
    <ol><li aria-current="false" data-cm-id="1"><a href=/>Startseite</a></li>
    <li aria-current="false" data-cm-id="2"><a href=/ausschuesse>Ausschüsse</a></li>
    <li aria-current="false" data-cm-id="3"><a href=/ausschuesse/a09>Wirtschaft und Energie</a></li></ol>
    <h1 class="bt-artikel__title">Anhörung zur Wärmeplanung</h1>
    <p><strong>Zeit: </strong>Dienstag, 8. September 2026, 8 bis 9.30 Uhr<br/></p>
    <p>Die Novelle ändert auch das <a href="https://dserver.bundestag.de/btd/20/012/2001234.pdf">20/1234</a>.</p>
    <aside class="bt-artikel__aside">
      <h2 class="bt-artikel__aside-section-title">Stellungnahmen</h2>
      <ul><li><a href="/resource/blob/1/a.pdf">21(9)333 Stellungnahme des BDEW e.V.</a></li>
      <li><a href="/resource/blob/2/b.pdf">Zusammenstellung der Stellungnahmen</a></li></ul>
      <h2 class="bt-artikel__aside-section-title">Dokumente</h2>
      <ul><li><a href="https://dserver.bundestag.de/btd/21/065/2106587.pdf">21/6587 - Gesetzentwurf</a></li></ul>
    </aside>`;
  const parsed = parseHearingPage(page, 'https://www.bundestag.de/ausschuesse/a09/x/1205008-1205008');

  it('takes Drucksachen from the document list, not from links in the write-up', () => {
    expect(parsed.drucksachen).toEqual(['21/6587']);
  });

  it('keeps the committee, date and every statement verbatim', () => {
    expect(parsed.id).toBe('1205008');
    expect(parsed.committee).toBe('Wirtschaft und Energie');
    expect(parsed.date).toBe('2026-09-08');
    expect(parsed.statements.map((s) => s.label)).toEqual(['21(9)333 Stellungnahme des BDEW e.V.', 'Zusammenstellung der Stellungnahmen']);
    expect(parsed.statements[0].number).toBe('21(9)333');
    expect(parsed.statements[1].author).toBeNull();
  });

  it('reads the subject from the lead paragraph when a committee publishes no document list', () => {
    const noList = `
      <h1 class="bt-artikel__title">Anhörung zum Tariftreuegesetz</h1>
      <p><strong>Zeit: </strong>Montag, 3. November 2025,<br/><strong>Ort: </strong>Berlin<br/></p>
      <p>Der Entwurf für ein Tariftreuegesetz (<a href="https://dserver.bundestag.de/btd/21/019/2101941.pdf">21/1941</a>) ist auf Kritik gestoßen.</p>
      <p>Schon das alte Gesetz (<a href="https://dserver.bundestag.de/btd/21/001/2100100.pdf">21/100</a>) war umstritten.</p>`;
    const h = parseHearingPage(noList, 'https://www.bundestag.de/a/b/1117218-1117218');
    expect(h.drucksachen).toEqual(['21/1941']);
    expect(h.isHearing).toBe(true);
  });

  it('marks an ordinary public sitting as not a hearing', () => {
    const sitting = `
      <h1 class="bt-artikel__title">14. Sitzung</h1>
      <p><strong>Zeit: </strong>Mittwoch, 28. Januar 2026<br/><strong>Ort: </strong>Berlin<br/></p>
      <p>Der Ausschuss sprach mit dem Staatssekretär über <a href="https://dserver.bundestag.de/btd/21/021/2102150.pdf">21/2150</a>.</p>`;
    expect(parseHearingPage(sitting, 'https://www.bundestag.de/a/b/1-1').isHearing).toBe(false);
  });

  it('is null for a page that is not an article', () => {
    expect(parseHearingPage('<html></html>', 'https://www.bundestag.de/x')).toBeNull();
  });
});
