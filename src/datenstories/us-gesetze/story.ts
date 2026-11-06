/**
 * Datenstory "US-Lobby in Berlin", part 2: the bills — every Bundestag vote with US lobbyists,
 * then the sugar levy as the closer look at the GKV-Reform.
 *
 * Every number is a `{slot}` filled by slots() from public/data/datenstories/us-gesetze.json.
 * The vote list itself is fully live: a new vote with US lobbyists appears with its plain title.
 * pollNotes/orgNotes only add short labels and context to votes and orgs we know. Dates of votes
 * are never written here; they come from the data (one poll date in the abgeordnetenwatch feed is
 * known to be off by a day).
 *
 * Research files: recherche/befunde-us-einfluss-2026-11.md, recherche/slides-us-lobby/quellen.md.
 * Curated inputs: data/datenstories/us-gesetze/, data/datenstories/us-lobby/us-parents.json.
 */
import { RES_PUBLICA, US_METHOD } from '../partners';
import type { DatenstoryListing, StorySection, UsGesetzeData } from '../types';

export const RESEARCHED_ON = '2026-11-06';

export const listing: DatenstoryListing = {
  slug: 'us-gesetze',
  kicker: 'US-Lobby in Berlin',
  title: 'Zuckerabgabe, Heizungsgesetz, CO₂-Preis: hier lobbyierten US-Konzerne mit',
  teaser:
    'Zu welchen Bundestagsabstimmungen US-Konzerne Lobbyarbeit gemeldet haben, mit Ergebnis und Anliegen im Wortlaut. Dazu: wer für und wer gegen die Zuckerabgabe lobbyiert.',
  researchedOn: RESEARCHED_ON,
  partner: RES_PUBLICA,
  series: { name: 'US-Lobby in Berlin', part: 2, partLabel: 'Die Gesetze' },
};

export { orgNotes, pollNotes } from './notes';

/** Every number the text uses, computed from the built data. */
export function slots(d: UsGesetzeData) {
  const c = d.sugarLevy.counts;
  const gkv = d.votes.find((v) => v.id === 6601);
  return {
    voteCount: String(d.votes.length),
    usOrgCount: String(new Set(d.votes.flatMap((v) => v.usOrgs.map((o) => o.id))).size),
    gkvUs: String(gkv?.usOrgs.length ?? 0),
    gkvTotal: String(gkv?.lobbyCount ?? 0),
    levyTotal: String(d.sugarLevy.entries.length),
    levyOrgs: String(c.against + c.for + c.shape),
    levyAgainst: String(c.against),
    levyFor: String(c.for),
    levyShape: String(c.shape),
    levyAgency: String(c.agency),
    levyUs: String(d.sugarLevy.entries.filter((e) => e.isUs).length),
    usEntryCount: String(d.usEntryCount),
  };
}

