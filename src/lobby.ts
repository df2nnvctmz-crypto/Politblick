import { useSnapshot } from './snapshot';
import type { VoteChoice } from './polls';

/**
 * Lobbying data, joined offline by scripts/build-lobby-links.mjs from the Bundestag
 * Lobbyregister, the roll-call votes, and members' declared outside roles.
 *
 * Two things this data does NOT contain, and the UI must not imply:
 *
 *  - Meetings. Germany publishes no register of which lobbyist met which MP. Everything here
 *    is either an organisation's own declaration that it lobbied on a given bill, or a
 *    member's own declaration that they hold a role somewhere — never a recorded contact.
 *  - A stance, unless curated. The register records which Drucksache an organisation lobbied
 *    on, never whether it wanted the bill passed or stopped. `position` is only ever set from
 *    the hand-curated, sourced data/lobby-positions.json. Where it is null the organisation's
 *    own wording (`demands`) is shown instead, and no direction is claimed.
 */

export interface LobbyOrg {
  id: string;
  name: string;
  legalForm: string | null;
  city: string | null;
  url: string | null;
  /** Declared annual lobbying spend, reported by the register as a bracket. */
  expensesEuro: { from: number; to: number } | null;
  staffFte: number | null;
  fieldsOfInterest: string[];
}

export interface PollLobbyEntry {
  orgId: string;
  /** The organisation's own headline demands, verbatim from its register filing. */
  demands: string[];
  drucksachen: string[];
}

export interface Affiliation {
  orgId: string;
  roles: string[];
  /** What kind of tie this is, in the Bundestag's own category wording (position, shareholding, donation received, …). */
  categories: string[];
}

export type LobbyPosition = 'pro' | 'contra';

/** One member voting on a bill that an organisation they hold a role at lobbied on. */
export interface LobbyConflict {
  mandateId: number;
  pollId: number;
  orgId: string;
  roles: string[];
  categories: string[];
  vote: VoteChoice;
  demands: string[];
  /** Differs from their own fraction's majority on this poll. Statistical fact, not motive. */
  againstFraction: boolean | null;
  position: LobbyPosition | null;
  /** Only non-null where a curated, sourced stance exists for this org + Drucksache. */
  againstPosition: boolean | null;
  positionSource: string | null;
  positionNote: string | null;
}

/**
 * A member voting on a poll whose topic matches a specific, curated field of interest
 * (data/lobby-topic-map.json) of an organisation they hold a role at — WITHOUT that
 * organisation ever declaring lobbying on this exact bill. This is deliberately a weaker,
 * separate signal from LobbyConflict above: it means "same policy area", not "this
 * organisation lobbied this bill". Never render it the same way as a LobbyConflict, and
 * always show `matchedField` so the reader can judge relevance themselves — "this org lists
 * Bank- und Finanzwesen" carries very different weight than a generic label would.
 */
export interface TopicalTie {
  mandateId: number;
  pollId: number;
  orgId: string;
  roles: string[];
  categories: string[];
  vote: VoteChoice;
  matchedField: string;
  againstFraction: boolean | null;
}

export interface LobbyLinks {
  orgs: Record<string, LobbyOrg>;
  pollLobbying: Record<string, PollLobbyEntry[]>;
  affiliations: Record<string, Affiliation[]>;
  conflicts: LobbyConflict[];
  topicalTies: TopicalTie[];
  donorLinks: Record<string, string>;
  generatedAt: string | null;
  registerEntryCount: number;
}

export const EMPTY_LOBBY_LINKS: LobbyLinks = {
  orgs: {},
  pollLobbying: {},
  affiliations: {},
  conflicts: [],
  topicalTies: [],
  donorLinks: {},
  generatedAt: null,
  registerEntryCount: 0,
};

export interface PartyDonation {
  year: number;
  party: string;
  fraction: string;
  amountEuro: number;
  donor: string | null;
  donorCity: string | null;
  receivedOn: string | null;
  publishedOn: string | null;
}

