#!/usr/bin/env node
// Fetches roster + polls + every poll's full vote breakdown for the current Bundestag term
// and writes them as static JSON under public/data/. Meant to run every few hours via
// GitHub Actions — ~70 requests total, paced well under the 30 req/min fair-use limit.
import {
  API_BASE,
  REAL_PARTY_COLORS,
  FALLBACK_PARTY_COLOR,
  computePollResult,
  fetchAllPaginated,
  fetchCurrentLegislaturePeriod,
  makePacer,
  readJsonFile,
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
