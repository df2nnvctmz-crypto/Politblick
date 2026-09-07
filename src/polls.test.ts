import { describe, expect, it } from 'vitest';
import { computeAllAlignments, computeDivergences, computeMemberAlignment, isoWeekRange } from './polls';
import type { MemberVote, PartyTally, PollResult, RealPoll, VoteChoice } from './polls';

/**
 * "Parteitreue" and "gegen die eigene Fraktion gestimmt" are the two claims on this site that
 * name a person and assert something about their behaviour. Both come out of the functions
 * below, so these tests exist less to catch a crash than to pin the definition: which votes
 * count, which are unrated, and what a percentage is a percentage *of*.
 */

function poll(id: number, date: string): RealPoll {
  return {
    id,
    title: `Poll ${id}`,
    date,
    topic: 'Umwelt',
    topics: ['Umwelt'],
    accepted: true,
    url: `https://example.invalid/${id}`,
  } as RealPoll;
}

function tally(party: string, majority: VoteChoice | null): PartyTally {
  return { party, color: '#000', yes: 0, no: 0, abstain: 0, noShow: 0, majority };
}

function member(mandateId: number, party: string, vote: VoteChoice): MemberVote {
  return { mandateId, name: `MP ${mandateId}`, party, vote };
}

function result(p: RealPoll, breakdown: PartyTally[], votes: MemberVote[]): PollResult {
  return {
    poll: p,
    totalYes: 0,
    totalNo: 0,
    totalAbstain: 0,
    totalNoShow: 0,
    yesPct: 0,
    partyBreakdown: breakdown,
    votes,
  };
}

describe('computeMemberAlignment', () => {
  it('rates a vote against the member\'s own fraction majority, not the chamber', () => {
    const results = [
      result(poll(1, '2025-01-10'), [tally('SPD', 'yes'), tally('CDU/CSU', 'no')], [member(7, 'SPD', 'yes')]),
      result(poll(2, '2025-01-17'), [tally('SPD', 'yes'), tally('CDU/CSU', 'no')], [member(7, 'SPD', 'no')]),
    ];
    const summary = computeMemberAlignment(7, results);
    expect(summary.ratedCount).toBe(2);
    expect(summary.alignedCount).toBe(1);
    expect(summary.alignmentPct).toBe(50);
  });

  it('never rates an independent, who has no fraction line to diverge from', () => {
    // Fraktionslos is a bucket of unrelated members, not a fraction with a whip. A "majority"
    // across it describes nobody's expected behaviour, so it must stay unrated rather than
    // producing a loyalty figure about a named person that means nothing.
    const results = [
      result(poll(1, '2025-01-10'), [tally('Fraktionslos', 'yes')], [member(7, 'Fraktionslos', 'no')]),
    ];
    const summary = computeMemberAlignment(7, results);
    expect(summary.points).toHaveLength(1);
    expect(summary.points[0].aligned).toBeNull();
    expect(summary.ratedCount).toBe(0);
    expect(summary.alignmentPct).toBeNull();
  });

  it('excludes absences entirely rather than counting them as disloyalty', () => {
    const results = [
      result(poll(1, '2025-01-10'), [tally('SPD', 'yes')], [member(7, 'SPD', 'yes')]),
      result(poll(2, '2025-01-17'), [tally('SPD', 'yes')], [member(7, 'SPD', 'no_show')]),
    ];
    const summary = computeMemberAlignment(7, results);
    expect(summary.points).toHaveLength(1);
    expect(summary.alignmentPct).toBe(100);
  });

  it('leaves a vote unrated where the fraction itself had no majority', () => {
    const results = [
      result(poll(1, '2025-01-10'), [tally('SPD', null)], [member(7, 'SPD', 'yes')]),
    ];
    expect(computeMemberAlignment(7, results).alignmentPct).toBeNull();
  });

  it('reports no percentage at all rather than 0% when nothing is rated', () => {
    // A displayed "0% Parteitreue" next to a named person, produced by an empty denominator,
    // is the worst possible failure mode here — it reads as a finding.
    expect(computeMemberAlignment(7, []).alignmentPct).toBeNull();
    const absent = [result(poll(1, '2025-01-10'), [tally('SPD', 'yes')], [member(9, 'SPD', 'yes')])];
    expect(computeMemberAlignment(7, absent).alignmentPct).toBeNull();
    expect(computeMemberAlignment(7, absent).ratedCount).toBe(0);
  });

  it('orders points oldest-first regardless of the order results arrive in', () => {
    const results = [
      result(poll(2, '2025-01-17'), [tally('SPD', 'yes')], [member(7, 'SPD', 'yes')]),
      result(poll(1, '2025-01-10'), [tally('SPD', 'yes')], [member(7, 'SPD', 'yes')]),
    ];
    expect(computeMemberAlignment(7, results).points.map((p) => p.poll.id)).toEqual([1, 2]);
  });

  it('rates against the fraction the member sat in on the day, not a single current party', () => {
    // A member who changes fraction mid-term is measured against whichever fraction each vote
    // was cast under — that is what the per-vote `party` on the vote row is for.
    const results = [
      result(poll(1, '2025-01-10'), [tally('AfD', 'yes')], [member(7, 'AfD', 'yes')]),
      result(poll(2, '2025-01-17'), [tally('AfD', 'yes'), tally('Fraktionslos', 'no')], [member(7, 'Fraktionslos', 'no')]),
    ];
    const summary = computeMemberAlignment(7, results);
    expect(summary.ratedCount).toBe(1);
    expect(summary.alignedCount).toBe(1);
  });
});

