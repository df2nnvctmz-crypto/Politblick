#!/usr/bin/env node
// Fetches Bundestag committee assignments for the current legislature period and writes
// public/data/committees.json. ~80 requests (committees list + one membership lookup per
// committee), well under the fair-use limit even at fetch-core's pace.
//
// Committee assignments barely change mid-term (a handful of reshuffles a year), so this runs
// weekly rather than alongside fetch-core's 4-hourly cycle — no point re-fetching something
// that's essentially static every few hours.
//
// Why this data matters: each committee already carries abgeordnetenwatch's own field_topics —
// the SAME topic vocabulary used to tag polls (e.g. Finanzausschuss lists "Öffentliche
// Finanzen, Steuern und Abgaben" verbatim). That means "which committee is responsible for
// this poll's topic" comes for free from the API, with no manual curation — unlike the
// Lobbyregister topic map in data/lobby-topic-map.json, which has to be hand-curated because
// the Lobbyregister's field-of-interest vocabulary doesn't come pre-linked to anything.
import {
  API_BASE,
  fetchCurrentLegislaturePeriod,
  fetchJson,
  makePacer,
  readJsonFile,
  writeJsonFile,
} from './lib/common.mjs';

const pace = makePacer(1500);

async function main() {
  console.log('Fetching current legislature period…');
  const period = await fetchCurrentLegislaturePeriod();

  console.log('Fetching committees…');
  await pace();
  const committeesJson = await fetchJson(`${API_BASE}/committees?field_legislature=${period.id}&range_end=200`);
  const committees = committeesJson.data.map((c) => ({
    id: c.id,
    name: c.label,
    topics: (c.field_topics ?? []).map((t) => t.label),
  }));
  console.log(`  ${committees.length} committees`);

  console.log('Fetching memberships for each committee…');
  const memberships = [];
  for (const committee of committees) {
    await pace();
    const json = await fetchJson(`${API_BASE}/committee-memberships?committee=${committee.id}&range_end=200`);
    for (const m of json.data) {
      if (!m.candidacy_mandate) continue;
      memberships.push({
        mandateId: m.candidacy_mandate.id,
        committeeId: committee.id,
        role: m.committee_role,
      });
    }
  }
  console.log(`  ${memberships.length} memberships across ${new Set(memberships.map((m) => m.mandateId)).size} members`);

  await writeJsonFile('committees.json', { committees, memberships });

  const meta = await readJsonFile('meta.json', {});
  await writeJsonFile('meta.json', { ...meta, committeesGeneratedAt: new Date().toISOString() });

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
