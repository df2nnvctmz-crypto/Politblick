// Parsing and matching rules for public committee hearings (bundestag.de), kept apart from the
// fetch so they can be iterated against cached pages and pinned by tests.
//
// The rule of this file: a hearing page is published for people, not machines, and its layout
// differs by committee. Anything that cannot be read with certainty is kept as the Bundestag's
// own text and marked unmatched — it is never "cleaned up" into a claim. In particular:
//   - an organisation is only linked to a register entry on an exact (normalised) name match;
//   - a statement written by a person is never linked to the institution named next to them,
//     because an expert's affiliation is not the institution speaking;
//   - a hearing is only tied to a vote through a shared Drucksache number, never by topic or title.
import { normalizeOrgName } from './common.mjs';

const MONTHS = {
  januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

export function htmlText(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s*(?:&shy;|­)\s*/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "21/6587" from a dserver.bundestag.de Drucksache PDF link — same encoding extractDrucksachen() reads. */
function drucksachenIn(html) {
  const out = new Set();
  for (const m of String(html || '').matchAll(/dserver\.bundestag\.de\/btd\/(\d+)\/\d+\/(\d+)\.pdf/g)) {
    const number = Number(m[2].slice(m[1].length));
    if (Number.isFinite(number) && number > 0) out.add(`${m[1]}/${number}`);
  }
  return [...out];
}

/** "Dienstag, 8. September 2026" -> "2026-09-08"; null when the text holds no full German date. */
export function parseGermanDate(text) {
  const m = String(text || '').match(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  const day = Number(m[1]);
  if (!month || day < 1 || day > 31) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The sidebar sections ("Stellungnahmen", "Dokumente", …) as raw HTML, keyed by their heading. */
function asideSections(html) {
  const aside = html.match(/<aside class="bt-artikel__aside[\s\S]*?<\/aside>/)?.[0] ?? '';
  const sections = {};
  const parts = aside.split(/<h2 class="bt-artikel__aside-section-title">/).slice(1);
  for (const part of parts) {
    const end = part.indexOf('</h2>');
    if (end < 0) continue;
    sections[htmlText(part.slice(0, end))] = part.slice(end + 5);
  }
  return sections;
}

function links(html) {
  return [...String(html || '').matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: m[1],
    label: htmlText(m[2]).replace(/\((?:Dokument|Externer Link|Link)[^)]*\)/gi, '').trim(),
  }));
}

/** The paragraph right after the "Zeit: … Ort: …" block — the write-up's lead. Empty when the page has no such block. */
function leadParagraph(html) {
  const ort = html.search(/<strong>\s*Ort:\s*<\/strong>/);
  if (ort < 0) return '';
  const rest = html.slice(ort);
  const close = rest.indexOf('</p>');
  if (close < 0) return '';
  return rest.slice(close + 4).match(/^\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? '';
}

function absolute(href) {
  if (/^https?:\/\//.test(href)) return href;
  return `https://www.bundestag.de${href.startsWith('/') ? '' : '/'}${href}`;
}

/**
 * Reads one hearing page. Returns null for a page that is not a hearing article at all.
 *
 * Drucksachen come from three places only: the page's document list ("Dokumente"), the agenda
 * line of an upcoming hearing ("Gegenstand der Sitzung"), and the *first* paragraph of the
 * write-up. The rest of the prose is ignored — it cites older laws and neighbouring bills that
 * were not what the hearing was about.
 *
 * The first paragraph is trusted because it is where the Bundestag's editors state the subject
 * ("Der Entwurf der Bundesregierung für ein Tariftreuegesetz (21/1941) ist bei einer Anhörung …"),
 * and because that was checked: on every page of the 2026-10 crawl that carries both a document
 * list and a Drucksache in its first paragraph (49 pages), the first paragraph's numbers were a
 * subset of the document list. About 50 hearings — the Arbeit-und-Soziales, Recht and Verkehr
 * committees publish no document list at all — would otherwise have no Drucksache.
 */
export function parseHearingPage(html, url) {
  const title = htmlText(html.match(/<h1 class="bt-artikel__title">([\s\S]*?)<\/h1>/)?.[1] ?? '');
  if (!title) return null;
  const id = url.match(/\/(\d+)-\1(?:$|[?#])/)?.[1] ?? url.match(/\/(\d+)-\d+/)?.[1] ?? null;
  const crumbs = [...html.matchAll(/<li aria-current="false"[^>]*><a[^>]*>([\s\S]*?)<\/a><\/li>/g)].map((m) => htmlText(m[1]));
  const committee = crumbs[2] ?? null; // Startseite › Ausschüsse › <committee>

  const timeBlock = html.match(/<strong>\s*Zeit:\s*<\/strong>([\s\S]*?)<br/)?.[1] ?? '';
  const date = parseGermanDate(htmlText(timeBlock));

  const sections = asideSections(html);
  const subjectHtml = html.match(/Gegenstand der Sitzung([\s\S]*?)(?:<h2|<aside|Hinweis zur Anmeldung)/)?.[1] ?? '';
  const lead = leadParagraph(html);
  const drucksachen = [...new Set([...drucksachenIn(sections['Dokumente']), ...drucksachenIn(subjectHtml), ...drucksachenIn(lead)])];
  // Committees also list ordinary public sittings (a minister's Q&A, a petition) in the same
  // feed. Only a hearing or expert talk is one where outside bodies are invited to give evidence.
  const isHearing = /Anhörung|Fachgespräch|Sachverständig/i.test(`${title} ${htmlText(lead)}`) || Boolean(sections['Stellungnahmen'] || sections['Sachverständigenliste']);

  const statementLinks = links(sections['Stellungnahmen']).filter((l) => l.label);
  const authors = stripSharedTopic(statementLinks.map((l) => statementAuthor(l.label)));
  const statements = statementLinks.map((l, i) => ({ label: l.label, url: absolute(l.href), number: committeeDocNumber(l.label), author: authors[i] }));

  const expertList = links(sections['Sachverständigenliste'])[0];
  return {
    id,
    url,
    title,
    committee,
    date,
    isHearing,
    drucksachen,
    statements,
    expertListUrl: expertList ? absolute(expertList.href) : null,
  };
}

/** "21(9)333" — the Ausschussdrucksache number a statement was published under, if the label carries one. */
export function committeeDocNumber(label) {
  return String(label).match(/\b(\d{2}\s*\(\s*\d+\s*\)\s*[\w.-]*\d)/)?.[1]?.replace(/\s+/g, '') ?? null;
}

/**
 * Who a statement is by, read off the link text the committee published it under. The formats
 * seen across committees:
 *   "21(9)333 Stellungnahme des BDEW Bundesverband der Energie- und Wasserwirtschaft e.V."
 *   "Schriftliche Stellungnahme - Deutscher Gewerkschaftsbund (DGB)"
 *   "21(11)45 - Prof. Dr. Martin Werding"
 *   "01 - Malmendier, Prof. Dr. Ulrike, University of California, Berkeley"
 *   "21(4)233 A - Stellungnahme Prof. Dr. X - Hochschule Y - Nachrichtendienstrecht - BT-Drucksachen 21/7868"
 *   "Stellungnahme Dr. X (Bitkom e.V.) zur 33. Sitzung am 6. Oktober 2026 (Öffentliche Anhörung) "DIdG""
 * Only wording that is provably not part of a name is removed: the document number, the word
 * "Stellungnahme" with its prefixes and a *lower-case* article ("des", never the "Der" of "Der
 * Paritätische"), a trailing Drucksache reference, and a trailing "zur NN. Sitzung …". The
 * hearing's topic, repeated on every label of one hearing, is removed by stripSharedTopic().
 * Returns null for the bundle PDFs ("Zusammenstellung der Stellungnahmen") — those are not by anyone.
 */
export function statementAuthor(label) {
  let s = String(label || '').replace(/\((?:Dokument|Externer Link|Link|PDF|noch nicht barrierefrei)[^)]*\)/gi, '').trim();
  if (/Zusammenstellung|Gesamtdokument|alle Stellungnahmen/i.test(s)) return null;
  // 21(9)333, 21(11)45.1, 21(13)57c, and the Innenausschuss's lettered "21(4)233 A - …"
  s = s.replace(/^(?:Ausschuss-?drucksache\s+)?\d{2}\s*\(\s*\d+\s*\)\s*[\w.-]*(?:\s+[A-Z](?=\s*[-–]))?\s*/i, '');
  s = s.replace(/^\d{1,3}\s*[-–:.]\s*/, ''); // "01 - "
  s = s.replace(/^[-–:\s]+/, '');
  s = s.replace(/^(?:(?:schriftliche|unaufgeforderte|unangeforderte|ergänzende|gemeinsame|gutachtliche)\s+|anlage\s+zur\s+)*stellungnahmen?\b\s*/i, '');
  // Case-sensitive on purpose: "des BDEW" is grammar, "Der Paritätische" is a name.
  s = s.replace(/^(?:des|der|von|vom)\s+(?:(?:Sachverständigen|Sachverständige)\s+)?/, '');
  s = s.replace(/\s+[-–]\s+BT-Drucksachen?\s+[\d/,\s]+(?:und\s+[\d/,\s]+)*$/i, '');
  s = s.replace(/\s+zur\s+\d+\.\s+Sitzung\s+am\s+.*$/i, '');
  s = s.replace(/\s+[-–]\s+(?:(?:unangeforderte|unaufgeforderte)\s+)?Stellungnahme$/i, '');
  s = s.replace(/\s+[-–]\s+\d{2}\/\d+(?:\s*(?:,|und)\s*\d{2}\/\d+)*$/, ''); // "… - 21/3051"
  s = s.replace(/^[-–:\s]+/, '').replace(/[\s,;–-]+$/, '').trim();
  return s.length >= 3 ? s : null;
}

/**
 * Removes a hearing's topic from its statement authors. Some committees end every label with
 * " - <Thema>" ("… - Deutscher Anwaltverein - Nachrichtendienstrecht"). That segment is not
 * distinguishable from an affiliation by its wording ("… - Hochschule des Bundes"), so it is
 * told apart by how many statements carry it. In the 2026-10 data a topic sat on at least 60% of
 * a hearing's statements (19/19, 8/10, 6/9 …) and a shared affiliation on at most a quarter
 * (ver.di 2/42, Klinikverbund 3/68, Zeppelin Universität 2/12). So a final segment is removed
 * only when at least three statements, and at least half of the hearing's statements, end in it
 * (compared case-insensitively), and only if something of the name is left.
 */
export function stripSharedTopic(authors) {
  const tail = (a) => a?.match(/\s[-–]\s([^-–]+)$/)?.[1]?.trim() ?? null;
  const key = (t) => t.toLowerCase();
  const counts = new Map();
  for (const a of authors) {
    const t = tail(a);
    if (t) counts.set(key(t), (counts.get(key(t)) ?? 0) + 1);
  }
  const needed = Math.max(3, Math.ceil(authors.filter(Boolean).length / 2));
  return authors.map((a) => {
    const t = tail(a);
    if (!t || (counts.get(key(t)) ?? 0) < needed) return a;
    const rest = a.slice(0, a.length - t.length).replace(/\s[-–]\s*$/, '').trim();
    return rest.length >= 3 ? rest : a;
  });
}

/** "Prof. Dr. X", "Dr. X", "Nachname, Vorname" — a statement written by a person rather than an institution. */
export function looksLikePerson(author) {
  const s = String(author || '');
  if (/\b(?:Prof|Dr|Dipl|JProf|PD|RA|LL\.?M)\b\.?/.test(s)) return true;
  // "Söllner, Prof. Dr. Fritz" is caught above; this catches "Symon, Julia - Finance Watch".
  return /^[A-ZÄÖÜ][a-zäöüß-]+,\s+[A-ZÄÖÜ][a-zäöüß-]+(?:\s|$)/.test(s);
}

/**
 * The names a statement author is allowed to match under, strictest first:
 *   1. the author text as published,
 *   2. without one trailing acronym in parentheses — "Deutscher Gewerkschaftsbund (DGB)" —
 *      but only when the parenthetical really is an acronym (upper-case, short), so a
 *      qualifier like "(Landesverband Bayern)" that names a *different* body is never dropped.
 * The city-suffixed form ("…, Berlin") is handled in matchRegisterOrg, where it can be checked
 * against the register's own city.
 */
export function candidateNames(author) {
  const out = [author];
  const acronym = author.match(/^(.*\S)\s*\(([^()]{2,12})\)$/);
  if (acronym && /^[A-ZÄÖÜ][A-Za-zÄÖÜäöü&.\s-]*$/.test(acronym[2]) && acronym[2].replace(/[^A-ZÄÖÜ]/g, '').length >= 2) {
    out.push(acronym[1]);
  }
  return out;
}

/**
 * Index of register entries by normalised name. A name shared by two entries is recorded as
 * ambiguous and never matched — picking one of them would be a guess about which body spoke.
 */
export function buildRegisterNameIndex(register) {
  const index = new Map();
  for (const org of register) {
    const key = normalizeOrgName(String(org.name).trim());
    if (key.length <= 4) continue;
    const prev = index.get(key);
    index.set(key, prev && prev.id !== org.id ? AMBIGUOUS : org);
  }
  return index;
}
export const AMBIGUOUS = Symbol('ambiguous');

/**
 * The register entry a statement author is, or null. `aliases` is the hand-reviewed
 * data/hearing-org-aliases.json map (published author text -> register id), consulted first
 * so a human-confirmed link always wins over any rule. Returns { orgId, rule } so the output
 * can show *why* a link was made.
 */
export function matchRegisterOrg(author, index, aliases = {}, registerById = null) {
  if (!author) return null;
  const alias = aliases[author];
  if (alias !== undefined) return alias ? { orgId: alias, rule: 'alias' } : null; // null alias = reviewed, deliberately unlinked
  if (looksLikePerson(author)) return null;
  for (const name of candidateNames(author)) {
    const hit = index.get(normalizeOrgName(name));
    if (hit === AMBIGUOUS) return null;
    if (hit) return { orgId: hit.id, rule: name === author ? 'exact' : 'acronym' };
  }
  // "Verband forschender Arzneimittelhersteller (vfa), Berlin": drop a trailing ", <City>" only
  // if the remainder is a register entry *registered in that city*.
  const city = author.match(/^(.*\S),\s*([A-ZÄÖÜ][\wäöüß. -]{1,30})$/);
  if (city && registerById) {
    for (const name of candidateNames(city[1])) {
      const hit = index.get(normalizeOrgName(name));
      if (hit && hit !== AMBIGUOUS && registerById.get(hit.id)?.city?.trim().toLowerCase() === city[2].trim().toLowerCase()) {
        return { orgId: hit.id, rule: 'city' };
      }
    }
  }
  return null;
}
