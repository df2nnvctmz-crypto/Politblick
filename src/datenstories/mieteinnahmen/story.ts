/**
 * Datenstory "Mieteinnahmen im Bundestag". Which MPs report rental income
 * as a paid side activity, how the biggest figure spreads over places and tenancies, and what the
 * programme of that MP's party says about rent policy, side by side and without a verdict.
 *
 * Every number is a `{slot}` filled by slots() from public/data/datenstories/mieteinnahmen.json.
 * The one frozen finding is the programme quote (data/datenstories/mieteinnahmen/programm.json),
 * shown with the date it was checked. No partner: this story is Politblick's own.
 *
 * Research behind it: the r/mediasres post of 7 October 2026 (Sebastian Maack, Stand 06.10.2026).
 */
import type { DatenstoryListing, MietenData, StorySection } from '../types';

/** Day the figures were checked against bundestag.de (Stand der Pflichtangaben). The numbers on the page are live. */
export const RESEARCHED_ON = '2026-10-06';

export const listing: DatenstoryListing = {
  slug: 'mieteinnahmen',
  kicker: 'Nebeneinkünfte im Bundestag',
  title: 'Mieteinnahmen im Bundestag: Wer sie meldet und wie hoch sie sind',
  teaser: 'Welche Abgeordneten Einnahmen aus Vermietung melden, wie sich die höchste Summe auf Orte und Mietverhältnisse verteilt und was das Wahlprogramm der Partei zur Mietpolitik sagt.',
  topics: ['Nebeneinkünfte'],
  keywords: ['Sebastian Maack', 'Maack', 'Oliver Pöpsel', 'AfD', 'Vermietung', 'Vermieter', 'Mieter', 'Mietpreisbremse', 'Mietendeckel', 'Wohnen', 'Immobilien', 'Nebentätigkeiten'],
  publishedOn: '2026-10-07',
  researchedOn: RESEARCHED_ON,
  discussion: { name: 'r/mediasres', url: 'https://www.reddit.com/r/mediasres/comments/1wzepu5/die_afd_lehnt_mietpreisbremse_und_mietendeckel_im/' },
  previewStyle: 'slide',
  liveSource: 'den Nebentätigkeits-Angaben im Bundestag',
};

const int = (n: number) => Math.round(n).toLocaleString('de-DE');
const euro = (n: number) => `${int(n)} €`;
const dateDe = (iso: string | undefined) => (iso ? `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.${iso.slice(0, 4)}` : '');

/** Every number the text uses, computed from the built data. The claim checks recompute them independently. */
export function slots(d: MietenData) {
  const top = d.landlords[0];
  const second = d.landlords[1];
  const place = (i: number) => top?.places[i];
  const foreign = top?.places.find((p) => p.note);
  return {
    count: String(d.landlords.length),
    memberCount: int(d.memberCount),
    topName: top?.name ?? '',
    topParty: top?.party ?? '',
    topEuro: euro(top?.annualEuro ?? 0),
    topTenants: String(top?.tenantCount ?? 0),
    topPlaceCount: String(top?.places.length ?? 0),
    place1: place(0)?.place ?? '',
    place1Tenants: String(place(0)?.tenants ?? 0),
    place1Euro: euro(place(0)?.sumEuro ?? 0),
    place2: place(1)?.place ?? '',
    place2Euro: euro(place(1)?.sumEuro ?? 0),
    place3: place(2)?.place ?? '',
    place3Euro: euro(place(2)?.sumEuro ?? 0),
    secondName: second?.name ?? '',
    secondParty: second?.party ?? '',
    secondEuro: euro(second?.annualEuro ?? 0),
    secondTenants: String(second?.tenantCount ?? 0),
    foreignPlace: foreign?.place ?? '',
    foreignNote: foreign?.note ?? '',
    foreignEuro: euro(foreign?.sumEuro ?? 0),
    foreignMonth: euro((foreign?.sumEuro ?? 0) / 12),
    programmeParty: d.programme.party,
    programmeName: d.programme.programme,
    programmePage: d.programme.page,
    programmeChecked: dateDe(d.programme.checkedOn),
  };
}

