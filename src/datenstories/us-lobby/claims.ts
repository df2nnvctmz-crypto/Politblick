// No imports here on purpose: scripts/verify-datenstories.mjs loads this file straight into Node,
// which cannot resolve the extensionless imports the app files use.

/**
 * Claims the text of "US-Lobby in Berlin" (story.ts) makes that a live number could break.
 * scripts/verify-datenstories.mjs re-checks each one on every data update, from the raw snapshots
 * (it does not reuse slots()).
 *
 * kind:
 *  - justBelowRound: "Fast 50 Mio." is only honest while the total sits just below the round
 *    figure it is rounded to (within maxGap).
 *  - fractionWord: the headline's "ein Sechstel" is picked live; fail if the share is no longer
 *    close to any plain fraction, warn when the word differs from the one the research (and the
 *    Reddit slides) used.
 *  - officialNamed: a sentence that says the register names a person for a US entry; the person
 *    must still be listed there as a former office holder.
 */
export const claims = [
  { id: 'fast-total', says: 'Überschrift: „Fast {totalMioRounded} Mio. € im Jahr“', kind: 'justBelowRound', metric: 'usTotalEuro', unit: 1e6, maxGap: 0.05 },
  { id: 'visible-fraction', says: 'Überschrift: „nur {visibleFraction} davon ist als USA erkennbar“', kind: 'fractionWord', metric: 'usVisibleShare', maxRelError: 0.12, researchWord: 'ein Sechstel' },
  { id: 'buechner-mars', says: 'Drehtür: „Gestern Vize-Regierungssprecher, heute Lobbyarbeit u. a. für Mars“', kind: 'officialNamed', name: 'Wolfgang Büchner', usId: 'R003198' },
] as const;
