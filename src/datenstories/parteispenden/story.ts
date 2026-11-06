/**
 * Datenstory "Geld und Einfluss", part 2: who finances the parties. How widely large donations are
 * spread across donors per party, and the donor that paid four parties on one day.
 *
 * Every number is a `{slot}` filled by slots() from public/data/datenstories/parteispenden.json.
 * Nothing in this story is a frozen finding. No partner: this story is Politblick's own.
 */
import type { DatenstoryListing, ParteispendenData, StorySection } from '../types';

/** Day of the first publication: the Reddit post came out five days before the Sachsen-Anhalt election on 6 September 2026. The numbers on the page are live. */
export const RESEARCHED_ON = '2026-09-01';

export const listing: DatenstoryListing = {
  slug: 'parteispenden',
  kicker: 'Geld und Einfluss',
  title: 'Wer finanziert die Parteien? Bei BSW und Linke hängt fast alles an wenigen Spendern',
  teaser: 'Großspenden pro Partei und wie breit sie sich verteilen, die größten Einzelspender, und ein Unternehmen, das am selben Tag vier Parteien bedachte.',
  topics: ["Parteispenden"],
  keywords: ["Großspenden","Spender","BSW","Linke","CDU","CSU","FDP","AfD","SPD","Grüne","Bitpanda","Kryptobörse"],
  publishedOn: '2026-09-01',
  researchedOn: RESEARCHED_ON,
  series: { name: 'Geld und Einfluss', part: 2, partLabel: 'Wer finanziert die Parteien?' },
  discussion: { name: 'r/mediasres', url: 'https://www.reddit.com/r/mediasres/comments/1w4i32u/5_tage_vor_der_wahl_in_sachsenanhalt_ein_mann/' },
};

