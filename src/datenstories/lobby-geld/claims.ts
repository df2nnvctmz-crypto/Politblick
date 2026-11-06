// No imports here on purpose: scripts/verify-datenstories.mjs loads this file straight into Node,
// which cannot resolve the extensionless imports the app files use.

/**
 * Claims the text of "Lobby und Spenden" (story.ts) makes that live numbers could break.
 * scripts/verify-datenstories.mjs re-checks each one on every data update, from the raw snapshots.
 *
 * kind:
 *  - ratioAtLeast: "ein Vielfaches" holds only while yearly lobby spending is at least `min` times
 *    the donations published since the first year.
 *  - topType: the section says this actor type reports the most; it must still be the largest.
 */
export const claims = [
  { id: 'vielfaches', says: 'Überschrift und Lede: Lobbyausgaben eines Jahres sind „ein Vielfaches“ der Großspenden seit {donSince}', kind: 'ratioAtLeast', min: 5 },
  { id: 'unternehmen-vorn', says: 'Abschnitt 1: „Unternehmen melden den größten Anteil“', kind: 'topType', label: 'Unternehmen' },
] as const;
