// No imports here on purpose: scripts/verify-datenstories.mjs loads this file straight into Node,
// which cannot resolve the extensionless imports the app files use.

/**
 * Claims the text of "Mieteinnahmen im Bundestag" (story.ts) makes that live numbers could break.
 * scripts/verify-datenstories.mjs re-checks each one from the raw side-job list.
 *
 * kind:
 *  - topLandlord: "meldet die höchste Summe" holds only while `name` is still first by yearly rental income.
 *  - tenantsAtLeast: the headline number of tenancies must still be at least `min`.
 *  - singleTenantPlace: "ein einziges Mietverhältnis" holds while `place` has exactly one tenancy for `name`.
 */
export const claims = [
  { id: 'top-landlord', says: 'Abschnitt 1: „meldet die höchste Summe“', kind: 'topLandlord', name: 'Sebastian Maack' },
  { id: 'many-tenants', says: 'Titel und Abschnitt 2: Dutzende Mietverhältnisse', kind: 'tenantsAtLeast', name: 'Sebastian Maack', min: 50 },
  { id: 'single-tenant', says: 'Abschnitt 2: „ein einziges Mietverhältnis“ im Ausland', kind: 'singleTenantPlace', name: 'Sebastian Maack', place: 'Schruns/Tschagguns' },
] as const;
