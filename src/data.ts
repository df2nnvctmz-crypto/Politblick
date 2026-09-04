export type Lang = 'de' | 'en';

export interface Translation {
  navHome: string; navParliament: string; navMps: string; navMpsSearch: string; navParties: string; navCommittees: string; navPolls: string; navLobbyFinance: string;
  searchPlaceholder: string;
  heroKicker: string; heroTitle: string; heroSub: string;
  heroCta: string; heroCta2: string;
  findMpKicker: string; findMpPlaceholder: string; findMpNoResultsTemplate: string; findMpBrowseAll: string;
  searchGroupMps: string; searchGroupBills: string; searchGroupOrgs: string; searchGroupParties: string; searchSeeAllMpsTemplate: string;
  statMpsLabel: string;
  expectationTitle: string; expectationSub: string;
  featuredKicker: string; readMore: string;
  feedTitle: string; feedSub: string;
  filterParty: string; results: string;
  filterSort: string; sortDefault: string; sortIncome: string; sortTies: string;
  filterActorType: string; filterFieldOfInterest: string; filterAllLabel: string;
  filterSelectedCountTemplate: string; clearAllFilters: string; filterSearchPlaceholder: string;
  flagsLabel: string; backToSearch: string; backToHome: string;
  divergencesHeading: string; divergencesBaseRate: string;
  historyHeading: string; historyBaseRate: string; historyFractionAverage: string;
  historyTopicsLabel: string; historyTopicTemplate: string; historyTermTemplate: string;
  historyNone: string; historyLoading: string; historyInfo: string;
  historyKindOpposed: string; historyKindAbstained: string; historyKindBrokeAbstention: string;
  historyKindOpposedOne: string; historyKindAbstainedOne: string; historyKindBrokeAbstentionOne: string;
  historyKindSplitInfo: string; historyDetailTitle: string; historyDetailSub: string;
  historyDetailVoteTemplate: string; historySeeVotesTab: string;
  historyShowDetail: string; historyHideDetail: string;
  historyShowFiltered: string; historyClearFilter: string; historyNoMatches: string;
  historyCardContext: string; historyCardFirstTerm: string; historyCoverageNote: string;
  sortLoyalty: string; rosterLoyaltyLong: string; rosterLoyaltyRecent: string;
  historyCardHeadline: string; historyCardDetail: string;
  partyDissentTitle: string; partyDissentSub: string; partyCohesion: string;
  partyDividedTitle: string; partyDeviatorsTitle: string;
  partyDissentSummary: string; partyDissentSeeVotes: string; partyShowDetail: string; partyHideDetail: string;
  partyVoteLine: string; partyVoteTally: string; partyVoteNoShow: string;
  partyDeviatorsOnVote: string; partyDeviatorsMore: string;
  statWindowLong: string; statWindowRecent: string;
  partyDissentInfo: string; partyDividedTemplate: string; partyDeviatorTemplate: string;
  sortDivergences: string;
  voteBreakdown: string; voteYes: string; voteNo: string; voteAbstain: string; voteSplit: string;
  flaggedVotes: string; noFlaggedVotes: string; crossrefSub: string;
  colMp: string; colDonor: string; colIndustry: string; colAmount: string; colVote: string; colFlag: string;
  flagged: string; footerNote: string; footerSources: string; footerDisclaimer: string; footerIconsSource: string;
  footerFeedbackLabel: string; footerFeedbackEmail: string; footerFeedbackGithub: string;
  disclaimerFeedbackTitle: string; disclaimerFeedbackBody: string;
  tabOverview: string; tabVotes: string; tabLobby: string; tabFinance: string;
  follow: string; following: string;
  statBillsVoted: string; statAttendance: string; statPartyAlignment: string; statFlags: string;
  reasonPartyLine: string; abstainedFractionLine: string;
  impressumTitle: string; impressumBody: string;
  disclaimerTitle: string; disclaimerBody: string;
  disclaimerTechTitle: string; disclaimerTechBody: string; disclaimerGithubLabel: string;
  datenschutzTitle: string; datenschutzBody: string;
  datenTitle: string; datenIntro: string; datenLicenseNote: string;
  datenUpdatedTemplate: string; datenDownloadLabel: string; datenNoTimestamp: string; datenSourceLabel: string;
  datasets: {
    file: string; name: string; description: string; source: string; sourceUrl: string | null;
    metaKey: 'coreGeneratedAt' | 'sidejobsGeneratedAt' | 'lobbyRegisterGeneratedAt' | 'partyDonationsGeneratedAt' | 'committeesGeneratedAt' | 'voteHistoryGeneratedAt' | null;
  }[];
  rosterLoading: string; rosterUpdated: string; rosterError: string; rosterRetry: string;
  viewOnAbgeordnetenwatch: string; loadingProfile: string; profileNotFound: string;
  noLobbyData: string; noFinanceData: string;
  weekOf: string; noPollsThisWeek: string; pollsLoading: string; pollsError: string; sidejobsError: string;
  pollAccepted: string; pollRejected: string; voteNoShow: string;
  realAgainstPartyTemplate: string; abstainedPartyTemplate: string; loadingPoll: string; pollDetailMissing: string; viewSource: string;
  viewDrucksacheLabel: string; viewDrucksacheTemplate: string;
  partyDonationSourceTemplate: string;
  noMandateVotesYet: string;
  tabSidejobs: string; sidejobOnce: string; sidejobMonthly: string; sidejobAnnual: string; sidejobsSourceNote: string;
  sidejobIncomeLevelPrefix: string;
  alignmentTrendRealTemplate: string; photoCredit: string;
  dataAsOfTemplate: string; sidejobsAsOfTemplate: string;
  lobbyAffiliationsTitle: string; lobbyAffiliationsSub: string; lobbyNoAffiliations: string;
  lobbyVotesTitle: string; lobbyDemandLabel: string; lobbyNoVotes: string;
  lobbyAgainstPosition: string; lobbyAgainstFraction: string; lobbyAbstainedFraction: string; lobbyPositionSource: string;
  lobbyNoPositionNote: string; lobbyOrgSpend: string; lobbyOrgStaff: string;
  lobbyRegisterSource: string; lobbyNoContactsNote: string;
  pollLobbyingTitle: string; pollLobbyingCountTemplate: string; pollLobbyingNone: string;
  flaggedVotesSearchPlaceholder: string; pollLobbyingSearchPlaceholder: string; searchNoResults: string;
  donationSankeyTitle: string; donationSankeySub: string;
  donationSankeyNoteTemplate: string; donationSankeyExcludedTemplate: string;
  donationSankeyCoverageTemplate: string;
  donationSankeySliderLabelTemplate: string;
  donationTimelineTitle: string; donationTimelineSub: string; donationTimelinePartySub: string;
  donationTimelineAxisMaxTemplate: string; donationTimelineExcludedTemplate: string;
  donationTimelineEmpty: string; donationTimelineQuarterTotalLabel: string; donationTimelineRangeLabelTemplate: string;
  donationTimelineOtherDonorsLabel: string;
  chartExportLabel: string; chartExportCsv: string; chartExportSvg: string; chartExportPng: string;
  donationsTitle: string; donationsSub: string; donationsColParty: string;
  donationsColDonor: string; donationsColAmount: string; donationsColDate: string;
  /** Same underlying idea (a donor's summed total), but the two tables scope it differently — the
   * global table sums across every party, the per-party table sums only within that one party —
   * so the header text itself has to say which, not just page context, or the same donor showing
   * two different numbers on two pages reads as a bug rather than two deliberately different
   * questions ("how much did they give in total" vs. "how much did they give to this party"). */
  donationsColDonorTotalAll: string; donationsColDonorTotalPartyTemplate: string;
  donationsAlsoLobbyist: string; donationsSource: string;
  lobbyAsOfTemplate: string; donationsAsOfTemplate: string;
  crossrefTitle: string; crossrefEmpty: string; colOrg: string; colBill: string;
  topicalTiesTitle: string; topicalTiesSub: string; topicalTiesEmpty: string;
  topicalTieMatchedFieldTemplate: string; topicalTieNote: string; colMatchedField: string;
  topicalSearchPlaceholder: string; topicalNoResults: string;
  lobbyTopicalTitle: string; lobbyTopicalNote: string;
  lobbyIndicatorConflict: string; lobbyIndicatorTopical: string;
  overviewLobbyPreviewTitle: string; overviewLobbyPreviewCountTemplate: string; overviewLobbyPreviewEmpty: string;
  overviewSidejobsPreviewTitle: string; overviewSidejobsPreviewCountTemplate: string; overviewSidejobsPreviewEmpty: string;
  seeAll: string;
  orgsSectionTitle: string; orgsSectionSub: string; orgSearchPlaceholder: string; orgsNoResults: string;
  colOrgMembers: string; colOrgVotes: string; backToLobbyFinance: string; backToParties: string;
  orgSpendLabel: string; orgStaffLabel: string; orgFieldsLabel: string;
  orgDescriptionLabel: string; showMoreText: string;
  orgLobbiedBillsTitle: string; orgNoLobbiedBills: string;
  sectorChartTitle: string; sectorChartSub: string; sectorChartMembersTemplate: string; sectorChartOrgsTemplate: string;
  sectorMetricMembers: string; sectorMetricOrgs: string; sectorMetricSpend: string;
  orgAffiliatedMembersTitle: string; orgNoAffiliatedMembers: string;
  orgConflictsTitle: string; orgTopicalTitle: string;
  orgDonorTitle: string; orgDonorNote: string;
  orgNotFound: string;
  committeesTitle: string; committeesSub: string; committeeMembersCountLabel: string; committeeTopicsLabel: string;
  backToCommittees: string; committeeNotFound: string; committeesEmpty: string;
  committeeRoleChair: string; committeeRoleViceChair: string; committeeRoleSpokesperson: string; committeeRoleAlternate: string;
  profileCommitteesTitle: string;
  committeeMemberSearchPlaceholder: string; committeeLobbyTitle: string; committeeLobbySub: string;
  committeeListSearchPlaceholder: string;
  partyListSub: string;
  pollListSub: string; seeAllPolls: string; seeAllConflicts: string;
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
  partyNotFound: string; partyViewMembers: string;
  partyTabDonations: string; partyDonationsEmpty: string; partyDonationsCountLabel: string; partyDonorsCountLabel: string; donorSearchPlaceholder: string;
  partyVotesEmpty: string;
  scrollHintText: string;
  tieMatrixSub: string; matrixFilteredTemplate: string; matrixClearFilter: string;
  seatsLabel: string;
  networkSub: string; networkToggleCrossParty: string; networkToggleAll: string;
  networkOrgCountTemplate: string; networkViewOrg: string; networkViewParty: string; networkEmpty: string;
  showMoreTemplate: string; showLess: string;
  infoVerflechtung: string; infoAuffaelligkeit: string; infoThemenfeld: string;
  lobbyPartiesSubTabNetwork: string; lobbyPartiesSubTabByParty: string;
  lobbyOrgsSubTabDistribution: string; lobbyOrgsSubTabList: string;
  lobbyConflictsSubTabDirect: string; lobbyConflictsSubTabTopical: string;
  lobbyDonationsSubTabTotals: string; lobbyDonationsSubTabTimeline: string;
  lobbyDonationsSubTabTopDonors: string; lobbyDonationsSubTabAll: string;
  /** Per-page <title>/<meta description> content, set on every client-side navigation (see the
   * document-head effect in App.tsx) so real browser tabs/bookmarks/history and — critically —
   * the static HTML each page prerenders to (see scripts/prerender.mjs) carry the right title
   * instead of the generic "Politblick" on every single one of the ~1000+ deep-linkable pages. */
  metaHomeDescription: string;
  metaSearchDescription: string;
  metaMpDescTemplate: string;
  metaBillDescTemplate: string;
  metaOrgDescTemplate: string;
  metaCommitteeDescTemplate: string;
  metaPartyDescTemplate: string;
  metaImpressumDescription: string;
  metaDatenschutzDescription: string;
  metaDisclaimerDescription: string;
}

