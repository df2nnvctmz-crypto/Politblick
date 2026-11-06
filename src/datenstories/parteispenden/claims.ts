// No imports here on purpose: scripts/verify-datenstories.mjs loads this file straight into Node,
// which cannot resolve the extensionless imports the app files use.

/**
 * Claims the text of "Wer finanziert die Parteien?" (story.ts) makes that live numbers could break.
 * scripts/verify-datenstories.mjs re-checks each one from the raw donation list.
 *
 * kind:
 *  - fewDonors: "hängt an wenigen Spendern" holds only while the party has at most `max` donors.
 *  - manyDonors: and the contrast party must still have at least `min`.
 *  - top3AtLeast: the headline share of the three biggest donors must still be at least `min`.
 *  - bitpandaOneDay: all Bitpanda donations still carry one and the same date.
 *  - bitpandaRatio: "mehr als das 20-Fache" holds while donations / lobby budget midpoint >= min.
 */
export const claims = [
  { id: 'bsw-few', says: 'Überschrift: wenige Spender beim BSW', kind: 'fewDonors', party: 'BSW', max: 8 },
  { id: 'linke-few', says: 'Überschrift: wenige Spender bei der Linken', kind: 'fewDonors', party: 'Linke', max: 5 },
  { id: 'cdu-many', says: 'Überschrift: die CDU/CSU hat viele Spender', kind: 'manyDonors', party: 'CDU/CSU', min: 50 },
  { id: 'bsw-top3', says: 'Abschnitt 1: „fast alles von drei Spendern“ beim BSW', kind: 'top3AtLeast', party: 'BSW', min: 0.9 },
  { id: 'bitpanda-day', says: 'Abschnitt 2: Bitpanda spendete „an einem Tag“', kind: 'bitpandaOneDay' },
  { id: 'bitpanda-ratio', says: 'Abschnitt 2: „mehr als das 20-Fache des eigenen Lobbybudgets“', kind: 'bitpandaRatio', min: 20 },
] as const;
