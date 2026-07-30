export type Lang = 'de' | 'en';

export type PartyName = 'SPD' | 'CDU/CSU' | 'Grüne' | 'FDP' | 'AfD' | 'Linke' | 'BSW';

/** Colors for the 8 illustrative demo profiles used by the sample bills/votes/lobby content below. */
export const DEMO_PARTY_META: Record<PartyName, { color: string }> = {
  SPD: { color: 'oklch(52% 0.16 25)' },
  'CDU/CSU': { color: 'oklch(25% 0.01 90)' },
  Grüne: { color: 'oklch(52% 0.1 150)' },
  FDP: { color: 'oklch(75% 0.15 100)' },
  AfD: { color: 'oklch(55% 0.11 240)' },
  Linke: { color: 'oklch(45% 0.15 340)' },
  BSW: { color: 'oklch(45% 0.08 290)' },
};

export const TOPICS_DE = ['Alle Themen', 'Klima', 'Wirtschaft', 'Gesundheit', 'Sicherheit', 'Digitales'];
export const TOPICS_EN = ['All topics', 'Climate', 'Economy', 'Health', 'Security', 'Digital'];

export type VoteChoice = 'yes' | 'no' | 'abstain';

export interface VoteRecord {
  billId: string;
  vote: VoteChoice;
}

export interface LobbyContact {
  org: string;
  topic: string;
  date: string;
}

export interface Donation {
  donor: string;
  industry: string;
  amount: string;
  date: string;
}

export interface ExpectationNote {
  billId: string;
  de: string;
  en: string;
}

export interface Mp {
  id: string;
  name: string;
  party: PartyName;
  constituency: string;
  flags: string[];
  expectationNote?: ExpectationNote;
  /** [billsVoted, attendance%, partyAlignment%, flagCount] */
  statValues: [number, string, string, number];
  voteHistory: VoteRecord[];
  lobbyContacts: LobbyContact[];
  donations: Donation[];
}

/** Illustrative sample profiles (not real people) used to demo the votes/lobby/finance analysis views. */
export const DEMO_MPS: Mp[] = [
  {
    id: 'm1', name: 'Anna Becker', party: 'SPD', constituency: 'Berlin-Mitte',
    flags: ['Stimmte für Subventionsgesetz nach Spende aus der Branche'],
    expectationNote: { billId: 'b4', de: 'Enthielt sich bei der Digitalsteuer nach Kontakt mit dem Handelsverband Deutschland', en: 'Abstained on the digital tax after contact with the German Retail Association' },
    statValues: [142, '96%', '91%', 1],
    voteHistory: [
      { billId: 'b1', vote: 'yes' }, { billId: 'b2', vote: 'yes' }, { billId: 'b3', vote: 'no' }, { billId: 'b4', vote: 'abstain' }, { billId: 'b5', vote: 'yes' },
    ],
    lobbyContacts: [
      { org: 'Bundesverband der Energiewirtschaft', topic: 'Klimaschutzgesetz-Novelle', date: '12.03.2026' },
      { org: 'Handelsverband Deutschland', topic: 'Digitalsteuer für Plattformen', date: '02.02.2026' },
    ],
    donations: [{ donor: 'Energie Nord AG', industry: 'Energie', amount: '18.000€', date: 'Nov 2025' }],
  },
  {
    id: 'm2', name: 'Markus Voss', party: 'CDU/CSU', constituency: 'München-Ost',
    flags: [], statValues: [138, '93%', '97%', 0],
    voteHistory: [
      { billId: 'b1', vote: 'no' }, { billId: 'b2', vote: 'yes' }, { billId: 'b3', vote: 'yes' }, { billId: 'b4', vote: 'no' }, { billId: 'b5', vote: 'yes' },
    ],
    lobbyContacts: [{ org: 'Bundesverband der Deutschen Industrie', topic: 'Rüstungsexportkontrolle', date: '20.01.2026' }],
    donations: [],
  },
  {
    id: 'm3', name: 'Fatima Celik', party: 'Grüne', constituency: 'Köln',
    flags: [], statValues: [150, '99%', '94%', 0],
    voteHistory: [
      { billId: 'b1', vote: 'yes' }, { billId: 'b2', vote: 'yes' }, { billId: 'b3', vote: 'no' }, { billId: 'b4', vote: 'yes' }, { billId: 'b5', vote: 'abstain' },
    ],
    lobbyContacts: [{ org: 'Deutsche Umwelthilfe', topic: 'Klimaschutzgesetz-Novelle', date: '05.03.2026' }],
    donations: [],
  },
  {
    id: 'm4', name: 'Jens Reuter', party: 'FDP', constituency: 'Stuttgart',
    flags: ['Stimmte gegen Digitalsteuer nach Lobbykontakt der Plattformbranche'],
    expectationNote: { billId: 'b3', de: 'Stimmte für schärfere Rüstungsexportkontrolle entgegen der FDP-Mehrheit', en: 'Voted for stricter arms-export controls against the FDP majority' },
    statValues: [130, '88%', '89%', 1],
    voteHistory: [
      { billId: 'b1', vote: 'no' }, { billId: 'b2', vote: 'no' }, { billId: 'b3', vote: 'yes' }, { billId: 'b4', vote: 'no' }, { billId: 'b5', vote: 'abstain' },
    ],
    lobbyContacts: [{ org: 'Bitkom e.V.', topic: 'Digitalsteuer für Plattformen', date: '18.02.2026' }],
    donations: [{ donor: 'TechConnect Media GmbH', industry: 'Plattformwirtschaft', amount: '25.000€', date: 'Jan 2026' }],
  },
  {
    id: 'm5', name: 'Peter Lang', party: 'AfD', constituency: 'Dresden',
    flags: [], statValues: [120, '82%', '95%', 0],
    voteHistory: [
      { billId: 'b1', vote: 'no' }, { billId: 'b2', vote: 'no' }, { billId: 'b3', vote: 'no' }, { billId: 'b4', vote: 'no' }, { billId: 'b5', vote: 'no' },
    ],
    lobbyContacts: [], donations: [],
  },
  {
    id: 'm6', name: 'Sabine Krüger', party: 'Linke', constituency: 'Leipzig',
    flags: [], statValues: [145, '97%', '92%', 0],
    voteHistory: [
      { billId: 'b1', vote: 'yes' }, { billId: 'b2', vote: 'yes' }, { billId: 'b3', vote: 'no' }, { billId: 'b4', vote: 'yes' }, { billId: 'b5', vote: 'yes' },
    ],
    lobbyContacts: [{ org: 'Deutscher Gewerkschaftsbund', topic: 'Mindestlohnerhöhung', date: '11.01.2026' }],
    donations: [],
  },
  {
    id: 'm7', name: 'Thomas Wagner', party: 'BSW', constituency: 'Chemnitz',
    flags: ['Erhielt Spende der Pharmabranche vor Gesundheitsreform-Abstimmung'],
    statValues: [110, '85%', '88%', 1],
    voteHistory: [
      { billId: 'b1', vote: 'abstain' }, { billId: 'b2', vote: 'yes' }, { billId: 'b3', vote: 'no' }, { billId: 'b4', vote: 'abstain' }, { billId: 'b5', vote: 'yes' },
    ],
    lobbyContacts: [{ org: 'Verband der forschenden Pharmaunternehmen', topic: 'Gesundheitsreform 2026', date: '25.02.2026' }],
    donations: [{ donor: 'MediPharm Holding', industry: 'Pharma', amount: '30.000€', date: 'Dez 2025' }],
  },
  {
    id: 'm8', name: 'Lena Hoffmann', party: 'CDU/CSU', constituency: 'Hamburg-Nord',
    flags: [], statValues: [141, '95%', '96%', 0],
    voteHistory: [
      { billId: 'b1', vote: 'no' }, { billId: 'b2', vote: 'yes' }, { billId: 'b3', vote: 'yes' }, { billId: 'b4', vote: 'no' }, { billId: 'b5', vote: 'yes' },
    ],
    lobbyContacts: [], donations: [],
  },
];