describe('computeAllAlignments agrees with computeMemberAlignment', () => {
  // These are two implementations of one rule: the per-member one for a profile, the batch one
  // for the 630-row search list. They are the exact drift risk verify-vote-history-summary.mjs
  // exists to catch between Node and the browser — the same hazard, one file apart.
  const results = [
    result(
      poll(1, '2025-01-10'),
      [tally('SPD', 'yes'), tally('CDU/CSU', 'no'), tally('Fraktionslos', 'yes')],
      [member(1, 'SPD', 'yes'), member(2, 'SPD', 'no'), member(3, 'CDU/CSU', 'no'), member(4, 'Fraktionslos', 'yes')],
    ),
    result(
      poll(2, '2025-01-17'),
      [tally('SPD', 'no'), tally('CDU/CSU', null)],
      [member(1, 'SPD', 'no'), member(2, 'SPD', 'no_show'), member(3, 'CDU/CSU', 'yes'), member(4, 'Fraktionslos', 'abstain')],
    ),
    result(
      poll(3, '2025-01-03'),
      [tally('SPD', 'abstain')],
      [member(1, 'SPD', 'abstain'), member(2, 'SPD', 'yes')],
    ),
  ];

  const batch = computeAllAlignments(results);

  for (const mandateId of [1, 2, 3, 4]) {
    it(`matches for mandate ${mandateId}`, () => {
      const single = computeMemberAlignment(mandateId, results);
      const fromBatch = batch.get(mandateId);
      expect(fromBatch).toBeDefined();
      expect(fromBatch!.alignedCount).toBe(single.alignedCount);
      expect(fromBatch!.ratedCount).toBe(single.ratedCount);
      expect(fromBatch!.alignmentPct).toBe(single.alignmentPct);
      expect(fromBatch!.windowSize).toBe(single.windowSize);
      expect(fromBatch!.points.map((p) => [p.poll.id, p.vote, p.party, p.aligned])).toEqual(
        single.points.map((p) => [p.poll.id, p.vote, p.party, p.aligned]),
      );
    });
  }
});

describe('computeDivergences', () => {
  it('reports only members who broke with their own fraction majority', () => {
    const r = result(
      poll(1, '2025-01-10'),
      [tally('SPD', 'yes'), tally('CDU/CSU', 'no')],
      [member(1, 'SPD', 'yes'), member(2, 'SPD', 'no'), member(3, 'CDU/CSU', 'no')],
    );
    const out = computeDivergences(r);
    expect(out.map((d) => d.member.mandateId)).toEqual([2]);
    expect(out[0].majorityVote).toBe('yes');
  });

  it('never names an independent or an absentee as diverging', () => {
    const r = result(
      poll(1, '2025-01-10'),
      [tally('SPD', 'yes'), tally('Fraktionslos', 'yes')],
      [member(1, 'Fraktionslos', 'no'), member(2, 'SPD', 'no_show')],
    );
    expect(computeDivergences(r)).toEqual([]);
  });

  it('names nobody where the fraction had no majority to break with', () => {
    const r = result(poll(1, '2025-01-10'), [tally('SPD', null)], [member(1, 'SPD', 'no')]);
    expect(computeDivergences(r)).toEqual([]);
  });
});

describe('isoWeekRange', () => {
  it('runs Monday to Sunday around a midweek date', () => {
    const { start, end } = isoWeekRange('2025-01-15'); // a Wednesday
    expect(start.toISOString().slice(0, 10)).toBe('2025-01-13');
    expect(end.toISOString().slice(0, 10)).toBe('2025-01-19');
  });

  it('treats Sunday as the end of the week it closes, not the start of the next', () => {
    const { start, end } = isoWeekRange('2025-01-19');
    expect(start.toISOString().slice(0, 10)).toBe('2025-01-13');
    expect(end.toISOString().slice(0, 10)).toBe('2025-01-19');
  });

  it('does not shift across a month or year boundary', () => {
    const { start, end } = isoWeekRange('2025-01-01'); // a Wednesday
    expect(start.toISOString().slice(0, 10)).toBe('2024-12-30');
    expect(end.toISOString().slice(0, 10)).toBe('2025-01-05');
  });
});
