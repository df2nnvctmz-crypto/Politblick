/**
 * Datenstory "US-Lobby in Berlin", part 1: the money (treemap) and the revolving door.
 *
 * Every number is a `{slot}` filled by slots() from public/data/datenstories/us-lobby.json, so
 * text and chart can never disagree. Quotes, role labels and register wording are frozen findings
 * and keep their date.
 *
 * Research files: recherche/befunde-us-einfluss-2026-11.md, recherche/slides-us-lobby/quellen.md,
 * recherche/us-einfluss-lobbyregister.xlsx. Curated inputs: data/datenstories/us-lobby/.
 */
import { RES_PUBLICA, US_METHOD } from '../partners';
import type { DatenstoryListing, StorySection, UsLobbyData } from '../types';

export const RESEARCHED_ON = '2026-11-06';

export const listing: DatenstoryListing = {
  slug: 'us-lobby',
  kicker: 'US-Lobby in Berlin',
  title: 'Fast 50 Mio. € im Jahr, aber nur ein kleiner Teil ist als amerikanisch erkennbar',
  teaser:
    'US-Konzerne lobbyieren in Berlin vor allem über deutsche Tochterfirmen, oft mit früheren Abgeordneten und Regierungsleuten. Wir haben die Tochterfirmen den Mutterkonzernen zugeordnet.',
  topics: ["Lobbyregister","Drehtür"],
  keywords: ["USA","Tochterfirmen","Treemap","Gates Foundation","Microsoft","Google","Meta","Amazon","Mars","Wolfgang Büchner","Jens Teutrine","Seitenwechsel"],
  publishedOn: '2026-11-06',
  researchedOn: RESEARCHED_ON,
  partner: RES_PUBLICA,
  series: { name: 'US-Lobby in Berlin', part: 1, partLabel: 'Das Geld und die Drehtür' },
};

const FRACTIONS: [number, string][] = [
  [1 / 2, 'die Hälfte'],
  [1 / 3, 'ein Drittel'],
  [1 / 4, 'ein Viertel'],
  [1 / 5, 'ein Fünftel'],
  [1 / 6, 'ein Sechstel'],
  [1 / 7, 'ein Siebtel'],
  [1 / 8, 'ein Achtel'],
];

/** Nearest plain-language fraction ("ein Sechstel") for a share between 0 and 1. */
export function fractionWord(share: number): { word: string; value: number } {
  const [value, word] = FRACTIONS.reduce((best, f) => (Math.abs(f[0] - share) < Math.abs(best[0] - share) ? f : best));
  return { word, value };
}

const de1 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mio = (euro: number) => de1(euro / 1e6);
const pct = (share: number) => Math.round(share * 100).toLocaleString('de-DE');
const listDe = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} und ${items.at(-1)}`);
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
/** "2025-05" → "Mai 2025". */
export const monthYear = (ym: string | null) => (ym ? `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : '');

/** Every number the text uses, computed from the built data. The claim checks recompute them independently. */
export function slots(d: UsLobbyData) {
  const { seat, subsidiary } = d.treemap.zones;
  const visibleShare = seat.sumEuro / d.treemap.totalEuro;
  const rd = d.revolvingDoor;
  const buechner = rd.people.find((p) => p.name === 'Wolfgang Büchner');
  return {
    totalMio: mio(d.treemap.totalEuro),
    totalMioRounded: String(Math.round(d.treemap.totalEuro / 1e6)),
    entryCount: String(d.treemap.entryCount),
    seatCount: String(seat.count),
    seatMio: mio(seat.sumEuro),
    subCount: String(subsidiary.count),
    subMio: mio(subsidiary.sumEuro),
    visiblePct: pct(visibleShare),
    hiddenPct: pct(1 - visibleShare),
    visibleFraction: fractionWord(visibleShare).word,
    registerSharePct: de1((d.treemap.totalEuro / d.treemap.registerTotalEuro) * 100),
    topSubsidiaries: listDe(subsidiary.groups.slice(0, 3).map((g) => g.label)),
    topSeat: seat.groups[0]?.label ?? '',
    topSeatMio: mio(seat.groups[0]?.valueEuro ?? 0),
    excludedCount: String(d.treemap.excludedCount),
    doorPersons: String(rd.totals.persons),
    doorExMps: String(rd.totals.exMps),
    doorGov: String(rd.totals.government),
    doorStaff: String(rd.totals.staff),
    doorNamed: String(rd.people.length),
    buechnerEnd: monthYear(buechner?.endDate ?? null),
  };
}