export const story = {
  kicker: 'Nebeneinkünfte im Bundestag',
  title: 'Mieteinnahmen im Bundestag',
  titleAccent: '{topName} meldet {topEuro} im Jahr aus {topTenants} Mietverhältnissen',
  lede: [
    '{count} von {memberCount} Abgeordneten melden in ihren veröffentlichungspflichtigen Angaben Einnahmen aus Vermietung. Die höchste Summe nennt {topName} ({topParty}): {topEuro} brutto im Jahr aus {topTenants} einzeln aufgeführten Mietverhältnissen.',
    'Daneben steht, was das Wahlprogramm seiner Partei zur Mietpolitik sagt. Beides ist öffentlich und wird hier ohne Wertung nebeneinandergestellt.',
  ],
  metaTitle: 'Mieteinnahmen im Bundestag: Wer sie meldet – Politblick',
  metaDescription:
    '{count} Abgeordnete melden Mieteinnahmen. {topName} ({topParty}) nennt {topEuro} brutto im Jahr aus {topTenants} Mietverhältnissen. Mit Orten, Einzelbeträgen und dem Wahlprogramm der Partei zur Mietpolitik.',
  sections: [
    {
      id: 'uebersicht',
      chart: 'landlords',
      heading: '{count} Abgeordnete melden Mieteinnahmen, {topName} meldet die höchste Summe',
      body: [
        '{topName} ({topParty}) meldet {topEuro} im Jahr, {secondName} ({secondParty}) {secondEuro}. Gezählt sind bezahlte Nebentätigkeiten, deren Titel „Vermietung“ enthält und die einen Betrag nennen. Monatliche Beträge sind auf zwölf Monate hochgerechnet.',
        'Alle Beträge sind brutto, also vor Kosten wie Krediten, Instandhaltung, Verwaltung und Steuern. Jede Zeile lässt sich aufklappen und zeigt die Orte.',
      ],
      shows: 'Welche Abgeordneten Mieteinnahmen als bezahlte Nebentätigkeit melden und in welcher Höhe, brutto.',
      notShows:
        'Den Gewinn: Kosten, Kredite und Steuern gehen noch ab. Vermietung ist legal und anzeigepflichtig, die Meldung ist Voraussetzung dieser Auswertung und kein Vorwurf. Wer Einnahmen unter einer anderen Bezeichnung meldet, taucht hier nicht auf.',
    },
    {
      id: 'orte',
      chart: 'places',
      heading: '{topName}: {topTenants} Mietverhältnisse an {topPlaceCount} Orten',
      body: [
        'Am meisten meldet {topName} aus {place1} ({place1Tenants} Mietverhältnisse, {place1Euro}), gefolgt von {place2} ({place2Euro}) und {place3} ({place3Euro}).',
        '{foreignPlace} liegt in {foreignNote}. Dort steht ein einziges Mietverhältnis mit {foreignEuro} im Jahr, rund {foreignMonth} im Monat.',
        'Der Balken oben zeigt, welcher Anteil der Summe aus welchem Ort kommt. Die Spalte „Durchschnitt“ zeigt, was ein Mietverhältnis dort im Schnitt einbringt. Ein Klick auf einen Ort zeigt alle Einzelbeträge.',
      ],
      shows: 'Wie sich die gemeldeten Mieteinnahmen auf Orte und einzelne Mietverhältnisse verteilen.',
      notShows:
        'Um welche Objekte es geht (Wohnung, Ferienobjekt, Gewerbe) und in welchem Bundesland die Orte liegen. Die Meldung nennt nur Ort und Betrag; Ortsnamen wie Rüdersdorf gibt es mehrfach.',
    },
    {
      id: 'programm',
      chart: 'programme',
      heading: 'Was das Wahlprogramm der {programmeParty} zur Mietpolitik sagt',
      body: [
        'Im {programmeName} steht auf {programmePage} der Satz, der hier im Wortlaut zitiert ist. Die Meldung des Abgeordneten {topName} steht daneben.',
        'Ein Programm ist eine Parteiposition, die Pflichtangaben sind eine Einzelmeldung. Ob und wie das eine mit dem anderen zusammenhängt, sagen die Daten nicht.',
      ],
      shows: 'Was das Programm der Partei zu Mietpreisbremse und Mietendeckel sagt, wörtlich und mit Seitenangabe, und was der Abgeordnete beim Bundestag meldet.',
      notShows:
        'Eine Aussage über die Haltung oder das Abstimmungsverhalten des Abgeordneten. Vermietung ist legal und anzeigepflichtig. Das Zitat ist Stand der Prüfung, nicht live.',
    },
  ] satisfies StorySection<'landlords' | 'places' | 'programme'>[],
  method: [
    'Grundlage sind die veröffentlichungspflichtigen Angaben der Abgeordneten zu Nebentätigkeiten, wie Politblick sie aus den Daten von abgeordnetenwatch übernimmt. Gezählt werden bezahlte Tätigkeiten, deren Titel „Vermietung“ enthält und die einen Betrag nennen; monatliche Beträge sind mit zwölf multipliziert. Orte stehen so da, wie sie gemeldet sind.',
    'Das Zitat stammt aus dem Bundestagswahlprogramm 2025 der Partei und ist mit Stand {programmeChecked} geprüft. Ältere Programmseiten mit demselben Satz sind nicht verlinkt.',
  ],
};

export { claims } from './claims';
