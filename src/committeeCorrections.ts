import type { CommitteeMembership } from './committees';

/**
 * Corrections to abgeordnetenwatch's committee roles, applied on every snapshot load (the daily
 * data workflow regenerates public/data/committees.json, so fixing the JSON by hand would not
 * stick).
 *
 * Background: in the 21st Bundestag the AfD's candidates failed to be elected chair of six
 * committees (Haushalt, Finanzen, Inneres, Recht, Arbeit und Soziales, Petitionen). Those
 * committees have no elected chair; they were first led by their longest-serving member, then on
 * an acting basis. abgeordnetenwatch still lists a "chairperson" for each, and for the
 * Finanzausschuss that is demonstrably wrong: Olav Gutting only led the constituent session in
 * May 2025 as longest-serving member, while bundestag.de calls Christian Görke (Die Linke) "der
 * amtierende Vorsitzende des Finanzausschusses" (committee page, photo caption of 6 May 2026).
 *
 * So: where the acting chair is verified, they get "acting_chairperson"; everyone else listed as
 * "chairperson" in these six committees is shown as a plain member until verified — no title
 * beats a wrong title on a page that makes claims about named people.
 */
const COMMITTEES_WITHOUT_ELECTED_CHAIR = new Set([
  6089, // Haushaltsausschuss
  6113, // Finanzausschuss
  6090, // Innenausschuss
  6099, // Ausschuss für Recht und Verbraucherschutz
  6081, // Ausschuss für Arbeit und Soziales
  6096, // Petitionsausschuss
]);

/** committeeId → mandateId of the acting chair, only where bundestag.de confirms it. */
const VERIFIED_ACTING_CHAIRS: Record<number, number> = {
  6113: 68564, // Christian Görke (Die Linke), Finanzausschuss
};

export function correctCommitteeRoles(memberships: CommitteeMembership[]): CommitteeMembership[] {
  return memberships.map((m) => {
    if (!COMMITTEES_WITHOUT_ELECTED_CHAIR.has(m.committeeId)) return m;
    if (VERIFIED_ACTING_CHAIRS[m.committeeId] === m.mandateId) return { ...m, role: 'acting_chairperson' };
    if (m.role === 'chairperson') return { ...m, role: 'member' };
    return m;
  });
}