export const TRANSLATIONS: Record<Lang, Translation> = {
  de: {
    navHome: 'Start', navParliament: 'Parlament', navMps: 'Abgeordnete', navMpsSearch: 'Abgeordnete durchsuchen', navParties: 'Parteien', navCommittees: 'Ausschüsse', navPolls: 'Abstimmungen', navLobbyFinance: 'Lobby & Finanzen',
    searchPlaceholder: 'Abgeordnete, Themen, Gesetze suchen…',
    heroKicker: 'Öffentliche Daten, an einem Ort',
    heroTitle: 'Jede Abstimmung. Jede Verbindung.',
    heroSub: 'Politblick bringt Abstimmungen, Lobbyregister-Einträge und Parteispenden aus öffentlichen Quellen in eine durchsuchbare Ansicht — ohne Login, ohne Cookies.',
    heroCta: 'Abgeordnete durchsuchen', heroCta2: 'Lobby & Finanzen ansehen',
    findMpKicker: 'Wer vertritt dich im Bundestag?',
    findMpPlaceholder: 'Deine Stadt oder dein Wahlkreis…',
    findMpNoResultsTemplate: 'Keine Treffer für „{query}“.',
    findMpBrowseAll: 'Alle Abgeordneten durchsuchen',
    searchGroupMps: 'Abgeordnete', searchGroupBills: 'Gesetze & Abstimmungen', searchGroupOrgs: 'Organisationen', searchGroupParties: 'Parteien',
    searchSeeAllMpsTemplate: 'Alle Abgeordneten für „{query}“ anzeigen',
    statMpsLabel: 'Abgeordnete erfasst',
    expectationTitle: 'Gegen die Erwartung gestimmt',
    expectationSub: 'Abgeordnete, die von der Mehrheitslinie ihrer eigenen Fraktion abgewichen sind — mit Kontext zu Lobbyverflechtungen und Spenden.',
    featuredKicker: 'Im Fokus', readMore: 'Vollständige Analyse lesen',
    feedTitle: 'Aktuelle Abstimmungen', feedSub: 'Kürzlich abgeschlossene Abstimmungen im Bundestag',
    filterParty: 'Partei', results: 'Ergebnisse',
    filterSort: 'Sortierung', sortDefault: 'Standard', sortIncome: 'Nebeneinkünfte (höchste zuerst)', sortTies: 'Verflechtungen (meiste zuerst)',
    filterActorType: 'Akteurstyp', filterFieldOfInterest: 'Interessengebiet', filterAllLabel: 'Alle',
    filterSelectedCountTemplate: '{n} ausgewählt', clearAllFilters: 'Filter zurücksetzen', filterSearchPlaceholder: 'Suchen…',
    flagsLabel: 'Hinweise', backToSearch: 'Zurück zur Suche', backToHome: 'Zurück zur Startseite',
    divergencesHeading: 'Abweichungen von der Fraktionslinie',
    divergencesBaseRate: '{count} von {total} bewerteten Abstimmungen — Fraktionstreue {pct}%',
    historyHeading: 'Langzeit-Bilanz',
    historyBaseRate: '{count} Abweichungen bei {total} bewerteten Abstimmungen — Fraktionstreue {pct}%',
    historyFractionAverage: 'Die eigene Fraktion kam bei denselben Abstimmungen auf {pct}%.',
    historyTopicsLabel: 'Abweichungen nach Themenfeld',
    historyTopicTemplate: '{topic}: {count} von {total}',
    historyTermTemplate: '{label}: {count} von {total}',
    historyNone: 'Keine früheren Mandate im Bundestag erfasst — die Langzeit-Bilanz beginnt erst mit der zweiten Wahlperiode.',
    historyLoading: 'Langzeit-Daten werden geladen…',
    historyKindOpposed: 'Gegenstimmen',
    historyKindAbstained: 'Enthaltungen',
    historyKindBrokeAbstention: 'Stimmen trotz Enthaltungslinie',
    historyKindOpposedOne: 'Gegenstimme',
    historyKindAbstainedOne: 'Enthaltung',
    historyKindBrokeAbstentionOne: 'Stimme trotz Enthaltungslinie',
    historyKindSplitInfo:
      'Nicht jede Abweichung ist dasselbe. Eine Gegenstimme ist offener Widerspruch: Die Fraktion stimmte mit Ja, das Mitglied mit Nein (oder umgekehrt). Eine Enthaltung ist ein angemeldeter Vorbehalt — sie als Gegenstimme zu zählen, würde mehr behaupten, als tatsächlich passiert ist. Und wenn die Fraktion sich enthielt, das Mitglied aber abstimmte, hat es eine Position bezogen, die die Fraktion gerade nicht einnehmen wollte. Über das gesamte Archiv verteilen sich die Abweichungen etwa 61 / 29 / 10 Prozent auf diese drei Fälle.',
    historyDetailTitle: 'Abweichungen in früheren Wahlperioden',
    historyDetailSub: 'Jede namentliche Abstimmung der abgeschlossenen Wahlperioden, bei der die Stimme von der Mehrheitslinie der eigenen Fraktion abwich — neueste zuerst. Die laufende Wahlperiode ist nicht enthalten.',
    historyDetailVoteTemplate: 'Stimme: {vote} · Fraktionslinie ({party}): {majority}',
    historySeeVotesTab: 'Alle Abweichungen im Detail ansehen →',
    historyShowDetail: 'Alle {count} Abweichungen einzeln anzeigen ▾',
    historyHideDetail: 'Einzelne Abweichungen ausblenden ▴',
    historyShowFiltered: '{count} passende Abweichungen anzeigen ▾',
    historyClearFilter: 'Filter zurücksetzen',
    historyNoMatches: 'Keine Abweichung passt zu dieser Kombination.',
    historyCardContext: 'Langfristig {count} von {total} — Fraktionsschnitt {pct}%',
    historyCardFirstTerm: 'Erste Wahlperiode — keine Langzeit-Bilanz',
    historyCoverageNote: 'Langfristig = namentliche Abstimmungen der abgeschlossenen Wahlperioden {year}, verglichen mit der Mehrheitslinie der eigenen Fraktion. Die laufende Wahlperiode ist darin nicht enthalten.',
    partyDissentTitle: 'Fraktionsdisziplin',
    partyDissentSub: 'Wo diese Fraktion in den abgeschlossenen Wahlperioden {year} uneins war — und wer am häufigsten von der eigenen Mehrheitslinie abwich.',
    partyCohesion: 'Geschlossenheit {pct}% bei {total} abgegebenen Stimmen',
    partyDividedTitle: 'Abstimmungen mit den meisten Abweichungen',
    partyDeviatorsTitle: 'Häufigste Abweichler',
    partyDissentSummary: '{divided} von {total} Abstimmungen waren in der Fraktion umstritten.',
    partyDissentSeeVotes: 'Umstrittene Abstimmungen ansehen →',
    partyVoteLine: 'Mehrheitslinie der Fraktion: {majority}',
    partyVoteTally: '{yes} Ja · {no} Nein · {abstain} Enthaltung',
    partyVoteNoShow: '{count} nicht teilgenommen',
    partyDeviatorsOnVote: 'Wich von der Fraktionslinie ab',
    partyDeviatorsMore: '+{count} weitere',
    statWindowLong: 'Wahlperioden {year}',
    statWindowRecent: 'letzte {count} Abstimmungen',
    partyShowDetail: 'Mehr umstrittene Abstimmungen anzeigen ▾',
    partyHideDetail: 'Weniger anzeigen ▴',
    partyDissentInfo: 'Anteil der Stimmen, die der Mehrheitslinie der eigenen Fraktion folgten. Wichtig zur Einordnung: Bei Gewissensentscheidungen — etwa Ehe für Alle, Organspende oder Stammzellgesetz — heben Fraktionen den Fraktionszwang häufig ausdrücklich auf. Dann gibt es gar keine Linie, von der jemand abweichen könnte, und ein hoher Anteil bedeutet Meinungsvielfalt, nicht Aufsässigkeit. Ob der Zwang im Einzelfall aufgehoben war, verzeichnet keine der Quellen — Politblick trifft dazu deshalb keine Aussage und zeigt nur den gemessenen Anteil.',
    partyDividedTemplate: '{count} von {total} ({pct}%)',
    partyDeviatorTemplate: '{count} Abweichungen',
    sortDivergences: 'Abweichungen (meiste zuerst)',
    historyCardHeadline: 'Fraktionstreue langfristig {pct}% · Fraktion {fracPct}%',
    historyCardDetail: '{count} Abweichungen bei {total} Abstimmungen ({year})',
    sortLoyalty: 'Fraktionstreue (niedrigste zuerst)',
    rosterLoyaltyLong: 'Fraktionstreue {pct}% · {total} Abstimmungen ({year})',
    rosterLoyaltyRecent: 'Fraktionstreue {pct}% · letzte {total} Abstimmungen',
    historyInfo:
      'Namentliche Abstimmungen früherer Wahlperioden, verglichen mit der Mehrheitslinie der Fraktion, der die Person am jeweiligen Abstimmungstag angehörte. Der Fraktionsschnitt daneben ist der entscheidende Vergleichswert: Eine Fraktionstreue von 97% bedeutet etwas völlig anderes, je nachdem ob die Kolleginnen und Kollegen bei 99% oder bei 95% liegen. Eine statistische Beobachtung, keine Unterstellung von Fehlverhalten.',
    voteBreakdown: 'Abstimmungsergebnis nach Partei', voteYes: 'Ja', voteNo: 'Nein', voteAbstain: 'Enthaltung', voteSplit: 'Kein Mehrheitsvotum',
    flaggedVotes: 'Auffällige Stimmen', noFlaggedVotes: 'Keine auffälligen Stimmen bei dieser Abstimmung.', crossrefSub: 'Abgeordnete, die über eine Funktion, Beteiligung oder Zuwendung mit einer Organisation verbunden sind, die zu genau dieser Abstimmung Interessenvertretung angemeldet hat — sowie die veröffentlichten Großspenden an die Parteien.',
    colMp: 'Abgeordnete/r', colDonor: 'Spender', colIndustry: 'Branche', colAmount: 'Betrag', colVote: 'Stimme', colFlag: 'Hinweis',
    flagged: 'Auffällig', footerNote: 'Nur öffentliche Daten. Kein Login, keine Cookies.', footerSources: 'Quellen: Abgeordnetenwatch, Bundestag, Lobbyregister',
    footerIconsSource: 'Icons: Google Material Symbols',
    footerDisclaimer: 'Politblick ist ein privates, nicht-kommerzielles Hobbyprojekt ohne Verbindung zu Parteien, Fraktionen oder staatlichen Stellen.',
    footerFeedbackLabel: 'Fehler oder falsche Daten gefunden?', footerFeedbackEmail: 'Per E-Mail melden', footerFeedbackGithub: 'Auf GitHub melden',
    disclaimerFeedbackTitle: 'Fehler gefunden oder Feedback?',
    disclaimerFeedbackBody: 'Politblick führt Daten aus mehreren automatisierten Quellen zusammen — Übertragungsfehler sind nicht ausgeschlossen. Wenn Ihnen eine falsche Zahl, ein falsch zugeordneter Beleg oder ein technisches Problem auffällt, freuen wir uns über eine Nachricht: per E-Mail für alle, oder als Issue auf GitHub für alle, die technisch versiert sind und ein Problem direkt dokumentieren möchten.',
    tabOverview: 'Übersicht', tabVotes: 'Abstimmungen', tabLobby: 'Lobbyverflechtungen', tabFinance: 'Parteifinanzen',
    follow: 'Folgen', following: 'Gefolgt',
    statBillsVoted: 'Abstimmungen', statAttendance: 'Anwesenheit', statPartyAlignment: 'Parteitreue', statFlags: 'Hinweise',
    reasonPartyLine: 'Stimmte gegen die Mehrheit der eigenen Fraktion',
    abstainedFractionLine: 'Enthielt sich, während die Mehrheit der eigenen Fraktion abstimmte',
    impressumTitle: 'Impressum',
    impressumBody: 'Angaben gemäß § 5 DDG\n\nPolitblick - Oskar Leenders\nc/o Autorenglück #30896\nAlbert-Einstein-Str. 47\n02977 Hoyerswerda\n\nKontakt:\nTelefon: +49 (0) 179 1678934\nE-Mail: kontakt@politblick.de\n\nVerantwortlich für den Inhalt nach § 18 Abs. 2 MStV:\nOskar Leenders, Anschrift wie oben\n\nPolitblick ist ein privates, nicht-kommerzielles Projekt zur Aggregation öffentlich zugänglicher Daten. Es besteht keine Verbindung zu Parteien, Fraktionen oder staatlichen Stellen.',
    datenschutzTitle: 'Datenschutzerklärung',
    datenschutzBody: '1. Verantwortlicher\n\nPolitblick - Oskar Leenders\nc/o Autorenglück #30896\nAlbert-Einstein-Str. 47\n02977 Hoyerswerda\nTelefon: +49 (0) 179 1678934\nE-Mail: kontakt@politblick.de\n\n2. Hosting\n\nDiese Website wird über GitHub Pages gehostet (GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA). Beim Aufruf der Seite verarbeitet GitHub automatisch sogenannte Server-Logfiles, die Ihr Browser übermittelt (u. a. IP-Adresse, Datum und Uhrzeit der Anfrage, aufgerufene Seite, Referrer-URL, Browsertyp). Diese Verarbeitung erfolgt auf Grundlage unseres berechtigten Interesses an einem sicheren und funktionsfähigen Betrieb der Website sowie zur Abwehr von Angriffen (Art. 6 Abs. 1 lit. f DSGVO). Da hierbei Daten in die USA übermittelt werden, stützt sich dies auf die Zertifizierung von GitHub unter dem EU-U.S. Data Privacy Framework sowie ergänzend auf die Standardvertragsklauseln der Europäischen Kommission (Durchführungsbeschluss (EU) 2021/914). Näheres regelt die Datenschutzerklärung von GitHub: https://docs.github.com/site-policy/privacy-policies/github-privacy-statement\n\n3. Reichweitenmessung (GoatCounter)\n\nPolitblick nutzt den Open-Source-Dienst GoatCounter (https://www.goatcounter.com/), um zu sehen, wie viele Menschen die Seite besuchen. GoatCounter setzt keine Cookies, speichert keine Daten im Local Storage Ihres Browsers und erstellt keine Nutzerprofile. Zur Unterscheidung wiederkehrender Besuche wird serverseitig für maximal 8 Stunden ein anonymer, aus Website, IP-Adresse und Browserkennung gebildeter Hashwert im Arbeitsspeicher gehalten und danach verworfen — er wird nicht in einer Datenbank gespeichert. Erfasst werden ausschließlich aggregierte Statistiken (u. a. Seitenaufrufe, grobe geografische Herkunft, Browser, Bildschirmgröße, Referrer), keine personenbezogenen Einzelprofile. Die Server von GoatCounter stehen bei Hetzner Online GmbH in Finnland und Deutschland, also innerhalb der EU — es findet keine Datenübermittlung in ein Drittland statt. Diese Verarbeitung erfolgt auf Grundlage unseres berechtigten Interesses, die Nutzung der Website nachzuvollziehen (Art. 6 Abs. 1 lit. f DSGVO). Näheres regelt die Datenschutzerklärung von GoatCounter: https://www.goatcounter.com/help/privacy\n\n4. Externe Dienste, die einzelne Seiten nachladen\n\nDie meisten auf Politblick angezeigten Daten (Abgeordnete, Abstimmungen, Nebentätigkeiten, Lobbyregister, Parteispenden) werden nicht live bei Ihrem Seitenaufruf von Drittanbietern geladen, sondern in regelmäßigen Abständen automatisiert aktualisiert und ausschließlich von unserem eigenen Server ausgeliefert.\n\nEine Ausnahme sind Profilbilder von Abgeordneten: Diese werden beim Öffnen eines Abgeordnetenprofils live von Wikidata und Wikimedia Commons (Wikimedia Foundation Inc.) nachgeladen. Dabei wird Ihre IP-Adresse an die Server von Wikidata/Wikimedia übertragen. Die Einbindung dieser Bilder erfolgt auf Grundlage unseres berechtigten Interesses an einer ansprechenden und informativen Darstellung der Abgeordnetenprofile (Art. 6 Abs. 1 lit. f DSGVO). Die Wikimedia Foundation hat ihren Sitz in San Francisco, USA, wodurch auch hierbei eine Datenübermittlung in ein Drittland stattfindet. Auf Inhalt, Umfang und die dabei getroffenen Garantien für diese Übermittlung haben wir keinen Einfluss; es gilt die Datenschutzerklärung der Wikimedia Foundation: https://foundation.wikimedia.org/wiki/Policy:Privacy_policy\n\n5. Speicherdauer\n\nPolitblick selbst speichert die oben genannten Daten nicht dauerhaft. Wie lange GitHub, GoatCounter und die Wikimedia Foundation die bei ihnen jeweils anfallenden Daten aufbewahren, richtet sich nach deren eigenen, oben verlinkten Datenschutzerklärungen.\n\n6. Ihre Rechte\n\nSie haben das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung Ihrer personenbezogenen Daten sowie ein Recht auf Datenübertragbarkeit und Widerspruch, jeweils im Rahmen der gesetzlichen Vorgaben (Art. 15–21 DSGVO). Sie haben zudem das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.\n\n7. Kontakt\n\nBei Fragen zum Datenschutz wenden Sie sich bitte an die oben genannte Kontaktadresse.',
    datenTitle: 'Daten herunterladen',
    datenIntro: 'Alle auf Politblick verwendeten Daten werden automatisiert aus öffentlichen Quellen zusammengeführt und als statische JSON-Dateien ausgeliefert — dieselben Dateien, die auch diese Website selbst lädt. Sie stehen hier zum direkten Download bereit, etwa für eigene Auswertungen oder zur Recherche.',
    datenLicenseNote: 'Die Nutzungsbedingungen richten sich nach der jeweiligen Quelle (siehe unten). Politblick übernimmt keine Gewähr für Richtigkeit oder Vollständigkeit der Daten — Details siehe „Hinweis zu den Daten“.',
    datenUpdatedTemplate: 'Zuletzt aktualisiert: {date}', datenDownloadLabel: 'Herunterladen', datenNoTimestamp: 'Zeitstempel nicht verfügbar', datenSourceLabel: 'Quelle:',
    datasets: [
      { file: '/data/roster.json', name: 'Abgeordnete & Fraktionen', description: 'Alle Mitglieder des aktuellen Bundestags mit Fraktion und Wahlkreis.', source: 'abgeordnetenwatch.de (CC0 1.0)', sourceUrl: 'https://www.abgeordnetenwatch.de/api/entitaeten/candidacy-mandate', metaKey: 'coreGeneratedAt' },
      { file: '/data/polls.json', name: 'Abstimmungen', description: 'Alle namentlichen Abstimmungen der laufenden Wahlperiode: Titel, Thema, Datum, Ergebnis, verlinkte Drucksachen und eine redaktionelle Kurzbeschreibung.', source: 'abgeordnetenwatch.de (CC0 1.0)', sourceUrl: 'https://www.abgeordnetenwatch.de/api/entitaeten/poll', metaKey: 'coreGeneratedAt' },
      { file: '/data/poll-results.json', name: 'Abstimmungsergebnisse', description: 'Das Stimmverhalten jedes einzelnen Abgeordneten zu jeder Abstimmung.', source: 'abgeordnetenwatch.de (CC0 1.0)', sourceUrl: 'https://www.abgeordnetenwatch.de/api/entitaeten/vote', metaKey: 'coreGeneratedAt' },
      { file: '/data/sidejobs.json', name: 'Nebeneinkünfte', description: 'Von Abgeordneten gemeldete Nebentätigkeiten und Nebeneinkünfte gemäß den Verhaltensregeln für Mitglieder des Deutschen Bundestages.', source: 'abgeordnetenwatch.de (CC0 1.0)', sourceUrl: 'https://www.abgeordnetenwatch.de/api/entitaeten/sidejob', metaKey: 'sidejobsGeneratedAt' },
      { file: '/data/lobby-links.json', name: 'Lobbyregister-Verknüpfungen', description: 'Von Politblick aus dem Lobbyregister des Deutschen Bundestages, den Abstimmungsdaten und den gemeldeten Nebentätigkeiten abgeleitete Verknüpfungen: welche Organisationen zu welchen Gesetzen Interessenvertretung angemeldet haben und welche Abgeordneten dazu Verflechtungen aufweisen.', source: 'Lobbyregister des Deutschen Bundestages, Verknüpfung von Politblick', sourceUrl: 'https://www.lobbyregister.bundestag.de/', metaKey: 'lobbyRegisterGeneratedAt' },
      { file: '/data/party-donations.json', name: 'Großspenden an Parteien', description: 'Einzelspenden oberhalb der gesetzlichen Veröffentlichungsschwelle (§ 25 Abs. 3 PartG).', source: 'Veröffentlichung der Bundestagspräsidentin', sourceUrl: 'https://www.bundestag.de/parlament/praesidium/parteienfinanzierung/fundstellen50000', metaKey: 'partyDonationsGeneratedAt' },
      { file: '/data/vote-history.json', name: 'Abstimmungsarchiv (abgeschlossene Wahlperioden)', description: 'Das Stimmverhalten jedes Abgeordneten bei jeder namentlichen Abstimmung der abgeschlossenen Wahlperioden seit 2005. Kompakt kodiert: pro Abstimmung ein Zeichen je Mitglied für die Stimme und eines für die damalige Fraktion. Die laufende Wahlperiode steht in den Dateien oben.', source: 'abgeordnetenwatch.de (CC0 1.0)', sourceUrl: 'https://www.abgeordnetenwatch.de/api/entitaeten/vote', metaKey: 'voteHistoryGeneratedAt' },
      { file: '/data/vote-history-summary.json', name: 'Langzeit-Bilanz je Abgeordnete/r', description: 'Aus dem Archiv abgeleitete Kennzahlen pro Person: Zahl der bewerteten Abstimmungen, Abweichungen von der eigenen Fraktionslinie und der Fraktionsschnitt bei denselben Abstimmungen. Enthält keine Einzelstimmen — nur Summen, damit die Startseite nicht das ganze Archiv laden muss.', source: 'Ableitung von Politblick aus dem Abstimmungsarchiv', sourceUrl: null, metaKey: 'voteHistoryGeneratedAt' },
      { file: '/data/committees.json', name: 'Ausschüsse', description: 'Bundestagsausschüsse und ihre Mitglieder — dient intern dazu, thematische Übereinstimmungen mit einer Ausschusszuständigkeit zu kennzeichnen.', source: 'abgeordnetenwatch.de (CC0 1.0)', sourceUrl: 'https://www.abgeordnetenwatch.de/api/entitaeten/committee', metaKey: 'committeesGeneratedAt' },
    ],
    disclaimerTitle: 'Hinweis zu den Daten',
    disclaimerBody: 'Alle auf Politblick dargestellten Informationen stammen aus öffentlich zugänglichen Quellen (Abgeordnetenwatch, Bundestag-Open-Data, Lobbyregister des Deutschen Bundestages, Veröffentlichungen der Bundestagspräsidentin zu Großspenden) und werden automatisiert zusammengeführt.\n\nWichtig zum Thema Lobbyismus: In Deutschland gibt es kein öffentliches Verzeichnis von Treffen zwischen Interessenvertretern und Abgeordneten. Politblick kann und will daher nicht zeigen, wer sich mit wem getroffen hat. Dargestellt werden ausschließlich Eigenerklärungen — einerseits von Organisationen, die im Lobbyregister angeben, zu welcher Drucksache sie Interessenvertretung betreiben, andererseits von Abgeordneten, die ihre Funktionen, Beteiligungen und Zuwendungen anzeigen müssen. Wo beides dieselbe Abstimmung betrifft, wird das als Überschneidung ausgewiesen.\n\nDas Lobbyregister verzeichnet nicht, ob eine Organisation für oder gegen ein Vorhaben war. Eine Aussage wie "stimmte gegen die Position dieser Organisation" erscheint deshalb nur dort, wo eine belegte Position redaktionell erfasst und mit Quelle hinterlegt wurde. Ansonsten steht das Anliegen im Wortlaut der Organisation, ohne Richtungsangabe.\n\nDie Daten zu Abgeordneten, Abstimmungen und Fraktionstreue werden alle paar Stunden automatisch aktualisiert; Nebeneinkünfte und Parteispenden einmal täglich, das Lobbyregister wöchentlich. Das Archiv abgeschlossener Wahlperioden (2005–2025) ändert sich nicht mehr und wird deshalb nur einmal erhoben. Politblick zeigt also nicht den Stand in Echtzeit, sondern den Stand der letzten automatischen Aktualisierung — den genauen Zeitpunkt sehen Sie am Seitenende.\n\nTrotz sorgfältiger Aufbereitung übernehmen wir keine Gewähr für Richtigkeit, Vollständigkeit oder Aktualität der Angaben. Insbesondere Abweichungen von der Fraktionslinie und als "Verflechtung" gekennzeichnete Verknüpfungen stellen statistische Beobachtungen dar, keine Tatsachenbehauptungen über Absicht oder Fehlverhalten einzelner Personen. Eine Abweichung ist für sich genommen weder ungewöhnlich noch vorwerfbar — sie wird deshalb nie ohne die Zahl der zugrunde liegenden Abstimmungen und den Vergleichswert der eigenen Fraktion gezeigt.\n\nFür verbindliche Aussagen konsultieren Sie bitte die genannten Primärquellen. Politblick übernimmt keine Haftung für Entscheidungen, die auf Basis dieser Daten getroffen werden.',
    disclaimerTechTitle: 'Technische Aufbereitung der Daten',
    disclaimerTechBody: 'Politblick berechnet nichts live beim Aufruf einer Seite. Automatisierte Skripte holen die Rohdaten in den oben genannten Abständen von den Originalquellen, verarbeiten sie zu einem Snapshot, und die Website liest daraus — nicht in Echtzeit von den Quellen selbst.\n\n"Mehrheitslinie einer Fraktion": Für jede Abstimmung wird pro Partei gezählt, wie viele ihrer Abgeordneten mit Ja, Nein oder Enthaltung gestimmt haben; die häufigste Stimme gilt als Mehrheitslinie. Fraktionslose Abgeordnete haben keine Mehrheitslinie, weil sie keiner Fraktion mit gemeinsamer Position angehören.\n\n"Auffällige Stimme" / gegen die Erwartung: Ein Abgeordneter gilt als abweichend, wenn seine Stimme von der Mehrheitslinie der eigenen Fraktion abweicht. Nicht-Abstimmungen und fraktionslose Abgeordnete fließen nicht in diese Auswertung ein.\n\n"Fraktionstreue" (Ausrichtungs-%): Anteil der Abstimmungen, bei denen die Stimme mit der Mehrheitslinie der eigenen Fraktion übereinstimmte. Wo eine Langzeit-Bilanz vorliegt, bezieht sich der Wert auf alle namentlichen Abstimmungen der abgeschlossenen Wahlperioden seit 2005; sonst auf die letzten 10 Abstimmungen. Welcher Zeitraum gilt, steht immer an der Zahl. Nicht-Abstimmungen zählen nicht mit; fraktionslose Abgeordnete werden nicht bewertet.\n\nLangzeit-Bilanz: Das Archiv enthält die abgeschlossenen Wahlperioden 2005–2025. Die laufende Wahlperiode ist darin NICHT enthalten — deren Abstimmungen stehen separat im Abstimmungs-Tab. Rund 63% der aktuellen Abgeordneten hatten schon ein früheres Mandat; für die übrigen gibt es keine Langzeit-Bilanz, was ausdrücklich so ausgewiesen wird und nicht als perfekte Treue gewertet werden darf.\n\nArten der Abweichung: Eine Gegenstimme (Fraktion Ja, Mitglied Nein oder umgekehrt) ist offener Widerspruch. Eine Enthaltung, während die Fraktion sich festlegte, ist ein angemeldeter Vorbehalt — sie wird deshalb getrennt gezählt und nicht als Gegenstimme dargestellt. Stimmt ein Mitglied ab, während die Fraktion sich enthielt, ist das ein dritter Fall. Über das Archiv verteilen sich die Abweichungen etwa 61 / 29 / 10 Prozent auf diese drei.\n\nFraktionsdisziplin: Für eine Fraktion wird gezählt, welcher Anteil aller abgegebenen Stimmen der eigenen Mehrheitslinie folgte. Bei Gewissensentscheidungen heben Fraktionen den Fraktionszwang häufig auf; ob das im Einzelfall geschah, verzeichnet keine Quelle, und Politblick trifft dazu keine Aussage. Ein hoher Abweichungsanteil kann also Meinungsvielfalt statt Aufsässigkeit bedeuten — deshalb steht neben jeder Zahl das vollständige Stimmenverhältnis der Fraktion.\n\nSpenden nach Quartal: Großspenden werden anhand ihres Eingangsdatums in Kalenderquartale einsortiert. Spenden ohne bekanntes Eingangsdatum erscheinen nicht im Zeitverlauf-Diagramm, zählen aber weiterhin zur Gesamtsumme und stehen in der Tabelle.\n\n"Top"-Listen (z. B. größte Spender): Wo eine vollständige Liste unübersichtlich wäre, zeigt Politblick nur die größten Einzelpositionen mit eigener Farbe; alle übrigen werden zu "Weitere" zusammengefasst — aus Summen und Tabellen werden sie dadurch nie entfernt.\n\nDiese Regeln sind fest im Code hinterlegt und werden nicht von Hand für einzelne Abgeordnete oder Parteien angepasst.',
    disclaimerGithubLabel: 'Quellcode auf GitHub ansehen',
    rosterLoading: 'Abgeordnetenliste wird geladen…', rosterUpdated: 'Aktualisiert', rosterError: 'Abgeordnetenliste konnte nicht geladen werden.', rosterRetry: 'Erneut versuchen',
    viewOnAbgeordnetenwatch: 'Vollständiges Profil auf abgeordnetenwatch.de ansehen',
    loadingProfile: 'Profil wird geladen…', profileNotFound: 'Profil nicht gefunden.',
    noLobbyData: 'Für dieses Mitglied sind keine Verflechtungen mit registrierten Interessenvertretungen erfasst.',
    noFinanceData: 'Für dieses Mitglied sind keine Nebeneinkünfte oder Nebentätigkeiten gemeldet.',
    tabSidejobs: 'Nebentätigkeiten', sidejobOnce: 'einmalig', sidejobMonthly: 'monatlich', sidejobAnnual: 'jährlich',
    sidejobsSourceNote: 'Quelle: Angaben gemäß den Verhaltensregeln für Mitglieder des Deutschen Bundestages. Keine Nebeneinkünfte gemeldet bedeutet nicht zwingend, dass keine bestehen — nur, dass keine meldepflichtige Tätigkeit vorliegt.',
    sidejobIncomeLevelPrefix: 'Stufe',
    alignmentTrendRealTemplate: 'Parteitreue der letzten {n} Abstimmungen',
    photoCredit: 'Foto: Wikimedia Commons',
    dataAsOfTemplate: 'Abgeordnete, Abstimmungen: Stand {date}',
    sidejobsAsOfTemplate: 'Nebentätigkeiten: Stand {date}',
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
    lobbyAbstainedFraction: 'Enthielt sich, während die Mehrheit der eigenen Fraktion abstimmte',
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
    flaggedVotesSearchPlaceholder: 'Name oder Partei suchen…', pollLobbyingSearchPlaceholder: 'Organisation suchen…',
    searchNoResults: 'Keine Treffer für diese Suche.',
    donationSankeyTitle: 'Geldfluss der größten Spender',
    donationSankeySub: 'Wer wie viel an welche Partei gespendet hat — Spender, die an mehrere Parteien gespendet haben, verzweigen sich auf mehrere Linien.',
    donationSankeyNoteTemplate: 'Zeigt die {n} größten Einzelspender nach Gesamtsumme — nicht alle Spenden. Parteitotals hier können deshalb niedriger ausfallen als oben.',
    donationSankeyExcludedTemplate: '{n} weitere Spender ({amount} insgesamt) sind hier nicht dargestellt, aber in der Tabelle unten enthalten.',
    donationSankeyCoverageTemplate: '{pct} % der Gesamtsumme',
    donationSankeySliderLabelTemplate: 'Top {n} Spender',
    donationTimelineTitle: 'Großspenden über Zeit', donationTimelineSub: 'Eingegangene Großspenden pro Quartal, gestapelt nach Partei.',
    donationTimelinePartySub: 'Eingegangene Großspenden dieser Partei pro Quartal.',
    donationTimelineAxisMaxTemplate: 'bis {amount} / Quartal',
    donationTimelineExcludedTemplate: '{n} Spende(n) ohne Eingangsdatum sind hier nicht dargestellt, aber in Summe und Tabelle enthalten.',
    donationTimelineEmpty: 'Keine datierten Großspenden für diesen Zeitraum.',
    donationTimelineQuarterTotalLabel: 'Summe:',
    donationTimelineRangeLabelTemplate: 'Zeitraum: {from} – {to}',
    donationTimelineOtherDonorsLabel: 'Weitere Spender',
    chartExportLabel: 'Diagramm herunterladen', chartExportCsv: 'Rohdaten als CSV', chartExportSvg: 'Als SVG herunterladen', chartExportPng: 'Als PNG herunterladen',
    donationsTitle: 'Großspenden an Parteien',
    donationsSub: 'Einzelspenden über 35.000 € (bis März 2024: über 50.000 €), veröffentlicht von der Bundestagspräsidentin.',
    donationsColParty: 'Partei', donationsColDonor: 'Spender', donationsColAmount: 'Betrag', donationsColDate: 'Eingang',
    donationsColDonorTotalAll: 'Spender insgesamt (alle Parteien)', donationsColDonorTotalPartyTemplate: 'Spender insgesamt bei {party}',
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
    topicalSearchPlaceholder: 'Abgeordnete/r, Organisation oder Abstimmung suchen…',
    topicalNoResults: 'Keine thematischen Überschneidungen für diese Filter gefunden.',
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
    overviewSidejobsPreviewTitle: 'Nebentätigkeiten',
    overviewSidejobsPreviewCountTemplate: '{n} gemeldete Nebentätigkeiten',
    overviewSidejobsPreviewEmpty: 'Keine Nebentätigkeiten gemeldet',
    seeAll: 'Alle ansehen',
    orgsSectionTitle: 'Organisationen durchsuchen',
    orgsSectionSub: 'Alle Organisationen aus dem Lobbyregister, die mit mindestens einem Abgeordneten, einer Abstimmung oder einer Parteispende verknüpft sind.',
    orgSearchPlaceholder: 'Organisation suchen…',
    orgsNoResults: 'Keine Organisationen gefunden.',
    colOrgMembers: 'Verflochtene Abgeordnete', colOrgVotes: 'Abstimmungen mit Interessenvertretung',
    backToLobbyFinance: 'Zurück zu Lobby & Finanzen', backToParties: 'Zurück zu Parteien',
    orgSpendLabel: 'Gemeldete Lobbyausgaben', orgStaffLabel: 'Beschäftigte in der Interessenvertretung (VZÄ)',
    orgFieldsLabel: 'Interessengebiete',
    orgDescriptionLabel: 'Beschreibung der Tätigkeit', showMoreText: 'Mehr anzeigen',
    sectorChartTitle: 'Interessengebiete mit den meisten Verflechtungen',
    sectorChartSub: 'Interessengebiete, gerankt nach der gewählten Kennzahl. Anklicken filtert die Liste unten.',
    sectorChartMembersTemplate: '{n} Abgeordnete', sectorChartOrgsTemplate: '{n} Organisationen',
    sectorMetricMembers: 'Abgeordnete', sectorMetricOrgs: 'Organisationen', sectorMetricSpend: 'Lobbyausgaben',
    orgLobbiedBillsTitle: 'Abstimmungen mit angemeldeter Interessenvertretung',
    orgNoLobbiedBills: 'Für diese Organisation ist zu keiner namentlichen Abstimmung dieser Wahlperiode Interessenvertretung angemeldet.',
    orgAffiliatedMembersTitle: 'Abgeordnete mit Funktion bei dieser Organisation',
    orgNoAffiliatedMembers: 'Kein Abgeordneter hat eine Funktion bei dieser Organisation angegeben.',
    orgConflictsTitle: 'Abstimmungen von verflochtenen Abgeordneten',
    orgTopicalTitle: 'Abstimmungen im gleichen Themenfeld',
    orgDonorTitle: 'Als Spender an Parteien',
    orgDonorNote: 'Diese Organisation ist unter diesem Namen auch als Großspenderin an Parteien registriert.',
    orgNotFound: 'Organisation nicht gefunden.',
    committeesTitle: 'Ausschüsse', committeesSub: 'Alle Ausschüsse und Gremien des Bundestags mit ihrer aktuellen Besetzung.',
    committeeMembersCountLabel: 'Mitglieder', committeeTopicsLabel: 'Themenfelder',
    backToCommittees: 'Zurück zu Ausschüsse', committeeNotFound: 'Ausschuss nicht gefunden.', committeesEmpty: 'Keine Ausschüsse gefunden.',
    committeeRoleChair: 'Vorsitz', committeeRoleViceChair: 'Stellv. Vorsitz', committeeRoleSpokesperson: 'Sprecher:in', committeeRoleAlternate: 'Stellv. Mitglied',
    profileCommitteesTitle: 'Ausschüsse',
    committeeMemberSearchPlaceholder: 'Name oder Partei suchen…',
    committeeLobbyTitle: 'Organisationen mit den meisten Verflechtungen in diesem Ausschuss',
    committeeLobbySub: 'Registrierte Interessenvertretungen, bei denen Mitglieder dieses Ausschusses eine Funktion, Beteiligung oder Zuwendung angegeben haben — gerankt nach Anzahl verflochtener Mitglieder.',
    committeeListSearchPlaceholder: 'Ausschuss oder Themenfeld suchen…',
    partyListSub: 'Jede Fraktion im Bundestag: Sitzverteilung, Lobbyverflechtungen, Großspenden und wie sie bei namentlichen Abstimmungen votiert hat.',
    pollListSub: 'Alle namentlichen Abstimmungen im Bundestag dieser Wahlperiode.', seeAllPolls: 'Alle Abstimmungen ansehen', seeAllConflicts: 'Alle Verflechtungen ansehen',
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
    partyNotFound: 'Für diese Partei liegen keine Lobbydaten vor.', partyViewMembers: 'Alle Abgeordneten anzeigen',
    partyTabDonations: 'Spenden', partyDonationsEmpty: 'Keine gemeldeten Großspenden für diese Partei.',
    partyDonationsCountLabel: 'Anzahl Großspenden', partyDonorsCountLabel: 'Anzahl Spender',
    donorSearchPlaceholder: 'Spender suchen…',
    partyVotesEmpty: 'Für diese Partei sind noch keine Abstimmungsergebnisse erfasst.',
    weekOf: 'Sitzungswoche', noPollsThisWeek: 'Für die aktuelle Sitzungswoche liegen noch keine namentlichen Abstimmungen vor.',
    pollsLoading: 'Abstimmungen werden geladen…', pollsError: 'Abstimmungsdaten konnten nicht geladen werden.',
    sidejobsError: 'Nebentätigkeiten konnten nicht geladen werden.',
    pollAccepted: 'Angenommen', pollRejected: 'Abgelehnt', voteNoShow: 'Nicht abgestimmt',
    realAgainstPartyTemplate: 'Stimmte gegen die Mehrheit der eigenen Fraktion ({party})',
    abstainedPartyTemplate: 'Enthielt sich, während die Mehrheit der Fraktion ({party}) abstimmte',
    loadingPoll: 'Abstimmung wird geladen…', pollDetailMissing: 'Abstimmung nicht gefunden.', viewSource: 'Quelle ansehen',
    viewDrucksacheLabel: 'Gesetzestext:', viewDrucksacheTemplate: 'Drucksache {number} (PDF)',
    partyDonationSourceTemplate: 'Quelle: Veröffentlichung der Bundestagspräsidentin für {year}',
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
    networkViewOrg: 'Organisation ansehen', networkViewParty: 'Partei ansehen',
    networkEmpty: 'Für diese Auswahl sind keine Organisationen mit Parteibezug erfasst.',
    showMoreTemplate: 'Alle {n} anzeigen', showLess: 'Weniger anzeigen',
    infoVerflechtung:
      'Ein:e Abgeordnete:r übt eine Funktion oder Beteiligung bei einer Organisation aus — oder erhielt eine Zuwendung von ihr —, die zu genau dieser Abstimmung Interessenvertretung im Lobbyregister angemeldet hat. Eine statistische Beobachtung, keine Unterstellung von Fehlverhalten.',
    infoAuffaelligkeit:
      'Zählt die Abstimmungen, bei denen ein:e Abgeordnete:r von der Mehrheitslinie der eigenen Fraktion abgewichen ist — immer zusammen mit der Zahl aller bewerteten Abstimmungen, denn eine einzelne Abweichung sagt für sich genommen nichts aus. Eine statistische Beobachtung, keine Unterstellung von Fehlverhalten.',
    infoThemenfeld:
      'Schwächerer Hinweis als eine Verflechtung: Die Organisation hat kein Interessengebiet angemeldet, das speziell auf diese Abstimmung verweist — nur ein allgemeines Interessengebiet, das laut Politblick-Redaktion zum Thema passt. Kein dokumentierter Bezug zu dieser Abstimmung.',
    lobbyPartiesSubTabNetwork: 'Netzwerk', lobbyPartiesSubTabByParty: 'Nach Partei',
    lobbyOrgsSubTabDistribution: 'Verteilung', lobbyOrgsSubTabList: 'Organisationen',
    lobbyConflictsSubTabDirect: 'Direkte Verflechtungen', lobbyConflictsSubTabTopical: 'Thematische Nähe',
    lobbyDonationsSubTabTotals: 'Gesamtspenden', lobbyDonationsSubTabTimeline: 'Spenden über Zeit',
    lobbyDonationsSubTabTopDonors: 'Großspender', lobbyDonationsSubTabAll: 'Alle Spenden',
    metaHomeDescription:
      'Politblick zeigt, wie Bundestagsabgeordnete abgestimmt haben, welche Nebeneinkünfte, Lobbykontakte und Parteispenden dahinterstehen — kostenlos, werbefrei und ohne Tracking.',
    metaSearchDescription: 'Alle Bundestagsabgeordneten durchsuchen und filtern — nach Partei, Wahlkreis und mehr.',
    metaMpDescTemplate: 'Abstimmungen, Nebeneinkünfte und Lobbykontakte von {name} ({party}) im Bundestag.',
    metaBillDescTemplate: 'Wie hat der Bundestag über „{title}“ abgestimmt? Alle Stimmen, aufgeschlüsselt nach Fraktion.',
    metaOrgDescTemplate: 'Lobbyregister-Eintrag, verflochtene Abgeordnete und gemeldete Ausgaben von {name} auf Politblick',
    metaCommitteeDescTemplate: 'Mitglieder und Zuständigkeiten des Ausschusses {name} im Bundestag.',
    metaPartyDescTemplate: 'Sitzverteilung, Abstimmungsverhalten, Lobbyverflechtungen und Großspenden von {party} im Bundestag.',
    metaImpressumDescription: 'Impressum und Kontaktangaben von Politblick.',
    metaDatenschutzDescription: 'Datenschutzerklärung von Politblick — welche Daten anfallen und wie sie verarbeitet werden.',
    metaDisclaimerDescription: 'Woher die Daten auf Politblick stammen und was ihre Grenzen sind.',
  },
  en: {
    navHome: 'Home', navParliament: 'Parliament', navMps: 'MPs', navMpsSearch: 'Search MPs', navParties: 'Parties', navCommittees: 'Committees', navPolls: 'Votes', navLobbyFinance: 'Lobby & Finance',
    searchPlaceholder: 'Search MPs, topics, bills…',
    heroKicker: 'Public data, one place',
    heroTitle: 'Every vote. Every connection.',
    heroSub: 'Politblick brings votes, lobbying contacts and campaign donations from a dozen public sources into one searchable view — no login, no cookies.',
    heroCta: 'Search MPs', heroCta2: 'View lobby & finance',
    findMpKicker: 'Who represents you in the Bundestag?',
    findMpPlaceholder: 'Your city or constituency…',
    findMpNoResultsTemplate: 'No matches for “{query}”.',
    findMpBrowseAll: 'Browse all MPs',
    searchGroupMps: 'MPs', searchGroupBills: 'Bills & votes', searchGroupOrgs: 'Organizations', searchGroupParties: 'Parties',
    searchSeeAllMpsTemplate: 'Show all MPs for “{query}”',
    statMpsLabel: 'MPs tracked',
    expectationTitle: 'Voted against expectation',
    expectationSub: 'MPs who broke from their own party’s majority line — with context on lobby ties and donations.',
    featuredKicker: 'In focus', readMore: 'Read the full analysis',
    feedTitle: 'Recent votes', feedSub: 'Recently concluded roll-call votes in the Bundestag',
    filterParty: 'Party', results: 'results',
    filterSort: 'Sort by', sortDefault: 'Default', sortIncome: 'Outside income (highest first)', sortTies: 'Lobby ties (most first)',
    filterActorType: 'Actor type', filterFieldOfInterest: 'Field of interest', filterAllLabel: 'All',
    filterSelectedCountTemplate: '{n} selected', clearAllFilters: 'Clear filters', filterSearchPlaceholder: 'Search…',
    flagsLabel: 'flags', backToSearch: 'Back to search', backToHome: 'Back to home',
    divergencesHeading: "Votes against their own fraction’s line",
    divergencesBaseRate: '{count} of {total} rated votes — {pct}% aligned with the fraction',
    historyHeading: 'Long-term record',
    historyBaseRate: '{count} divergences across {total} rated votes — {pct}% aligned with the fraction',
    historyFractionAverage: 'Their own fraction averaged {pct}% on the same votes.',
    historyTopicsLabel: 'Divergences by policy area',
    historyTopicTemplate: '{topic}: {count} of {total}',
    historyTermTemplate: '{label}: {count} of {total}',
    historyNone: 'No earlier Bundestag mandate on file — a long-term record only starts with a second term.',
    historyLoading: 'Loading long-term record…',
    historyKindOpposed: 'Opposite votes',
    historyKindAbstained: 'Abstentions',
    historyKindBrokeAbstention: 'Votes where the fraction abstained',
    historyKindOpposedOne: 'Opposite vote',
    historyKindAbstainedOne: 'Abstention',
    historyKindBrokeAbstentionOne: 'Vote where the fraction abstained',
    historyKindSplitInfo:
      "Not every divergence is the same act. An opposite vote is open dissent: the fraction voted yes, the member voted no, or the reverse. An abstention is a registered reservation — counting it as a vote against would claim more than actually happened. And where the fraction abstained but the member voted, they took a position their fraction declined to take. Across the whole archive these split roughly 61 / 29 / 10 per cent.",
    historyDetailTitle: 'Divergences in earlier terms',
    historyDetailSub: 'Every recorded vote of the completed terms where this member departed from their own fraction’s majority line — most recent first. The current term is not included.',
    historyDetailVoteTemplate: 'Vote: {vote} · fraction line ({party}): {majority}',
    historySeeVotesTab: 'See every divergence in detail →',
    historyShowDetail: 'Show all {count} divergences individually ▾',
    historyHideDetail: 'Hide individual divergences ▴',
    historyShowFiltered: 'Show {count} matching divergences ▾',
    historyClearFilter: 'Clear filter',
    historyNoMatches: 'No divergence matches this combination.',
    historyCardContext: 'Long term {count} of {total} — fraction average {pct}%',
    historyCardFirstTerm: 'First term — no long-term record yet',
    historyCoverageNote: 'Long term = recorded votes from the completed terms {year}, measured against the member’s own fraction majority. The current term is not included.',
    partyDissentTitle: 'Fraction discipline',
    partyDissentSub: 'Where this fraction was divided across the completed terms {year} — and who most often departed from its own majority line.',
    partyCohesion: '{pct}% cohesion across {total} votes cast',
    partyDividedTitle: 'Votes with the most divergences',
    partyDeviatorsTitle: 'Most frequent deviators',
    partyDissentSummary: '{divided} of {total} votes divided the fraction.',
    partyDissentSeeVotes: 'See the divided votes →',
    partyVoteLine: 'Fraction majority line: {majority}',
    partyVoteTally: '{yes} yes · {no} no · {abstain} abstained',
    partyVoteNoShow: '{count} did not take part',
    partyDeviatorsOnVote: 'Departed from the fraction line',
    partyDeviatorsMore: '+{count} more',
    statWindowLong: 'terms {year}',
    statWindowRecent: 'last {count} votes',
    partyShowDetail: 'Show more divided votes ▾',
    partyHideDetail: 'Show fewer ▴',
    partyDissentInfo: 'Share of votes that followed the fraction’s own majority line. Important context: on conscience questions — same-sex marriage, organ donation, stem cell law — fractions often explicitly lift the whip. There is then no line to depart from, and a high share means diversity of view rather than indiscipline. Whether the whip was lifted in any given case is recorded by none of the sources, so Politblick makes no claim about it and shows only the measured share.',
    partyDividedTemplate: '{count} of {total} ({pct}%)',
    partyDeviatorTemplate: '{count} divergences',
    sortDivergences: 'Divergences (most first)',
    historyCardHeadline: 'Long-term loyalty {pct}% · fraction {fracPct}%',
    historyCardDetail: '{count} divergences across {total} votes ({year})',
    sortLoyalty: 'Fraction loyalty (lowest first)',
    rosterLoyaltyLong: 'Fraction loyalty {pct}% · {total} votes ({year})',
    rosterLoyaltyRecent: 'Fraction loyalty {pct}% · last {total} votes',
    historyInfo:
      "Recorded votes from earlier terms, compared against the majority line of whichever fraction the member belonged to on the day of each vote. The fraction average beside it is the number that matters: 97% loyalty means something entirely different depending on whether colleagues sat at 99% or at 95%. A statistical observation, not an accusation of wrongdoing.",
    voteBreakdown: 'Vote breakdown by party', voteYes: 'Yes', voteNo: 'No', voteAbstain: 'Abstain', voteSplit: 'No majority',
    flaggedVotes: 'Flagged votes', noFlaggedVotes: 'No flagged votes on this poll.', crossrefSub: 'MPs tied by a position, shareholding or donation to an organization that registered lobbying on that very vote — plus the published large donations to the parties.',
    colMp: 'MP', colDonor: 'Donor', colIndustry: 'Industry', colAmount: 'Amount', colVote: 'Vote', colFlag: 'Flag',
    flagged: 'Flagged', footerNote: 'Public data only. No login, no cookies.', footerSources: 'Sources: Abgeordnetenwatch, Bundestag, Lobbyregister',
    footerIconsSource: 'Icons: Google Material Symbols',
    footerDisclaimer: 'Politblick is a private, non-commercial hobby project with no affiliation with any party, parliamentary group, or government body.',
    footerFeedbackLabel: 'Found an error or bad data?', footerFeedbackEmail: 'Report by email', footerFeedbackGithub: 'Report on GitHub',
    disclaimerFeedbackTitle: 'Found an error, or have feedback?',
    disclaimerFeedbackBody: 'Politblick merges data from several automated sources — transcription errors are possible. If you spot a wrong figure, a misattributed record, or a technical problem, we’d appreciate a message: by email for anyone, or as a GitHub issue if you’re technical and want to document the problem directly.',
    tabOverview: 'Overview', tabVotes: 'Voting record', tabLobby: 'Lobby ties', tabFinance: 'Campaign finance',
    follow: 'Follow', following: 'Following',
    statBillsVoted: 'Bills voted', statAttendance: 'Attendance', statPartyAlignment: 'Party alignment', statFlags: 'Flags',
    reasonPartyLine: 'Voted against own party’s majority',
    abstainedFractionLine: 'Abstained while their own fraction’s majority voted',
    impressumTitle: 'Legal notice',
    impressumBody: 'Information per § 5 DDG (German Digital Services Act)\n\nPolitblick - Oskar Leenders\nc/o Autorenglück #30896\nAlbert-Einstein-Str. 47\n02977 Hoyerswerda, Germany\n\nContact:\nPhone: +49 (0) 179 1678934\nEmail: contact@politblick.de\n\nResponsible for content per § 18 (2) MStV (German Interstate Media Treaty):\nOskar Leenders, address as above\n\nPolitblick is a private, non-commercial project that aggregates publicly available data. It has no affiliation with any party, parliamentary group, or government body.',
    datenschutzTitle: 'Privacy policy',
    datenschutzBody: '1. Controller\n\nPolitblick - Oskar Leenders\nc/o Autorenglück #30896\nAlbert-Einstein-Str. 47\n02977 Hoyerswerda, Germany\nPhone: +49 (0) 179 1678934\nEmail: contact@politblick.de\n\n2. Hosting\n\nThis website is hosted via GitHub Pages (GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA). When you access the site, GitHub automatically processes server log files transmitted by your browser (including IP address, date and time of the request, page requested, referrer URL, browser type). This processing is based on our legitimate interest in the secure and functional operation of the website and in defending against attacks (Art. 6(1)(f) GDPR). As this involves transferring data to the US, this is based on GitHub’s certification under the EU-U.S. Data Privacy Framework, supplemented by the European Commission’s Standard Contractual Clauses (Implementing Decision (EU) 2021/914). For details, see GitHub’s privacy statement: https://docs.github.com/site-policy/privacy-policies/github-privacy-statement\n\n3. Visit counting (GoatCounter)\n\nPolitblick uses the open-source service GoatCounter (https://www.goatcounter.com/) to see how many people visit the site. GoatCounter does not use cookies, does not store anything in your browser’s local storage, and does not build user profiles. To distinguish returning visits, it holds an anonymous hash — built from the site, your IP address, and browser identifier — in server memory for at most 8 hours before discarding it; this hash is never written to a database. Only aggregate statistics are collected (e.g. pageviews, approximate geographic location, browser, screen size, referrer) — never individual personal profiles. GoatCounter’s servers are operated by Hetzner Online GmbH in Finland and Germany — within the EU, so no transfer to a third country takes place. This processing is based on our legitimate interest in understanding how the website is used (Art. 6(1)(f) GDPR). For details, see GoatCounter’s privacy policy: https://www.goatcounter.com/help/privacy\n\n4. Third-party services loaded on individual pages\n\nMost of the data shown on Politblick (MPs, votes, outside income, lobby register, party donations) is not fetched live from third parties when you load the page; it is refreshed on a regular automated schedule and served exclusively from our own server.\n\nOne exception is MP portrait photos: these are loaded live from Wikidata and Wikimedia Commons (Wikimedia Foundation Inc.) when you open an MP’s profile. This transmits your IP address to Wikidata/Wikimedia’s servers. Including these images is based on our legitimate interest in an appealing and informative presentation of MP profiles (Art. 6(1)(f) GDPR). The Wikimedia Foundation is based in San Francisco, USA, so this also involves a transfer to a third country. We have no control over the content, scope, or safeguards applied to that transfer; the Wikimedia Foundation’s privacy policy applies: https://foundation.wikimedia.org/wiki/Policy:Privacy_policy\n\n5. Retention\n\nPolitblick itself does not permanently store the data described above. How long GitHub, GoatCounter, and the Wikimedia Foundation retain the data that arises on their own systems is governed by their own privacy policies, linked above.\n\n6. Your rights\n\nYou have the right to access, rectify, erase, and restrict the processing of your personal data, as well as a right to data portability and objection, subject to the applicable legal requirements (Art. 15–21 GDPR). You also have the right to lodge a complaint with a data protection supervisory authority.\n\n7. Contact\n\nFor questions about data protection, please contact the address given above.',
    datenTitle: 'Download the data',
    datenIntro: 'Everything Politblick shows is aggregated automatically from public sources and served as static JSON files — the very same files this site itself loads. They\'re available here for direct download, e.g. for your own analysis or reporting.',
    datenLicenseNote: 'Reuse terms follow each underlying source (see below). Politblick makes no guarantee as to accuracy or completeness — see "Data disclaimer" for details.',
    datenUpdatedTemplate: 'Last updated: {date}', datenDownloadLabel: 'Download', datenNoTimestamp: 'No timestamp available', datenSourceLabel: 'Source:',
    datasets: [
      { file: '/data/roster.json', name: 'MPs & parliamentary groups', description: 'Every current Bundestag member with their parliamentary group and constituency.', source: 'abgeordnetenwatch.de (CC0 1.0)', sourceUrl: 'https://www.abgeordnetenwatch.de/api/entitaeten/candidacy-mandate', metaKey: 'coreGeneratedAt' },
      { file: '/data/polls.json', name: 'Votes', description: 'Every roll-call vote of the current term: title, topic, date, result, linked printed matters, and an editorial plain-language summary.', source: 'abgeordnetenwatch.de (CC0 1.0)', sourceUrl: 'https://www.abgeordnetenwatch.de/api/entitaeten/poll', metaKey: 'coreGeneratedAt' },
      { file: '/data/poll-results.json', name: 'Vote breakdowns', description: 'How every individual MP voted on every roll call.', source: 'abgeordnetenwatch.de (CC0 1.0)', sourceUrl: 'https://www.abgeordnetenwatch.de/api/entitaeten/vote', metaKey: 'coreGeneratedAt' },
      { file: '/data/sidejobs.json', name: 'Outside income', description: 'Disclosed side activities and outside income, per the Bundestag members\' code of conduct.', source: 'abgeordnetenwatch.de (CC0 1.0)', sourceUrl: 'https://www.abgeordnetenwatch.de/api/entitaeten/sidejob', metaKey: 'sidejobsGeneratedAt' },
      { file: '/data/lobby-links.json', name: 'Lobby register cross-references', description: 'Links Politblick derives from the German Bundestag lobby register, the vote data, and disclosed side activities: which organizations declared lobbying on which bills, and which MPs have a tie to them.', source: 'German Bundestag lobby register, cross-referenced by Politblick', sourceUrl: 'https://www.lobbyregister.bundestag.de/', metaKey: 'lobbyRegisterGeneratedAt' },
      { file: '/data/party-donations.json', name: 'Large party donations', description: 'Individual donations above the statutory disclosure threshold (§ 25 (3) PartG).', source: 'Bundestag President\'s publication', sourceUrl: 'https://www.bundestag.de/parlament/praesidium/parteienfinanzierung/fundstellen50000', metaKey: 'partyDonationsGeneratedAt' },
      { file: '/data/vote-history.json', name: 'Vote archive (completed terms)', description: 'How every member voted in every recorded vote of the completed terms since 2005. Compactly encoded: one character per member for the vote and one for the fraction they sat in at the time. The current term is in the files above.', source: 'abgeordnetenwatch.de (CC0 1.0)', sourceUrl: 'https://www.abgeordnetenwatch.de/api/entitaeten/vote', metaKey: 'voteHistoryGeneratedAt' },
      { file: '/data/vote-history-summary.json', name: 'Long-term record per member', description: 'Aggregates derived from the archive: rated votes, divergences from the member’s own fraction line, and that fraction’s average on the same votes. Carries no individual votes — totals only, so the landing page need not load the whole archive.', source: 'Derived by Politblick from the vote archive', sourceUrl: null, metaKey: 'voteHistoryGeneratedAt' },
      { file: '/data/committees.json', name: 'Committees', description: 'Bundestag committees and their members — used internally to flag topical matches with committee jurisdiction.', source: 'abgeordnetenwatch.de (CC0 1.0)', sourceUrl: 'https://www.abgeordnetenwatch.de/api/entitaeten/committee', metaKey: 'committeesGeneratedAt' },
    ],
    disclaimerTitle: 'Data disclaimer',
    disclaimerBody: 'All information shown on Politblick comes from publicly available sources (Abgeordnetenwatch, Bundestag open data, the German Bundestag lobby register, and the President of the Bundestag’s publications of large donations) and is aggregated automatically.\n\nImportant, on lobbying: Germany publishes no register of meetings between lobbyists and MPs. Politblick therefore cannot and does not attempt to show who met whom. What is shown are self-declarations only — by organizations, which state in the lobby register which printed matter they lobby on, and by MPs, who must declare their positions, shareholdings and donations received. Where the two concern the same vote, that is reported as an overlap.\n\nThe lobby register does not record whether an organization was for or against a proposal. A statement such as "voted against this organization’s position" therefore appears only where a sourced position has been recorded editorially. Otherwise the organization’s aim is shown in its own words, with no direction attached.\n\nMP, voting and fraction-loyalty data refresh automatically every few hours; outside income and party donations once daily; the lobby register weekly. The archive of completed terms (2005–2025) no longer changes and is therefore collected once. Politblick therefore does not show a live, real-time state — it shows the state as of the last automatic update, timestamped at the bottom of the page.\n\nDespite careful processing, we make no guarantee as to the accuracy, completeness, or currency of the information. In particular, divergences from a fraction line and links labeled as "ties" represent statistical observations, not factual claims about any individual’s intent or wrongdoing. A single divergence is neither unusual nor blameworthy on its own — which is why it is never shown without the number of votes it is drawn from and the member’s own fraction average for comparison.\n\nFor authoritative information, please consult the primary sources listed. Politblick accepts no liability for decisions made based on this data.',
    disclaimerTechTitle: 'Technical data processing',
    disclaimerTechBody: 'Politblick doesn’t compute anything live when you load a page. Automated scripts fetch the raw data from the original sources at the intervals listed above, process it into a snapshot, and the site reads from that snapshot — not from the sources themselves in real time.\n\n"Party majority": for each vote, Politblick counts how many of a party’s MPs voted yes, no, or abstained; whichever is largest becomes that party’s majority line. Independent MPs (Fraktionslos) have no majority line, since they don’t belong to a fraction with a shared position.\n\n"Flagged vote" / against expectation: an MP counts as diverging when their vote differs from their own fraction’s majority line. Non-votes and independent MPs are excluded from this comparison.\n\n"Fraction loyalty" (%): the share of votes that matched the member’s own fraction majority line. Where a long-term record exists it covers every recorded vote of the completed terms since 2005; otherwise the last 10 votes. The applicable period is always stated next to the number. Non-votes don’t count; independent MPs aren’t rated.\n\nLong-term record: the archive holds the completed terms 2005–2025. The current term is NOT included — those votes are listed separately on the votes tab. About 63% of sitting members held an earlier mandate; for the rest there is no long-term record, which is stated explicitly and must not be read as flawless loyalty.\n\nKinds of divergence: an opposite vote (fraction yes, member no or the reverse) is open dissent. An abstention while the fraction took a side is a registered reservation, counted separately and never presented as a vote against. A member voting where the fraction abstained is a third case. Across the archive these run roughly 61 / 29 / 10 per cent.\n\nFraction discipline: for a fraction, Politblick reports the share of all votes cast that followed its own majority line. On conscience questions fractions often lift the whip; whether that happened in any given case is recorded by no source, and Politblick makes no claim about it. A high divergence share may therefore mean diversity of view rather than indiscipline — which is why the fraction’s full tally is shown beside every such number.\n\nDonations by quarter: large donations are bucketed into calendar quarters by their received date. Donations with no known received date don’t appear in the time-series chart, but are still included in totals and the table.\n\n"Top" lists (e.g. largest donors): where a full list would be unreadable, Politblick shows only the largest individual entries with their own color; everything else is grouped into "other" — it is never dropped from totals or tables.\n\nThese rules are fixed in the code and are never adjusted by hand for a specific MP or party.',
    disclaimerGithubLabel: 'View source on GitHub',
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
    lobbyAbstainedFraction: 'Abstained while their own fraction’s majority voted',
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
    flaggedVotesSearchPlaceholder: 'Search name or party…', pollLobbyingSearchPlaceholder: 'Search an organization…',
    searchNoResults: 'No matches for this search.',
    donationSankeyTitle: 'Money flow of the largest donors',
    donationSankeySub: 'Who donated how much to which party — donors who gave to more than one party branch across multiple lines.',
    donationSankeyNoteTemplate: 'Shows the {n} largest individual donors by total amount — not every donation. Party totals here can be lower than in the chart above as a result.',
    donationSankeyExcludedTemplate: '{n} further donors ({amount} total) are not shown here, but are included in the table below.',
    donationSankeyCoverageTemplate: '{pct}% of party total',
    donationSankeySliderLabelTemplate: 'Top {n} donors',
    donationTimelineTitle: 'Large donations over time', donationTimelineSub: 'Large donations received per quarter, stacked by party.',
    donationTimelinePartySub: 'Large donations received by this party per quarter.',
    donationTimelineAxisMaxTemplate: 'up to {amount} / quarter',
    donationTimelineExcludedTemplate: '{n} donation(s) without a received date are not shown here, but are included in the total and table.',
    donationTimelineEmpty: 'No dated large donations for this period.',
    donationTimelineQuarterTotalLabel: 'Total:',
    donationTimelineRangeLabelTemplate: 'Time range: {from} – {to}',
    donationTimelineOtherDonorsLabel: 'Other donors',
    chartExportLabel: 'Download chart', chartExportCsv: 'Raw data as CSV', chartExportSvg: 'Download as SVG', chartExportPng: 'Download as PNG',
    donationsTitle: 'Large donations to parties',
    donationsSub: 'Single donations above €35,000 (before March 2024: above €50,000), published by the President of the Bundestag.',
    donationsColParty: 'Party', donationsColDonor: 'Donor', donationsColAmount: 'Amount', donationsColDate: 'Received',
    donationsColDonorTotalAll: 'Donor total (all parties)', donationsColDonorTotalPartyTemplate: 'Donor total at {party}',
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
    topicalSearchPlaceholder: 'Search MP, organization, or vote…',
    topicalNoResults: 'No topical overlaps found for these filters.',
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
    backToLobbyFinance: 'Back to Lobby & Finance', backToParties: 'Back to Parties',
    orgSpendLabel: 'Declared lobbying expenditure', orgStaffLabel: 'Staff engaged in lobbying (FTE)',
    orgFieldsLabel: 'Fields of interest',
    orgDescriptionLabel: 'Description of activity', showMoreText: 'Show more',
    sectorChartTitle: 'Fields of interest with the most ties',
    sectorChartSub: 'Fields of interest, ranked by the selected metric. Click a bar to filter the list below.',
    sectorChartMembersTemplate: '{n} MPs', sectorChartOrgsTemplate: '{n} organizations',
    sectorMetricMembers: 'MPs', sectorMetricOrgs: 'Organizations', sectorMetricSpend: 'Lobbying spend',
    orgLobbiedBillsTitle: 'Votes with registered lobbying',
    orgNoLobbiedBills: 'This organization has no registered lobbying on file for any roll-call vote this term.',
    orgAffiliatedMembersTitle: 'MPs holding a role at this organization',
    orgNoAffiliatedMembers: 'No MP has declared a role at this organization.',
    orgConflictsTitle: 'Votes by tied MPs',
    orgTopicalTitle: 'Votes in the same policy area',
    orgDonorTitle: 'As a party donor',
    orgDonorNote: 'This organization is also registered under this name as a large donor to parties.',
    orgNotFound: 'Organization not found.',
    committeesTitle: 'Committees', committeesSub: 'Every Bundestag committee and body, with its current membership.',
    committeeMembersCountLabel: 'Members', committeeTopicsLabel: 'Topics',
    backToCommittees: 'Back to committees', committeeNotFound: 'Committee not found.', committeesEmpty: 'No committees found.',
    committeeRoleChair: 'Chair', committeeRoleViceChair: 'Vice chair', committeeRoleSpokesperson: 'Spokesperson', committeeRoleAlternate: 'Alternate member',
    profileCommitteesTitle: 'Committees',
    committeeMemberSearchPlaceholder: 'Search name or party…',
    committeeLobbyTitle: 'Organizations with the most ties on this committee',
    committeeLobbySub: 'Registered lobbyists that members of this committee have declared a role, shareholding, or donation from — ranked by number of tied members.',
    committeeListSearchPlaceholder: 'Search a committee or topic…',
    partyListSub: 'Every fraction in the Bundestag: seat count, lobby ties, large donations, and how they voted on roll-call votes.',
    pollListSub: 'Every roll-call vote in the Bundestag this term.', seeAllPolls: 'See all votes', seeAllConflicts: 'See all conflicts',
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
    partyNotFound: 'No lobbying data is on file for this party.', partyViewMembers: 'View all MPs',
    partyTabDonations: 'Donations', partyDonationsEmpty: 'No reported large donations for this party.',
    partyDonationsCountLabel: 'Number of large donations', partyDonorsCountLabel: 'Number of distinct donors',
    donorSearchPlaceholder: 'Search donors…',
    partyVotesEmpty: 'No vote results are on file yet for this party.',
    weekOf: 'Sitting week', noPollsThisWeek: 'No roll-call votes are available yet for the current sitting week.',
    pollsLoading: 'Loading votes…', pollsError: 'Could not load voting data.',
    sidejobsError: 'Could not load outside income data.',
    pollAccepted: 'Accepted', pollRejected: 'Rejected', voteNoShow: 'Did not vote',
    realAgainstPartyTemplate: 'Voted against their own fraction majority ({party})',
    abstainedPartyTemplate: 'Abstained while their own fraction’s majority ({party}) voted',
    loadingPoll: 'Loading vote…', pollDetailMissing: 'Vote not found.', viewSource: 'View source',
    viewDrucksacheLabel: 'Bill text:', viewDrucksacheTemplate: 'Printed matter {number} (PDF)',
    partyDonationSourceTemplate: 'Source: Bundestag President’s publication for {year}',
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
    networkViewOrg: 'View organization', networkViewParty: 'View party',
    networkEmpty: 'No organizations with a party tie are on file for this selection.',
    showMoreTemplate: 'Show all {n}', showLess: 'Show less',
    infoVerflechtung:
      'An MP holds a role or shareholding at an organization — or received a payment from it — that registered lobbying on the printed matter behind this exact vote. A statistical observation, not an accusation of wrongdoing.',
    infoAuffaelligkeit:
      "Counts the votes where an MP broke from their own fraction’s majority line — always shown against the total number of rated votes, because a single divergence on its own means nothing. A statistical observation, not an accusation of wrongdoing.",
    infoThemenfeld:
      "A weaker signal than a documented tie: the organization hasn't registered lobbying that specifically names this vote — only a general field of interest that Politblick's editors judged to match the topic. No documented link to this particular vote.",
    lobbyPartiesSubTabNetwork: 'Network', lobbyPartiesSubTabByParty: 'By party',
    lobbyOrgsSubTabDistribution: 'Distribution', lobbyOrgsSubTabList: 'Organizations',
    lobbyConflictsSubTabDirect: 'Direct ties', lobbyConflictsSubTabTopical: 'Topical ties',
    lobbyDonationsSubTabTotals: 'Total donations', lobbyDonationsSubTabTimeline: 'Donations over time',
    lobbyDonationsSubTabTopDonors: 'Top donors', lobbyDonationsSubTabAll: 'All donations',
    metaHomeDescription:
      'Politblick shows how German Bundestag MPs voted, and what side income, lobby ties, and party donations sit behind it — free, ad-free, and tracking-free.',
    metaSearchDescription: 'Search and filter every Bundestag MP — by party, constituency, and more.',
    metaMpDescTemplate: 'Votes, side income, and lobby ties of {name} ({party}) in the Bundestag.',
    metaBillDescTemplate: 'How did the Bundestag vote on "{title}"? Every vote, broken down by fraction.',
    metaOrgDescTemplate: 'Lobby register entry, tied MPs, and reported spending for {name} on Politblick',
    metaCommitteeDescTemplate: 'Members and responsibilities of the {name} committee in the Bundestag.',
    metaPartyDescTemplate: 'Seat count, voting record, lobby ties, and large donations of {party} in the Bundestag.',
    metaImpressumDescription: 'Legal notice and contact details for Politblick.',
    metaDatenschutzDescription: "Politblick's privacy policy — what data is collected and how it's processed.",
    metaDisclaimerDescription: "Where Politblick's data comes from, and what its limits are.",
  },
};
