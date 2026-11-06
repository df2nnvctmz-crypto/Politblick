/**
 * Datenstory "Geld und Einfluss", part 1: what lobbying costs compared with what parties get in
 * large donations, and where the two overlap (politicians with a function at registered
 * organisations, donors that are registered lobbyists).
 *
 * Every number is a `{slot}` filled by slots() from public/data/datenstories/lobby-geld.json, so
 * text and chart can never disagree. Nothing in this story is a frozen finding.
 *
 * Research behind it: marketing slides "Lobbyausgaben sind ein Vielfaches der Großspenden" and
 * "Wo sich beides berührt". No partner: this story is Politblick's own.
 */
import type { DatenstoryListing, LobbyGeldData, StorySection } from '../types';

/** Day of the first publication (Reddit post, slide "Stand 05.09.2026"). The numbers on the page are live. */
export const RESEARCHED_ON = '2026-09-05';

export const listing: DatenstoryListing = {
  slug: 'lobby-geld',
  kicker: 'Geld und Einfluss',
  title: 'Lobbyausgaben sind ein Vielfaches der Großspenden',
  teaser: 'Was Interessenvertretung im Jahr kostet, was Parteien an Großspenden erhalten, und wo sich beides berührt: Funktionen von Abgeordneten und Spender, die selbst im Lobbyregister stehen.',
  topics: ["Lobbyregister","Parteispenden"],
  keywords: ["Lobbyausgaben","Großspenden","Spender","Wirtschaftsforum der SPD","Beirat","Nebentätigkeiten","Verflechtung","DVAG","Campact"],
  publishedOn: '2026-09-05',
  researchedOn: RESEARCHED_ON,
  series: { name: 'Geld und Einfluss', part: 1, partLabel: 'Lobby und Spenden' },
  discussion: { name: 'r/mediasres', url: 'https://www.reddit.com/r/mediasres/comments/1w8bam3/lobbyausgaben_sind_ein_ein_vielfaches_der/' },
};

