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
}

export const TRANSLATIONS: Record<Lang, Translation> = {
  de: {
    navHome: 'Start', navMps: 'Abgeordnete', navLobbyFinance: 'Lobby & Finanzen',
    searchPlaceholder: 'Abgeordnete, Themen, Gesetze suchen…',
    heroKicker: 'Öffentliche Daten, an einem Ort',
    heroTitle: 'Jede Abstimmung. Jede Verbindung.',
    heroSub: 'Politblick bringt Abstimmungen, Lobbykontakte und Parteispenden aus über einem Dutzend öffentlicher Quellen in eine durchsuchbare Ansicht — ohne Login, ohne Tracking.',
    heroCta: 'Abgeordnete durchsuchen', heroCta2: 'Lobby & Finanzen ansehen',
    statMpsLabel: 'Abgeordnete erfasst', statFlagsLabel: 'Auffälligkeiten',
    expectationTitle: 'Gegen die Erwartung gestimmt',
    expectationSub: 'Abgeordnete, die von der Mehrheitslinie ihrer eigenen Fraktion abgewichen sind — mit Kontext zu Lobbykontakten und Spenden.',
    featuredKicker: 'Im Fokus', readMore: 'Vollständige Analyse lesen',
    feedTitle: 'Aktuelle Abstimmungen', feedSub: 'Kürzlich abgeschlossene Abstimmungen im Bundestag',
    filterParty: 'Partei', filterTopic: 'Thema', results: 'Ergebnisse',
    flagsLabel: 'Hinweise', backToSearch: 'Zurück zur Suche', backToHome: 'Zurück zur Startseite',
    alignmentTrend: 'Übereinstimmung mit Parteilinie über Zeit', partyAverage: 'Partei-Durchschnitt',
    flagsHeading: 'Auffälligkeiten', sourceNote: 'Quelle: Lobbyregister des Deutschen Bundestages.',
    rechenschaftsNote: 'Quelle: Rechenschaftsberichte der Parteien.',
    voteBreakdown: 'Abstimmungsergebnis nach Partei', voteYes: 'Ja', voteNo: 'Nein', voteAbstain: 'Enthaltung',
    flaggedVotes: 'Auffällige Stimmen', crossrefSub: 'Verknüpfung von Spendendaten, Lobbykontakten und Abstimmungsverhalten.',
    colMp: 'Abgeordnete/r', colDonor: 'Spender', colIndustry: 'Branche', colAmount: 'Betrag', colVote: 'Stimme', colFlag: 'Hinweis',
    flagged: 'Auffällig', footerNote: 'Nur öffentliche Daten. Kein Login, kein Tracking.', footerSources: 'Quellen: Abgeordnetenwatch, Bundestag, Lobbyregister',
    tabOverview: 'Übersicht', tabVotes: 'Abstimmungen', tabLobby: 'Lobbykontakte', tabFinance: 'Parteifinanzen',
    follow: 'Folgen', following: 'Gefolgt',
    statBillsVoted: 'Abstimmungen', statAttendance: 'Anwesenheit', statPartyAlignment: 'Parteitreue', statFlags: 'Hinweise',
    reasonPartyLine: 'Stimmte gegen die Mehrheit der eigenen Fraktion',
    impressumTitle: 'Impressum',
    impressumBody: 'Angaben gemäß § 5 TMG\n\n[Name / Organisation]\n[Straße, Hausnummer]\n[PLZ, Ort]\n\nKontakt:\nE-Mail: [kontakt@politblick.de]\n\nVerantwortlich für den Inhalt nach § 55 Abs. 2 RStV:\n[Name, Anschrift]\n\nPolitblick ist ein privates, nicht-kommerzielles Projekt zur Aggregation öffentlich zugänglicher Daten. Es besteht keine Verbindung zu Parteien, Fraktionen oder staatlichen Stellen.',
    disclaimerTitle: 'Hinweis zu den Daten',
    disclaimerBody: 'Alle auf Politblick dargestellten Informationen stammen aus öffentlich zugänglichen Quellen (u. a. Abgeordnetenwatch, Bundestag-Open-Data, Lobbyregister, Rechenschaftsberichte der Parteien) und werden automatisiert zusammengeführt.\n\nTrotz sorgfältiger Aufbereitung übernehmen wir keine Gewähr für Richtigkeit, Vollständigkeit oder Aktualität der Angaben. Insbesondere die als "Auffälligkeit" gekennzeichneten Verknüpfungen zwischen Abstimmungen, Lobbykontakten und Spenden stellen statistische Beobachtungen dar, keine Tatsachenbehauptungen über Absicht oder Fehlverhalten einzelner Personen.\n\nFür verbindliche Aussagen konsultieren Sie bitte die genannten Primärquellen. Politblick übernimmt keine Haftung für Entscheidungen, die auf Basis dieser Daten getroffen werden.',
    rosterLoading: 'Abgeordnetenliste wird geladen…', rosterUpdated: 'Aktualisiert', rosterError: 'Abgeordnetenliste konnte nicht geladen werden.', rosterRetry: 'Erneut versuchen',
    viewOnAbgeordnetenwatch: 'Vollständiges Profil auf abgeordnetenwatch.de ansehen',
    loadingProfile: 'Profil wird geladen…', profileNotFound: 'Profil nicht gefunden.',
    noLobbyData: 'Für dieses Mitglied sind noch keine Lobbykontakte hinterlegt.',
    noFinanceData: 'Für dieses Mitglied sind keine Nebeneinkünfte oder Nebentätigkeiten gemeldet.',
    tabSidejobs: 'Nebeneinkünfte', sidejobOnce: 'einmalig', sidejobMonthly: 'monatlich', sidejobAnnual: 'jährlich',
    sidejobsSourceNote: 'Quelle: Angaben gemäß den Verhaltensregeln für Mitglieder des Deutschen Bundestages. Keine Nebeneinkünfte gemeldet bedeutet nicht zwingend, dass keine bestehen — nur, dass keine meldepflichtige Tätigkeit vorliegt.',
    sidejobIncomeLevelPrefix: 'Stufe',
    alignmentTrendRealTemplate: 'Parteitreue der letzten {n} Abstimmungen',
    photoCredit: 'Foto: Wikimedia Commons',
    weekOf: 'Sitzungswoche', noPollsThisWeek: 'Für die aktuelle Sitzungswoche liegen noch keine namentlichen Abstimmungen vor.',
    pollsLoading: 'Abstimmungen werden geladen…', pollsError: 'Abstimmungsdaten konnten nicht geladen werden.',
    sidejobsError: 'Nebeneinkünfte konnten nicht geladen werden.',
    pollAccepted: 'Angenommen', pollRejected: 'Abgelehnt', voteNoShow: 'Nicht abgestimmt',
    realAgainstPartyTemplate: 'Stimmte gegen die Mehrheit der eigenen Fraktion ({party})',
    loadingPoll: 'Abstimmung wird geladen…', pollDetailMissing: 'Abstimmung nicht gefunden.', viewSource: 'Quelle ansehen',
    noMandateVotesYet: 'Für dieses Mitglied sind noch keine namentlichen Abstimmungen aus der laufenden Wahlperiode erfasst.',
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
    expectationSub: 'MPs who broke from their own party’s majority line — with context on lobby contacts and donations.',
    featuredKicker: 'In focus', readMore: 'Read the full analysis',
    feedTitle: 'Recent votes', feedSub: 'Recently concluded roll-call votes in the Bundestag',
    filterParty: 'Party', filterTopic: 'Topic', results: 'results',
    flagsLabel: 'flags', backToSearch: 'Back to search', backToHome: 'Back to home',
    alignmentTrend: 'Alignment with party line over time', partyAverage: 'Party average',
    flagsHeading: 'Flags', sourceNote: 'Source: German Bundestag lobby register.',
    rechenschaftsNote: 'Source: Party financial disclosure reports.',
    voteBreakdown: 'Vote breakdown by party', voteYes: 'Yes', voteNo: 'No', voteAbstain: 'Abstain',
    flaggedVotes: 'Flagged votes', crossrefSub: 'Cross-referencing donation data, lobby contacts and voting behavior.',
    colMp: 'MP', colDonor: 'Donor', colIndustry: 'Industry', colAmount: 'Amount', colVote: 'Vote', colFlag: 'Flag',
    flagged: 'Flagged', footerNote: 'Public data only. No login, no tracking.', footerSources: 'Sources: Abgeordnetenwatch, Bundestag, Lobbyregister',
    tabOverview: 'Overview', tabVotes: 'Voting record', tabLobby: 'Lobby contacts', tabFinance: 'Campaign finance',
    follow: 'Follow', following: 'Following',
    statBillsVoted: 'Bills voted', statAttendance: 'Attendance', statPartyAlignment: 'Party alignment', statFlags: 'Flags',
    reasonPartyLine: 'Voted against own party’s majority',
    impressumTitle: 'Legal notice',
    impressumBody: 'Information per § 5 TMG (German Telemedia Act)\n\n[Name / Organization]\n[Street, number]\n[Postal code, city]\n\nContact:\nEmail: [contact@politblick.de]\n\nResponsible for content per § 55 (2) RStV:\n[Name, address]\n\nPolitblick is a private, non-commercial project that aggregates publicly available data. It has no affiliation with any party, parliamentary group, or government body.',
    disclaimerTitle: 'Data disclaimer',
    disclaimerBody: 'All information shown on Politblick comes from publicly available sources (including Abgeordnetenwatch, Bundestag open data, the lobby register, and parties’ financial disclosure reports) and is aggregated automatically.\n\nDespite careful processing, we make no guarantee as to the accuracy, completeness, or currency of the information. In particular, links labeled as "flags" between votes, lobby contacts, and donations represent statistical observations, not factual claims about any individual’s intent or wrongdoing.\n\nFor authoritative information, please consult the primary sources listed. Politblick accepts no liability for decisions made based on this data.',
    rosterLoading: 'Loading MP roster…', rosterUpdated: 'Updated', rosterError: 'Could not load the MP roster.', rosterRetry: 'Retry',
    viewOnAbgeordnetenwatch: 'View full profile on abgeordnetenwatch.de',
    loadingProfile: 'Loading profile…', profileNotFound: 'Profile not found.',
    noLobbyData: 'No lobby contacts are on file for this member yet.',
    noFinanceData: 'No outside income or side activities are reported for this member.',
    tabSidejobs: 'Outside income', sidejobOnce: 'one-time', sidejobMonthly: 'monthly', sidejobAnnual: 'annual',
    sidejobsSourceNote: 'Source: Disclosures under the Bundestag members’ code of conduct. No reported outside income does not necessarily mean none exists — only that no disclosable activity is on file.',
    sidejobIncomeLevelPrefix: 'Level',
    alignmentTrendRealTemplate: 'Party alignment over the last {n} votes',
    photoCredit: 'Photo: Wikimedia Commons',
    weekOf: 'Sitting week', noPollsThisWeek: 'No roll-call votes are available yet for the current sitting week.',
    pollsLoading: 'Loading votes…', pollsError: 'Could not load voting data.',
    sidejobsError: 'Could not load outside income data.',
    pollAccepted: 'Accepted', pollRejected: 'Rejected', voteNoShow: 'Did not vote',
    realAgainstPartyTemplate: 'Voted against their own fraction majority ({party})',
    loadingPoll: 'Loading vote…', pollDetailMissing: 'Vote not found.', viewSource: 'View source',
    noMandateVotesYet: 'No roll-call votes are on file yet for this member in the current term.',
  },
};
