// Applies a closed FragDenStaat review issue: ticked candidates are confirmed, unticked rejected.
// Reads the issue body from ISSUE_BODY (never interpolated into a shell). Writes the decisions,
// drops the reviewed candidates from the pending list, and rebuilds nothing itself
// (the workflow runs build-fds-mentions.mjs afterwards).
//
// Line format (written by fetch-fds.mjs, title editable by the reviewer):
//   - [x] `R001923:9467` **Diehl Stiftung & Co. KG** — Titel: Brief zum Lieferkettengesetz [indirekt]
import fs from 'node:fs';
import { PATHS, keyOf, readJson, writeJson } from './lib/fds.mjs';

const body = process.env.ISSUE_BODY ?? '';
const today = new Date().toISOString().slice(0, 10);
const candidates = readJson(PATHS.candidates, { pending: [] });
const decisions = readJson(PATHS.decisions, { decisions: [] });
const decided = new Set(decisions.decisions.map((d) => keyOf(d.orgId, d.docId)));
const byKey = new Map(candidates.pending.map((c) => [keyOf(c.orgId, c.docId), c]));

const LINE = /^\s*[-*] \[( |x|X)\] `(R\d+):(\d+)`.*?—\s*Titel:\s*(.+?)\s*$/gm;
const applied = { confirm: [], reject: [], skipped: [] };
for (const m of body.matchAll(LINE)) {
  const [, tick, orgId, docIdStr, rawTitle] = m;
  const key = `${orgId}:${docIdStr}`;
  const c = byKey.get(key);
  if (!c || decided.has(key)) {
    applied.skipped.push(key);
    continue;
  }
  decided.add(key);
  byKey.delete(key);
  if (tick === ' ') {
    decisions.decisions.push({ orgId, docId: c.docId, decision: 'reject', orgName: c.orgName, checkedAt: today });
    applied.reject.push(`${c.orgName} (${key})`);
    continue;
  }
  const indirect = /\[indirekt\]/i.test(rawTitle);
  const group = /\[gruppe\]/i.test(rawTitle);
  const title = rawTitle.replace(/\[(indirekt|gruppe)\]/gi, '').replace(/\s+/g, ' ').trim().slice(0, 200);
  decisions.decisions.push({
    orgId,
    docId: c.docId,
    decision: 'confirm',
    title: title || c.docTitle,
    authority: c.authority ?? 'Behörde nicht angegeben',
    year: c.year ?? null,
    page: c.page,
    url: c.url,
    indirect,
    group,
    checkedAt: today,
  });
  applied.confirm.push(`${c.orgName}: ${title} (${key})`);
}

decisions.decisions.sort((a, b) => a.orgId.localeCompare(b.orgId) || a.docId - b.docId);
candidates.pending = [...byKey.values()];
writeJson(PATHS.decisions, decisions);
writeJson(PATHS.candidates, candidates);

const summary = [
  `Übernommen: ${applied.confirm.length} bestätigt, ${applied.reject.length} abgelehnt.`,
  ...(applied.confirm.length ? ['', '**Bestätigt (jetzt auf der Seite):**', ...applied.confirm.map((s) => `- ${s}`)] : []),
  ...(applied.skipped.length ? ['', `Übersprungen (schon entschieden oder unbekannt): ${applied.skipped.join(', ')}`] : []),
  ...(candidates.pending.length ? ['', `Noch offen aus anderen Issues: ${candidates.pending.length}`] : []),
].join('\n');
console.error(summary);
if (process.env.FDS_SUMMARY_FILE) fs.writeFileSync(process.env.FDS_SUMMARY_FILE, summary.replace(/@/g, '(at)') + '\n');