const de1 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mio = (euro: number) => de1(euro / 1e6);
/** Two decimals, trailing zero dropped: 1,75 / 1,8 / 9,56. */
const mio2 = (euro: number) => (euro / 1e6).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const int = (n: number) => n.toLocaleString('de-DE');
const pct = (share: number) => Math.floor(share * 100 + 1e-9).toLocaleString('de-DE');
const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;
const listDe = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} und ${items.at(-1)}`);
const dateDe = (iso: string | undefined) => (iso ? `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.${iso.slice(0, 4)}` : '');

/** Every number the text uses, computed from the built data. The claim checks recompute them independently. */
export function slots(d: ParteispendenData) {
  const p = (name: string) => d.parties.find((x) => x.party === name);
  const bsw = p('BSW');
  const linke = p('Linke');
  const cdu = p('CDU/CSU');
  const bp = d.bitpanda;
  const budgetMid = bp?.budget ? (bp.budget.from + bp.budget.to) / 2 : 0;
  return {
    totalMio: mio(d.totalEuro),
    count: int(d.count),
    firstYear: String(d.firstYear ?? ''),
    bswDonors: String(bsw?.donorCount ?? 0),
    bswMio: mio(bsw?.sumEuro ?? 0),
    bswTop3: pct(bsw?.top3Share ?? 0),
    bswTopName: bsw?.topDonors[0]?.name ?? '',
    bswTopMio: mio(bsw?.topDonors[0]?.euro ?? 0),
    linkeDonors: String(linke?.donorCount ?? 0),
    linkeSum: euro(linke?.sumEuro ?? 0),
    cduDonors: String(cdu?.donorCount ?? 0),
    cduMio: mio(cdu?.sumEuro ?? 0),
    cduTop3: pct(cdu?.top3Share ?? 0),
    bpMio: mio2(bp?.totalEuro ?? 0),
    bpDate: dateDe(bp?.dates[0]),
    bpPartyCount: String(bp?.partyNames.length ?? 0),
    bpPartyList: listDe(bp?.partyNames ?? []),
    bpBudget: bp?.budget ? `${euro(bp.budget.from - 1)} bis ${euro(bp.budget.to)}` : '',
    bpRatio: String(budgetMid ? Math.floor((bp?.totalEuro ?? 0) / budgetMid) : 0),
  };
}

export const story = {
  kicker: 'Geld und Einfluss',
  title: '{cduDonors} Großspender bei der CDU/CSU',
  titleAccent: '{bswDonors} beim BSW, {linkeDonors} bei der Linken',
  lede: [
    'Seit {firstYear} hat der Bundestag {count} Großspenden an Parteien veröffentlicht, zusammen {totalMio} Mio. €. Wie breit sie sich auf Spender verteilen, unterscheidet sich stark: Beim BSW kommen {bswTop3} % von drei Spendern, bei der CDU/CSU {cduTop3} %.',
  ],
  metaTitle: 'Wer finanziert die Parteien? Großspenden pro Partei – Politblick',
  metaDescription:
    '{count} Großspenden seit {firstYear}, zusammen {totalMio} Mio. €: {cduDonors} Spender bei der CDU/CSU, {bswDonors} beim BSW, {linkeDonors} bei der Linken. Dazu: Bitpanda spendete {bpMio} Mio. € an einem Tag.',
  sections: [
    {
      id: 'verteilung',
      chart: 'partyBars',
      heading: 'Beim BSW hängt die Summe an {bswDonors} Spendern, bei der CDU/CSU verteilt sie sich auf {cduDonors}',
      body: [
        'Das BSW erhielt {bswMio} Mio. €, davon {bswTop3} % von den drei größten Spendern. Allein {bswTopName} gab {bswTopMio} Mio. €. Die Linke meldet {linkeDonors} Großspender mit zusammen {linkeSum}. Die CDU/CSU erhielt {cduMio} Mio. €, die drei größten Spender stehen für {cduTop3} %.',
        'In der Grafik lässt sich jede Partei aufklappen: die drei größten Einzelspender mit Betrag.',
      ],
      shows: 'Wie viel Geld jede Partei an veröffentlichungspflichtigen Großspenden erhalten hat und wie viele Spender dahinterstehen.',
      notShows:
        'Das ganze Parteibudget. Mitgliedsbeiträge, Kleinspenden und staatliche Mittel stehen nicht in dieser Liste. Eine hohe Konzentration sagt nichts über Einfluss, nur über die Abhängigkeit von wenigen Quellen.',
    },
    {
      id: 'bitpanda',
      chart: 'bitpanda',
      heading: 'Bitpanda zahlte am {bpDate} {bpMio} Mio. € an {bpPartyCount} Parteien,',
      headingAccent: 'mehr als das {bpRatio}-Fache des eigenen Lobbybudgets',
      body: [
        'Am {bpDate} gingen Großspenden von Bitpanda an {bpPartyList}, zusammen {bpMio} Mio. €. Im Lobbyregister meldet das Unternehmen Ausgaben von {bpBudget} im Jahr.',
        'Das Register verknüpft keine Spende mit einem Anliegen oder Gesetz. Die Zahlen stehen nebeneinander, mehr nicht.',
      ],
      shows: 'Wie hoch die Spenden eines einzelnen Spenders an mehrere Parteien waren und wie sie zum gemeldeten Lobbybudget stehen.',
      notShows:
        'Einen Zusammenhang zwischen Spende und Lobbyarbeit. Das Lobbybudget ist eine Spanne für das letzte Geschäftsjahr, gezeigt ist die Mitte. Spenden an Parteien sind legal und veröffentlichungspflichtig.',
    },
  ] satisfies StorySection<'partyBars' | 'bitpanda'>[],
  method: [
    'Grundlage sind die vom Bundestag veröffentlichten Parteispenden über 35.000 € (vor dem 5. März 2024 über 50.000 €), seit {firstYear}. Spenden an CDU und CSU sind zur Fraktion CDU/CSU zusammengefasst.',
    'Dargestellt sind sieben Parteien, die kleineren Parteien sind nicht einzeln aufgeführt. Lobbybudgets stammen aus dem Lobbyregister, Spender werden über den Namen mit Registereinträgen verknüpft.',
  ],
};

export { claims } from './claims';
