import type { RealMp } from './bundestag';
import { useSnapshot } from './snapshot';

export interface Committee {
  id: number;
  name: string;
  topics: string[];
  url: string | null;
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

/**
 * One hand-picked icon per committee (Material Symbols, Outlined, self-hosted under
 * public/icons/committees/) — the Bundestag itself has no icon taxonomy, so this is a curated
 * mapping keyed by committee id rather than derived from field_topics, since several committees
 * share the same topic tags but need visually distinct icons (e.g. the Rechtsausschuss and the
 * Europarecht subcommittee both list "Recht", but one is domestic law, the other EU law).
 * Keyed by id (stable across a legislature) rather than name, which can change wording slightly
 * between terms.
 */
const COMMITTEE_ICON_BY_ID: Record<number, { icon: string; alt: string }> = {
  6484: { icon: 'policy', alt: 'Geldwäscheprävention' },
  6338: { icon: 'coronavirus', alt: 'Pandemie' },
  6337: { icon: 'public', alt: 'Europarecht' },
  6336: { icon: 'handshake', alt: 'Krisenprävention und Friedensförderung' },
  6335: { icon: 'public', alt: 'Internationale Ordnung' },
  6333: { icon: 'shield', alt: 'Rüstungskontrolle' },
  6332: { icon: 'school', alt: 'Auswärtige Kultur- und Bildungspolitik' },
  6252: { icon: 'eco', alt: 'Nachhaltige Entwicklung' },
  6174: { icon: 'account_balance', alt: 'Vertrauensgremium' },
  6173: { icon: 'account_balance_wallet', alt: 'Bundesfinanzierung' },
  6172: { icon: 'child_care', alt: 'Kinderbelange' },
  6138: { icon: 'fact_check', alt: 'Rechnungsprüfung' },
  6137: { icon: 'public', alt: 'EU-Angelegenheiten' },
  6115: { icon: 'how_to_vote', alt: 'Wahlprüfung' },
  6113: { icon: 'payments', alt: 'Finanzen' },
  6108: { icon: 'home_work', alt: 'Wohnen und Bauwesen' },
  6107: { icon: 'handshake', alt: 'Wirtschaftliche Zusammenarbeit' },
  6106: { icon: 'bolt', alt: 'Wirtschaft und Energie' },
  6105: { icon: 'rule', alt: 'Geschäftsordnung' },
  6104: { icon: 'shield', alt: 'Verteidigung' },
  6103: { icon: 'commute', alt: 'Verkehr' },
  6102: { icon: 'forest', alt: 'Umwelt und Klimaschutz' },
  6101: { icon: 'flight', alt: 'Tourismus' },
  6100: { icon: 'sports_soccer', alt: 'Sport' },
  6099: { icon: 'gavel', alt: 'Recht' },
  6096: { icon: 'campaign', alt: 'Petitionen' },
  6093: { icon: 'volunteer_activism', alt: 'Menschenrechte' },
  6092: { icon: 'agriculture', alt: 'Landwirtschaft' },
  6091: { icon: 'palette', alt: 'Kultur und Medien' },
  6090: { icon: 'security', alt: 'Innere Sicherheit' },
  6089: { icon: 'account_balance_wallet', alt: 'Haushalt' },
  6088: { icon: 'medical_services', alt: 'Gesundheit' },
  6087: { icon: 'rocket_launch', alt: 'Forschung und Raumfahrt' },
  6085: { icon: 'public', alt: 'Europäische Union' },
  6084: { icon: 'computer', alt: 'Digitales' },
  6083: { icon: 'family_restroom', alt: 'Familie und Bildung' },
  6082: { icon: 'flag', alt: 'Außenpolitik' },
  6081: { icon: 'handshake', alt: 'Arbeit und Soziales' },
  5995: { icon: 'visibility', alt: 'Kontrollgremium' },
};
/** Generic government-building icon for any committee not yet in the curated map above (e.g. a
 * newly created one this legislature) — better than showing nothing, but deliberately never the
 * icon a real curated entry would get, so a missing mapping is visually obvious rather than
 * silently blending in. */
const COMMITTEE_ICON_FALLBACK = { icon: 'account_balance', alt: 'Ausschuss' };

export function committeeIcon(id: number): { icon: string; alt: string } {
  const entry = COMMITTEE_ICON_BY_ID[id] ?? COMMITTEE_ICON_FALLBACK;
  return { icon: `/icons/committees/${entry.icon}.svg`, alt: entry.alt };
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