export const story = {
  kicker: 'US-Lobby in Berlin',
  title: 'Zuckerabgabe ab 2028',
  titleAccent: 'Coca-Cola dagegen, Bristol-Myers Squibb dafür',
  lede: [
    'Die GKV-Reform kündigt eine Zuckerabgabe an: Coca-Cola lobbyiert dagegen, Bristol-Myers Squibb dafür. Insgesamt haben US-Konzerne laut Lobbyregister zu {voteCount} namentlichen Abstimmungen dieser Wahlperiode Lobbyarbeit gemeldet. Bei der GKV-Reform allein gehören {gkvUs} von {gkvTotal} Lobbyakteuren zu US-Konzernen.',
  ],
  metaTitle: 'Zuckerabgabe, Heizungsgesetz, CO₂-Preis: hier lobbyierten US-Konzerne mit – Politblick',
  metaDescription:
    '{voteCount} Bundestagsabstimmungen, zu denen US-Konzerne Lobbyarbeit gemeldet haben, mit Ergebnis und Anliegen im Wortlaut. Dazu: wer für und wer gegen die Zuckerabgabe lobbyiert.',
  sections: [
    {
      id: 'abstimmungen',
      chart: 'votes',
      heading: 'Zuckerabgabe, Heizungsgesetz, CO₂-Preis:',
      headingAccent: 'hier lobbyierten US-Konzerne mit',
      body: [
        'Jede Zeile ist eine namentliche Abstimmung, zu der ein US-Konzern laut Register Lobbyarbeit gemeldet hat: worum es im Gesetz geht, das Ergebnis und die US-Konzerne unter allen Lobbyakteuren. Aufklappen zeigt die Zusammenfassung des Gesetzes, das Ergebnis nach Fraktion und die Anliegen im Wortlaut des Registers.',
        'Ob ein Konzern ein Gesetz wollte oder verhindern wollte, sagt das Register nicht. Wo wir den Wortlaut des Eintrags gelesen haben, steht es dabei: bei der Zuckerabgabe in der GKV-Reform ist Coca-Cola dagegen, Bristol-Myers Squibb dafür.',
        'Nicht jeder US-Konzern ist am Namen zu erkennen: Viessmann gehört seit 2024 zum US-Konzern Carrier, Intervet ist die Tiersparte von MSD.',
      ],
      shows: 'Zu welchen Gesetzen US-Konzerne Lobbyarbeit gemeldet haben und wie der Bundestag abgestimmt hat.',
      notShows:
        'Ob die Lobbyarbeit das Ergebnis beeinflusst hat. Die Verbindung von Registereintrag und Abstimmung ist Politblicks Zuordnung über die im Register genannten Gesetzesvorhaben, keine Angabe des Registers selbst.',
    },
    {
      id: 'zuckerabgabe',
      chart: 'levy',
      heading: 'Zuckerabgabe ab 2028:',
      headingAccent: '{levyAgainst} Organisationen dagegen, {levyFor} dafür',
      body: [
        'Mit der {gkvBill} kündigt der Bundestag eine Abgabe auf zuckergesüßte Getränke ab 2028 an. {levyTotal} Registereinträge nennen eine Zuckersteuer oder -abgabe. Ohne Agenturen und Einzelpersonen sind es {levyOrgs} Organisationen: {levyAgainst} dagegen, {levyFor} dafür, {levyShape} wollen sie gestalten, begrenzen oder lassen keine Position erkennen.',
        '{levyUs} davon sind US-Akteure. Coca-Cola und das Consumer Choice Center sind dagegen, PepsiCo will die Steuer mitgestalten, Bristol-Myers Squibb begrüßt sie.',
      ],
      shows: 'Wer im Register Lobbyarbeit zur Zuckerabgabe meldet und in welche Richtung.',
      notShows:
        'Wie viel Geld in dieses Thema fließt: Das Register nennt Ausgaben nur pro Organisation, nicht pro Thema. Die Lager sind unsere Lesart des Wortlauts der Einträge; Grenzfälle stehen in der Quellenliste.',
      quotes: [
        {
          who: 'Coca-Cola GmbH',
          role: 'dagegen · auch über die Agentur von Beust & Coll.',
          text: 'Ziel der Interessenvertretung ist es, auf die fehlende Evidenzbasis sowie die Unverhältnismäßigkeit möglicher neuer Regelungen hinzuweisen',
          asOf: RESEARCHED_ON,
          sourceUrl: 'https://www.lobbyregister.bundestag.de/suche/R001689',
        },
        {
          who: 'Bristol-Myers Squibb',
          role: 'dafür · Pharma',
          text: 'der aus meiner Sicht zu begrüßenden Einführung einer Zuckerabgabe',
          asOf: RESEARCHED_ON,
          sourceUrl: 'https://www.lobbyregister.bundestag.de/suche/R000931',
        },
      ],
    },
  ] satisfies StorySection<'votes' | 'levy'>[],
  method: [
    'Abstimmungen und Ergebnisse: abgeordnetenwatch.de (CC0). Welche Organisation zu welchem Gesetz lobbyiert hat, leitet Politblick aus den im Lobbyregister genannten Gesetzesvorhaben und Drucksachen ab. Beides aktualisiert sich mit jedem Datenabruf.',
    ...US_METHOD,
    'Die Lager zur Zuckerabgabe beruhen auf einer Suche im Register am 6.11.2026 und werden nicht automatisch aktualisiert.',
  ],
};

export { claims } from './claims';
