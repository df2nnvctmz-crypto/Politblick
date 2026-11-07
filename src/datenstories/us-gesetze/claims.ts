// No imports here on purpose: scripts/verify-datenstories.mjs loads this file straight into Node,
// which cannot resolve the extensionless imports the app files use.

/**
 * Claims the text of the "Gesetze" story (story.ts) makes that live data could break
 * (see scripts/verify-datenstories.mjs).
 *  - usEntries: frozen sentences naming register entries as US actors.
 *  - votesHaveUs: the headline names these votes; each must still show US lobbyists.
 *  - stanceOnVote: a sentence that names a direction for an org on a vote; the org must still lobby
 *    on that vote as a US entry, and the curated sugar-levy camp must still say the same.
 */
export const claims = [
  {
    id: 'headline-votes',
    says: 'Abschnitt 1: „Zuckerabgabe, Heizungsgesetz, CO₂-Preis: hier lobbyierten US-Konzerne mit“',
    kind: 'votesHaveUs',
    pollIds: [6601, 6605, 6733],
  },
  {
    id: 'levy-us-actors',
    says: 'Zuckerabgabe: „Coca-Cola und das Consumer Choice Center sind dagegen, PepsiCo will die Steuer mitgestalten. Bristol-Myers Squibb nennt die Abgabe nur nebenbei begrüßenswert …“',
    kind: 'usEntries',
    ids: ['R001689', 'R007925', 'R000073', 'R000931'],
  },
  { id: 'gkv-coca-cola', says: 'Überschrift, Lede und Abstimmungen: „Coca-Cola dagegen“ bei der Zuckerabgabe', kind: 'stanceOnVote', pollId: 6601, orgId: 'R001689', camp: 'against' },
  { id: 'carrier-intervet', says: 'Abstimmungen: „Viessmann gehört seit 2024 zum US-Konzern Carrier, Intervet ist die Tiersparte von MSD.“', kind: 'usEntries', ids: ['R002670', 'R002408'] },
] as const;
