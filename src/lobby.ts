import { useSnapshot } from './snapshot';
import type { VoteChoice } from './polls';
import type { RealMp } from './bundestag';

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
  /** The register's own classification of what kind of interest representative this is (Unternehmen, Verband, Beratungsunternehmen, Wissenschaft, Privatperson, …). */
  actorType: string | null;
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
  /**
   * Whether the member also sits on the Bundestag committee actually responsible for this
   * poll's topic — an official, verifiable fact (abgeordnetenwatch's own committee/topic data),
   * never a guess. Materially stronger than the field-of-interest match alone: not just "their
   * org is in a related industry", but "they personally sit on the body that handles bills like
   * this one". Still not a document trail — keep it visually distinct from LobbyConflict.
   */
  onRelevantCommittee: boolean;
  relevantCommitteeNames: string[];
}

export interface PartyLobbyField {
  field: string;
  /** Distinct organisations tied to this party's members that declare this field — an org with several members of the same party counts once, not once per member. */
  orgCount: number;
}

export interface PartyLobbyTopOrg {
  orgId: string;
  memberCount: number;
}

export interface PartyLobbySummary {
  party: string;
  orgCount: number;
  memberCount: number;
  expensesEuro: { from: number; to: number };
  byField: PartyLobbyField[];
  topOrgs: PartyLobbyTopOrg[];
}

export interface LobbyLinks {
  orgs: Record<string, LobbyOrg>;
  pollLobbying: Record<string, PollLobbyEntry[]>;
  affiliations: Record<string, Affiliation[]>;
  conflicts: LobbyConflict[];
  topicalTies: TopicalTie[];
  donorLinks: Record<string, string>;
  partyLobbySummary: PartyLobbySummary[];
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
  partyLobbySummary: [],
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
  pollTopic: string;
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
      pollTopic: poll.topic,
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
  // Committee-verified ties first — an official, verifiable fact, not just a field-of-interest
  // guess — then newest bill first within each group.
  rows.sort((a, b) => Number(b.tie.onRelevantCommittee) - Number(a.tie.onRelevantCommittee) || b.pollDate.localeCompare(a.pollDate));
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
  const all = [...snapshot.partyDonations].sort((a, b) => b.amountEuro - a.amountEuro);
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
  return { byFraction, all, loading, error };
}

export interface OrgListEntry {
  org: LobbyOrg;
  affiliatedMemberCount: number;
  lobbiedPollCount: number;
  /** Distinct parties of affiliated members, biggest tie first — powers the party filter. */
  parties: string[];
}

/**
 * Every organisation referenced by something (a member tie, a lobbied vote, or a large
 * donation) — the browsable index for organisation-centric pages. Pure lookup, no fetching.
 */
export function useOrgList(): { orgs: OrgListEntry[]; loading: boolean; error: string | null } {
  const { snapshot, loading, error } = useSnapshot();
  if (!snapshot) return { orgs: [], loading, error };
  const links = snapshot.lobbyLinks;

  const memberCountByOrg = new Map<string, number>();
  for (const orgLinks of Object.values(links.affiliations)) {
    for (const link of orgLinks) memberCountByOrg.set(link.orgId, (memberCountByOrg.get(link.orgId) ?? 0) + 1);
  }
  const pollCountByOrg = new Map<string, number>();
  for (const entries of Object.values(links.pollLobbying)) {
    for (const entry of entries) pollCountByOrg.set(entry.orgId, (pollCountByOrg.get(entry.orgId) ?? 0) + 1);
  }
  const partyByMandate = new Map(snapshot.members.map((m) => [String(m.mandateId), m.party]));
  const partyCountsByOrg = new Map<string, Map<string, number>>();
  for (const [mandateId, orgLinks] of Object.entries(links.affiliations)) {
    const party = partyByMandate.get(mandateId);
    if (!party) continue;
    for (const link of orgLinks) {
      const counts = partyCountsByOrg.get(link.orgId) ?? new Map<string, number>();
      counts.set(party, (counts.get(party) ?? 0) + 1);
      partyCountsByOrg.set(link.orgId, counts);
    }
  }

  const orgs = Object.values(links.orgs)
    .map((org) => ({
      org,
      affiliatedMemberCount: memberCountByOrg.get(org.id) ?? 0,
      lobbiedPollCount: pollCountByOrg.get(org.id) ?? 0,
      parties: [...(partyCountsByOrg.get(org.id)?.entries() ?? [])].sort((a, b) => b[1] - a[1]).map(([party]) => party),
    }))
    .sort((a, b) => b.affiliatedMemberCount - a.affiliatedMemberCount || b.lobbiedPollCount - a.lobbiedPollCount || a.org.name.localeCompare(b.org.name, 'de'));
  return { orgs, loading, error };
}

export interface OrgLobbiedPoll {
  pollId: number;
  pollTitle: string;
  pollDate: string;
  demands: string[];
}

export interface OrgAffiliatedMember {
  member: RealMp;
  roles: string[];
  categories: string[];
}

export interface OrgDetailState {
  org: LobbyOrg | null;
  lobbiedPolls: OrgLobbiedPoll[];
  affiliatedMembers: OrgAffiliatedMember[];
  conflicts: (LobbyConflict & { memberName: string; politicianId: number | null; pollTitle: string; pollDate: string })[];
  topicalTies: (TopicalTie & { memberName: string; politicianId: number | null; pollTitle: string; pollDate: string })[];
  /** Party donor names (from the >35k€ disclosures) that this organisation is itself registered under. Usually empty — most large donors are private individuals or holding companies, not registered lobbyists. */
  donorNames: string[];
  loading: boolean;
  error: string | null;
}

