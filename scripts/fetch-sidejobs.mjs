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
  sleep,
  transformMandate,
  transformSidejob,
  writeJsonFile,
  writeMetaFile,
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
  // One member's request failing after all of fetchJson's retries (the API sometimes stalls for
  // minutes on this endpoint) used to abort the whole ~30-minute run, throwing away every member
  // already fetched. Instead, a failed member is retried once more at the end, and if that also
  // fails, their previously committed entries are kept rather than dropped — so a transient
  // outage leaves one member's data a day stale instead of publishing them as having none.
  const previous = await readJsonFile('sidejobs.json', {});
  const sidejobsByMandate = {};
  const fetchMember = async (member) => {
    // fetchAllPaginated paces before every request itself, so no extra pace() here — a second
    // one just doubled the run time.
    const raw = await fetchAllPaginated(
      (start, end) => `${API_BASE}/sidejobs?mandates=${member.mandateId}&range_start=${start}&range_end=${end}`,
      pace,
      { timeoutMs: 45_000 },
    );
    if (raw.length > 0) sidejobsByMandate[member.mandateId] = raw.map(transformSidejob);
  };

  let failed = [];
  let done = 0;
  for (const member of members) {
    try {
      await fetchMember(member);
    } catch (e) {
      console.warn(`  failed for mandate ${member.mandateId} (${e?.message ?? e}) — will retry at the end`);
      failed.push(member);
    }
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${members.length}…`);
  }

  if (failed.length > 0) {
    console.log(`Retrying ${failed.length} failed member(s) after a pause…`);
    await sleep(60_000);
    const stillFailed = [];
    for (const member of failed) {
      try {
        await fetchMember(member);
      } catch (e) {
        console.warn(`  still failing for mandate ${member.mandateId} (${e?.message ?? e})`);
        stillFailed.push(member);
      }
    }
    failed = stillFailed;
  }

  // A handful of failures is a flaky endpoint; this many is an outage, and committing a file
  // that is mostly yesterday's data under today's timestamp would misstate its freshness.
  const maxFailures = Math.ceil(members.length * 0.05);
  if (failed.length > maxFailures) {
    throw new Error(`${failed.length}/${members.length} members failed (limit ${maxFailures}) — not writing sidejobs.json`);
  }
  for (const member of failed) {
    const kept = previous[member.mandateId];
    if (kept) sidejobsByMandate[member.mandateId] = kept;
    console.warn(`  kept previous data for mandate ${member.mandateId} (${kept ? kept.length : 0} entries)`);
  }
  console.log(`  ${Object.keys(sidejobsByMandate).length} members with at least one disclosed activity`);

  await writeJsonFile('sidejobs.json', sidejobsByMandate);
  await writeMetaFile({ sidejobsGeneratedAt: new Date().toISOString() });

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
