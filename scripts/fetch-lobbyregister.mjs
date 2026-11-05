#!/usr/bin/env node
// Fetches the full public Lobbyregister of the Deutscher Bundestag (~6,900 registered interest
// representatives) and writes a slimmed-down snapshot to public/data/lobby-orgs.json.
//
// The register is cursor-paginated at a fixed 50 entries per page, so a full crawl is ~140
// requests and takes about two and a half minutes at the pacing below. The raw payload is
// ~100 MB; almost all of that is prose we don't render (activity descriptions, statement
// texts, contact details), so only the fields the site actually joins on or displays are kept.
//
// This runs weekly — the register changes slowly, and the derived links are rebuilt separately
// by build-lobby-links.mjs, which needs no network at all.
import {
  fetchLobbyPage,
  makePacer,
  normalizeRegisterText,
  resolveLobbyApiKey,
  writeMetaFile,
  writeSourceFile,
} from './lib/common.mjs';

const pace = makePacer(400);

/**
 * A person's declared government or Bundestag function from the last five years, which the
 * register requires for every lobbyist ("Angaben zu Funktionen in Bundestag und Bundesregierung").
 * Kept structured, not as a sentence, so the UI can word it per language. These are the entry's
 * own statements; the register does not check them.
 */
function governmentFunction(p) {
  const g = p?.recentGovernmentFunction;
  if (!p?.recentGovernmentFunctionPresent || !g) return null;
  const base = { kind: g.type?.code ?? null, ended: g.ended !== false, endDate: g.endDate ?? null };
  if (g.houseOfRepresentatives) {
    return { ...base, role: g.houseOfRepresentatives.function?.code ?? null, position: g.houseOfRepresentatives.functionPosition?.trim() || null, authority: null };
  }
  if (g.federalGovernment) {
    const d = g.federalGovernment.department;
    return { ...base, role: g.federalGovernment.function?.code ?? null, position: null, authority: d?.shortTitle || d?.title || null };
  }
  if (g.federalAdministration) {
    const a = g.federalAdministration;
    return { ...base, role: null, position: a.function?.trim() || null, authority: a.supremeFederalAuthorityShort || a.supremeFederalAuthority || null };
  }
  return { ...base, role: null, position: null, authority: null };
}

