import { describe, expect, it } from 'vitest';
import { buildBillUrlParam, buildMpUrlParam, buildSlugParam, extractLeadingId, extractMpId, parseBillId } from './urlParams';
import type { RealMp } from './bundestag';
import type { RealPoll } from './polls';

/**
 * Every URL these build is share-worthy and gets indexed, so the contract that matters is that
 * older, uglier forms keep resolving: a bare `/abgeordnete/118559` shared before slugs existed
 * must still land on the same person forever.
 */

const roster = [
  { id: 118559, name: 'Friedrich Merz' },
  { id: 118131, name: 'Anna Lührmann' },
] as RealMp[];

describe('buildMpUrlParam / extractMpId', () => {
  it('appends a readable slug to the id', () => {
    expect(buildMpUrlParam('118559', roster)).toBe('118559-friedrich-merz');
    expect(buildMpUrlParam('118131', roster)).toBe('118131-anna-luehrmann');
  });

  it('falls back to the bare id for a member not in the roster', () => {
    expect(buildMpUrlParam('999999', roster)).toBe('999999');
  });

  it('round-trips: whatever it builds, extractMpId reads the id back out', () => {
    for (const mp of roster) {
      expect(extractMpId(buildMpUrlParam(String(mp.id), roster))).toBe(String(mp.id));
    }
  });

  it('still resolves a bare-id URL shared before slugs existed', () => {
    expect(extractMpId('118559')).toBe('118559');
  });

  it('reads the id back out even when the name part changes', () => {
    // A member changing their published name must not break links already out in the world.
    expect(extractMpId('118559-friedrich-merz')).toBe('118559');
    expect(extractMpId('118559-someone-else-entirely')).toBe('118559');
  });

  it('returns null for an absent segment', () => {
    expect(extractMpId(null)).toBeNull();
    expect(extractMpId('')).toBeNull();
  });
});

describe('extractLeadingId', () => {
  it('isolates a numeric id from its slug', () => {
    expect(extractLeadingId('4119-heizungsgesetz')).toBe('4119');
  });

  it('keeps the Lobbyregister\'s letter-prefixed org ids intact', () => {
    // Org ids look like "R007203" — they are not numeric, so splitting on the first hyphen
    // (rather than matching leading digits) is what makes one function serve both.
    expect(extractLeadingId('R007203-stiftung-lesen')).toBe('R007203');
    expect(extractLeadingId('R007203')).toBe('R007203');
  });

  it('returns the whole segment when there is no slug', () => {
    expect(extractLeadingId('4119')).toBe('4119');
  });

  it('returns null for an absent segment', () => {
    expect(extractLeadingId(null)).toBeNull();
  });
});

describe('buildSlugParam', () => {
  it('falls back to the bare id when there is no name to slug', () => {
    expect(buildSlugParam('R007203', null)).toBe('R007203');
    expect(buildSlugParam(4119, undefined)).toBe('4119');
    expect(buildSlugParam(4119, '')).toBe('4119');
  });

  it('round-trips through extractLeadingId', () => {
    const param = buildSlugParam('R007203', 'Stiftung Lesen e.V.');
    expect(param).toBe('R007203-stiftung-lesen-e-v');
    expect(extractLeadingId(param)).toBe('R007203');
  });
});

describe('parseBillId', () => {
  it('reads a purely numeric segment as a real poll id', () => {
    expect(parseBillId('4119')).toBe(4119);
  });

  it('leaves a non-numeric id as a string', () => {
    expect(parseBillId('b1')).toBe('b1');
  });

  it('returns null for an absent segment', () => {
    expect(parseBillId(null)).toBeNull();
  });
});

describe('buildBillUrlParam', () => {
  const polls = [{ id: 4119, title: 'Gebäudeenergiegesetz' }] as RealPoll[];

  it('slugs the poll title behind the id', () => {
    expect(buildBillUrlParam(4119, polls)).toBe('4119-gebaeudeenergiegesetz');
    expect(extractLeadingId(buildBillUrlParam(4119, polls))).toBe('4119');
  });

  it('falls back to the bare id for an unknown poll', () => {
    expect(buildBillUrlParam(9999, polls)).toBe('9999');
  });
});