export const story = {
  kicker: 'US-Lobby in Berlin',
  title: 'Fast {totalMioRounded} Mio. € im Jahr für US-Lobbyarbeit in Berlin',
  titleAccent: 'nur {visibleFraction} davon ist als USA erkennbar',
  lede: [
    'Im Lobbyregister des Bundestags stehen {seatCount} Einträge mit Sitz in den USA. Dazu kommen {subCount} deutsche Tochterfirmen von US-Konzernen, die dort als deutsche Gesellschaft geführt werden. Zusammen melden sie {totalMio} Mio. € Lobbyausgaben im Jahr, {registerSharePct} % aller Lobbyausgaben im Register.',
  ],
  metaTitle: 'US-Lobby in Berlin: nur {visibleFraction} ist als USA erkennbar – Politblick',
  metaDescription:
    '{entryCount} US-Akteure melden {totalMio} Mio. € Lobbyausgaben im Jahr, nur {seatMio} Mio. € davon unter einer US-Adresse. Dazu: {doorExMps} Ex-Abgeordnete und frühere Regierungsleute, die für US-Konzerne lobbyieren.',
  sections: [
    {
      id: 'sichtbarkeit',
      chart: 'treemap',
      heading: '{hiddenPct} % des Geldes laufen über deutsche Tochterfirmen',
      body: [
        'Wer im Register nach dem Sitz „USA“ filtert, findet {seatCount} Einträge mit {seatMio} Mio. €, allen voran {topSeat} mit {topSeatMio} Mio. €. Die übrigen {subMio} Mio. € melden deutsche Töchter, die größten gehören zu {topSubsidiaries}.',
        'Im Register steht bei diesen Töchtern eine deutsche Adresse. Zu welchem Konzern sie gehören, steht dort nicht.',
      ],
      shows: 'Wie viel US-Konzerne und -Organisationen laut eigener Angabe für Lobbyarbeit in Berlin ausgeben, und wie wenig davon man am Sitz im Register erkennt.',
      notShows:
        'Ob das Geld Entscheidungen beeinflusst hat. Die Beträge sind die Mitte der gemeldeten Spannen für das letzte Geschäftsjahr (meist 2025, Gates Foundation 2024), keine exakten Summen.',
    },
    {
      id: 'drehtuer',
      chart: 'revolvingDoor',
      heading: 'Gestern Vize-Regierungssprecher,',
      headingAccent: 'heute Lobbyarbeit u. a. für Mars',
      body: [
        'Wolfgang Büchner war bis {buechnerEnd} stellvertretender Regierungssprecher. Heute nennt ihn die Agentur MSLGROUP im Lobbyregister bei ihrem Auftrag für Mars. Thema laut Register: Zucker- und Fettreduktion in Lebensmitteln und mögliche Werbebeschränkungen.',
        'Das Register verlangt Angaben zu Funktionen in Regierung und Bundestag aus den letzten fünf Jahren, auch von Agenturen, die für Auftraggeber arbeiten. Für US-Akteure nennt es {doorPersons} solche Personen: {doorExMps} frühere Abgeordnete, {doorGov} frühere Beschäftigte von Ministerien und Bundesverwaltung und {doorStaff} frühere Mitarbeiter von Abgeordneten. Die Mitarbeiter sind Privatpersonen; wir zählen sie nur. In der Grafik lässt sich jede Zeile anklicken: frühere Funktion, Auftrag und Themen laut Register.',
      ],
      shows: 'Wer laut Register früher ein Amt oder Mandat hatte und heute für US-Konzerne oder -Organisationen lobbyiert, und seit wann.',
      notShows:
        'Fehlverhalten. Der Wechsel ist legal: Eine Karenzzeit gilt nur für Bundesminister und Parlamentarische Staatssekretäre. Die Angaben zu früheren Funktionen sind Selbstauskünfte im Register.',
    },
  ] satisfies StorySection<'treemap' | 'revolvingDoor'>[],
  method: [
    'Grundlage ist das Lobbyregister des Bundestags (alle aktiven Einträge). Beträge, Aufträge und frühere Funktionen aktualisieren sich mit jedem Datenabruf.',
    ...US_METHOD,
    'Nicht gezählt: {excludedCount} Grenzfälle, darunter Agenturen und Kanzleien (sie lobbyieren für Kunden), Minderheitsbeteiligungen von US-Investoren und Konzerne mit Sitz außerhalb der USA.',
  ],
};

export { claims } from './claims';