const personName = (p) => [p.academicDegreeBefore, p.firstName, p.lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

/** Only the people with a declared government/Bundestag function — the rest are not shown. */
function formerOfficials(people) {
  const out = new Map();
  for (const p of people) {
    const gov = governmentFunction(p);
    if (gov && !out.has(personName(p))) out.set(personName(p), { name: personName(p), gov });
  }
  return [...out.values()];
}

/**
 * Keeps the register entry fields the site joins on or shows. Notably `regulatoryProjects` is
 * reduced to the printed matters (the Drucksache join key) plus the org's own headline demand,
 * which is the only place the register states what it actually wanted.
 */
function transformLobbyEntry(raw) {
  const identity = raw.lobbyistIdentity ?? {};
  const projects = raw.regulatoryProjects?.regulatoryProjects ?? [];

  const lobbiedProjects = [];
  for (const p of projects) {
    const printingNumbers = (p.printedMatters ?? []).map((m) => m.printingNumber).filter(Boolean);
    if (printingNumbers.length === 0) continue;
    lobbiedProjects.push({
      number: p.regulatoryProjectNumber,
      // The org's own headline for what it wanted. Shown verbatim — we never infer a
      // for/against stance from it (see data/lobby-positions.json for the curated stances).
      demand: p.title ?? null,
      printingNumbers,
      laws: (p.affectedLaws ?? []).map((l) => l.shortTitle || l.title).filter(Boolean),
    });
  }

  return {
    id: raw.registerNumber,
    name: identity.name ?? null,
    legalForm: identity.legalFormType?.de ?? null,
    city: identity.address?.city ?? null,
    // ISO 3166 code of the registered seat ("DE", "AT", "US", …). This is the address the entry
    // gives, not the nationality of an owner: a German subsidiary of a foreign group is "DE".
    country: identity.address?.country?.code ?? null,
    website: identity.contactDetails?.websites?.[0]?.website ?? null,
    url: raw.registerEntryDetails?.detailsPageUrl ?? null,
    active: raw.accountDetails?.activeLobbyist !== false,
    // The register's own classification of what kind of interest representative this is
    // (Unternehmen, Verband, gemeinnützige Organisation, Beratungsunternehmen, Wissenschaft,
    // Privatperson, …) — lets the UI filter by actor type without us inventing a taxonomy.
    actorType: raw.activitiesAndInterests?.activity?.de ?? null,
    // The org's own free-text account of its lobbying activity ("Beschreibung der Tätigkeit" in
    // the Lobbyregister UI) — shown verbatim, never summarised or interpreted.
    description: normalizeRegisterText(raw.activitiesAndInterests?.activityDescription),
    fieldsOfInterest: (raw.activitiesAndInterests?.fieldsOfInterest ?? []).map((f) => f.de).filter(Boolean),
    // Declared annual lobbying expenditure, reported by the register as a bracket.
    expensesEuro: raw.financialExpenses?.financialExpensesEuro ?? null,
    staffFte: raw.employeesInvolvedInLobbying?.employeeFTE ?? null,
    donors: (raw.donators?.donators ?? []).map((d) => ({
      name: d.name,
      euro: d.donationEuro ?? null,
    })),
    lobbiedProjects,
    formerOfficials: formerOfficials([...(identity.legalRepresentatives ?? []), ...(identity.entrustedPersons ?? [])]),
    // Lobbying on behalf of others ("Auftragsangaben"): who an agency works for and for how much,
    // or which agencies an organisation hired. Client persons are left out — they are private
    // individuals, and the register only names them because they pay for lobbying.
    contracts: (raw.contracts?.contracts ?? []).map((c) => ({
      projects: (c.regulatoryProjects ?? []).map((p) => p.regulatoryProjectTitle).filter(Boolean),
      clients: (c.clients?.clientOrganizations ?? []).map((o) => ({
        id: o.referenceRegisterNumber ?? null,
        name: normalizeRegisterText(o.referenceName) ?? '',
        euro: o.financialResourcesReceived ? { from: o.financialResourcesReceived.from, to: o.financialResourcesReceived.to } : null,
      })),
      clientPersonCount: (c.clients?.clientPersons ?? []).length,
      agencies: (c.contractors?.contractorOrganizations ?? []).map((o) => ({ id: o.referenceRegisterNumber ?? null, name: normalizeRegisterText(o.referenceName ?? o.name) ?? '' })),
      formerOfficials: formerOfficials([...(c.contractors?.entrustedPersons ?? []), ...(c.contractors?.contractorPersons ?? [])]),
    })),
  };
}

async function main() {
  console.log('Resolving Lobbyregister API key…');
  const apiKey = await resolveLobbyApiKey();

  console.log('Crawling register entries…');
  const entries = [];
  let cursor = null;
  let pages = 0;
  let total = null;
  for (;;) {
    await pace();
    const page = await fetchLobbyPage(apiKey, cursor);
    entries.push(...page.results);
    pages++;
    total ??= page.totalResultCount;
    if (pages % 25 === 0) console.log(`  ${entries.length}/${total ?? '?'}…`);
    // The API signals exhaustion by omitting the cursor on the last page (it used to return an
    // unchanged one). A missing cursor must stop the crawl: passing it on means "no cursor",
    // which restarts at page 1 and loops until the heap runs out.
    if (!page.results.length || !page.cursor || page.cursor === cursor) break;
    if (total != null && entries.length >= total) break;
    cursor = page.cursor;
  }
  console.log(`  ${entries.length} entries in ${pages} pages`);

  if (total != null && entries.length < total * 0.9) {
    throw new Error(`Crawl looks truncated: got ${entries.length} of ${total} entries — refusing to overwrite the snapshot.`);
  }

  const orgs = entries.map(transformLobbyEntry).filter((o) => o.name);
  orgs.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const withProjects = orgs.filter((o) => o.lobbiedProjects.length > 0).length;
  console.log(`  ${withProjects} orgs declare lobbying on at least one identifiable Drucksache`);

  // Written to data/ rather than public/data/: at ~5 MB this is derive input, not something
  // the browser should ever download. build-lobby-links.mjs turns it into the slim
  // public/data/lobby-links.json that the site actually loads.
  await writeSourceFile('lobby-register.json', orgs);

  await writeMetaFile({
    lobbyRegisterGeneratedAt: new Date().toISOString(),
    lobbyRegisterEntryCount: orgs.length,
  });

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