export interface Bill {
  id: string;
  title: string;
  category: string;
  date: string;
  summaryDe: string;
  summaryEn: string;
  breakdown: Partial<Record<PartyName, [number, number, number]>>;
}

export const BILLS: Bill[] = [
  {
    id: 'b1', title: 'Klimaschutzgesetz-Novelle', category: 'Klima', date: '14.03.2026',
    summaryDe: 'Verschärfung der CO₂-Reduktionsziele für die Industrie bis 2032.',
    summaryEn: 'Tightens industrial CO₂ reduction targets through 2032.',
    breakdown: { SPD: [80, 10, 10], 'CDU/CSU': [40, 50, 10], Grüne: [98, 1, 1], FDP: [30, 60, 10], AfD: [2, 95, 3], Linke: [90, 5, 5], BSW: [45, 35, 20] },
  },
  {
    id: 'b2', title: 'Mindestlohnerhöhung', category: 'Wirtschaft', date: '22.02.2026',
    summaryDe: 'Anhebung des gesetzlichen Mindestlohns auf 14,50€ ab 2027.',
    summaryEn: 'Raises the statutory minimum wage to €14.50 starting 2027.',
    breakdown: { SPD: [95, 3, 2], 'CDU/CSU': [55, 40, 5], Grüne: [92, 3, 5], FDP: [15, 80, 5], AfD: [20, 70, 10], Linke: [99, 0, 1], BSW: [70, 20, 10] },
  },
  {
    id: 'b3', title: 'Rüstungsexportkontrolle', category: 'Sicherheit', date: '08.02.2026',
    summaryDe: 'Strengere Genehmigungspflichten für Rüstungsexporte in Krisenregionen.',
    summaryEn: 'Stricter approval requirements for arms exports to crisis regions.',
    breakdown: { SPD: [60, 30, 10], 'CDU/CSU': [35, 55, 10], Grüne: [85, 10, 5], FDP: [40, 50, 10], AfD: [10, 85, 5], Linke: [88, 7, 5], BSW: [50, 40, 10] },
  },
  {
    id: 'b4', title: 'Digitalsteuer für Plattformen', category: 'Digitales', date: '19.02.2026',
    summaryDe: 'Einführung einer Umsatzsteuer für große Digitalplattformen ab 500 Mio.€ Jahresumsatz.',
    summaryEn: 'Introduces a turnover tax on large digital platforms above €500M annual revenue.',
    breakdown: { SPD: [75, 15, 10], 'CDU/CSU': [45, 45, 10], Grüne: [80, 10, 10], FDP: [10, 85, 5], AfD: [30, 60, 10], Linke: [85, 10, 5], BSW: [55, 30, 15] },
  },
  {
    id: 'b5', title: 'Gesundheitsreform 2026', category: 'Gesundheit', date: '02.03.2026',
    summaryDe: 'Neuordnung der Krankenhausfinanzierung und Arzneimittelpreise.',
    summaryEn: 'Restructures hospital financing and pharmaceutical pricing.',
    breakdown: { SPD: [85, 10, 5], 'CDU/CSU': [60, 30, 10], Grüne: [75, 15, 10], FDP: [35, 55, 10], AfD: [15, 80, 5], Linke: [70, 20, 10], BSW: [65, 15, 20] },
  },
];

