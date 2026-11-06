// No imports here on purpose: scripts/verify-datenstories.mjs loads this file straight into Node,
// which cannot resolve the extensionless imports the app files use.

/**
 * Short label and one line of "what the law is about" per vote (frozen editorial text); votes
 * without a note show their plain title.
 *
 * stanceTopic: the subject a curated stance on this vote refers to. The build only attaches a
 * stance to the GKV-Reform (the sugar-levy camps, hand-read from the register); the tag then reads
 * "<stanceTopic>: Coca-Cola dagegen". Nothing else on the site may claim a direction.
 */
export const pollNotes: Record<number, { short: string; context?: string; stanceTopic?: string }> = {
  6601: { short: 'GKV-Reform', context: 'stabilisiert die Krankenkassenbeiträge und kündigt eine Zuckerabgabe ab 2028 an', stanceTopic: 'Zuckerabgabe' },
  6605: { short: 'Gebäudemodernisierungsgesetz', context: 'ersetzt das Heizungsgesetz, die 65-%-Pflicht für erneuerbare Heizungen entfällt' },
  6733: { short: 'CO₂-Preis 2027', context: 'der CO₂-Preis für Sprit, Heizöl und Gas steigt nicht weiter' },
  6715: { short: 'Bluttest auf Trisomien (NIPT): Monitoring', context: 'Kassenzulassung des Bluttests überwachen' },
  6727: { short: 'Bluttest auf Trisomien (NIPT): Änderungsantrag', context: 'bisherigen Umfang der Kassenleistung erhalten' },
  6330: { short: 'Tierarzneimittelgesetz', context: 'EU-Regeln zur Antibiotika-Erfassung bei Tieren' },
};

/** Why an org counts as US when its name doesn't say so (frozen editorial text). */
export const orgNotes: Record<string, string> = {
  R002670: 'Viessmann gehört seit 2024 dem US-Konzern Carrier',
  R001107: 'Illumina verkauft Sequenzierer und Testkits für diese Bluttests',
  R002408: 'Intervet ist die Tiersparte von MSD (Merck & Co.)',
};
