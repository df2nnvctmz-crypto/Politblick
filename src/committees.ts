import type { RealMp } from './bundestag';
import { useSnapshot } from './snapshot';

export interface Committee {
  id: number;
  name: string;
  topics: string[];
}

export type CommitteeRole = 'member' | 'chairperson' | 'vice_chairperson' | 'foreperson' | 'spokesperson' | 'alternate_member';

export interface CommitteeMembership {
  mandateId: number;
  committeeId: number;
  role: string;
}

/** Lower sorts first — leadership roles surface above the plain membership list. Unknown roles
 * (the API adds new ones occasionally) sort last rather than crashing. */
const ROLE_RANK: Record<string, number> = {
  chairperson: 0,
  foreperson: 0,
  vice_chairperson: 1,
  spokesperson: 2,
  member: 3,
  alternate_member: 4,
};

function roleRank(role: string): number {
  return ROLE_RANK[role] ?? 5;
}

export interface CommitteeListEntry {
  committee: Committee;
  memberCount: number;
}

/** All committees with their current (voting + alternate) member count, sorted alphabetically — a
 * plain browse list, not a ranking, so alphabetical reads more naturally than "biggest first". */
export function useCommitteeList(): { entries: CommitteeListEntry[]; loading: boolean; error: string | null } {
  const { snapshot, loading, error } = useSnapshot();
  if (!snapshot) return { entries: [], loading, error };
  const countByCommittee = new Map<number, number>();
  for (const m of snapshot.committeeMemberships) {
    countByCommittee.set(m.committeeId, (countByCommittee.get(m.committeeId) ?? 0) + 1);
  }
  const entries = [...snapshot.committees]
    .map((committee) => ({ committee, memberCount: countByCommittee.get(committee.id) ?? 0 }))
    .sort((a, b) => a.committee.name.localeCompare(b.committee.name, 'de'));
  return { entries, loading, error };
}

export interface CommitteeMemberRow {
  role: string;
  mandateId: number;
  member: RealMp | undefined;
}

export interface CommitteeDetail {
  committee: Committee;
  members: CommitteeMemberRow[];
}

/** A single committee's roster, resolved against the roster snapshot — `member` is undefined for
 * mandates outside the current legislature snapshot (e.g. someone who has since left office). */
export function useCommitteeDetail(committeeId: string | null): { detail: CommitteeDetail | null; loading: boolean; error: string | null } {
  const { snapshot, loading, error } = useSnapshot();
  if (!snapshot || committeeId === null) return { detail: null, loading, error };
  const id = Number(committeeId);
  const committee = snapshot.committees.find((c) => c.id === id);
  if (!committee) return { detail: null, loading, error };
  const mandateToMember = new Map(snapshot.members.map((m) => [m.mandateId, m]));
  const members = snapshot.committeeMemberships
    .filter((m) => m.committeeId === id)
    .map((m) => ({ role: m.role, mandateId: m.mandateId, member: mandateToMember.get(m.mandateId) }))
    .sort((a, b) => roleRank(a.role) - roleRank(b.role) || (a.member?.name ?? '').localeCompare(b.member?.name ?? '', 'de'));
  return { detail: { committee, members }, loading, error };
}

export interface MemberCommitteeRow {
  committee: Committee;
  role: string;
}

/** The committees a single MP sits on, for the profile page — leadership roles first. */
export function useMemberCommittees(mandateId: number | null): { rows: MemberCommitteeRow[]; loading: boolean; error: string | null } {
  const { snapshot, loading, error } = useSnapshot();
  if (!snapshot || mandateId === null) return { rows: [], loading, error };
  const committeesById = new Map(snapshot.committees.map((c) => [c.id, c]));
  const rows = snapshot.committeeMemberships
    .filter((m) => m.mandateId === mandateId)
    .map((m) => ({ committee: committeesById.get(m.committeeId), role: m.role }))
    .filter((r): r is MemberCommitteeRow => Boolean(r.committee))
    .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.committee.name.localeCompare(b.committee.name, 'de'));
  return { rows, loading, error };
}
