#!/usr/bin/env node
// Fetches disclosed outside income (Nebeneinkuenfte) for every current member. This changes
// far less often than votes, and at ~630 requests it's the slow one (~25 min paced under the
// rate limit), so it runs on its own, less frequent schedule rather than alongside fetch-core.
import {
  API_BASE,
  fetchAllPaginated,
  fetchCurrentLegislaturePeriod,
  makePacer,
  readJsonFile,
  transformMandate,
  transformSidejob,
  writeJsonFile,
} from './lib/common.mjs';

const pace = makePacer(2500); // slower pace — this script alone makes ~630 requests

async function main() {
  console.log('Fetching current legislature period…');
  const period = await fetchCurrentLegislaturePeriod();

  console.log('Fetching roster (candidacies-mandates)…');
  await pace();
  const rawMandates = await fetchAllPaginated(
    (start, end) => `${API_BASE}/candidacies-mandates?parliament_period=${period.id}&range_start=${start}&range_end=${end}`,
    pace,
  );
  const members = rawMandates.map(transformMandate).filter(Boolean);
  console.log(`  ${members.length} members`);

  console.log('Fetching sidejobs for each member…');
  const sidejobsByMandate = {};
  let done = 0;
  for (const member of members) {
    await pace();
    const raw = await fetchAllPaginated(
      (start, end) => `${API_BASE}/sidejobs?mandates=${member.mandateId}&range_start=${start}&range_end=${end}`,
      pace,
    );
    if (raw.length > 0) sidejobsByMandate[member.mandateId] = raw.map(transformSidejob);
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${members.length}…`);
  }
  console.log(`  ${Object.keys(sidejobsByMandate).length} members with at least one disclosed activity`);

  await writeJsonFile('sidejobs.json', sidejobsByMandate);

  const meta = await readJsonFile('meta.json', {});
  await writeJsonFile('meta.json', { ...meta, sidejobsGeneratedAt: new Date().toISOString() });

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