export interface Translation {
  navHome: string; navMps: string; navLobbyFinance: string;
  searchPlaceholder: string;
  heroKicker: string; heroTitle: string; heroSub: string;
  heroCta: string; heroCta2: string;
  statMpsLabel: string; statFlagsLabel: string;
  expectationTitle: string; expectationSub: string;
  featuredKicker: string; readMore: string;
  feedTitle: string; feedSub: string;
  filterParty: string; filterTopic: string; results: string;
  flagsLabel: string; backToSearch: string; backToHome: string;
  alignmentTrend: string; partyAverage: string;
  flagsHeading: string; sourceNote: string;
  rechenschaftsNote: string;
  voteBreakdown: string; voteYes: string; voteNo: string; voteAbstain: string;
  flaggedVotes: string; crossrefSub: string;
  colMp: string; colDonor: string; colIndustry: string; colAmount: string; colVote: string; colFlag: string;
  flagged: string; footerNote: string; footerSources: string;
  tabOverview: string; tabVotes: string; tabLobby: string; tabFinance: string;
  follow: string; following: string;
  statBillsVoted: string; statAttendance: string; statPartyAlignment: string; statFlags: string;
  reasonPartyLine: string;
  impressumTitle: string; impressumBody: string;
  disclaimerTitle: string; disclaimerBody: string;
  rosterLoading: string; rosterUpdated: string; rosterError: string; rosterRetry: string;
  viewOnAbgeordnetenwatch: string; loadingProfile: string; profileNotFound: string;
  noLobbyData: string; noFinanceData: string;
  weekOf: string; noPollsThisWeek: string; pollsLoading: string; pollsError: string; sidejobsError: string;
  pollAccepted: string; pollRejected: string; voteNoShow: string;
  realAgainstPartyTemplate: string; loadingPoll: string; pollDetailMissing: string; viewSource: string;
  noMandateVotesYet: string;
  tabSidejobs: string; sidejobOnce: string; sidejobMonthly: string; sidejobAnnual: string; sidejobsSourceNote: string;
  sidejobIncomeLevelPrefix: string;
  alignmentTrendRealTemplate: string; photoCredit: string;
  dataAsOfTemplate: string; sidejobsAsOfTemplate: string;
  lobbyAffiliationsTitle: string; lobbyAffiliationsSub: string; lobbyNoAffiliations: string;
  lobbyVotesTitle: string; lobbyDemandLabel: string; lobbyNoVotes: string;
  lobbyAgainstPosition: string; lobbyAgainstFraction: string; lobbyPositionSource: string;
  lobbyNoPositionNote: string; lobbyOrgSpend: string; lobbyOrgStaff: string;
  lobbyRegisterSource: string; lobbyNoContactsNote: string;
  pollLobbyingTitle: string; pollLobbyingCountTemplate: string; pollLobbyingNone: string;
  donationsTitle: string; donationsSub: string; donationsColParty: string;
  donationsColDonor: string; donationsColAmount: string; donationsColDate: string;
  donationsAlsoLobbyist: string; donationsSource: string;
  lobbyAsOfTemplate: string; donationsAsOfTemplate: string;
  crossrefTitle: string; crossrefEmpty: string; colOrg: string; colBill: string;
  topicalTiesTitle: string; topicalTiesSub: string; topicalTiesEmpty: string;
  topicalTieMatchedFieldTemplate: string; topicalTieNote: string; colMatchedField: string;
  lobbyTopicalTitle: string; lobbyTopicalNote: string;
  lobbyIndicatorConflict: string; lobbyIndicatorTopical: string;
  overviewLobbyPreviewTitle: string; overviewLobbyPreviewCountTemplate: string; overviewLobbyPreviewEmpty: string;
  overviewSidejobsPreviewTitle: string; overviewSidejobsPreviewCountTemplate: string; overviewSidejobsPreviewEmpty: string;
  seeAll: string;
  orgsSectionTitle: string; orgsSectionSub: string; orgSearchPlaceholder: string; orgsNoResults: string;
  colOrgMembers: string; colOrgVotes: string; backToLobbyFinance: string;
  orgSpendLabel: string; orgStaffLabel: string; orgFieldsLabel: string;
  orgLobbiedBillsTitle: string; orgNoLobbiedBills: string;
  orgAffiliatedMembersTitle: string; orgNoAffiliatedMembers: string;
  orgConflictsTitle: string; orgTopicalTitle: string;
  orgDonorTitle: string; orgDonorNote: string;
  orgNotFound: string;
  partyLobbyTitle: string; partyLobbySub: string;
  partyLobbyOrgCountTemplate: string; partyLobbyMemberCountTemplate: string;
  partyLobbyTopFieldsLabel: string; partyLobbySpendLabel: string;
  lobbyOnCommitteeTemplate: string;
  lobbyTabOverview: string; lobbyTabParties: string; lobbyTabOrgs: string;
  lobbyTabConflicts: string; lobbyTabTopical: string; lobbyTabDonations: string;
  lobbySectionLabel: string;
  statOrgsReferencedLabel: string; statConflictsLabel: string;
  statTopicalTiesLabel: string; statDonationsSumLabel: string;
  partyDetailFieldsTitle: string; partyDetailOrgsTitle: string;
  partyNotFound: string;
  scrollHintText: string;
  tieMatrixSub: string; matrixFilteredTemplate: string; matrixClearFilter: string;
  seatsLabel: string;
  networkSub: string; networkToggleCrossParty: string; networkToggleAll: string;
  networkOrgCountTemplate: string; networkViewOrg: string; networkEmpty: string;
}

