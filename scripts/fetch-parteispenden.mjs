#!/usr/bin/env node
// Scrapes the Bundestag President's publication of large party donations (§ 25 Abs. 3 PartG:
// single donations above 35.000 € since 5 March 2024, above 50.000 € before that) into
// public/data/party-donations.json.
//
// There is no JSON/CSV feed for this — it is published as one HTML table per year, a few dozen
// rows each, so scraping is the only option. It's cheap: one request for the year index plus
// one per year fetched.
//
// Data minimisation: the source prints each donor's full postal address. Only the name and
// city are kept here — enough to identify a corporate donor and to join it to the
// Lobbyregister, without republishing private individuals' street addresses.
import { canonicalPartyName, makePacer, writeJsonFile, writeMetaFile } from './lib/common.mjs';

const INDEX_URL = 'https://www.bundestag.de/parlament/praesidium/parteienfinanzierung/fundstellen50000';
const BASE = 'https://www.bundestag.de';
/** How many years back to keep. The current term is what the site shows; older years bloat the payload. */
const YEARS_TO_KEEP = 4;

const pace = makePacer(1000);

/**
 * Exact, case-insensitive party-label → fraction pairs, confirmed by hand. This is deliberately
 * NOT a fuzzy/regex match: canonicalPartyName()'s old "any label containing BÜNDNIS is Grüne"
 * rule once also matched BSW's own registered name ("Bündnis Sahra Wagenknecht — Vernunft und
 * Gerechtigkeit"), silently folding ~€6.4M of BSW donations into Grüne's totals for months. A
 * label not in this list fails the whole fetch (see fractionFor()) instead of guessing — add the
 * new label here, deliberately, once you've confirmed the right fraction.
 */
const KNOWN_PARTY_LABELS = new Map([
  ['cdu', 'CDU/CSU'],
  ['csu', 'CDU/CSU'],
  ['spd', 'SPD'],
  ['bündnis 90 / die grünen', 'Grüne'],
  ['bündnis 90/ die grünen', 'Grüne'],
  ['fdp', 'FDP'],
  ['afd', 'AfD'],
  ['die linke', 'Linke'],
  ['bsw', 'BSW'],
  ['bündnis sahra wagenknecht -vernunft und gerechtigkeit', 'BSW'],
  ['freie wähler', 'Freie Wähler'],
  ['volt deutschland', 'Volt'],
  ['volt deutschland partei', 'Volt'],
  ['ssw', 'SSW'],
  ['mlpd', 'MLPD'],
  ['werteunion', 'WerteUnion'],
  ['die gerechtigkeitspartei - team todenhöfer', 'Die Gerechtigkeitspartei - Team Todenhöfer'],
  ['dkp', 'DKP'],
]);

function fractionFor(partyLabel) {
  const label = partyLabel.trim();
  const known = KNOWN_PARTY_LABELS.get(label.toLowerCase());
  if (known) return known;
  // Never let a regex guess decide silently — that's exactly how this bug happened. Fail loud
  // and name the guess, so whoever's running the fetch adds a deliberate, reviewed entry above.
  const guess = canonicalPartyName(label);
  throw new Error(
    `Unrecognised donor party label "${partyLabel}" (fuzzy guess: "${guess}"). ` +
      'Add it to KNOWN_PARTY_LABELS in scripts/fetch-parteispenden.mjs after confirming the correct fraction by hand.',
  );
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'politblick-bot' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function cellText(html) {
  return (
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      // Soft hyphens are used liberally in the source for column-width control, often with
      // newlines around them ("Deutsch\n&shy;land"). They must be removed together with the
      // adjacent whitespace, or collapsing whitespace later leaves "Deutsch land".
      .replace(/\s*(?:&shy;|­)\s*/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** "38.150 Euro" / "1.015.767,12 Euro" -> 38150 / 1015767.12 */
function parseEuro(text) {
  const m = text.replace(/\./g, '').match(/(\d+)(?:,(\d{1,2}))?/);
  if (!m) return null;
  return Number(`${m[1]}.${m[2] ?? '0'}`);
}

/** "27.07.2026" -> "2026-07-27" (ISO, so it sorts and compares like the rest of the snapshot). */
function parseGermanDate(text) {
  const m = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * The donor cell is `Name<br />Street<br />ZIP City`. Splitting on <br /> is what separates
 * the donor's name from their address — after tag-stripping they'd be indistinguishable.
 */
function parseDonor(cellHtml) {
  const lines = cellHtml
    .split(/<br\s*\/?>/i)
    .map(cellText)
    .filter(Boolean);
  const name = lines[0] ?? null;
  const last = lines.length > 1 ? lines[lines.length - 1] : '';
  const city = last.replace(/^\d{4,5}\s*/, '').trim() || null;
  return { name, city };
}

function parseYearPage(html, year) {
  const table = html.match(/<table[\s\S]*?<\/table>/);
  if (!table) return [];
  const rows = table[0].match(/<tr[\s\S]*?<\/tr>/g) ?? [];
  const donations = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    // Month sub-headings are single-cell <th> rows; the header row is <th> too. Skip both.
    if (cells.length < 5) continue;
    const partyLabel = cellText(cells[0]);
    const amount = parseEuro(cellText(cells[1]));
    if (!partyLabel || amount === null) continue;
    const donor = parseDonor(cells[2]);
    donations.push({
      year,
      party: partyLabel,
      fraction: fractionFor(partyLabel),
      amountEuro: amount,
      donor: donor.name,
      donorCity: donor.city,
      receivedOn: parseGermanDate(cellText(cells[3])),
      publishedOn: parseGermanDate(cellText(cells[4])),
    });
  }
  return donations;
}

async function main() {
  console.log('Fetching year index…');
  const index = await fetchText(INDEX_URL);
  const years = [
    ...new Set(
      [...index.matchAll(/href="([^"]*\/fundstellen50000\/(\d{4}))"/g)].map((m) => m[2]),
    ),
  ]
    .map(Number)
    .sort((a, b) => b - a)
    .slice(0, YEARS_TO_KEEP);
  console.log(`  keeping years: ${years.join(', ')}`);

  const donations = [];
  for (const year of years) {
    await pace();
    const html = await fetchText(`${BASE}/parlament/praesidium/parteienfinanzierung/fundstellen50000/${year}`);
    const rows = parseYearPage(html, year);
    console.log(`  ${year}: ${rows.length} donations`);
    if (rows.length === 0) {
      console.warn(`  WARNING: no rows parsed for ${year} — the page layout may have changed.`);
    }
    donations.push(...rows);
  }

  if (donations.length === 0) {
    throw new Error('Parsed zero donations across all years — refusing to overwrite the snapshot.');
  }

  donations.sort((a, b) => (b.publishedOn ?? '').localeCompare(a.publishedOn ?? ''));
  console.log(`  ${donations.length} donations total`);

  await writeJsonFile('party-donations.json', donations);
  await writeMetaFile({
    partyDonationsGeneratedAt: new Date().toISOString(),
    partyDonationsYears: years,
  });

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
