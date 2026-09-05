// All figures below are already live on politblick.de. Keep this file the
// single source of truth for the two slides — see README.md for how to
// refresh it.

export const STAND = "Stand 05.09.2026";

export type PartyKey =
  | "CDU/CSU"
  | "SPD"
  | "AfD"
  | "Grüne"
  | "Linke"
  | "FDP"
  | "BSW";

export const PARTY_COLORS: Record<PartyKey, { bg: string; fg: string }> = {
  "CDU/CSU": { bg: "#000000", fg: "#ffffff" },
  SPD: { bg: "#e3000f", fg: "#ffffff" },
  AfD: { bg: "#009ee0", fg: "#ffffff" },
  Grüne: { bg: "#409a3c", fg: "#ffffff" },
  Linke: { bg: "#be3075", fg: "#ffffff" },
  FDP: { bg: "#ffed00", fg: "#000000" },
  BSW: { bg: "#8f2b4a", fg: "#ffffff" },
};

// ---------------------------------------------------------------------------
// Slide 1 — SlideSpend
// ---------------------------------------------------------------------------

export const spendData = {
  // "Interessenvertretung" is the register's own statutory term, and the only thing the figure
  // below actually measures. Neither "Einflussnahme" nor "Zugang" is supportable: the register
  // records no recipient, no meeting and no date, so nothing here shows that anyone bought
  // anything. It would also misdescribe its own contents — the second-largest declarant is the
  // Verbraucherzentrale Bundesverband, and Campact is eighth.
  pill: "WAS INTERESSENVERTRETUNG KOSTET",
  headline: "Lobbyausgaben sind ein vielfaches der Großspenden.",
  subheadline: "Warum reden wir nicht darüber?",
  caveat:
    "Ausgaben, die Organisationen selbst im Lobbyregister melden. Das Register verknüpft keinen Euro mit einer Partei, einem Gesetz oder einem Datum.",

  compare: {
    donations: {
      label: "Großspenden an Parteien",
      value: 51_464_101,
      // 1.342 Tage (2022-12-30 bis 2026-09-02) = 3,67 Jahre. "4 Jahre" wäre zu viel: 2026 ist
      // erst bis September erfasst.
      note: "über mehr als 3 Jahre",
    },
    lobbySpend: {
      label: "Gemeldete Lobbyausgaben",
      value: 869_167_557,
      note: "je Geschäftsjahr",
    },
  },
  compareNote:
    "Mehr als drei Jahre veröffentlichte Großspenden sind rund 6 % eines einzigen Jahres gemeldeter Lobbyausgaben.",

  breakdownHeader: "NACH ART DER ORGANISATION",
  // Midpoints of the reported brackets, the same estimator as the headline above. Using the
  // brackets' upper bounds here instead (the register's `to`) would make the seven bars sum to
  // 849,6 Mio. € against a 869,2 Mio. € headline, implying only 19,6 Mio. € for the ten
  // categories not shown when the real figure is 43,1 Mio. € — a 2,2x understatement of the
  // remainder, produced purely by mixing two estimators on one slide.
  breakdown: [
    { label: "Unternehmen", melder: 1566, betrag: 322_110_783 },
    { label: "Wirtschafts- und Gewerbeverbände", melder: 681, betrag: 229_395_341 },
    { label: "Gemeinnützige Organisationen", melder: 1171, betrag: 84_015_586 },
    { label: "Sonstige private Organisationen", melder: 371, betrag: 67_285_186 },
    { label: "Berufsverbände", melder: 497, betrag: 56_435_249 },
    { label: "NGOs", melder: 226, betrag: 38_140_113 },
    { label: "Beratungsunternehmen", melder: 193, betrag: 28_705_097 },
  ],

  footnote:
    "6.029 aktive Eintragungen, davon 5.113 mit Angabe. Das Register meldet in Stufen von 10.000 € — die Gesamtsumme liegt zwischen 843.605.113 € und 894.730.000 €; gezeigt ist jeweils die Mitte. Jede Organisation meldet für ihr eigenes letztes Geschäftsjahr, ohne Jahresangabe — die Summe ist kein Kalenderjahr.",

  footer: {
    label: "Gemeldete Lobbyausgaben",
    stand: STAND,
    source: "Quelle: lobbyregister.bundestag.de · bundestag.de (Großspenden)",
  },
};

// ---------------------------------------------------------------------------
// Slide 2 — SlideTies
// ---------------------------------------------------------------------------

