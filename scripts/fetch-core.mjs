#!/usr/bin/env node
// Fetches roster + polls + every poll's full vote breakdown for the current Bundestag term,
// plus each member's Wikidata photo, and writes them as static JSON under public/data/. Meant
// to run every few hours via GitHub Actions — ~70 requests per run, paced well under the
// 30 req/min fair-use limit, except the very first run (or when new members join), which also
// pays for one photo lookup per not-yet-cached member.
import {
  API_BASE,
  REAL_PARTY_COLORS,
  FALLBACK_PARTY_COLOR,
  computePollResult,
  fetchAllPaginated,
  fetchCurrentLegislaturePeriod,
  makePacer,
  readJsonFile,
  resolvePoliticianPhotoUrl,
  transformMandate,
  transformPoll,
  writeJsonFile,
} from './lib/common.mjs';

const pace = makePacer(1500); // one request per 1.5s — well under 30/min

async function main() {
  console.log('Fetching current legislature period…');
  const period = await fetchCurrentLegislaturePeriod();
  console.log(`  ${period.label} (id ${period.id})`);

  console.log('Fetching roster (candidacies-mandates)…');
  await pace();
  const rawMandates = await fetchAllPaginated(
    (start, end) => `${API_BASE}/candidacies-mandates?parliament_period=${period.id}&range_start=${start}&range_end=${end}`,
    pace,
  );
  const members = rawMandates.map(transformMandate).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  console.log(`  ${members.length} members`);

  console.log('Resolving member photos…');
  // Cached by politician id from the previous run's roster.json, so only members new since
  // last run (normally zero) pay for a fresh lookup — the full 630-member backfill only
  // happens once.
  const previousRoster = await readJsonFile('roster.json', { members: [] });
  const photoCache = new Map(previousRoster.members.filter((m) => 'photoUrl' in m).map((m) => [m.id, m.photoUrl]));
  let newLookups = 0;
  for (const member of members) {
    if (photoCache.has(member.id)) {
      member.photoUrl = photoCache.get(member.id);
      continue;
    }
    await pace();
    try {
      member.photoUrl = await resolvePoliticianPhotoUrl(member.id);
    } catch (e) {
      console.warn(`  photo lookup failed for ${member.name}: ${e.message}`);
      member.photoUrl = null;
    }
    newLookups++;
    if (newLookups % 50 === 0) console.log(`  resolved ${newLookups} new photos…`);
  }
  console.log(`  ${newLookups} new lookups, ${members.length - newLookups} from cache`);

  const partyCounts = new Map();
  for (const m of members) partyCounts.set(m.party, (partyCounts.get(m.party) || 0) + 1);
  const parties = [...partyCounts.entries()]
    .map(([name, seats]) => ({ name, seats, color: REAL_PARTY_COLORS[name] || FALLBACK_PARTY_COLOR }))
    .sort((a, b) => b.seats - a.seats);

  console.log('Fetching polls list…');
  const rawPolls = await fetchAllPaginated(
    (start, end) =>
      `${API_BASE}/polls?field_legislature=${period.id}&range_start=${start}&range_end=${end}&sort_by=field_poll_date&sort_direction=desc`,
    pace,
  );
  const polls = rawPolls.map(transformPoll).sort((a, b) => b.date.localeCompare(a.date));
  console.log(`  ${polls.length} polls`);

  console.log('Fetching full vote breakdown for each poll…');
  const pollResults = {};
  for (const poll of polls) {
    await pace();
    const rawVotes = await fetchAllPaginated((start, end) => `${API_BASE}/votes?poll=${poll.id}&range_start=${start}&range_end=${end}`, pace);
    pollResults[poll.id] = computePollResult(rawVotes);
    console.log(`  poll ${poll.id} (${poll.title}): ${rawVotes.length} votes`);
  }

  await writeJsonFile('roster.json', { members, parties });
  await writeJsonFile('polls.json', polls);
  await writeJsonFile('poll-results.json', pollResults);

  const meta = await readJsonFile('meta.json', {});
  await writeJsonFile('meta.json', {
    ...meta,
    legislaturePeriodId: period.id,
    legislatureLabel: period.label,
    coreGeneratedAt: new Date().toISOString(),
  });

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