export function formatEuro(value: number): string {
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`;
}

/** The register reports spend as a bracket; a from===to bracket is an exact figure. */
export function formatExpenseBracket(bracket: { from: number; to: number } | null): string | null {
  if (!bracket) return null;
  if (bracket.to === 0) return formatEuro(0);
  if (bracket.from === bracket.to) return formatEuro(bracket.from);
  return `${formatEuro(bracket.from)} – ${formatEuro(bracket.to)}`;
}

export interface MemberLobbyState {
  /** Registered interest groups this member holds a declared role at. */
  affiliations: { org: LobbyOrg; roles: string[]; categories: string[] }[];
  /** Bills they voted on that one of those organisations lobbied. */
  conflicts: (LobbyConflict & { org: LobbyOrg })[];
  /** Bills they voted on in the same policy area as one of those organisations — weaker, see TopicalTie. */
  topicalTies: (TopicalTie & { org: LobbyOrg })[];
  loading: boolean;
  error: string | null;
}

/** One member's lobbying ties — pure lookup in the snapshot, no fetching. */
export function useMemberLobby(mandateId: number | null): MemberLobbyState {
  const { snapshot, loading, error } = useSnapshot();
  if (mandateId === null || !snapshot) return { affiliations: [], conflicts: [], topicalTies: [], loading, error };

  const links = snapshot.lobbyLinks;
  const affiliations = (links.affiliations[String(mandateId)] ?? [])
    .map((a) => {
      const org = links.orgs[a.orgId];
      return org ? { org, roles: a.roles, categories: a.categories ?? [] } : null;
    })
    .filter((a): a is { org: LobbyOrg; roles: string[]; categories: string[] } => a !== null)
    .sort((a, b) => a.org.name.localeCompare(b.org.name, 'de'));

  const conflicts = links.conflicts
    .filter((c) => c.mandateId === mandateId)
    .map((c) => {
      const org = links.orgs[c.orgId];
      return org ? { ...c, org } : null;
    })
    .filter((c): c is LobbyConflict & { org: LobbyOrg } => c !== null);

  const topicalTies = links.topicalTies
    .filter((t) => t.mandateId === mandateId)
    .map((t) => {
      const org = links.orgs[t.orgId];
      return org ? { ...t, org } : null;
    })
    .filter((t): t is TopicalTie & { org: LobbyOrg } => t !== null);

  return { affiliations, conflicts, topicalTies, loading, error };
}

export interface PollLobbyState {
  entries: { org: LobbyOrg; demands: string[]; drucksachen: string[] }[];
  loading: boolean;
  error: string | null;
}

/** The registered interest groups that declared lobbying on one poll's Drucksachen. */
export function usePollLobbying(pollId: number | null): PollLobbyState {
  const { snapshot, loading, error } = useSnapshot();
  if (pollId === null || !snapshot) return { entries: [], loading, error };
  const links = snapshot.lobbyLinks;
  const entries = (links.pollLobbying[String(pollId)] ?? [])
    .map((e) => {
      const org = links.orgs[e.orgId];
      return org ? { org, demands: e.demands, drucksachen: e.drucksachen } : null;
    })
    .filter((e): e is { org: LobbyOrg; demands: string[]; drucksachen: string[] } => e !== null);
  return { entries, loading, error };
}

export interface CrossrefRow {
  conflict: LobbyConflict;
  org: LobbyOrg;
  memberName: string;
  party: string;
  mandateId: number;
  politicianId: number | null;
  pollTitle: string;
  pollDate: string;
}

/**
 * Every member/bill cross-reference, newest bill first, ready for the Lobby & Finance table.
 *
 * Ordering puts the strongest evidence on top: a vote that went against a curated, sourced
 * stance of the member's own organisation first, then votes that broke from their fraction,
 * then the rest.
 */
export function useCrossrefRows(): { rows: CrossrefRow[]; loading: boolean; error: string | null } {
  const { snapshot, loading, error } = useSnapshot();
  if (!snapshot) return { rows: [], loading, error };

  const memberByMandate = new Map(snapshot.members.map((m) => [m.mandateId, m]));
  const rows: CrossrefRow[] = [];
  for (const conflict of snapshot.lobbyLinks.conflicts) {
    const org = snapshot.lobbyLinks.orgs[conflict.orgId];
    const poll = snapshot.polls.find((p) => p.id === conflict.pollId);
    if (!org || !poll) continue;
    const member = memberByMandate.get(conflict.mandateId);
    rows.push({
      conflict,
      org,
      memberName: member?.name ?? '—',
      party: member?.party ?? '—',
      mandateId: conflict.mandateId,
      politicianId: member?.id ?? null,
      pollTitle: poll.title,
      pollDate: poll.date,
    });
  }

  const rank = (r: CrossrefRow) => (r.conflict.againstPosition ? 0 : r.conflict.againstFraction ? 1 : 2);
  rows.sort((a, b) => rank(a) - rank(b) || b.pollDate.localeCompare(a.pollDate));
  return { rows, loading, error };
}

export interface TopicalTieRow {
  tie: TopicalTie;
  org: LobbyOrg;
  memberName: string;
  party: string;
  mandateId: number;
  politicianId: number | null;
  pollTitle: string;
  pollDate: string;
}

/** Every member/bill topical tie, ready for the Lobby & Finance page's "same policy area" table. Kept in its own list, never merged with useCrossrefRows — see TopicalTie. */
export function useTopicalTieRows(): { rows: TopicalTieRow[]; loading: boolean; error: string | null } {
  const { snapshot, loading, error } = useSnapshot();
  if (!snapshot) return { rows: [], loading, error };

  const memberByMandate = new Map(snapshot.members.map((m) => [m.mandateId, m]));
  const rows: TopicalTieRow[] = [];
  for (const tie of snapshot.lobbyLinks.topicalTies) {
    const org = snapshot.lobbyLinks.orgs[tie.orgId];
    const poll = snapshot.polls.find((p) => p.id === tie.pollId);
    if (!org || !poll) continue;
    const member = memberByMandate.get(tie.mandateId);
    rows.push({
      tie,
      org,
      memberName: member?.name ?? '—',
      party: member?.party ?? '—',
      mandateId: tie.mandateId,
      politicianId: member?.id ?? null,
      pollTitle: poll.title,
      pollDate: poll.date,
    });
  }
  rows.sort((a, b) => b.pollDate.localeCompare(a.pollDate));
  return { rows, loading, error };
}

export interface PartyDonationSummary {
  fraction: string;
  total: number;
  count: number;
  donations: PartyDonation[];
}

/** Large donations grouped by party, biggest total first. */
export function usePartyDonations(): {
  byFraction: PartyDonationSummary[];
  all: PartyDonation[];
  loading: boolean;
  error: string | null;
} {
  const { snapshot, loading, error } = useSnapshot();
  if (!snapshot) return { byFraction: [], all: [], loading, error };
  const grouped = new Map<string, PartyDonation[]>();
  for (const d of snapshot.partyDonations) {
    const list = grouped.get(d.fraction) ?? [];
    list.push(d);
    grouped.set(d.fraction, list);
  }
  const byFraction = [...grouped.entries()]
    .map(([fraction, donations]) => ({
      fraction,
      total: donations.reduce((sum, d) => sum + d.amountEuro, 0),
      count: donations.length,
      donations: [...donations].sort((a, b) => b.amountEuro - a.amountEuro),
    }))
    .sort((a, b) => b.total - a.total);
  return { byFraction, all: snapshot.partyDonations, loading, error };
}