const de1 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mio = (euro: number) => de1(euro / 1e6);
const int = (n: number) => n.toLocaleString('de-DE');
const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;
const listDe = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} und ${items.at(-1)}`);

/** Every number the text uses, computed from the built data. The claim checks recompute them independently. */
export function slots(d: LobbyGeldData) {
  const ratio = d.spend.totalEuro / d.donations.totalEuro;
  const [top, second] = d.spend.byType;
  const topOrg = d.overlap.topOrgs[0];
  const topDonor = d.overlap.donors[0];
  return {
    spendMio: mio(d.spend.totalEuro),
    declaringCount: int(d.spend.declaringCount),
    donMio: mio(d.donations.totalEuro),
    donCount: int(d.donations.count),
    donSince: String(d.donations.firstYear ?? ''),
    ratio: String(Math.round(ratio)),
    donOfSpendPct: String(Math.round((d.donations.totalEuro / d.spend.totalEuro) * 100)),
    topType: top?.label ?? '',
    topTypeMio: mio(top?.midEuro ?? 0),
    secondType: second?.label ?? '',
    secondTypeMio: mio(second?.midEuro ?? 0),
    withFunction: int(d.overlap.withFunction),
    memberCount: int(d.overlap.memberCount),
    topOrg: topOrg?.name ?? '',
    topOrgMdb: String(topOrg?.mdbCount ?? 0),
    donorCount: String(d.overlap.donors.length),
    topDonor: topDonor?.name ?? '',
    topDonorMio: mio(topDonor?.donatedEuro ?? 0),
    topDonorParties: listDe(topDonor?.parties.map((p) => p.party) ?? []),
    topDonorBudget: topDonor?.budget ? `${euro(topDonor.budget.from - 1)} bis ${euro(topDonor.budget.to)}` : '',
  };
}

export const story = {
  kicker: 'Geld und Einfluss',
  title: '{spendMio} Mio. € Lobbyausgaben in einem Jahr',
  titleAccent: 'Großspenden an Parteien seit {donSince}: {donMio} Mio. €',
  lede: [
    'Im Lobbyregister des Bundestags melden {declaringCount} Organisationen Ausgaben für Interessenvertretung, zusammen {spendMio} Mio. € für ihr letztes Geschäftsjahr. Die Parteien haben seit {donSince} Großspenden von zusammen {donMio} Mio. € veröffentlicht. Das sind etwa {donOfSpendPct} % dessen, was in einem einzigen Jahr für Lobbyarbeit gemeldet wird.',
  ],
  metaTitle: 'Lobbyausgaben sind ein Vielfaches der Großspenden – Politblick',
  metaDescription:
    '{spendMio} Mio. € Lobbyausgaben im Jahr gegenüber {donMio} Mio. € Großspenden an Parteien seit {donSince}. Dazu: {withFunction} von {memberCount} Abgeordneten haben eine Funktion bei einer eingetragenen Interessenvertretung.',
  sections: [
    {
      id: 'ausgaben',
      chart: 'spendDonations',
      heading: 'Lobbyausgaben: {spendMio} Mio. € in einem Jahr,',
      headingAccent: 'Großspenden: {donMio} Mio. € in mehreren Jahren',
      body: [
        '{topType} melden mit {topTypeMio} Mio. € den größten Anteil, danach folgen {secondType} mit {secondTypeMio} Mio. €. Die Großspenden an Parteien (Einzelspenden über 35.000 €) summieren sich seit {donSince} auf {donMio} Mio. € aus {donCount} Spenden.',
        'Beide Summen messen Verschiedenes: Das Register meldet Ausgaben für Interessenvertretung insgesamt, nicht einzelne Zahlungen an Parteien oder Politiker.',
      ],
      shows: 'Wie viel Organisationen laut eigener Angabe für Interessenvertretung ausgeben, und wie viel Parteien an veröffentlichungspflichtigen Großspenden erhalten haben.',
      notShows:
        'Ob Lobbyarbeit Entscheidungen beeinflusst. Das Register meldet Ausgabenspannen für das jeweils letzte Geschäftsjahr, gezeigt ist die Mitte. Kleinspenden sind nicht öffentlich, vor dem 5. März 2024 galt zudem die Schwelle 50.000 €.',
    },
    {
      id: 'verflechtung',
      chart: 'overlap',
      heading: '{withFunction} von {memberCount} Abgeordneten',
      headingAccent: 'haben eine Funktion bei einer eingetragenen Interessenvertretung',
      body: [
        'Gemeint sind Angaben der Abgeordneten zu Beirat, Kuratorium, Vorstand und ähnlichen Funktionen, verknüpft mit dem Lobbyregister. Am häufigsten ist {topOrg} mit {topOrgMdb} Abgeordneten.',
        '{donorCount} Spender stehen zugleich selbst im Lobbyregister. Den größten Betrag gab {topDonor} mit {topDonorMio} Mio. € an {topDonorParties}; als Lobbybudget meldet das Unternehmen {topDonorBudget} im Jahr.',
      ],
      shows: 'Wo sich Funktionen von Abgeordneten, Spenden und eingetragene Interessenvertretung berühren.',
      notShows:
        'Ein Treffen oder eine Zahlung: Eine Funktion ist eine Angabe der Abgeordneten, keine Gegenleistung. Ob Spende und Lobbyarbeit zusammenhängen, zeigen die Daten nicht. Spender werden über den Namen mit Registereinträgen verknüpft, nicht jeder Name wird erkannt.',
    },
  ] satisfies StorySection<'spendDonations' | 'overlap'>[],
  method: [
    'Lobbyausgaben: alle aktiven Einträge im Lobbyregister des Bundestags mit Angabe zu den Ausgaben. Gezeigt ist die Mitte der gemeldeten Spanne je Organisation; jede Organisation meldet für ihr eigenes letztes Geschäftsjahr, die Summe ist daher kein Kalenderjahr.',
    'Großspenden: die vom Bundestag veröffentlichten Parteispenden über 35.000 € (davor über 50.000 €), nach Veröffentlichungsdatum, seit {donSince}.',
    'Funktionen von Abgeordneten: Nebentätigkeitsangaben beim Bundestag, verknüpft mit Registereinträgen. Spender im Register: Zuordnung der Spendernamen zu Registereinträgen nach dem Namen.',
  ],
};

export { claims } from './claims';
