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
  readJsonFile,
  resolveLobbyApiKey,
  writeJsonFile,
  writeSourceFile,
} from './lib/common.mjs';

const pace = makePacer(400);

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
    website: identity.contactDetails?.websites?.[0]?.website ?? null,
    url: raw.registerEntryDetails?.detailsPageUrl ?? null,
    active: raw.accountDetails?.activeLobbyist !== false,
    // The register's own classification of what kind of interest representative this is
    // (Unternehmen, Verband, gemeinnützige Organisation, Beratungsunternehmen, Wissenschaft,
    // Privatperson, …) — lets the UI filter by actor type without us inventing a taxonomy.
    actorType: raw.activitiesAndInterests?.activity?.de ?? null,
    fieldsOfInterest: (raw.activitiesAndInterests?.fieldsOfInterest ?? []).map((f) => f.de).filter(Boolean),
    // Declared annual lobbying expenditure, reported by the register as a bracket.
    expensesEuro: raw.financialExpenses?.financialExpensesEuro ?? null,
    staffFte: raw.employeesInvolvedInLobbying?.employeeFTE ?? null,
    donors: (raw.donators?.donators ?? []).map((d) => ({
      name: d.name,
      euro: d.donationEuro ?? null,
    })),
    lobbiedProjects,
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
    // The API signals exhaustion by returning an unchanged cursor.
    if (!page.results.length || page.cursor === cursor) break;
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

  const meta = await readJsonFile('meta.json', {});
  await writeJsonFile('meta.json', {
    ...meta,
    lobbyRegisterGeneratedAt: new Date().toISOString(),
    lobbyRegisterEntryCount: orgs.length,
  });

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