/** Everything tied to one organisation — the reverse of the member-centric view. Pure lookup, no fetching: this is the same lobby-links.json data read from a different direction. */
export function useOrgDetail(orgId: string | null): OrgDetailState {
  const { snapshot, loading, error } = useSnapshot();
  const empty: OrgDetailState = { org: null, lobbiedPolls: [], affiliatedMembers: [], conflicts: [], topicalTies: [], donorNames: [], loading, error };
  if (orgId === null || !snapshot) return empty;

  const links = snapshot.lobbyLinks;
  const org = links.orgs[orgId] ?? null;
  if (!org) return empty;

  const memberByMandate = new Map(snapshot.members.map((m) => [m.mandateId, m]));
  const pollById = new Map(snapshot.polls.map((p) => [p.id, p]));

  const lobbiedPolls: OrgLobbiedPoll[] = [];
  for (const [pollIdStr, entries] of Object.entries(links.pollLobbying)) {
    const entry = entries.find((e) => e.orgId === orgId);
    if (!entry) continue;
    const poll = pollById.get(Number(pollIdStr));
    if (!poll) continue;
    lobbiedPolls.push({ pollId: poll.id, pollTitle: poll.title, pollDate: poll.date, demands: entry.demands });
  }
  lobbiedPolls.sort((a, b) => b.pollDate.localeCompare(a.pollDate));

  const affiliatedMembers: OrgAffiliatedMember[] = [];
  for (const [mandateIdStr, orgLinks] of Object.entries(links.affiliations)) {
    const link = orgLinks.find((l) => l.orgId === orgId);
    if (!link) continue;
    const member = memberByMandate.get(Number(mandateIdStr));
    if (!member) continue;
    affiliatedMembers.push({ member, roles: link.roles, categories: link.categories });
  }
  affiliatedMembers.sort((a, b) => a.member.name.localeCompare(b.member.name, 'de'));

  const conflicts = links.conflicts
    .filter((c) => c.orgId === orgId)
    .map((c) => {
      const member = memberByMandate.get(c.mandateId);
      const poll = pollById.get(c.pollId);
      if (!poll) return null;
      return { ...c, memberName: member?.name ?? '—', politicianId: member?.id ?? null, pollTitle: poll.title, pollDate: poll.date };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const topicalTies = links.topicalTies
    .filter((t) => t.orgId === orgId)
    .map((t) => {
      const member = memberByMandate.get(t.mandateId);
      const poll = pollById.get(t.pollId);
      if (!poll) return null;
      return { ...t, memberName: member?.name ?? '—', politicianId: member?.id ?? null, pollTitle: poll.title, pollDate: poll.date };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  const donorNames = Object.entries(links.donorLinks)
    .filter(([, linkedOrgId]) => linkedOrgId === orgId)
    .map(([donorName]) => donorName);

  return { org, lobbiedPolls, affiliatedMembers, conflicts, topicalTies, donorNames, loading, error };
}

/** Per-party lobbying summary — pure lookup, no fetching. Biggest tally first. */
export function usePartyLobbySummary(): { summaries: PartyLobbySummary[]; loading: boolean; error: string | null } {
  const { snapshot, loading, error } = useSnapshot();
  if (!snapshot) return { summaries: [], loading, error };
  return { summaries: snapshot.lobbyLinks.partyLobbySummary, loading, error };
}

export interface OrgPartyTie {
  party: string;
  memberCount: number;
}

export interface OrgNetworkNode {
  org: LobbyOrg;
  /** One entry per party with at least one tied member, biggest first. */
  ties: OrgPartyTie[];
  totalMembers: number;
}

/**
 * Every organisation with at least one MP affiliation, aggregated by party — powers the
 * party↔org network graph. Built directly from `affiliations`, not from
 * `partyLobbySummary.topOrgs` (which the fetch pipeline caps at 10 orgs per party and would
 * silently drop most cross-party ties — the exact thing this graph exists to surface).
 */
export function useOrgPartyNetwork(): { orgs: OrgNetworkNode[]; loading: boolean; error: string | null } {
  const { snapshot, loading, error } = useSnapshot();
  if (!snapshot) return { orgs: [], loading, error };

  const partyByMandate = new Map(snapshot.members.map((m) => [m.mandateId, m.party]));
  const tieCounts = new Map<string, Map<string, number>>();

  for (const [mandateIdStr, affs] of Object.entries(snapshot.lobbyLinks.affiliations)) {
    const party = partyByMandate.get(Number(mandateIdStr));
    if (!party) continue;
    for (const a of affs) {
      if (!snapshot.lobbyLinks.orgs[a.orgId]) continue;
      let byParty = tieCounts.get(a.orgId);
      if (!byParty) {
        byParty = new Map();
        tieCounts.set(a.orgId, byParty);
      }
      byParty.set(party, (byParty.get(party) ?? 0) + 1);
    }
  }

  const orgs: OrgNetworkNode[] = [...tieCounts.entries()].map(([orgId, byParty]) => {
    const ties = [...byParty.entries()].map(([party, memberCount]) => ({ party, memberCount })).sort((a, b) => b.memberCount - a.memberCount);
    return { org: snapshot.lobbyLinks.orgs[orgId], ties, totalMembers: ties.reduce((sum, t) => sum + t.memberCount, 0) };
  });
  orgs.sort((a, b) => b.ties.length - a.ties.length || b.totalMembers - a.totalMembers);

  return { orgs, loading, error };
}
