// data/fds-decisions.json (hand-reviewed FragDenStaat matches) -> public/data/fds-mentions.json
// Only confirmed decisions are published; rejected ones only keep the weekly check from re-suggesting them.
import { PATHS, readJson, writeJson } from './lib/fds.mjs';

const { decisions } = readJson(PATHS.decisions, { decisions: [] });
const orgs = {};
for (const d of decisions) {
  if (d.decision !== 'confirm') continue;
  (orgs[d.orgId] ??= []).push({
    docId: d.docId,
    title: d.title,
    authority: d.authority ?? 'Behörde nicht angegeben',
    year: d.year ?? null,
    page: d.page,
    url: d.url,
    ...(d.match ? { snippetBefore: d.snippetBefore ?? '', match: d.match, snippetAfter: d.snippetAfter ?? '' } : {}),
    indirect: Boolean(d.indirect),
    group: Boolean(d.group),
    checkedAt: d.checkedAt,
  });
}
const latest = decisions.reduce((m, d) => (d.checkedAt > m ? d.checkedAt : m), '');
writeJson(PATHS.mentions, { generatedAt: latest, source: 'FragDenStaat', orgs });
const total = Object.values(orgs).reduce((n, l) => n + l.length, 0);
console.error(`fds-mentions: ${total} mentions on ${Object.keys(orgs).length} org pages`);