export const tiesData = {
  pill: "WO SICH BEIDES BERÜHRT",
  headline: "204 von 630 Abgeordneten",
  subheadline:
    "haben eine Funktion bei einer eingetragenen Interessenvertretung.",
  // 204, not the 211 rows the pipeline joins: seven of those members declare no function at all,
  // only a payment or paid work ("Einnahmen im Jahr 2025", "Arbeiter"). Counting them here would
  // contradict this slide's own caveat, which says "keine Zahlung".
  caveat:
    "Eigenangaben der Abgeordneten zu Nebentätigkeiten, verknüpft mit dem Lobbyregister. Kein Treffen, keine Zahlung — eine Funktion, etwa im Vorstand oder Kuratorium.",

  mandateHeader: "ORGANISATIONEN MIT DEN MEISTEN MANDATSTRÄGERN",
  mandateOrgs: [
    { label: "Wirtschaftsforum der SPD e.V.", mdb: 35 },
    { label: "Bundesstiftung Magnus Hirschfeld", mdb: 13 },
    {
      label: "Deutsche Gesellschaft für Internationale Zusammenarbeit (GIZ)",
      mdb: 13,
    },
    { label: "Deutsche Stiftung Weltbevölkerung (DSW)", mdb: 11 },
    { label: "Sparkassenverband Bayern", mdb: 10 },
    { label: "Gesellschaft zum Studium strukturpolitischer Fragen e.V.", mdb: 10 },
    { label: "Stiftung Lesen", mdb: 9 },
    { label: "Deutsche Energie-Agentur (dena)", mdb: 8 },
  ],

  donorHeader: "SPENDER, DIE AUCH LOBBYREGISTER-EINTRÄGE SIND",
  // Rule, applied without exception: every organisation the pipeline matches from a published
  // large donation to a Lobbyregister entry that is STILL ACTIVE, ranked by total donated.
  // Two matches are excluded by that rule because their register entry has ended — Viessmann
  // Generations Group (555.000 €) and Aquila Capital Holding (292.000 €). The header is present
  // tense, so a lapsed entry does not belong under it; dropping only one of them, or keeping
  // both unmarked, is what would be indefensible.
  donorLobby: [
    {
      label: "Deutsche Vermögensberatung (DVAG)",
      parties: ["CDU/CSU", "SPD", "Grüne", "FDP"] as PartyKey[],
      donation: 2_270_005,
      lobbyBudget: "490.001 – 500.000 €",
    },
    {
      label: "Bitpanda GmbH",
      parties: ["CDU/CSU", "SPD", "FDP"] as PartyKey[],
      donation: 1_750_000,
      lobbyBudget: "80.001 – 90.000 €",
    },
    {
      label: "Campact e.V.",
      parties: ["SPD", "Grüne", "Linke"] as PartyKey[],
      donation: 1_081_338,
      lobbyBudget: "6.420.001 – 6.430.000 €",
    },
    {
      label: "Hagedorn Management GmbH",
      parties: ["CDU/CSU", "FDP"] as PartyKey[],
      donation: 200_000,
      lobbyBudget: "20.001 – 30.000 €",
    },
    {
      label: "Verband der Chemischen Industrie e.V.",
      parties: ["CDU/CSU", "SPD"] as PartyKey[],
      donation: 200_000,
      lobbyBudget: "9.430.001 – 9.440.000 €",
    },
    {
      label: "Coroplast Fritz Müller GmbH & Co. KG",
      parties: ["CDU/CSU", "FDP"] as PartyKey[],
      donation: 155_000,
      lobbyBudget: "0 €",
    },
    {
      label: "TRUMPF SE + Co. KG",
      parties: ["CDU/CSU"] as PartyKey[],
      donation: 150_000,
      lobbyBudget: "220.001 – 230.000 €",
    },
    {
      label: "Schön Klinik SE",
      parties: ["CDU/CSU"] as PartyKey[],
      donation: 75_000,
      lobbyBudget: "110.001 – 120.000 €",
    },
  ],
  donorNote:
    "Eintrag im Lobbyregister heißt nicht, dass Ausgaben gemeldet werden — manche Eintragungen melden 0 €.",

  footer: {
    label: "Lobbyverflechtungen im Bundestag",
    stand: STAND,
    source:
      "Quelle: bundestag.de (Nebentätigkeiten, Großspenden) · lobbyregister.bundestag.de",
  },
};
