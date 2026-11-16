// Weekly FragDenStaat check: new documents in the watched collections are matched against the
// lobby register; hits go to data/fds-candidates.json for a human review (nothing is published here).
//
// Usage: node scripts/fetch-fds.mjs [--seed]
//   --seed  record every current document as already seen, without matching (first setup)
// Env:
//   FDS_ISSUE_FILE  where to write the review-issue markdown (only written when there is something new)
//   GITHUB_OUTPUT   receives `new_candidates` and `new_collections` counts
import fs from 'node:fs';
import { FDS_API, PATHS, buildEntities, fdsGet, fdsList, keyOf, matchPage, readJson, writeJson } from './lib/fds.mjs';

const seedOnly = process.argv.includes('--seed');
const today = new Date().toISOString().slice(0, 10);

const state = readJson(PATHS.state, { watched: [], seenDocs: {}, knownCollections: [], lastRun: null });
const candidates = readJson(PATHS.candidates, { pending: [] });
const decisions = readJson(PATHS.decisions, { decisions: [] });
const decided = new Set(decisions.decisions.map((d) => keyOf(d.orgId, d.docId)));
const pendingKeys = new Set(candidates.pending.map((c) => keyOf(c.orgId, c.docId)));

const entities = buildEntities(readJson(PATHS.register, []), readJson(PATHS.aliases, {}));
if (!entities.length) throw new Error(`no lobby-register entities loaded from ${PATHS.register}`);

// 1. Collections FragDenStaat added since the last run (reported, not processed automatically).
const allCollections = await fdsList(`${FDS_API}/documentcollection/?limit=50`);
const known = new Set(state.knownCollections);
const newCollections = state.knownCollections.length ? allCollections.filter((c) => !known.has(c.id)) : [];
state.knownCollections = allCollections.map((c) => c.id);

// 2. New documents in watched collections.
const pbCache = new Map();
const reqCache = new Map();
const cached = async (cache, uri, pick) => {
  if (!uri) return null;
  if (!cache.has(uri)) {
    const j = await fdsGet(uri);
    cache.set(uri, j ? pick(j) : null);
  }
  return cache.get(uri);
};

const fresh = [];
let newDocs = 0;
for (const cid of state.watched) {
  const meta = allCollections.find((c) => c.id === cid);
  const docs = await fdsList(`${FDS_API}/document/?collection=${cid}&limit=50`);
  const seen = new Set(state.seenDocs[cid] ?? []);
  for (const d of docs) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    newDocs++;
    if (seedOnly) continue;
    const pages = await fdsGet(`${FDS_API}/page/?document=${d.id}&limit=50`);
    for (const p of pages?.objects ?? []) {
      for (const h of matchPage(p.content, entities)) {
        const key = keyOf(h.orgId, d.id);
        if (decided.has(key) || pendingKeys.has(key)) continue;
        pendingKeys.add(key);
        const request = await cached(reqCache, d.foirequest, (r) => ({ title: r.title, date: (r.created_at || '').slice(0, 10) }));
        fresh.push({
          orgId: h.orgId,
          orgName: h.orgName,
          docId: d.id,
          docTitle: d.title,
          collectionId: cid,
          collectionTitle: meta?.title ?? String(cid),
          page: p.number,
          numPages: d.num_pages,
          url: `${d.site_url}#page-${p.number}`,
          authority: await cached(pbCache, d.publicbody, (b) => b.name ?? null),
          year: request?.date ? Number(request.date.slice(0, 4)) : null,
          snippet: h.snippet,
          foundAt: today,
        });
      }
    }
  }
  state.seenDocs[cid] = [...seen];
  console.error(`collection ${cid} "${meta?.title ?? '?'}": ${docs.length} docs`);
}

state.lastRun = today;
candidates.pending.push(...fresh);
writeJson(PATHS.state, state);
writeJson(PATHS.candidates, candidates);
console.error(`${seedOnly ? 'seeded' : 'new'} documents: ${newDocs}, new candidates: ${fresh.length}, new collections: ${newCollections.length}`);

// 3. Review issue body.
const clean = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[`<>]/g, "'")
    .replace(/@/g, '(at)') // never ping GitHub users from OCR text
    .replace(/#(\d)/g, '#​$1'); // no accidental issue links
const suggestTitle = (t) =>
  clean(t)
    .replace(/[_]+/g, ' ')
    .replace(/[-\s]*gesch(w|)(ä|ae)rzt/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

if (process.env.FDS_ISSUE_FILE && (fresh.length || newCollections.length)) {
  const lines = [
    `Neue Treffer aus FragDenStaat (Lauf vom ${today}).`,
    '',
    '**So geht die Prüfung:**',
    '- Haken setzen = bestätigen (erscheint auf der Organisationsseite). Kein Haken = ablehnen (taucht nicht wieder auf).',
    '- Den Titel nach „Titel:“ kannst du direkt hier im Issue bearbeiten (Issue → ··· → Edit). Mit `[indirekt]` oder `[gruppe]` am Ende des Titels bekommt der Treffer das passende Label.',
    '- Danach das Issue mit **„Close as completed“** schließen. Erst dann werden die Entscheidungen übernommen und die Seite aktualisiert. „Close as not planned“ übernimmt nichts.',
    '',
  ];
  if (fresh.length) {
    lines.push(`### ${fresh.length} neue Kandidaten`, '');
    for (const c of fresh) {
      lines.push(`- [ ] \`${keyOf(c.orgId, c.docId)}\` **${clean(c.orgName)}** — Titel: ${suggestTitle(c.docTitle)}`);
      lines.push(`  - [Dokument, Seite ${c.page}/${c.numPages}](${c.url}) · ${clean(c.authority ?? 'Behörde unbekannt')} · ${c.year ?? 'Jahr unbekannt'} · Sammlung „${clean(c.collectionTitle)}“`);
      lines.push(`  - Kontext: „${clean(c.snippet)}“`);
    }
    lines.push('');
  }
  if (newCollections.length) {
    lines.push(`### ${newCollections.length} neue Sammlungen bei FragDenStaat`, '', 'Werden nicht automatisch durchsucht. Zum Beobachten die ID in `data/fds-state.json` unter `watched` eintragen.', '');
    for (const c of newCollections) lines.push(`- ${c.id}: ${clean(c.title)} (${c.document_count ?? '?'} Dokumente)`);
  }
  fs.writeFileSync(process.env.FDS_ISSUE_FILE, lines.join('\n') + '\n');
}
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `new_candidates=${fresh.length}\nnew_collections=${newCollections.length}\n`);
}
