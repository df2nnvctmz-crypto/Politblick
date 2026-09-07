import { describe, expect, it } from 'vitest';
import { EMPTY_LOBBY_LINKS, aggregateDonorTotals, lookupDonorTotal, makeCanonicalDonorName } from './lobby';
import type { LobbyLinks, PartyDonation } from './lobby';

/**
 * "Spender insgesamt" is a figure printed next to a company's name and a party's name. Getting
 * it wrong in either direction is a published error about identifiable parties: too low reads
 * as a one-off gift, too high overstates what a donor gave.
 */

const DVAG = 'Deutsche Vermögensberatung AG';

/** One company, four published spellings — the shape the register reconciles. */
const links: LobbyLinks = {
  ...EMPTY_LOBBY_LINKS,
  orgs: { R001: { name: DVAG } as LobbyLinks['orgs'][string] },
  donorLinks: {
    [DVAG]: 'R001',
    'Deutsche Vermögensberatung Aktiengesellschaft DVAG': 'R001',
    'DeutscheVermögensberatung AG': 'R001',
    'Deutsche Vermögensberatung': 'R001',
  },
};

function donation(donor: string | null, amountEuro: number, fraction = 'CDU/CSU'): PartyDonation {
  return {
    year: 2025,
    party: fraction,
    fraction,
    amountEuro,
    donor,
    donorCity: null,
    receivedOn: '2025-03-01',
    publishedOn: '2025-03-10',
    sourceUrl: 'https://example.invalid',
  };
}

describe('makeCanonicalDonorName', () => {
  it('resolves every spelling onto the register\'s own name', () => {
    const canonical = makeCanonicalDonorName(links);
    expect(canonical('Deutsche Vermögensberatung Aktiengesellschaft DVAG')).toBe(DVAG);
    expect(canonical('DeutscheVermögensberatung AG')).toBe(DVAG);
    expect(canonical(DVAG)).toBe(DVAG);
  });

  it('falls back to the raw name for a donor that is not on the register', () => {
    // Most donors are not registered lobbyists. They must still show their own total, under
    // their own name, rather than vanishing or collapsing into some other donor.
    const canonical = makeCanonicalDonorName(links);
    expect(canonical('Privatperson Muster')).toBe('Privatperson Muster');
  });

  it('falls back to the raw name when donorLinks points at a missing org', () => {
    const canonical = makeCanonicalDonorName({ ...EMPTY_LOBBY_LINKS, donorLinks: { Foo: 'GONE' } });
    expect(canonical('Foo')).toBe('Foo');
  });
});

describe('aggregateDonorTotals', () => {
  const canonical = makeCanonicalDonorName(links);

  it('sums one donor once across every spelling of their name', () => {
    const totals = aggregateDonorTotals(
      [
        donation(DVAG, 100_000),
        donation('Deutsche Vermögensberatung Aktiengesellschaft DVAG', 50_000, 'SPD'),
        donation('DeutscheVermögensberatung AG', 25_000, 'FDP'),
      ],
      canonical,
    );
    expect(totals.get(DVAG)).toBe(175_000);
    expect(totals.size).toBe(1);
  });

  it('keys the map by the canonical name, never by a raw spelling', () => {
    // This is the contract every reader of the map depends on, and the one that was broken:
    // a `.get(row.donor)` on a non-canonical row missed and silently fell back to that row's
    // own amount, so the table sorted by one number and displayed another.
    const totals = aggregateDonorTotals([donation('DeutscheVermögensberatung AG', 25_000)], canonical);
    expect(totals.get(DVAG)).toBe(25_000);
    expect(totals.get('DeutscheVermögensberatung AG')).toBeUndefined();
  });

  it('keeps genuinely different donors apart', () => {
    const totals = aggregateDonorTotals([donation(DVAG, 100_000), donation('Andere GmbH', 70_000)], canonical);
    expect(totals.get(DVAG)).toBe(100_000);
    expect(totals.get('Andere GmbH')).toBe(70_000);
  });

  it('skips rows published without a donor rather than bucketing them together', () => {
    const totals = aggregateDonorTotals([donation(null, 100_000), donation(null, 70_000)], canonical);
    expect(totals.size).toBe(0);
  });
});

describe('lookupDonorTotal', () => {
  const canonical = makeCanonicalDonorName(links);
  const donations = [
    donation(DVAG, 100_000),
    donation('Deutsche Vermögensberatung Aktiengesellschaft DVAG', 50_000, 'SPD'),
    donation('DeutscheVermögensberatung AG', 25_000, 'FDP'),
  ];
  const totals = aggregateDonorTotals(donations, canonical);

  it('reads the same total from every row, whichever spelling that row uses', () => {
    // The point of the column: a reader should see the donor's full picture from any single
    // row, without having to search for the other spellings themselves.
    for (const d of donations) {
      expect(lookupDonorTotal(totals, d.donor, canonical)).toBe(175_000);
    }
  });

  it('returns 0 for a row with no donor', () => {
    expect(lookupDonorTotal(totals, null, canonical)).toBe(0);
  });

  it('returns 0 for a donor absent from the map rather than throwing', () => {
    expect(lookupDonorTotal(totals, 'Nicht vorhanden', canonical)).toBe(0);
  });

  it('scopes correctly when the map covers only one party\'s rows', () => {
    // The per-party table builds its own map from that party's rows alone, so the totals are
    // party-scoped by construction — but the lookup still has to canonicalise, or a
    // differently-spelled row in the same party misses its own group.
    const spdOnly = donations.filter((d) => d.fraction === 'SPD');
    const spdTotals = aggregateDonorTotals(spdOnly, canonical);
    expect(lookupDonorTotal(spdTotals, 'Deutsche Vermögensberatung Aktiengesellschaft DVAG', canonical)).toBe(50_000);
    expect(lookupDonorTotal(spdTotals, DVAG, canonical)).toBe(50_000);
  });
});
