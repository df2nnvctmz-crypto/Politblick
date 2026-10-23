#!/usr/bin/env node
// Turns the scraped hearings into the file bill and organisation pages load.
//
// No network. Inputs:  data/hearings.json              (fetch-hearings.mjs)
//                      data/lobby-register.json        (fetch-lobbyregister.mjs)
//                      data/hearing-org-aliases.json   (hand-reviewed)
//             Output:  public/data/hearings.json
//
// Two things are (re)derived here, both under the rules in scripts/lib/hearings.mjs: who each
// statement is by — recomputed from the published label, so a parsing-rule change needs no new
// crawl — and the register link on it. Joining a hearing to a vote happens in the browser, on the
// Drucksache numbers both carry — so the every-4h poll refresh needs no rebuild of this file.
//
// Like the other derive steps, the output inherits its generatedAt from its input, so an
// unchanged rebuild is an empty diff.
import { readSourceFile, writeJsonFile } from './lib/common.mjs';
import { buildRegisterNameIndex, matchRegisterOrg, statementAuthor, stripSharedTopic } from './lib/hearings.mjs';

async function main() {
  const source = await readSourceFile('hearings.json', null);
  if (!source?.hearings?.length) {
    console.warn('data/hearings.json is empty or missing — run fetch-hearings.mjs first. Nothing to derive.');
    return;
  }
  const register = await readSourceFile('lobby-register.json', []);
  const { aliases = {} } = await readSourceFile('hearing-org-aliases.json', { aliases: {} });
  const registerById = new Map(register.map((o) => [o.id, o]));

  // A reviewed alias that points at nothing is a typo or a deleted entry — either way the
  // reviewer's intent can no longer be honoured, so stop rather than drop the link quietly.
  for (const [author, id] of Object.entries(aliases)) {
    if (id !== null && !registerById.has(id)) throw new Error(`hearing-org-aliases.json: "${author}" -> ${id}, which is not in the register.`);
  }
  if (register.length === 0) console.warn('data/lobby-register.json is missing — statements are written without register links.');

  const index = buildRegisterNameIndex(register);
  const orgs = {};
  const rules = {};
  let statements = 0;
  let linked = 0;

  const hearings = source.hearings.map((h) => {
    const authors = stripSharedTopic(h.statements.map((s) => statementAuthor(s.label)));
    return {
      id: h.id,
      url: h.url,
      title: h.title,
      committee: h.committee,
      date: h.date,
      drucksachen: h.drucksachen,
      expertListUrl: h.expertListUrl,
      statements: h.statements
        .map((s, i) => ({ ...s, author: authors[i] }))
        // Bundles ("Zusammenstellung der Stellungnahmen") are not by anyone; the hearing link covers them.
        .filter((s) => s.author)
        .map((s) => {
          statements++;
          const match = matchRegisterOrg(s.author, index, aliases, registerById);
          const out = { author: s.author, label: s.label, url: s.url, number: s.number };
          if (!match) return out;
          linked++;
          rules[match.rule] = (rules[match.rule] ?? 0) + 1;
          const org = registerById.get(match.orgId);
          orgs[match.orgId] = { name: org.name.trim(), url: org.url ?? null };
          return { ...out, orgId: match.orgId, rule: match.rule };
        }),
    };
  });

  console.log(`${hearings.length} hearings, ${statements} statements, ${linked} linked to a register entry`, rules);
  await writeJsonFile('hearings.json', {
    generatedAt: source.generatedAt,
    source: source.source,
    registerEntryCount: register.length,
    orgs,
    hearings,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
