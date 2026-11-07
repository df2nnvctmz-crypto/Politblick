/**
 * Builder of the Datenstory researched for r/mediasres in October 2026:
 *   mieteinnahmen — who reports rental income in the side-job disclosures, and the places behind it
 *
 * Same rules as build-datenstories.mjs: no prose here, only numbers, ids and labels that are data. The
 * hand-written text lives in src/datenstories/<slug>/story.ts. The helpers (org page paths, curated
 * file reader, rounding) are passed in by build-datenstories.mjs so this module has no circular import.
 */
import { REAL_PARTY_COLORS, FALLBACK_PARTY_COLOR, slugify } from './common.mjs';

const PAID = 'Vergütete Tätigkeit neben dem Mandat';
const annualOf = (j) => (j.interval === 'monthly' ? 12 : 1) * (j.income ?? 0);
const byMandateId = (ctx) => new Map(ctx.roster.members.map((m) => [String(m.mandateId), m]));
/** /abgeordnete/<id>-<name-slug>, the exact form the app and build-sitemap.mjs use. */
const mpPathOf = (m) => `/abgeordnete/${m.id}-${slugify(m.name)}`;
const partyColor = (p) => REAL_PARTY_COLORS[p] ?? FALLBACK_PARTY_COLOR;

// ---- mieteinnahmen -----------------------------------------------------------------------------------

export async function buildMieteinnahmen(ctx, h) {
  const programme = await h.readCurated('mieteinnahmen/programm.json');
  const byMandate = byMandateId(ctx);
  const landlords = [];
  for (const [mandateId, list] of Object.entries(ctx.sidejobs)) {
    const m = byMandate.get(mandateId);
    if (!m) continue;
    // A rental entry is a paid side activity whose title says "Vermietung" and that carries an amount.
    const rows = list.filter((j) => j.categoryLabel === PAID && j.income > 0 && /vermietung/i.test(j.title ?? ''));
    if (!rows.length) continue;
    const places = new Map();
    for (const j of rows) {
      const place = j.title.match(/Mieter\s+\d+,\s*(.+)$/)?.[1].trim() ?? 'ohne Ortsangabe';
      const p = places.get(place) ?? { place, note: programme.placeNotes[place] ?? null, tenants: 0, sumEuro: 0, amounts: [] };
      const a = h.roundEuro(annualOf(j));
      p.tenants++;
      p.sumEuro += a;
      p.amounts.push(a);
      places.set(place, p);
    }
    landlords.push({
      name: m.name,
      party: m.party,
      color: partyColor(m.party),
      mandateId: m.mandateId,
      mpPath: mpPathOf(m),
      profileUrl: m.profileUrl,
      constituency: m.constituency ?? null,
      annualEuro: h.roundEuro(rows.reduce((s, j) => s + annualOf(j), 0)),
      tenantCount: rows.length,
      monthlyBased: rows.some((j) => j.interval === 'monthly'),
      places: [...places.values()]
        .map((p) => ({ ...p, sumEuro: h.roundEuro(p.sumEuro), amounts: p.amounts.sort((a, b) => b - a) }))
        .sort((a, b) => b.sumEuro - a.sumEuro || a.place.localeCompare(b.place, 'de')),
    });
  }
  landlords.sort((a, b) => b.annualEuro - a.annualEuro || a.name.localeCompare(b.name, 'de'));
  return {
    slug: 'mieteinnahmen',
    generatedAt: ctx.meta.sidejobsGeneratedAt ?? null,
    curatedCheckedOn: programme.checkedOn,
    memberCount: ctx.roster.members.length,
    landlords,
    programme: {
      party: programme.party,
      programme: programme.partyProgramme,
      page: programme.page,
      quote: programme.quote,
      sourceLabel: programme.sourceLabel,
      sourceUrl: programme.sourceUrl,
      checkedOn: programme.checkedOn,
    },
    orgPaths: [],
  };
}