export const TRANSLATIONS: Record<Lang, Translation> = {
  de: {
    navHome: 'Start', navMps: 'Abgeordnete', navLobbyFinance: 'Lobby & Finanzen',
    searchPlaceholder: 'Abgeordnete, Themen, Gesetze suchen…',
    heroKicker: 'Öffentliche Daten, an einem Ort',
    heroTitle: 'Jede Abstimmung. Jede Verbindung.',
    heroSub: 'Politblick bringt Abstimmungen, Lobbyregister-Einträge und Parteispenden aus öffentlichen Quellen in eine durchsuchbare Ansicht — ohne Login, ohne Tracking.',
    heroCta: 'Abgeordnete durchsuchen', heroCta2: 'Lobby & Finanzen ansehen',
    statMpsLabel: 'Abgeordnete erfasst', statFlagsLabel: 'Auffälligkeiten',
    expectationTitle: 'Gegen die Erwartung gestimmt',
    expectationSub: 'Abgeordnete, die von der Mehrheitslinie ihrer eigenen Fraktion abgewichen sind — mit Kontext zu Lobbyverflechtungen und Spenden.',
    featuredKicker: 'Im Fokus', readMore: 'Vollständige Analyse lesen',
    feedTitle: 'Aktuelle Abstimmungen', feedSub: 'Kürzlich abgeschlossene Abstimmungen im Bundestag',
    filterParty: 'Partei', filterTopic: 'Thema', results: 'Ergebnisse',
    flagsLabel: 'Hinweise', backToSearch: 'Zurück zur Suche', backToHome: 'Zurück zur Startseite',
    alignmentTrend: 'Übereinstimmung mit Parteilinie über Zeit', partyAverage: 'Partei-Durchschnitt',
    flagsHeading: 'Auffälligkeiten', sourceNote: 'Quelle: Lobbyregister des Deutschen Bundestages.',
    rechenschaftsNote: 'Quelle: Rechenschaftsberichte der Parteien.',
    voteBreakdown: 'Abstimmungsergebnis nach Partei', voteYes: 'Ja', voteNo: 'Nein', voteAbstain: 'Enthaltung',
    flaggedVotes: 'Auffällige Stimmen', crossrefSub: 'Abgeordnete, die über eine Funktion, Beteiligung oder Zuwendung mit einer Organisation verbunden sind, die zu genau dieser Abstimmung Interessenvertretung angemeldet hat — sowie die veröffentlichten Großspenden an die Parteien.',
    colMp: 'Abgeordnete/r', colDonor: 'Spender', colIndustry: 'Branche', colAmount: 'Betrag', colVote: 'Stimme', colFlag: 'Hinweis',
    flagged: 'Auffällig', footerNote: 'Nur öffentliche Daten. Kein Login, kein Tracking.', footerSources: 'Quellen: Abgeordnetenwatch, Bundestag, Lobbyregister',
    tabOverview: 'Übersicht', tabVotes: 'Abstimmungen', tabLobby: 'Lobbyverflechtungen', tabFinance: 'Parteifinanzen',
    follow: 'Folgen', following: 'Gefolgt',
    statBillsVoted: 'Abstimmungen', statAttendance: 'Anwesenheit', statPartyAlignment: 'Parteitreue', statFlags: 'Hinweise',
    reasonPartyLine: 'Stimmte gegen die Mehrheit der eigenen Fraktion',
    impressumTitle: 'Impressum',
    impressumBody: 'Angaben gemäß § 5 TMG\n\n[Name / Organisation]\n[Straße, Hausnummer]\n[PLZ, Ort]\n\nKontakt:\nE-Mail: [kontakt@politblick.de]\n\nVerantwortlich für den Inhalt nach § 55 Abs. 2 RStV:\n[Name, Anschrift]\n\nPolitblick ist ein privates, nicht-kommerzielles Projekt zur Aggregation öffentlich zugänglicher Daten. Es besteht keine Verbindung zu Parteien, Fraktionen oder staatlichen Stellen.',
    disclaimerTitle: 'Hinweis zu den Daten',
    disclaimerBody: 'Alle auf Politblick dargestellten Informationen stammen aus öffentlich zugänglichen Quellen (Abgeordnetenwatch, Bundestag-Open-Data, Lobbyregister des Deutschen Bundestages, Veröffentlichungen der Bundestagspräsidentin zu Großspenden) und werden automatisiert zusammengeführt.\n\nWichtig zum Thema Lobbyismus: In Deutschland gibt es kein öffentliches Verzeichnis von Treffen zwischen Interessenvertretern und Abgeordneten. Politblick kann und will daher nicht zeigen, wer sich mit wem getroffen hat. Dargestellt werden ausschließlich Eigenerklärungen — einerseits von Organisationen, die im Lobbyregister angeben, zu welcher Drucksache sie Interessenvertretung betreiben, andererseits von Abgeordneten, die ihre Funktionen, Beteiligungen und Zuwendungen anzeigen müssen. Wo beides dieselbe Abstimmung betrifft, wird das als Überschneidung ausgewiesen.\n\nDas Lobbyregister verzeichnet nicht, ob eine Organisation für oder gegen ein Vorhaben war. Eine Aussage wie "stimmte gegen die Position dieser Organisation" erscheint deshalb nur dort, wo eine belegte Position redaktionell erfasst und mit Quelle hinterlegt wurde. Ansonsten steht das Anliegen im Wortlaut der Organisation, ohne Richtungsangabe.\n\nDie Daten zu Abgeordneten, Abstimmungen und Parteitreue werden alle paar Stunden automatisch aktualisiert; Nebeneinkünfte und Parteispenden einmal täglich, das Lobbyregister wöchentlich. Politblick zeigt also nicht den Stand in Echtzeit, sondern den Stand der letzten automatischen Aktualisierung — den genauen Zeitpunkt sehen Sie am Seitenende.\n\nTrotz sorgfältiger Aufbereitung übernehmen wir keine Gewähr für Richtigkeit, Vollständigkeit oder Aktualität der Angaben. Insbesondere die als "Auffälligkeit" oder "Verflechtung" gekennzeichneten Verknüpfungen stellen statistische Beobachtungen dar, keine Tatsachenbehauptungen über Absicht oder Fehlverhalten einzelner Personen.\n\nFür verbindliche Aussagen konsultieren Sie bitte die genannten Primärquellen. Politblick übernimmt keine Haftung für Entscheidungen, die auf Basis dieser Daten getroffen werden.',
    rosterLoading: 'Abgeordnetenliste wird geladen…', rosterUpdated: 'Aktualisiert', rosterError: 'Abgeordnetenliste konnte nicht geladen werden.', rosterRetry: 'Erneut versuchen',
    viewOnAbgeordnetenwatch: 'Vollständiges Profil auf abgeordnetenwatch.de ansehen',
    loadingProfile: 'Profil wird geladen…', profileNotFound: 'Profil nicht gefunden.',
    noLobbyData: 'Für dieses Mitglied sind keine Verflechtungen mit registrierten Interessenvertretungen erfasst.',
    noFinanceData: 'Für dieses Mitglied sind keine Nebeneinkünfte oder Nebentätigkeiten gemeldet.',
    tabSidejobs: 'Nebeneinkünfte', sidejobOnce: 'einmalig', sidejobMonthly: 'monatlich', sidejobAnnual: 'jährlich',
    sidejobsSourceNote: 'Quelle: Angaben gemäß den Verhaltensregeln für Mitglieder des Deutschen Bundestages. Keine Nebeneinkünfte gemeldet bedeutet nicht zwingend, dass keine bestehen — nur, dass keine meldepflichtige Tätigkeit vorliegt.',
    sidejobIncomeLevelPrefix: 'Stufe',
    alignmentTrendRealTemplate: 'Parteitreue der letzten {n} Abstimmungen',
    photoCredit: 'Foto: Wikimedia Commons',
    dataAsOfTemplate: 'Abgeordnete, Abstimmungen: Stand {date}',
    sidejobsAsOfTemplate: 'Nebeneinkünfte: Stand {date}',
    lobbyAffiliationsTitle: 'Verflechtungen mit registrierten Interessenvertretungen',
    lobbyAffiliationsSub:
      'Organisationen im Lobbyregister des Bundestages, bei denen dieses Mitglied laut eigener Angabe eine Funktion ausübt.',
    lobbyNoAffiliations:
      'Dieses Mitglied übt nach eigenen Angaben keine Funktion bei einer im Lobbyregister eingetragenen Organisation aus.',
    lobbyVotesTitle: 'Abstimmungen mit Bezug zu diesen Organisationen',
    lobbyDemandLabel: 'Erklärtes Anliegen der Organisation',
    lobbyNoVotes:
      'Keine namentliche Abstimmung dieser Wahlperiode betrifft eine Drucksache, zu der eine dieser Organisationen Interessenvertretung angemeldet hat.',
    lobbyAgainstPosition: 'Stimmte gegen die Position dieser Organisation',
    lobbyAgainstFraction: 'Stimmte gegen die Mehrheit der eigenen Fraktion',
    lobbyPositionSource: 'Beleg der Position',
    lobbyNoPositionNote:
      'Das Lobbyregister verzeichnet, zu welcher Drucksache eine Organisation Interessenvertretung angemeldet hat — nicht, ob sie dafür oder dagegen war. Wo keine belegte Position hinterlegt ist, steht hier das Anliegen im Wortlaut der Organisation; die Bewertung bleibt Ihnen überlassen.',
    lobbyOrgSpend: 'Gemeldete Lobbyausgaben',
    lobbyOrgStaff: 'Beschäftigte in der Interessenvertretung (VZÄ)',
    lobbyRegisterSource: 'Quelle: Lobbyregister des Deutschen Bundestages.',
    lobbyNoContactsNote:
      'Hinweis: In Deutschland gibt es kein öffentliches Verzeichnis von Treffen zwischen Interessenvertretern und Abgeordneten. Alle Angaben hier beruhen auf Eigenerklärungen — der Organisationen im Lobbyregister und der Abgeordneten zu ihren Nebentätigkeiten.',
    pollLobbyingTitle: 'Angemeldete Interessenvertretung zu dieser Abstimmung',
    pollLobbyingCountTemplate: '{n} Organisationen haben zu den Drucksachen dieser Abstimmung Interessenvertretung angemeldet.',
    pollLobbyingNone: 'Zu den Drucksachen dieser Abstimmung ist keine Interessenvertretung im Register angemeldet.',
    donationsTitle: 'Großspenden an Parteien',
    donationsSub: 'Einzelspenden über 35.000 € (bis März 2024: über 50.000 €), veröffentlicht von der Bundestagspräsidentin.',
    donationsColParty: 'Partei', donationsColDonor: 'Spender', donationsColAmount: 'Betrag', donationsColDate: 'Eingang',
    donationsAlsoLobbyist: 'Auch im Lobbyregister eingetragen',
    donationsSource: 'Quelle: Veröffentlichungen der Bundestagspräsidentin nach § 25 Abs. 3 PartG.',
    lobbyAsOfTemplate: 'Lobbyregister: Stand {date}',
    donationsAsOfTemplate: 'Parteispenden: Stand {date}',
    crossrefTitle: 'Abstimmung trotz eigener Verflechtung',
    crossrefEmpty: 'Derzeit sind keine solchen Überschneidungen erfasst.',
    colOrg: 'Organisation', colBill: 'Abstimmung',
    topicalTiesTitle: 'Gleiches Themenfeld, keine angemeldete Interessenvertretung zu dieser Abstimmung',
    topicalTiesSub:
      'Diese Organisation hat nicht erklärt, zu dieser Abstimmung Interessenvertretung zu betreiben — sie ist nur im selben Themenfeld tätig. Schwächerer Hinweis als oben: kein Beleg, nur thematische Nähe.',
    topicalTiesEmpty: 'Derzeit sind keine solchen thematischen Überschneidungen erfasst.',
    topicalTieMatchedFieldTemplate: 'Organisation listet als Interessengebiet: „{field}“',
    topicalTieNote:
      'Diese Verknüpfung beruht nur auf thematischer Nähe: Die Organisation hat kein Interessengebiet angemeldet, das speziell auf diese Drucksache verweist — nur ein allgemeines Interessengebiet, das laut Politblick-Redaktion zum Thema dieser Abstimmung passt. Anders als bei den oben genannten Verflechtungen gibt es hier keinen dokumentierten Bezug zu genau diesem Gesetz.',
    colMatchedField: 'Interessengebiet',
    lobbyTopicalTitle: 'Gleiches Themenfeld (kein dokumentierter Bezug zu dieser Abstimmung)',
    lobbyTopicalNote:
      'Diese Organisationen haben nicht erklärt, zu dieser Abstimmung Interessenvertretung zu betreiben — sie sind nur allgemein im selben Themenfeld tätig, laut ihrem eigenen im Lobbyregister angegebenen Interessengebiet.',
    lobbyIndicatorConflict: 'Eine Organisation, bei der dieses Mitglied eine Funktion ausübt, hat zu dieser Abstimmung Interessenvertretung angemeldet',
    lobbyIndicatorTopical: 'Eine Organisation, bei der dieses Mitglied eine Funktion ausübt, ist im selben Themenfeld tätig (kein dokumentierter Bezug zu dieser Abstimmung)',
    overviewLobbyPreviewTitle: 'Lobbyverflechtungen',
    overviewLobbyPreviewCountTemplate: '{n} Organisationen im Lobbyregister',
    overviewLobbyPreviewEmpty: 'Keine registrierten Interessenvertretungen bekannt',
    overviewSidejobsPreviewTitle: 'Nebeneinkünfte',
    overviewSidejobsPreviewCountTemplate: '{n} gemeldete Nebentätigkeiten',
    overviewSidejobsPreviewEmpty: 'Keine Nebeneinkünfte gemeldet',
    seeAll: 'Alle ansehen',
    orgsSectionTitle: 'Organisationen durchsuchen',
    orgsSectionSub: 'Alle Organisationen aus dem Lobbyregister, die mit mindestens einem Abgeordneten, einer Abstimmung oder einer Parteispende verknüpft sind.',
    orgSearchPlaceholder: 'Organisation suchen…',
    orgsNoResults: 'Keine Organisationen gefunden.',
    colOrgMembers: 'Verflochtene Abgeordnete', colOrgVotes: 'Abstimmungen mit Interessenvertretung',
    backToLobbyFinance: 'Zurück zu Lobby & Finanzen',
    orgSpendLabel: 'Gemeldete Lobbyausgaben', orgStaffLabel: 'Beschäftigte in der Interessenvertretung (VZÄ)',
    orgFieldsLabel: 'Interessengebiete',
    orgLobbiedBillsTitle: 'Abstimmungen mit angemeldeter Interessenvertretung',
    orgNoLobbiedBills: 'Für diese Organisation ist zu keiner namentlichen Abstimmung dieser Wahlperiode Interessenvertretung angemeldet.',
    orgAffiliatedMembersTitle: 'Abgeordnete mit Funktion bei dieser Organisation',
    orgNoAffiliatedMembers: 'Kein Abgeordneter hat eine Funktion bei dieser Organisation angegeben.',
    orgConflictsTitle: 'Abstimmungen von verflochtenen Abgeordneten',
    orgTopicalTitle: 'Abstimmungen im gleichen Themenfeld',
    orgDonorTitle: 'Als Spender an Parteien',
    orgDonorNote: 'Diese Organisation ist unter diesem Namen auch als Großspenderin an Parteien registriert.',
    orgNotFound: 'Organisation nicht gefunden.',
    partyLobbyTitle: 'Lobbyverflechtungen nach Partei',
    partyLobbySub: 'Für jede Partei: die Organisationen, bei denen ihre Abgeordneten laut eigener Angabe eine Funktion ausüben, gruppiert nach deren Interessengebiet.',
    partyLobbyOrgCountTemplate: '{n} Organisationen', partyLobbyMemberCountTemplate: '{n} Abgeordnete mit Funktion',
    partyLobbyTopFieldsLabel: 'Häufigste Interessengebiete', partyLobbySpendLabel: 'Summe gemeldeter Lobbyausgaben (grobe Schätzung)',
    lobbyOnCommitteeTemplate: 'Mitglied im zuständigen Ausschuss: {committee}',
    lobbyTabOverview: 'Übersicht', lobbyTabParties: 'Nach Partei', lobbyTabOrgs: 'Organisationen',
    lobbyTabConflicts: 'Verflechtungen', lobbyTabTopical: 'Themenfeld', lobbyTabDonations: 'Parteispenden',
    lobbySectionLabel: 'Bereich',
    statOrgsReferencedLabel: 'Verknüpfte Organisationen', statConflictsLabel: 'Abstimmung trotz Verflechtung',
    statTopicalTiesLabel: 'Gleiches Themenfeld', statDonationsSumLabel: 'Großspenden gesamt',
    partyDetailFieldsTitle: 'Alle Interessengebiete', partyDetailOrgsTitle: 'Alle verflochtenen Organisationen',
    partyNotFound: 'Für diese Partei liegen keine Lobbydaten vor.',
    weekOf: 'Sitzungswoche', noPollsThisWeek: 'Für die aktuelle Sitzungswoche liegen noch keine namentlichen Abstimmungen vor.',
    pollsLoading: 'Abstimmungen werden geladen…', pollsError: 'Abstimmungsdaten konnten nicht geladen werden.',
    sidejobsError: 'Nebeneinkünfte konnten nicht geladen werden.',
    pollAccepted: 'Angenommen', pollRejected: 'Abgelehnt', voteNoShow: 'Nicht abgestimmt',
    realAgainstPartyTemplate: 'Stimmte gegen die Mehrheit der eigenen Fraktion ({party})',
    loadingPoll: 'Abstimmung wird geladen…', pollDetailMissing: 'Abstimmung nicht gefunden.', viewSource: 'Quelle ansehen',
    noMandateVotesYet: 'Für dieses Mitglied sind noch keine namentlichen Abstimmungen aus der laufenden Wahlperiode erfasst.',
    scrollHintText: 'Wischen für weitere Spalten',
    tieMatrixSub: 'Anzahl der Überschneidungen nach Partei und Themenfeld. Auf eine Zelle klicken, um die Tabelle unten zu filtern.',
    matrixFilteredTemplate: 'Gefiltert: {party} · {topic}',
    matrixClearFilter: 'Filter zurücksetzen',
    seatsLabel: 'Sitze',
    networkSub: 'Jeder Punkt ist eine Organisation, bei der laut eigener Angabe mindestens ein:e Abgeordnete:r eine Funktion ausübt — Linien zeigen, bei welcher Partei. Mauszeiger über einen Punkt zeigt den Namen. Auf eine Partei tippen zum Hervorheben, auf mehrere für Überschneidungen, auf eine Organisation für Details.',
    networkToggleCrossParty: 'Nur parteiübergreifend',
    networkToggleAll: 'Alle anzeigen',
    networkOrgCountTemplate: '{n} Organisationen im Netzwerk',
    networkViewOrg: 'Organisation ansehen',
    networkEmpty: 'Für diese Auswahl sind keine Organisationen mit Parteibezug erfasst.',
  },
  en: {
    navHome: 'Home', navMps: 'MPs', navLobbyFinance: 'Lobby & Finance',
    searchPlaceholder: 'Search MPs, topics, bills…',
    heroKicker: 'Public data, one place',
    heroTitle: 'Every vote. Every connection.',
    heroSub: 'Politblick brings votes, lobbying contacts and campaign donations from a dozen public sources into one searchable view — no login, no tracking.',
    heroCta: 'Search MPs', heroCta2: 'View lobby & finance',
    statMpsLabel: 'MPs tracked', statFlagsLabel: 'Flags raised',
    expectationTitle: 'Voted against expectation',
    expectationSub: 'MPs who broke from their own party’s majority line — with context on lobby ties and donations.',
    featuredKicker: 'In focus', readMore: 'Read the full analysis',
    feedTitle: 'Recent votes', feedSub: 'Recently concluded roll-call votes in the Bundestag',
    filterParty: 'Party', filterTopic: 'Topic', results: 'results',
    flagsLabel: 'flags', backToSearch: 'Back to search', backToHome: 'Back to home',
    alignmentTrend: 'Alignment with party line over time', partyAverage: 'Party average',
    flagsHeading: 'Flags', sourceNote: 'Source: German Bundestag lobby register.',
    rechenschaftsNote: 'Source: Party financial disclosure reports.',
    voteBreakdown: 'Vote breakdown by party', voteYes: 'Yes', voteNo: 'No', voteAbstain: 'Abstain',
    flaggedVotes: 'Flagged votes', crossrefSub: 'MPs tied by a position, shareholding or donation to an organization that registered lobbying on that very vote — plus the published large donations to the parties.',
    colMp: 'MP', colDonor: 'Donor', colIndustry: 'Industry', colAmount: 'Amount', colVote: 'Vote', colFlag: 'Flag',
    flagged: 'Flagged', footerNote: 'Public data only. No login, no tracking.', footerSources: 'Sources: Abgeordnetenwatch, Bundestag, Lobbyregister',
    tabOverview: 'Overview', tabVotes: 'Voting record', tabLobby: 'Lobby ties', tabFinance: 'Campaign finance',
    follow: 'Follow', following: 'Following',
    statBillsVoted: 'Bills voted', statAttendance: 'Attendance', statPartyAlignment: 'Party alignment', statFlags: 'Flags',
    reasonPartyLine: 'Voted against own party’s majority',
    impressumTitle: 'Legal notice',
    impressumBody: 'Information per § 5 TMG (German Telemedia Act)\n\n[Name / Organization]\n[Street, number]\n[Postal code, city]\n\nContact:\nEmail: [contact@politblick.de]\n\nResponsible for content per § 55 (2) RStV:\n[Name, address]\n\nPolitblick is a private, non-commercial project that aggregates publicly available data. It has no affiliation with any party, parliamentary group, or government body.',
    disclaimerTitle: 'Data disclaimer',
    disclaimerBody: 'All information shown on Politblick comes from publicly available sources (Abgeordnetenwatch, Bundestag open data, the German Bundestag lobby register, and the President of the Bundestag’s publications of large donations) and is aggregated automatically.\n\nImportant, on lobbying: Germany publishes no register of meetings between lobbyists and MPs. Politblick therefore cannot and does not attempt to show who met whom. What is shown are self-declarations only — by organizations, which state in the lobby register which printed matter they lobby on, and by MPs, who must declare their positions, shareholdings and donations received. Where the two concern the same vote, that is reported as an overlap.\n\nThe lobby register does not record whether an organization was for or against a proposal. A statement such as "voted against this organization’s position" therefore appears only where a sourced position has been recorded editorially. Otherwise the organization’s aim is shown in its own words, with no direction attached.\n\nMP, voting and party-alignment data refresh automatically every few hours; outside income and party donations once daily; the lobby register weekly. Politblick therefore does not show a live, real-time state — it shows the state as of the last automatic update, timestamped at the bottom of the page.\n\nDespite careful processing, we make no guarantee as to the accuracy, completeness, or currency of the information. In particular, links labeled as "flags" or "ties" represent statistical observations, not factual claims about any individual’s intent or wrongdoing.\n\nFor authoritative information, please consult the primary sources listed. Politblick accepts no liability for decisions made based on this data.',
    rosterLoading: 'Loading MP roster…', rosterUpdated: 'Updated', rosterError: 'Could not load the MP roster.', rosterRetry: 'Retry',
    viewOnAbgeordnetenwatch: 'View full profile on abgeordnetenwatch.de',
    loadingProfile: 'Loading profile…', profileNotFound: 'Profile not found.',
    noLobbyData: 'No ties to registered interest groups are on file for this member.',
    noFinanceData: 'No outside income or side activities are reported for this member.',
    tabSidejobs: 'Outside income', sidejobOnce: 'one-time', sidejobMonthly: 'monthly', sidejobAnnual: 'annual',
    sidejobsSourceNote: 'Source: Disclosures under the Bundestag members’ code of conduct. No reported outside income does not necessarily mean none exists — only that no disclosable activity is on file.',
    sidejobIncomeLevelPrefix: 'Level',
    alignmentTrendRealTemplate: 'Party alignment over the last {n} votes',
    photoCredit: 'Photo: Wikimedia Commons',
    dataAsOfTemplate: 'MPs, votes: as of {date}',
    sidejobsAsOfTemplate: 'Outside income: as of {date}',
    lobbyAffiliationsTitle: 'Ties to registered interest groups',
    lobbyAffiliationsSub:
      'Organizations in the Bundestag lobby register at which this member has declared holding a position.',
    lobbyNoAffiliations:
      'By their own declarations, this member holds no position at an organization listed in the lobby register.',
    lobbyVotesTitle: 'Votes involving those organizations',
    lobbyDemandLabel: 'The organization’s stated aim',
    lobbyNoVotes:
      'No roll-call vote this term concerns a printed matter that any of these organizations registered lobbying on.',
    lobbyAgainstPosition: 'Voted against this organization’s position',
    lobbyAgainstFraction: 'Voted against their own fraction’s majority',
    lobbyPositionSource: 'Evidence for this position',
    lobbyNoPositionNote:
      'The lobby register records which printed matter an organization registered lobbying on — not whether it was for or against. Where no sourced position is on file, the organization’s aim is shown in its own words and the judgement is left to you.',
    lobbyOrgSpend: 'Declared lobbying expenditure',
    lobbyOrgStaff: 'Staff engaged in lobbying (FTE)',
    lobbyRegisterSource: 'Source: German Bundestag lobby register.',
    lobbyNoContactsNote:
      'Note: Germany publishes no register of meetings between lobbyists and MPs. Everything shown here rests on self-declarations — by organizations in the lobby register, and by MPs about their outside roles.',
    pollLobbyingTitle: 'Registered lobbying on this vote',
    pollLobbyingCountTemplate: '{n} organizations registered lobbying on the printed matters behind this vote.',
    pollLobbyingNone: 'No registered lobbying is on file for the printed matters behind this vote.',
    donationsTitle: 'Large donations to parties',
    donationsSub: 'Single donations above €35,000 (before March 2024: above €50,000), published by the President of the Bundestag.',
    donationsColParty: 'Party', donationsColDonor: 'Donor', donationsColAmount: 'Amount', donationsColDate: 'Received',
    donationsAlsoLobbyist: 'Also listed in the lobby register',
    donationsSource: 'Source: Publications by the President of the Bundestag under § 25 (3) PartG.',
    lobbyAsOfTemplate: 'Lobby register: as of {date}',
    donationsAsOfTemplate: 'Party donations: as of {date}',
    crossrefTitle: 'Voted despite their own tie',
    crossrefEmpty: 'No such overlaps are on record at the moment.',
    colOrg: 'Organization', colBill: 'Vote',
    topicalTiesTitle: 'Same policy area, no registered lobbying on this vote',
    topicalTiesSub:
      'This organization did not register lobbying on this specific vote — it is only active in the same policy area. A weaker signal than the table above: no documented link, only topical proximity.',
    topicalTiesEmpty: 'No such topical overlaps are on record at the moment.',
    topicalTieMatchedFieldTemplate: 'Organization lists as a field of interest: "{field}"',
    topicalTieNote:
      'This tie rests on topical proximity only: the organization has not registered an interest specific to this printed matter — only a general field of interest that Politblick’s editors judged relevant to this vote’s topic. Unlike the ties listed above, there is no documented link to this specific bill.',
    colMatchedField: 'Field of interest',
    lobbyTopicalTitle: 'Same policy area (no documented link to this vote)',
    lobbyTopicalNote:
      'These organizations did not register lobbying on this specific vote — they are only generally active in the same policy area, per their own field of interest declared in the lobby register.',
    lobbyIndicatorConflict: 'An organization this member holds a role at registered lobbying on this vote',
    lobbyIndicatorTopical: 'An organization this member holds a role at is active in the same policy area (no documented link to this vote)',
    overviewLobbyPreviewTitle: 'Lobby ties',
    overviewLobbyPreviewCountTemplate: '{n} organizations in the lobby register',
    overviewLobbyPreviewEmpty: 'No registered lobby ties on file',
    overviewSidejobsPreviewTitle: 'Outside income',
    overviewSidejobsPreviewCountTemplate: '{n} declared outside activities',
    overviewSidejobsPreviewEmpty: 'No outside income reported',
    seeAll: 'See all',
    orgsSectionTitle: 'Search organizations',
    orgsSectionSub: 'Every organization from the lobby register tied to at least one MP, one vote, or one party donation.',
    orgSearchPlaceholder: 'Search an organization…',
    orgsNoResults: 'No organizations found.',
    colOrgMembers: 'Tied MPs', colOrgVotes: 'Votes with registered lobbying',
    backToLobbyFinance: 'Back to Lobby & Finance',
    orgSpendLabel: 'Declared lobbying expenditure', orgStaffLabel: 'Staff engaged in lobbying (FTE)',
    orgFieldsLabel: 'Fields of interest',
    orgLobbiedBillsTitle: 'Votes with registered lobbying',
    orgNoLobbiedBills: 'This organization has no registered lobbying on file for any roll-call vote this term.',
    orgAffiliatedMembersTitle: 'MPs holding a role at this organization',
    orgNoAffiliatedMembers: 'No MP has declared a role at this organization.',
    orgConflictsTitle: 'Votes by tied MPs',
    orgTopicalTitle: 'Votes in the same policy area',
    orgDonorTitle: 'As a party donor',
    orgDonorNote: 'This organization is also registered under this name as a large donor to parties.',
    orgNotFound: 'Organization not found.',
    partyLobbyTitle: 'Lobby ties by party',
    partyLobbySub: 'For each party: the organizations its MPs declare holding a role at, grouped by that organization’s own field of interest.',
    partyLobbyOrgCountTemplate: '{n} organizations', partyLobbyMemberCountTemplate: '{n} MPs with a role',
    partyLobbyTopFieldsLabel: 'Most common fields of interest', partyLobbySpendLabel: 'Sum of declared lobbying expenditure (rough estimate)',
    lobbyOnCommitteeTemplate: 'Sits on the responsible committee: {committee}',
    lobbyTabOverview: 'Overview', lobbyTabParties: 'By party', lobbyTabOrgs: 'Organizations',
    lobbyTabConflicts: 'Conflicts', lobbyTabTopical: 'Policy area', lobbyTabDonations: 'Party donations',
    lobbySectionLabel: 'Section',
    statOrgsReferencedLabel: 'Linked organizations', statConflictsLabel: 'Voted despite a tie',
    statTopicalTiesLabel: 'Same policy area', statDonationsSumLabel: 'Large donations, total',
    partyDetailFieldsTitle: 'All fields of interest', partyDetailOrgsTitle: 'All tied organizations',
    partyNotFound: 'No lobbying data is on file for this party.',
    weekOf: 'Sitting week', noPollsThisWeek: 'No roll-call votes are available yet for the current sitting week.',
    pollsLoading: 'Loading votes…', pollsError: 'Could not load voting data.',
    sidejobsError: 'Could not load outside income data.',
    pollAccepted: 'Accepted', pollRejected: 'Rejected', voteNoShow: 'Did not vote',
    realAgainstPartyTemplate: 'Voted against their own fraction majority ({party})',
    loadingPoll: 'Loading vote…', pollDetailMissing: 'Vote not found.', viewSource: 'View source',
    noMandateVotesYet: 'No roll-call votes are on file yet for this member in the current term.',
    scrollHintText: 'Swipe for more columns',
    tieMatrixSub: 'Count of overlaps by party and policy area. Click a cell to filter the table below.',
    matrixFilteredTemplate: 'Filtered: {party} · {topic}',
    matrixClearFilter: 'Clear filter',
    seatsLabel: 'seats',
    networkSub: 'Each dot is an organization where at least one MP declares holding a role — lines show which party. Hover a dot to see its name. Tap a party to highlight it, tap more than one for overlaps, tap an organization for details.',
    networkToggleCrossParty: 'Cross-party only',
    networkToggleAll: 'Show all',
    networkOrgCountTemplate: '{n} organizations in the network',
    networkViewOrg: 'View organization',
    networkEmpty: 'No organizations with a party tie are on file for this selection.',
  },
};
