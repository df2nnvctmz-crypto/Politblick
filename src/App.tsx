import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import {
  BILLS,
  DEMO_MPS,
  DEMO_PARTY_META,
  TOPICS_DE,
  TOPICS_EN,
  TRANSLATIONS,
  type Lang,
} from './data';
import { initials, trendPoints } from './helpers';
import { FALLBACK_PARTY_COLOR, REAL_PARTY_COLORS, useBundestagRoster, type RealMp } from './bundestag';
import { computeAllAlignments, computeDivergences, computeMemberAlignment, useAllPolls, useMandateVotes, usePollResult, useRecentPollResults, useWeeklyResults, type PollResult } from './polls';
import { useSidejobs } from './sidejobs';
import { useOnScreen, usePortrait } from './portraits';
import { useSnapshot } from './snapshot';
import {
  formatEuro,
  formatExpenseBracket,
  useCrossrefRows,
  useMemberLobby,
  useOrgDetail,
  useOrgList,
  usePartyDonations,
  usePartyLobbySummary,
  usePollLobbying,
  useTopicalTieRows,
  type CrossrefRow,
} from './lobby';

type View = 'home' | 'search' | 'profile' | 'bill' | 'crossref' | 'org' | 'party' | 'impressum' | 'disclaimer';
type ProfileTab = 'overview' | 'votes' | 'lobby' | 'finance';
type LobbyTab = 'overview' | 'parties' | 'orgs' | 'conflicts' | 'topical' | 'donations';
type BillId = string | number;

const voteBg: Record<string, string> = {
  yes: 'oklch(50% 0.14 155)',
  no: 'oklch(55% 0.16 40)',
  abstain: 'oklch(80% 0.006 260)',
  no_show: 'oklch(70% 0.008 260)',
};

function formatWeekRange(range: { start: Date; end: Date }, lang: Lang): string {
  const fmt = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short' });
  return `${fmt.format(range.start)} – ${fmt.format(range.end)}`;
}

function formatDateTime(iso: string, lang: Lang): string {
  const fmt = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return fmt.format(new Date(iso));
}

/**
 * Rapidly clicking through several profiles/bills (each of which fires votes + sidejobs +
 * a portrait lookup) means every one visited for even a few milliseconds still fires its
 * full fetch chain, none of which get cancelled when the user moves on — those stale
 * requests pile up and can starve the one the user actually stops on. Debouncing the id
 * means a profile/bill only actually triggers network calls once the user has stayed on it
 * for a beat, so flicking past several in a row costs nothing.
 */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function stop(fn: () => void) {
  return (e: MouseEvent) => {
    e.preventDefault();
    fn();
  };
}

function navStyle(active: boolean): CSSProperties {
  return {
    paddingBottom: 2,
    borderBottom: `2px solid ${active ? 'oklch(20% 0.01 260)' : 'transparent'}`,
    color: active ? 'oklch(20% 0.01 260)' : 'inherit',
  };
}

/** Lazy portrait for list rows: only resolves once scrolled near-into-view, falls back to colored initials. */
function MpAvatar({ politicianId, name, color, initials, size }: { politicianId: number; name: string; color: string; initials: string; size: number }) {
  const [ref, visible] = useOnScreen<HTMLDivElement>();
  const portrait = usePortrait(visible ? politicianId : null);
  if (portrait.url) {
    return (
      <img
        src={portrait.url}
        alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'oklch(90% 0.006 260)' }}
      />
    );
  }
  return (
    <div
      ref={ref}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.32,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function pillBtn(active: boolean): CSSProperties {
  return {
    padding: '6px 13px',
    border: 'none',
    cursor: 'pointer',
    background: active ? 'oklch(45% 0.16 265)' : 'white',
    color: active ? 'white' : 'oklch(30% 0.01 260)',
  };
}

/**
 * Wide data tables scroll horizontally on narrow screens. A bare overflow-x:auto container
 * gives no hint that there's more off to the side, so the right-hand columns just look
 * missing on mobile. This adds a small "swipe" caption (mobile only, via .pb-scroll-hint's
 * media query) plus edge shadows that fade in/out based on actual scroll position.
 */
function ScrollBox({ children, style, hintText }: { children: ReactNode; style: CSSProperties; hintText: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = () => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
    // Bail out when nothing changed so this never becomes an infinite render loop —
    // the ResizeObserver below fires on layout changes that don't move the edges too.
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  };

  useEffect(() => {
    updateEdges();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <div className="pb-scroll-hint" style={{ alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'oklch(50% 0.14 265)', marginBottom: 6 }}>
        <span aria-hidden>↔</span>
        {hintText}
      </div>
      <div ref={ref} onScroll={updateEdges} className="pb-scroll" style={{ overflowX: 'auto', ...style }}>
        {children}
      </div>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 22,
          pointerEvents: 'none',
          borderRadius: '14px 0 0 14px',
          background: 'linear-gradient(to right, oklch(20% 0.02 260 / 0.14), transparent)',
          opacity: edges.left ? 1 : 0,
          transition: 'opacity 150ms',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: 22,
          pointerEvents: 'none',
          borderRadius: '0 14px 14px 0',
          background: 'linear-gradient(to left, oklch(20% 0.02 260 / 0.14), transparent)',
          opacity: edges.right ? 1 : 0,
          transition: 'opacity 150ms',
        }}
      />
    </div>
  );
}

type MatrixCell = { party: string; topic: string };

/**
 * The "voted despite own tie" table is real signal, but as 34 rows of text it takes reading
 * every row to notice where it clusters. This turns party × policy-area into a small heatmap
 * so a concentration (e.g. one party, one topic, several rows) is visible at a glance — and
 * clicking a cell filters the table below to just that slice.
 */
function TieMatrix({
  rows,
  partyOrder,
  selected,
  onSelect,
  scrollHintText,
}: {
  rows: CrossrefRow[];
  partyOrder: { name: string; color: string }[];
  selected: MatrixCell | null;
  onSelect: (cell: MatrixCell | null) => void;
  scrollHintText: string;
}) {
  const counts = new Map<string, number>();
  const topicTotals = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.party}|${r.pollTopic}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    topicTotals.set(r.pollTopic, (topicTotals.get(r.pollTopic) ?? 0) + 1);
  }
  const topics = [...topicTotals.entries()].sort((a, b) => b[1] - a[1]).map(([topic]) => topic);
  const activeParties = partyOrder.filter((p) => rows.some((r) => r.party === p.name));
  const max = Math.max(1, ...counts.values());

  if (activeParties.length === 0 || topics.length === 0) return null;

  const heat = (n: number): { bg: string; fg: string } => {
    if (n === 0) return { bg: 'oklch(97% 0.006 260)', fg: 'oklch(78% 0.006 260)' };
    const t = Math.min(1, n / max);
    return {
      bg: `oklch(${(88 - t * 46).toFixed(0)}% ${(0.05 + t * 0.15).toFixed(3)} 40)`,
      fg: t > 0.5 ? 'white' : 'oklch(30% 0.06 40)',
    };
  };

  return (
    <ScrollBox hintText={scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14, marginBottom: 14 }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12.5, background: 'white' }}>
        <thead>
          <tr>
            <th style={{ padding: '8px 12px' }} />
            {topics.map((topic) => (
              <th
                key={topic}
                style={{ padding: '8px 8px', fontSize: 10, fontWeight: 700, color: 'oklch(45% 0.01 260)', textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}
              >
                {topic}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activeParties.map((p) => (
            <tr key={p.name}>
              <td style={{ padding: '6px 12px', fontWeight: 700, whiteSpace: 'nowrap', borderTop: '1px solid oklch(93% 0.006 260)' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: p.color, marginRight: 6 }} />
                {p.name}
              </td>
              {topics.map((topic) => {
                const n = counts.get(`${p.name}|${topic}`) ?? 0;
                const { bg, fg } = heat(n);
                const isSelected = selected?.party === p.name && selected?.topic === topic;
                return (
                  <td key={topic} style={{ padding: 4, borderTop: '1px solid oklch(93% 0.006 260)', textAlign: 'center' }}>
                    <button
                      disabled={n === 0}
                      onClick={() => onSelect(isSelected ? null : { party: p.name, topic })}
                      style={{
                        width: 34,
                        height: 28,
                        border: isSelected ? '2px solid oklch(45% 0.16 265)' : '1px solid transparent',
                        borderRadius: 7,
                        background: bg,
                        color: fg,
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: n === 0 ? 'default' : 'pointer',
                      }}
                    >
                      {n || ''}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollBox>
  );
}

function App() {
  const [view, setView] = useState<View>('home');
  const [lang, setLang] = useState<Lang>('de');
  const [selectedMpId, setSelectedMpId] = useState<string | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<BillId | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [orgSearchQuery, setOrgSearchQuery] = useState('');
  const [profileTab, setProfileTab] = useState<ProfileTab>('overview');
  const [lobbyTab, setLobbyTab] = useState<LobbyTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [partyFilter, setPartyFilter] = useState<Record<string, boolean>>({});
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [hoveredAlignmentPoint, setHoveredAlignmentPoint] = useState<number | null>(null);
  const [tieMatrixFilter, setTieMatrixFilter] = useState<MatrixCell | null>(null);

  const { snapshot } = useSnapshot();
  const roster = useBundestagRoster();
  const pollsState = useAllPolls();
  const weekly = useWeeklyResults(pollsState.polls);
  // Shared across the whole app: the search list computes every visible member's alignment
  // from this same fetch (no per-row network calls), and the profile page reuses it too.
  const recentPolls = useRecentPollResults(pollsState.polls);
  const mandateToMember = new Map(roster.members.map((m) => [m.mandateId, m]));

  const t = TRANSLATIONS[lang];
  const topics = lang === 'de' ? TOPICS_DE : TOPICS_EN;
  const activeTopic = topicFilter || topics[0];

  const goHome = () => setView('home');
  const goSearch = () => setView('search');
  const goCrossref = (tab: LobbyTab = 'overview') => {
    setView('crossref');
    setLobbyTab(tab);
  };
  const goImpressum = () => setView('impressum');
  const goDisclaimer = () => setView('disclaimer');
  const openMp = (id: string) => {
    setView('profile');
    setSelectedMpId(id);
    setProfileTab('overview');
  };
  const openBill = (id: BillId) => {
    setView('bill');
    setSelectedBillId(id);
  };
  const openOrg = (id: string) => {
    setView('org');
    setSelectedOrgId(id);
  };
  const openParty = (party: string) => {
    setView('party');
    setSelectedParty(party);
  };
  const setLangDe = () => setLang('de');
  const setLangEn = () => setLang('en');
  const toggleFollow = () => {
    if (!selectedMpId) return;
    const id = selectedMpId;
    setFollowing((f) => ({ ...f, [id]: !f[id] }));
  };
  const togglePartyFilter = (party: string) => {
    setPartyFilter((f) => ({ ...f, [party]: f[party] === false ? true : false }));
  };

  // Real, live-fetched Bundestag roster — powers the "MPs tracked" stat, the seat-count
  // cards, and the Search/browse directory. Refetched on mount and every 10 minutes.
  const parties = roster.parties.map((p) => ({
    ...p,
    checked: partyFilter[p.name] !== false,
    toggle: () => togglePartyFilter(p.name),
  }));

  const q = searchQuery.trim().toLowerCase();
  const filteredMps = roster.members.filter((m) => {
    if (partyFilter[m.party] === false) return false;
    if (q && !m.name.toLowerCase().includes(q) && !m.constituency.toLowerCase().includes(q)) return false;
    return true;
  });
  const alignmentByMandate = computeAllAlignments(recentPolls.results);

  // Illustrative sample profiles (not real people) that power the votes/lobby/finance demo content below.
  const demoMps = DEMO_MPS.map((m) => ({ ...m, color: DEMO_PARTY_META[m.party].color, initials: initials(m.name) }));
  const demoFlagCount = demoMps.reduce((sum, m) => sum + m.flags.length, 0);

  const billsWithBreakdown = BILLS.map((b) => {
    const values = Object.values(b.breakdown) as [number, number, number][];
    const totalsYes = values.reduce((a, c) => a + c[0], 0) / values.length;
    return { ...b, summary: lang === 'de' ? b.summaryDe : b.summaryEn, yesPct: Math.round(totalsYes) };
  });

  // Real data for the current sitting week: recent-votes feed, "against expectation" cards,
  // and the featured-vote widget. Each divergence is a plain statistical fact (this member's
  // vote differed from their own fraction's majority on this specific poll) — never a claim
  // about motive, sourced live from abgeordnetenwatch.de's roll-call vote records.
  const weekLabel = weekly.weekRange ? formatWeekRange(weekly.weekRange, lang) : '';
  const weeklyFeedItems = weekly.results.map((r) => {
    const divergence = weekly.divergences.find((d) => d.poll.id === r.poll.id);
    return {
      result: r,
      flag: !!divergence,
      flagText: divergence
        ? `${divergence.member.name}: ${t.realAgainstPartyTemplate.replace('{party}', divergence.member.party)}`
        : '',
    };
  });
  const realAgainstExpectation = weekly.divergences.slice(0, 4).map((d) => {
    const rm = mandateToMember.get(d.member.mandateId);
    const label = d.member.vote === 'yes' ? t.voteYes : d.member.vote === 'no' ? t.voteNo : t.voteAbstain;
    return {
      mpName: d.member.name,
      billTitle: d.poll.title,
      color: REAL_PARTY_COLORS[d.member.party] || FALLBACK_PARTY_COLOR,
      reason: t.realAgainstPartyTemplate.replace('{party}', d.member.party),
      voteLabel: label,
      bg: voteBg[d.member.vote],
      onOpen: rm ? () => openMp(String(rm.id)) : undefined,
    };
  });
  const featuredResult: PollResult | null = weekly.results[0] ?? null;

  // A profile is either one of the 8 illustrative demo MPs (full sample analysis content)
  // or a real, live-fetched Bundestag member (factual name/party/constituency only — no
  // fabricated votes/lobby/donations are ever attached to a real person).
  const demoMatch = demoMps.find((m) => m.id === selectedMpId);
  const realMatch = roster.members.find((m) => String(m.id) === selectedMpId);
  // Votes/sidejobs are now pure in-memory lookups in the static snapshot (no debounce needed).
  // Portraits still call out live (Wikidata + a small abgeordnetenwatch lookup), so that one
  // still debounces to avoid firing a lookup for every profile flicked past while browsing.
  const debouncedPoliticianId = useDebounced(realMatch ? realMatch.id : null, 350);
  const mandateVotes = useMandateVotes(realMatch ? realMatch.mandateId : null);
  const sidejobs = useSidejobs(realMatch ? realMatch.mandateId : null);
  const memberLobby = useMemberLobby(realMatch ? realMatch.mandateId : null);
  // Per-poll lookup so the Abstimmungen tab can show an inline lobby indicator on each vote
  // row, without re-scanning memberLobby's arrays once per row.
  const lobbyByPollId = new Map<number, { hasConflict: boolean; hasTopicalTie: boolean }>();
  for (const c of memberLobby.conflicts) {
    const entry = lobbyByPollId.get(c.pollId) ?? { hasConflict: false, hasTopicalTie: false };
    entry.hasConflict = true;
    lobbyByPollId.set(c.pollId, entry);
  }
  for (const tie of memberLobby.topicalTies) {
    const entry = lobbyByPollId.get(tie.pollId) ?? { hasConflict: false, hasTopicalTie: false };
    entry.hasTopicalTie = true;
    lobbyByPollId.set(tie.pollId, entry);
  }
  const portrait = usePortrait(debouncedPoliticianId);
  // Real, cheaply-derivable stats for a real profile's Overview tab. Bills-voted/attendance cover
  // the full term (cheap — already fetched for the Votes tab); party-alignment is derived (no
  // extra network call) from the shared `recentPolls` fetched once for the whole app.
  const realMpBillsVoted = mandateVotes.votes.filter((v) => v.vote !== 'no_show').length;
  const realMpAttendancePct = mandateVotes.votes.length > 0 ? Math.round((realMpBillsVoted / mandateVotes.votes.length) * 100) : null;
  const alignment = computeMemberAlignment(realMatch?.mandateId ?? -1, recentPolls.results);
  const realMpFlaggedVotes = alignment.points.filter((p) => p.aligned === false);
  const statLabels = [t.statBillsVoted, t.statAttendance, t.statPartyAlignment, t.statFlags];
  type Profile =
    | { kind: 'demo'; mp: (typeof demoMps)[number] & {
        stats: { label: string; value: string | number }[];
        hasFlags: boolean;
        trendPoints: string;
        partyTrendPoints: string;
        voteHistoryResolved: { billTitle: string; date: string; voteLabel: string; bg: string; onOpen: () => void }[];
      } }
    | { kind: 'real'; mp: RealMp }
    | { kind: 'loading' }
    | { kind: 'missing' };
  const profile: Profile = demoMatch
    ? {
        kind: 'demo',
        mp: {
          ...demoMatch,
          stats: demoMatch.statValues.map((value, i) => ({ label: statLabels[i], value })),
          hasFlags: demoMatch.flags.length > 0,
          trendPoints: trendPoints(demoMatch.id.charCodeAt(1)),
          partyTrendPoints: trendPoints(demoMatch.id.charCodeAt(1) + 2),
          voteHistoryResolved: demoMatch.voteHistory.map((v) => {
            const bill = BILLS.find((b) => b.id === v.billId)!;
            const label = v.vote === 'yes' ? t.voteYes : v.vote === 'no' ? t.voteNo : t.voteAbstain;
            return { billTitle: bill.title, date: bill.date, voteLabel: label, bg: voteBg[v.vote], onOpen: () => openBill(bill.id) };
          }),
        },
      }
    : realMatch
      ? { kind: 'real', mp: realMatch }
      : selectedMpId && roster.loading
        ? { kind: 'loading' }
        : { kind: 'missing' };

  const isFollowing = !!(selectedMpId && following[selectedMpId]);

  const profileTabs: { key: ProfileTab; label: string }[] = [
    { key: 'overview', label: t.tabOverview },
    { key: 'votes', label: t.tabVotes },
    { key: 'lobby', label: t.tabLobby },
    { key: 'finance', label: profile.kind === 'real' ? t.tabSidejobs : t.tabFinance },
  ];

  const buildBreakdown = (raw: (typeof billsWithBreakdown)[number]) => ({
    ...raw,
    partyBreakdown: Object.entries(raw.breakdown).map(([party, dist]) => {
      const [y, n, a] = dist as [number, number, number];
      return { party, summary: `${y}/${n}/${a}%`, y, n, a };
    }),
    flaggedMps: demoMps
      .filter((m) => m.flags.length > 0 && m.voteHistory.some((v) => v.billId === raw.id))
      .map((m) => ({ name: m.name, party: m.party, color: m.color, reason: m.flags[0], onOpen: () => openMp(m.id) })),
    onOpen: () => openBill(raw.id),
  });
  const demoBillMatch = billsWithBreakdown.find((b) => b.id === selectedBillId);
  const currentBill = demoBillMatch ? buildBreakdown(demoBillMatch) : null;
  const realPollId = typeof selectedBillId === 'number' ? selectedBillId : null;
  const pollDetail = usePollResult(realPollId);

  // Real cross-references: a member voting on a bill that an organisation they are personally
  // tied to registered lobbying on. Sourced from the Lobbyregister + members' own declarations.
  const crossref = useCrossrefRows();
  const topicalTieRows = useTopicalTieRows();
  const partyDonations = usePartyDonations();
  const pollLobbying = usePollLobbying(realPollId);
  const partyLobby = usePartyLobbySummary();
  const orgList = useOrgList();
  const orgDetail = useOrgDetail(selectedOrgId);
  const filteredOrgs = orgList.orgs.filter((e) => e.org.name.toLowerCase().includes(orgSearchQuery.trim().toLowerCase()));

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        color: 'oklch(20% 0.01 260)',
        background: 'oklch(99% 0.003 260)',
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'oklch(99% 0.003 260 / 0.92)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid oklch(90% 0.006 260)',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: '14px 32px',
          flexWrap: 'wrap',
        }}
      >
        <div onClick={goHome} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: '2px solid oklch(45% 0.16 265)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 13,
                height: 13,
                borderRadius: '50%',
                border: '2px solid oklch(45% 0.16 265 / 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'oklch(20% 0.01 260)' }} />
            </div>
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>Politblick</span>
        </div>
        <nav style={{ display: 'flex', gap: 18, fontSize: 13.5, fontWeight: 600, color: 'oklch(40% 0.01 260)' }}>
          <a onClick={stop(goHome)} href="#" style={navStyle(view === 'home')}>
            {t.navHome}
          </a>
          <a onClick={stop(goSearch)} href="#" style={navStyle(view === 'search')}>
            {t.navMps}
          </a>
          <a onClick={stop(goCrossref)} href="#" style={navStyle(view === 'crossref')}>
            {t.navLobbyFinance}
          </a>
        </nav>
        <div style={{ flex: 1, minWidth: 160, display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setView('search');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setView('search');
              }}
              placeholder={t.searchPlaceholder}
              style={{
                width: '100%',
                padding: '9px 14px 9px 34px',
                borderRadius: 8,
                border: '1px solid oklch(90% 0.006 260)',
                background: 'oklch(97% 0.006 260)',
                fontSize: 13.5,
                outline: 'none',
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 13,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 13,
                color: 'oklch(60% 0.006 260)',
              }}
            >
              ⌕
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          <div
            style={{
              display: 'flex',
              border: '1px solid oklch(90% 0.006 260)',
              borderRadius: 16,
              overflow: 'hidden',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <button onClick={setLangDe} style={pillBtn(lang === 'de')}>
              DE
            </button>
            <button onClick={setLangEn} style={pillBtn(lang === 'en')}>
              EN
            </button>
          </div>
        </div>
      </header>

      {view === 'home' && (
        <main style={{ flex: 1 }}>
          <section style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 32px 40px', textAlign: 'center' }}>
            <div
              style={{
                display: 'inline-block',
                fontSize: 12,
                fontWeight: 700,
                color: 'oklch(45% 0.16 265)',
                background: 'oklch(45% 0.16 265 / 0.08)',
                padding: '5px 12px',
                borderRadius: 20,
                marginBottom: 18,
              }}
            >
              {t.heroKicker}
            </div>
            <h1 style={{ fontSize: 44, lineHeight: 1.08, margin: '0 0 16px', fontWeight: 800, letterSpacing: '-0.02em' }}>
              {t.heroTitle}
            </h1>
            <p style={{ fontSize: 16.5, color: 'oklch(42% 0.01 260)', maxWidth: 600, margin: '0 auto 28px', lineHeight: 1.55 }}>
              {t.heroSub}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={goSearch}
                style={{
                  padding: '12px 22px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'oklch(45% 0.16 265)',
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t.heroCta}
              </button>
              <button
                onClick={() => goCrossref()}
                style={{
                  padding: '12px 22px',
                  borderRadius: 8,
                  border: '1px solid oklch(88% 0.006 260)',
                  background: 'white',
                  color: 'oklch(20% 0.01 260)',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t.heroCta2}
              </button>
            </div>
          </section>

          <section
            style={{
              maxWidth: 1100,
              margin: '0 auto',
              padding: '0 32px 32px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
              gap: 12,
            }}
          >
            <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statMpsLabel}</div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{roster.loading && roster.members.length === 0 ? '…' : roster.members.length}</div>
            </div>
            <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statFlagsLabel}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'oklch(55% 0.16 40)' }}>{demoFlagCount}</div>
            </div>
            {parties.map((p) => (
              <div key={p.name} style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'oklch(48% 0.01 260)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                  {p.name}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{p.seats}</div>
              </div>
            ))}
          </section>

          <section style={{ maxWidth: 1100, margin: '0 auto', padding: '12px 32px 8px' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>{t.expectationTitle}</h2>
            <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)', margin: '0 0 18px', maxWidth: 640 }}>{t.expectationSub}</p>
            {weekly.loading && weekly.results.length === 0 ? (
              <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.pollsLoading}</p>
            ) : realAgainstExpectation.length === 0 ? (
              <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.noPollsThisWeek}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 14 }}>
                {realAgainstExpectation.map((e, i) => (
                  <div
                    key={i}
                    onClick={e.onOpen}
                    style={{
                      cursor: e.onOpen ? 'pointer' : 'default',
                      background: 'white',
                      border: '1px solid oklch(90% 0.006 260)',
                      borderRadius: 12,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.color }} />
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{e.mpName}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: e.bg, color: 'white' }}>
                        {e.voteLabel}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)' }}>{e.billTitle}</div>
                    <div style={{ fontSize: 12.5, color: 'oklch(48% 0.16 40)', fontWeight: 500 }}>{e.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px 8px' }}>
            <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 14, padding: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(45% 0.16 265)', marginBottom: 6 }}>{t.featuredKicker}</div>
              {featuredResult ? (
                <>
                  <h3 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 16px' }}>{featuredResult.poll.title}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                    {featuredResult.partyBreakdown.map((pb) => {
                      const total = pb.yes + pb.no + pb.abstain + pb.noShow || 1;
                      const yesPct = Math.round((pb.yes / total) * 100);
                      return (
                        <div key={pb.party} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 70, fontSize: 11.5, fontWeight: 600, flexShrink: 0 }}>{pb.party}</span>
                          <div style={{ flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', display: 'flex', background: 'oklch(90% 0.006 260)' }}>
                            <div style={{ width: `${yesPct}%`, background: 'oklch(50% 0.14 155)' }} />
                            <div style={{ width: `${100 - yesPct}%`, background: 'oklch(55% 0.16 40)' }} />
                          </div>
                          <span style={{ width: 60, fontSize: 11, color: 'oklch(48% 0.01 260)', textAlign: 'right', flexShrink: 0 }}>{yesPct}%</span>
                        </div>
                      );
                    })}
                  </div>
                  <a href="#" onClick={stop(() => openBill(featuredResult.poll.id))} style={{ fontSize: 12.5, fontWeight: 700 }}>
                    {t.readMore} →
                  </a>
                </>
              ) : (
                <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)', margin: 0 }}>
                  {weekly.loading ? t.pollsLoading : t.noPollsThisWeek}
                </p>
              )}
            </div>
          </section>

          <section style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px 80px' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>{t.feedTitle}</h2>
            <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)', margin: '0 0 20px' }}>
              {t.feedSub}
              {weekLabel ? ` — ${t.weekOf} ${weekLabel}` : ''}
            </p>
            {weekly.error ? (
              <p style={{ fontSize: 13.5, color: 'oklch(48% 0.16 40)' }}>{t.pollsError}</p>
            ) : weekly.loading && weeklyFeedItems.length === 0 ? (
              <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.pollsLoading}</p>
            ) : weeklyFeedItems.length === 0 ? (
              <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.noPollsThisWeek}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 16 }}>
                {weeklyFeedItems.map((f) => (
                  <div
                    key={f.result.poll.id}
                    onClick={() => openBill(f.result.poll.id)}
                    style={{
                      cursor: 'pointer',
                      background: 'white',
                      border: '1px solid oklch(90% 0.006 260)',
                      borderRadius: 12,
                      padding: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'oklch(48% 0.01 260)' }}>
                        {f.result.poll.topic}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)' }}>{f.result.poll.date}</span>
                    </div>
                    <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.3 }}>{f.result.poll.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: 'oklch(93% 0.006 260)' }}>
                        <div style={{ width: `${f.result.yesPct}%`, background: 'oklch(50% 0.14 155)' }} />
                        <div style={{ width: `${100 - f.result.yesPct}%`, background: 'oklch(55% 0.16 40)' }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'oklch(48% 0.01 260)', whiteSpace: 'nowrap' }}>
                        {f.result.yesPct}% {t.voteYes}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: f.result.poll.accepted ? 'oklch(45% 0.14 155)' : 'oklch(48% 0.16 40)' }}>
                      {f.result.poll.accepted ? t.pollAccepted : t.pollRejected}
                    </span>
                    {f.flag && (
                      <div style={{ fontSize: 12, color: 'oklch(48% 0.16 40)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(55% 0.16 40)', display: 'inline-block' }} />
                        {f.flagText}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      )}

      {view === 'search' && (
        <main style={{ flex: 1, maxWidth: 1200, margin: '0 auto', width: '100%', padding: 32, display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <aside style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(45% 0.01 260)', marginBottom: 10 }}>{t.filterParty}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {parties.map((p) => (
                  <label key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={p.checked} onChange={p.toggle} style={{ accentColor: 'oklch(45% 0.16 265)' }} />
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(45% 0.01 260)', marginBottom: 10 }}>{t.filterTopic}</div>
              <select
                value={activeTopic}
                onChange={(e) => setTopicFilter(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid oklch(90% 0.006 260)', fontSize: 13.5, background: 'white' }}
              >
                {topics.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </div>
          </aside>
          <div style={{ flex: 1, minWidth: 320 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{t.navMps}</h2>
              <span style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
                {filteredMps.length} {t.results}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, fontSize: 11.5, color: 'oklch(55% 0.01 260)' }}>
              {roster.error ? (
                <>
                  <span style={{ color: 'oklch(48% 0.16 40)' }}>{t.rosterError}</span>
                  <button
                    onClick={roster.refresh}
                    style={{ border: 'none', background: 'none', color: 'oklch(45% 0.16 265)', fontWeight: 600, cursor: 'pointer', fontSize: 11.5, padding: 0 }}
                  >
                    {t.rosterRetry}
                  </button>
                </>
              ) : roster.loading && roster.members.length === 0 ? (
                <span>{t.rosterLoading}</span>
              ) : roster.lastUpdated ? (
                <>
                  <span>
                    {t.rosterUpdated} {roster.lastUpdated.toLocaleTimeString(lang === 'de' ? 'de-DE' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    onClick={roster.refresh}
                    disabled={roster.loading}
                    style={{ border: 'none', background: 'none', color: 'oklch(45% 0.16 265)', fontWeight: 600, cursor: roster.loading ? 'default' : 'pointer', fontSize: 11.5, padding: 0, opacity: roster.loading ? 0.5 : 1 }}
                  >
                    {roster.loading ? '…' : t.rosterRetry}
                  </button>
                </>
              ) : null}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 14 }}>
              {filteredMps.map((m) => {
                const memberAlignment = alignmentByMandate.get(m.mandateId);
                return (
                  <div
                    key={m.id}
                    onClick={() => openMp(String(m.id))}
                    style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}
                  >
                    <MpAvatar politicianId={m.id} name={m.name} color={m.color} initials={m.initials} size={44} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                      <div style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)' }}>
                        {m.party} · {m.constituency}
                      </div>
                      {memberAlignment?.alignmentPct !== null && memberAlignment !== undefined && (
                        <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 2 }}>
                          {t.statPartyAlignment}: {memberAlignment.alignmentPct}%
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      )}

      {view === 'profile' && (
        <main style={{ flex: 1, maxWidth: 980, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href="#" onClick={stop(goSearch)} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToSearch}
          </a>

          {profile.kind === 'loading' && <p style={{ fontSize: 14, color: 'oklch(48% 0.01 260)', marginTop: 20 }}>{t.loadingProfile}</p>}
          {profile.kind === 'missing' && <p style={{ fontSize: 14, color: 'oklch(48% 0.01 260)', marginTop: 20 }}>{t.profileNotFound}</p>}

          {(profile.kind === 'demo' || profile.kind === 'real') && (
            <>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center', margin: '20px 0 24px', flexWrap: 'wrap' }}>
                {profile.kind === 'real' && portrait.url ? (
                  <img
                    src={portrait.url}
                    alt={profile.mp.name}
                    style={{ width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'oklch(90% 0.006 260)' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: '50%',
                      background: profile.mp.color,
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 24,
                      flexShrink: 0,
                    }}
                  >
                    {profile.mp.initials}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h1 style={{ fontSize: 27, fontWeight: 800, margin: '0 0 4px' }}>{profile.mp.name}</h1>
                  <div style={{ fontSize: 13.5, color: 'oklch(45% 0.01 260)' }}>
                    {profile.mp.party} · {profile.mp.constituency}
                  </div>
                  {profile.kind === 'real' && portrait.url && (
                    <div style={{ fontSize: 10.5, color: 'oklch(60% 0.006 260)', marginTop: 2 }}>{t.photoCredit}</div>
                  )}
                </div>
                <button
                  onClick={toggleFollow}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid oklch(88% 0.006 260)',
                    background: isFollowing ? 'oklch(45% 0.16 265)' : 'white',
                    color: isFollowing ? 'white' : 'oklch(20% 0.01 260)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isFollowing ? t.following : t.follow}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid oklch(90% 0.006 260)', marginBottom: 24 }}>
                {profileTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setProfileTab(tab.key)}
                    style={{
                      padding: '10px 4px',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: 13.5,
                      fontWeight: 600,
                      borderBottom: `2px solid ${profileTab === tab.key ? 'oklch(45% 0.16 265)' : 'transparent'}`,
                      color: profileTab === tab.key ? 'oklch(20% 0.01 260)' : 'oklch(50% 0.01 260)',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {profileTab === 'overview' &&
                (profile.kind === 'demo' ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 28 }}>
                      {profile.mp.stats.map((s, i) => (
                        <div key={i} style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                          <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{s.label}</div>
                          <div style={{ fontSize: 24, fontWeight: 800 }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{t.alignmentTrend}</div>
                      <svg viewBox="0 0 400 100" style={{ width: '100%', height: 100, display: 'block' }}>
                        <polyline points={profile.mp.trendPoints} fill="none" stroke="oklch(45% 0.16 265)" strokeWidth={2.5} />
                        <polyline points={profile.mp.partyTrendPoints} fill="none" stroke="oklch(85% 0.006 260)" strokeWidth={2} strokeDasharray="4 4" />
                      </svg>
                      <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginTop: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 14, height: 2, background: 'oklch(45% 0.16 265)', display: 'inline-block' }} />
                          {profile.mp.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 14, height: 2, background: 'oklch(85% 0.006 260)', display: 'inline-block' }} />
                          {t.partyAverage}
                        </div>
                      </div>
                    </div>
                    {profile.mp.hasFlags && (
                      <div style={{ background: 'oklch(55% 0.16 40 / 0.06)', border: '1px solid oklch(55% 0.16 40 / 0.2)', borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(42% 0.16 40)', marginBottom: 8 }}>{t.flagsHeading}</div>
                        {profile.mp.flags.map((fl, i) => (
                          <div key={i} style={{ fontSize: 13, color: 'oklch(32% 0.14 40)', padding: '4px 0' }}>
                            · {fl}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : mandateVotes.loading && mandateVotes.votes.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.pollsLoading}</p>
                ) : mandateVotes.error ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.16 40)' }}>{t.pollsError}</p>
                ) : (
                  <>
                    {mandateVotes.votes.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 20 }}>
                        <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                          <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statBillsVoted}</div>
                          <div style={{ fontSize: 24, fontWeight: 800 }}>{realMpBillsVoted}</div>
                        </div>
                        <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                          <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statAttendance}</div>
                          <div style={{ fontSize: 24, fontWeight: 800 }}>{realMpAttendancePct}%</div>
                        </div>
                        <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                          <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statPartyAlignment}</div>
                          <div style={{ fontSize: 24, fontWeight: 800 }}>
                            {alignment.alignmentPct !== null ? `${alignment.alignmentPct}%` : recentPolls.loading ? '…' : '—'}
                          </div>
                        </div>
                        <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                          <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statFlags}</div>
                          <div style={{ fontSize: 24, fontWeight: 800 }}>{recentPolls.loading && alignment.points.length === 0 ? '…' : realMpFlaggedVotes.length}</div>
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.noMandateVotesYet}</p>
                    )}
                    {alignment.points.length > 0 && (
                      <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 20, marginBottom: 20, position: 'relative' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                          {t.alignmentTrendRealTemplate.replace('{n}', String(alignment.windowSize))}
                        </div>
                        <svg viewBox="0 0 400 60" style={{ width: '100%', height: 60, display: 'block' }}>
                          <line x1={20} y1={30} x2={380} y2={30} stroke="oklch(90% 0.006 260)" strokeWidth={2} />
                          {alignment.points.map((p, i) => {
                            const x = alignment.points.length > 1 ? 20 + (i * 360) / (alignment.points.length - 1) : 200;
                            const color = p.aligned === null ? 'oklch(80% 0.006 260)' : p.aligned ? 'oklch(50% 0.14 155)' : 'oklch(55% 0.16 40)';
                            return (
                              <circle
                                key={p.poll.id}
                                cx={x}
                                cy={30}
                                r={9}
                                fill={color}
                                fillOpacity={hoveredAlignmentPoint === i ? 1 : 0.001}
                                stroke={color}
                                strokeWidth={hoveredAlignmentPoint === i ? 0 : 0}
                                onMouseEnter={() => setHoveredAlignmentPoint(i)}
                                onMouseLeave={() => setHoveredAlignmentPoint((cur) => (cur === i ? null : cur))}
                                onClick={() => openBill(p.poll.id)}
                                style={{ cursor: 'pointer' }}
                              />
                            );
                          })}
                          {alignment.points.map((p, i) => {
                            const x = alignment.points.length > 1 ? 20 + (i * 360) / (alignment.points.length - 1) : 200;
                            const color = p.aligned === null ? 'oklch(80% 0.006 260)' : p.aligned ? 'oklch(50% 0.14 155)' : 'oklch(55% 0.16 40)';
                            return <circle key={p.poll.id} cx={x} cy={30} r={6} fill={color} style={{ pointerEvents: 'none' }} />;
                          })}
                        </svg>
                        {hoveredAlignmentPoint !== null &&
                          (() => {
                            const p = alignment.points[hoveredAlignmentPoint];
                            const x = alignment.points.length > 1 ? 20 + (hoveredAlignmentPoint * 360) / (alignment.points.length - 1) : 200;
                            const leftPct = (x / 400) * 100;
                            const voteLabel = p.vote === 'yes' ? t.voteYes : p.vote === 'no' ? t.voteNo : p.vote === 'abstain' ? t.voteAbstain : t.voteNoShow;
                            const lobbyHit = lobbyByPollId.get(p.poll.id);
                            return (
                              <div
                                style={{
                                  position: 'absolute',
                                  left: `${leftPct}%`,
                                  top: 56,
                                  transform: leftPct > 80 ? 'translateX(-100%)' : leftPct < 20 ? 'none' : 'translateX(-50%)',
                                  background: 'white',
                                  border: '1px solid oklch(88% 0.006 260)',
                                  borderRadius: 10,
                                  padding: '10px 14px',
                                  boxShadow: '0 4px 16px oklch(0% 0 0 / 0.1)',
                                  minWidth: 200,
                                  maxWidth: 260,
                                  zIndex: 5,
                                  pointerEvents: 'none',
                                }}
                              >
                                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>{p.poll.title}</div>
                                <div style={{ fontSize: 11, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>
                                  {p.poll.date} · {p.poll.topic}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: voteBg[p.vote], color: 'white' }}>{voteLabel}</span>
                                  {p.aligned === false && <span style={{ fontSize: 11, color: 'oklch(48% 0.16 40)', fontWeight: 600 }}>{t.reasonPartyLine}</span>}
                                </div>
                                {(lobbyHit?.hasConflict || lobbyHit?.hasTopicalTie) && (
                                  <div style={{ fontSize: 11, marginTop: 6, color: lobbyHit.hasConflict ? 'oklch(48% 0.16 40)' : 'oklch(55% 0.1 90)' }}>
                                    ⬤ {lobbyHit.hasConflict ? t.lobbyIndicatorConflict : t.lobbyIndicatorTopical}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                      </div>
                    )}
                    {realMpFlaggedVotes.length > 0 && (
                      <div style={{ background: 'oklch(55% 0.16 40 / 0.06)', border: '1px solid oklch(55% 0.16 40 / 0.2)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(42% 0.16 40)', marginBottom: 8 }}>{t.flagsHeading}</div>
                        {realMpFlaggedVotes.map((p) => (
                          <div key={p.poll.id} style={{ fontSize: 13, color: 'oklch(32% 0.14 40)', padding: '4px 0' }}>
                            · {p.poll.title}: {t.realAgainstPartyTemplate.replace('{party}', p.party)}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 20 }}>
                      <div
                        onClick={() => setProfileTab('lobby')}
                        style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: 16 }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{t.overviewLobbyPreviewTitle}</div>
                        <div style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', marginBottom: 8 }}>
                          {memberLobby.affiliations.length > 0
                            ? t.overviewLobbyPreviewCountTemplate.replace('{n}', String(memberLobby.affiliations.length))
                            : t.overviewLobbyPreviewEmpty}
                        </div>
                        {memberLobby.affiliations.length > 0 && (
                          <div style={{ fontSize: 12, color: 'oklch(45% 0.01 260)', marginBottom: 8 }}>
                            {memberLobby.affiliations.slice(0, 2).map((a) => a.org.name).join(' · ')}
                            {memberLobby.affiliations.length > 2 ? ` +${memberLobby.affiliations.length - 2}` : ''}
                          </div>
                        )}
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'oklch(48% 0.12 250)' }}>{t.seeAll} →</span>
                      </div>
                      <div
                        onClick={() => setProfileTab('finance')}
                        style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: 16 }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{t.overviewSidejobsPreviewTitle}</div>
                        <div style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', marginBottom: 8 }}>
                          {sidejobs.records.length > 0
                            ? t.overviewSidejobsPreviewCountTemplate.replace('{n}', String(sidejobs.records.length))
                            : t.overviewSidejobsPreviewEmpty}
                        </div>
                        {sidejobs.records.length > 0 && (
                          <div style={{ fontSize: 12, color: 'oklch(45% 0.01 260)', marginBottom: 8 }}>
                            {sidejobs.records.slice(0, 2).map((r) => r.organization ?? r.title).join(' · ')}
                            {sidejobs.records.length > 2 ? ` +${sidejobs.records.length - 2}` : ''}
                          </div>
                        )}
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'oklch(48% 0.12 250)' }}>{t.seeAll} →</span>
                      </div>
                    </div>
                    <a href={profile.mp.profileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700 }}>
                      {t.viewOnAbgeordnetenwatch} →
                    </a>
                  </>
                ))}

              {profileTab === 'votes' &&
                (profile.kind === 'demo' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {profile.mp.voteHistoryResolved.map((v, i) => (
                      <div
                        key={i}
                        onClick={v.onOpen}
                        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px', gap: 12 }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{v.billTitle}</div>
                          <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)' }}>{v.date}</div>
                        </div>
                        <div style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 12, background: v.bg, color: 'white', flexShrink: 0 }}>{v.voteLabel}</div>
                      </div>
                    ))}
                  </div>
                ) : mandateVotes.loading && mandateVotes.votes.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.pollsLoading}</p>
                ) : mandateVotes.error ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.16 40)' }}>{t.pollsError}</p>
                ) : mandateVotes.votes.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.noMandateVotesYet}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {mandateVotes.votes.map((v) => {
                      const label = v.vote === 'yes' ? t.voteYes : v.vote === 'no' ? t.voteNo : v.vote === 'abstain' ? t.voteAbstain : t.voteNoShow;
                      const lobbyHit = lobbyByPollId.get(v.poll.id);
                      return (
                        <div
                          key={v.poll.id}
                          onClick={() => openBill(v.poll.id)}
                          style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px', gap: 12 }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 14, fontWeight: 600 }}>{v.poll.title}</span>
                              {lobbyHit?.hasConflict && (
                                <span title={t.lobbyIndicatorConflict} style={{ fontSize: 11, fontWeight: 700, color: 'oklch(48% 0.16 40)', flexShrink: 0 }}>
                                  ⬤
                                </span>
                              )}
                              {!lobbyHit?.hasConflict && lobbyHit?.hasTopicalTie && (
                                <span title={t.lobbyIndicatorTopical} style={{ fontSize: 11, fontWeight: 700, color: 'oklch(60% 0.1 90)', flexShrink: 0 }}>
                                  ⬤
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)' }}>{v.poll.date}</div>
                          </div>
                          <div style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 12, background: voteBg[v.vote], color: 'white', flexShrink: 0 }}>{label}</div>
                        </div>
                      );
                    })}
                  </div>
                ))}

              {profileTab === 'lobby' &&
                (profile.kind === 'demo' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {profile.mp.lobbyContacts.map((l, i) => (
                      <div key={i} style={{ background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{l.org}</span>
                          <span style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>{l.date}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'oklch(42% 0.01 260)', marginTop: 3 }}>{l.topic}</div>
                      </div>
                    ))}
                    <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 6 }}>{t.sourceNote}</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                    <section>
                      <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>{t.lobbyAffiliationsTitle}</h3>
                      <p style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)', margin: '0 0 12px' }}>{t.lobbyAffiliationsSub}</p>
                      {memberLobby.affiliations.length === 0 ? (
                        <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.lobbyNoAffiliations}</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {memberLobby.affiliations.map(({ org, roles, categories }) => {
                            const spend = formatExpenseBracket(org.expensesEuro);
                            return (
                              <div
                                key={org.id}
                                onClick={() => openOrg(org.id)}
                                style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '14px 16px' }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                                  <span style={{ fontWeight: 600, fontSize: 14 }}>{org.name}</span>
                                  {org.city && <span style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', flexShrink: 0 }}>{org.city}</span>}
                                </div>
                                {roles.length > 0 && (
                                  <div style={{ fontSize: 13, color: 'oklch(42% 0.01 260)', marginTop: 3 }}>{roles.join(' · ')}</div>
                                )}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                  {categories.map((c) => (
                                    <span key={c} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'oklch(95% 0.008 260)', color: 'oklch(40% 0.01 260)' }}>
                                      {c}
                                    </span>
                                  ))}
                                </div>
                                {(spend || org.staffFte != null) && (
                                  <div style={{ fontSize: 11.5, color: 'oklch(50% 0.01 260)', marginTop: 8 }}>
                                    {spend && `${t.lobbyOrgSpend}: ${spend}`}
                                    {spend && org.staffFte != null && ' · '}
                                    {org.staffFte != null && `${t.lobbyOrgStaff}: ${org.staffFte}`}
                                  </div>
                                )}
                                {org.url && (
                                  <a
                                    href={org.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ fontSize: 12, color: 'oklch(48% 0.12 250)', display: 'inline-block', marginTop: 8 }}
                                  >
                                    {t.viewSource} →
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    {memberLobby.affiliations.length > 0 && (
                      <section>
                        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px' }}>{t.lobbyVotesTitle}</h3>
                        {memberLobby.conflicts.length === 0 ? (
                          <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.lobbyNoVotes}</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {memberLobby.conflicts.map((c) => {
                              const poll = pollsState.polls.find((p) => p.id === c.pollId);
                              const label = c.vote === 'yes' ? t.voteYes : c.vote === 'no' ? t.voteNo : t.voteAbstain;
                              return (
                                <div
                                  key={`${c.pollId}-${c.orgId}`}
                                  onClick={() => openBill(c.pollId)}
                                  style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '14px 16px' }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600, fontSize: 14 }}>{poll?.title ?? `#${c.pollId}`}</span>
                                    <span style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 12, background: voteBg[c.vote], color: 'white', flexShrink: 0 }}>
                                      {label}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 12.5, color: 'oklch(42% 0.01 260)', marginTop: 5 }}>{c.org.name}</div>
                                  {c.demands.length > 0 && (
                                    <div style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', marginTop: 6, fontStyle: 'italic' }}>
                                      {t.lobbyDemandLabel}: „{c.demands[0]}“
                                    </div>
                                  )}
                                  {c.againstPosition && (
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'oklch(48% 0.16 40)', marginTop: 8 }}>
                                      ⬤ {t.lobbyAgainstPosition}
                                      {c.positionSource && (
                                        <a href={c.positionSource} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontWeight: 500, marginLeft: 8, color: 'oklch(48% 0.12 250)' }}>
                                          {t.lobbyPositionSource} →
                                        </a>
                                      )}
                                    </div>
                                  )}
                                  {c.againstFraction && (
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'oklch(48% 0.14 60)', marginTop: 6 }}>⬤ {t.lobbyAgainstFraction}</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 10, lineHeight: 1.6 }}>{t.lobbyNoPositionNote}</p>
                      </section>
                    )}

                    {memberLobby.topicalTies.length > 0 && (
                      <section>
                        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>{t.lobbyTopicalTitle}</h3>
                        <p style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)', margin: '0 0 12px' }}>{t.lobbyTopicalNote}</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {memberLobby.topicalTies.map((tie) => {
                            const poll = pollsState.polls.find((p) => p.id === tie.pollId);
                            const label = tie.vote === 'yes' ? t.voteYes : tie.vote === 'no' ? t.voteNo : t.voteAbstain;
                            return (
                              <div
                                key={`${tie.pollId}-${tie.orgId}`}
                                onClick={() => openBill(tie.pollId)}
                                style={{ cursor: 'pointer', background: 'oklch(97% 0.008 90)', border: '1px solid oklch(88% 0.02 90)', borderRadius: 10, padding: '14px 16px' }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                                  <span style={{ fontWeight: 600, fontSize: 14 }}>{poll?.title ?? `#${tie.pollId}`}</span>
                                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 12, background: voteBg[tie.vote], color: 'white', flexShrink: 0 }}>
                                    {label}
                                  </span>
                                </div>
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openOrg(tie.org.id);
                                  }}
                                  style={{ fontSize: 12.5, color: 'oklch(42% 0.01 260)', marginTop: 5, textDecoration: 'underline', textDecorationColor: 'oklch(85% 0.02 90)', display: 'inline-block' }}
                                >
                                  {tie.org.name}
                                </div>
                                <div style={{ fontSize: 12.5, color: 'oklch(50% 0.03 90)', marginTop: 6 }}>
                                  {t.topicalTieMatchedFieldTemplate.replace('{field}', tie.matchedField)}
                                </div>
                                {tie.onRelevantCommittee && (
                                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.14 60)', marginTop: 6 }}>
                                    ⬤ {t.lobbyOnCommitteeTemplate.replace('{committee}', tie.relevantCommitteeNames[0] ?? '')}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', lineHeight: 1.6 }}>
                      {t.lobbyNoContactsNote}
                      <br />
                      {t.lobbyRegisterSource}
                    </p>
                  </div>
                ))}

              {profileTab === 'finance' &&
                (profile.kind === 'demo' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {profile.mp.donations.map((d, i) => (
                      <div key={i} style={{ background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{d.donor}</div>
                          <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>
                            {d.industry} · {d.date}
                          </div>
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 700 }}>{d.amount}</div>
                      </div>
                    ))}
                    <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 6 }}>{t.rechenschaftsNote}</div>
                  </div>
                ) : sidejobs.loading && sidejobs.records.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.pollsLoading}</p>
                ) : sidejobs.error ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.16 40)' }}>{t.sidejobsError}</p>
                ) : sidejobs.records.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.noFinanceData}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sidejobs.records.map((s) => {
                      const intervalLabel =
                        s.interval === 'once' ? t.sidejobOnce : s.interval === 'monthly' ? t.sidejobMonthly : s.interval === 'annual' ? t.sidejobAnnual : null;
                      return (
                        <div key={s.id} style={{ background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '14px 16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>
                                {s.title}
                                {s.jobTitleExtra ? ` (${s.jobTitleExtra})` : ''}
                              </div>
                              <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>
                                {s.organization ? `${s.organization} · ` : ''}
                                {s.categoryLabel}
                              </div>
                              {s.topics.length > 0 && (
                                <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 3 }}>{s.topics.join(', ')}</div>
                              )}
                            </div>
                            {(s.income !== null || s.incomeLevel) && (
                              <div style={{ fontSize: 15, fontWeight: 700, textAlign: 'right', flexShrink: 0 }}>
                                {s.income !== null
                                  ? `${s.income.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US')} €`
                                  : `${t.sidejobIncomeLevelPrefix} ${s.incomeLevel}`}
                                {intervalLabel && <div style={{ fontSize: 11, fontWeight: 400, color: 'oklch(48% 0.01 260)' }}>{intervalLabel}</div>}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 6 }}>{t.sidejobsSourceNote}</div>
                  </div>
                ))}
            </>
          )}
        </main>
      )}

      {view === 'bill' && (
        <main style={{ flex: 1, maxWidth: 900, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href="#" onClick={stop(goHome)} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToHome}
          </a>

          {currentBill && (
            <>
              <div style={{ margin: '18px 0 8px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'oklch(48% 0.01 260)' }}>
                {currentBill.category} · {currentBill.date}
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px' }}>{currentBill.title}</h1>
              <p style={{ fontSize: 14.5, color: 'oklch(38% 0.01 260)', lineHeight: 1.6, maxWidth: 680, margin: '0 0 28px' }}>{currentBill.summary}</p>

              <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{t.voteBreakdown}</div>
                {currentBill.partyBreakdown.map((pb) => (
                  <div key={pb.party} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ width: 90, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>{pb.party}</span>
                    <div style={{ flex: 1, height: 14, borderRadius: 7, overflow: 'hidden', display: 'flex', background: 'oklch(90% 0.006 260)' }}>
                      <div style={{ width: `${pb.y}%`, background: 'oklch(50% 0.14 155)' }} />
                      <div style={{ width: `${pb.n}%`, background: 'oklch(55% 0.16 40)' }} />
                      <div style={{ width: `${pb.a}%`, background: 'oklch(85% 0.006 260)' }} />
                    </div>
                    <span style={{ width: 70, fontSize: 11.5, color: 'oklch(48% 0.01 260)', textAlign: 'right', flexShrink: 0 }}>{pb.summary}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'oklch(48% 0.01 260)', marginTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 9, height: 9, background: 'oklch(50% 0.14 155)', display: 'inline-block', borderRadius: 2 }} />
                    {t.voteYes}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 9, height: 9, background: 'oklch(55% 0.16 40)', display: 'inline-block', borderRadius: 2 }} />
                    {t.voteNo}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 9, height: 9, background: 'oklch(85% 0.006 260)', display: 'inline-block', borderRadius: 2 }} />
                    {t.voteAbstain}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{t.flaggedVotes}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {currentBill.flaggedMps.map((fm, i) => (
                  <div
                    key={i}
                    onClick={fm.onOpen}
                    style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: fm.color }} />
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{fm.name}</span>
                      <span style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>{fm.party}</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'oklch(48% 0.16 40)' }}>{fm.reason}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {!currentBill && realPollId !== null && (
            <>
              {pollDetail.loading && <p style={{ fontSize: 14, color: 'oklch(48% 0.01 260)', marginTop: 20 }}>{t.loadingPoll}</p>}
              {pollDetail.error && <p style={{ fontSize: 14, color: 'oklch(48% 0.16 40)', marginTop: 20 }}>{t.pollsError}</p>}
              {!pollDetail.loading && !pollDetail.error && !pollDetail.result && (
                <p style={{ fontSize: 14, color: 'oklch(48% 0.01 260)', marginTop: 20 }}>{t.pollDetailMissing}</p>
              )}
              {pollDetail.result && (
                <>
                  <div style={{ margin: '18px 0 8px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'oklch(48% 0.01 260)' }}>
                    <span>
                      {pollDetail.result.poll.topic} · {pollDetail.result.poll.date}
                    </span>
                    <span style={{ color: pollDetail.result.poll.accepted ? 'oklch(45% 0.14 155)' : 'oklch(48% 0.16 40)' }}>
                      {pollDetail.result.poll.accepted ? t.pollAccepted : t.pollRejected}
                    </span>
                  </div>
                  <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 16px' }}>{pollDetail.result.poll.title}</h1>

                  <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{t.voteBreakdown}</div>
                    {pollDetail.result.partyBreakdown.map((pb) => {
                      const total = pb.yes + pb.no + pb.abstain + pb.noShow || 1;
                      return (
                        <div key={pb.party} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span style={{ width: 90, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>{pb.party}</span>
                          <div style={{ flex: 1, height: 14, borderRadius: 7, overflow: 'hidden', display: 'flex', background: 'oklch(90% 0.006 260)' }}>
                            <div style={{ width: `${(pb.yes / total) * 100}%`, background: 'oklch(50% 0.14 155)' }} />
                            <div style={{ width: `${(pb.no / total) * 100}%`, background: 'oklch(55% 0.16 40)' }} />
                            <div style={{ width: `${(pb.abstain / total) * 100}%`, background: 'oklch(85% 0.006 260)' }} />
                            <div style={{ width: `${(pb.noShow / total) * 100}%`, background: 'oklch(93% 0.006 260)' }} />
                          </div>
                          <span style={{ width: 90, fontSize: 11, color: 'oklch(48% 0.01 260)', textAlign: 'right', flexShrink: 0 }}>
                            {pb.yes}/{pb.no}/{pb.abstain}/{pb.noShow}
                          </span>
                        </div>
                      );
                    })}
                    <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'oklch(48% 0.01 260)', marginTop: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 9, height: 9, background: 'oklch(50% 0.14 155)', display: 'inline-block', borderRadius: 2 }} />
                        {t.voteYes} ({pollDetail.result.totalYes})
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 9, height: 9, background: 'oklch(55% 0.16 40)', display: 'inline-block', borderRadius: 2 }} />
                        {t.voteNo} ({pollDetail.result.totalNo})
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 9, height: 9, background: 'oklch(85% 0.006 260)', display: 'inline-block', borderRadius: 2 }} />
                        {t.voteAbstain} ({pollDetail.result.totalAbstain})
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 9, height: 9, background: 'oklch(93% 0.006 260)', display: 'inline-block', borderRadius: 2 }} />
                        {t.voteNoShow} ({pollDetail.result.totalNoShow})
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{t.flaggedVotes}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                    {computeDivergences(pollDetail.result).map((d, i) => {
                      const rm = mandateToMember.get(d.member.mandateId);
                      return (
                        <div
                          key={i}
                          onClick={rm ? () => openMp(String(rm.id)) : undefined}
                          style={{
                            cursor: rm ? 'pointer' : 'default',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'white',
                            border: '1px solid oklch(90% 0.006 260)',
                            borderRadius: 10,
                            padding: '12px 16px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: REAL_PARTY_COLORS[d.member.party] || FALLBACK_PARTY_COLOR }} />
                            <span style={{ fontSize: 14, fontWeight: 600 }}>{d.member.name}</span>
                            <span style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>{d.member.party}</span>
                          </div>
                          <span style={{ fontSize: 12, color: 'oklch(48% 0.16 40)' }}>
                            {t.realAgainstPartyTemplate.replace('{party}', d.member.party)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Interest groups that registered lobbying on this vote's Drucksachen. The
                      register says what each wanted, in its own words — never which way it
                      wanted the vote to go, so no direction is shown here. */}
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{t.pollLobbyingTitle}</div>
                  {pollLobbying.entries.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'oklch(48% 0.01 260)', marginBottom: 20 }}>{t.pollLobbyingNone}</p>
                  ) : (
                    <>
                      <p style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)', margin: '0 0 12px' }}>
                        {t.pollLobbyingCountTemplate.replace('{n}', String(pollLobbying.entries.length))}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                        {pollLobbying.entries.slice(0, 25).map((e) => {
                          const spend = formatExpenseBracket(e.org.expensesEuro);
                          return (
                            <div
                              key={e.org.id}
                              onClick={() => openOrg(e.org.id)}
                              style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{e.org.name}</span>
                                {spend && <span style={{ fontSize: 11.5, color: 'oklch(50% 0.01 260)', flexShrink: 0 }}>{spend}</span>}
                              </div>
                              {e.demands.length > 0 && (
                                <div style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', marginTop: 4, fontStyle: 'italic' }}>„{e.demands[0]}“</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <a href={pollDetail.result.poll.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700 }}>
                    {t.viewSource} →
                  </a>
                </>
              )}
            </>
          )}
        </main>
      )}

      {view === 'crossref' && (
        <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>{t.navLobbyFinance}</h1>
          <p style={{ fontSize: 14, color: 'oklch(45% 0.01 260)', margin: '0 0 20px', maxWidth: 640 }}>{t.crossrefSub}</p>

          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'oklch(55% 0.01 260)', marginBottom: 6 }}>
              {t.lobbySectionLabel}
            </label>
            <select
              value={lobbyTab}
              onChange={(e) => setLobbyTab(e.target.value as LobbyTab)}
              style={{ fontSize: 14, fontWeight: 600, padding: '9px 14px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 9, background: 'white', minWidth: 240 }}
            >
              <option value="overview">{t.lobbyTabOverview}</option>
              <option value="parties">{t.lobbyTabParties}</option>
              <option value="orgs">{t.lobbyTabOrgs}</option>
              <option value="conflicts">{t.lobbyTabConflicts}</option>
              <option value="topical">{t.lobbyTabTopical}</option>
              <option value="donations">{t.lobbyTabDonations}</option>
            </select>
          </div>

          {lobbyTab === 'overview' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginBottom: 28 }}>
                <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statOrgsReferencedLabel}</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{Object.keys(snapshot?.lobbyLinks.orgs ?? {}).length}</div>
                </div>
                <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statConflictsLabel}</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{crossref.rows.length}</div>
                </div>
                <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statTopicalTiesLabel}</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{topicalTieRows.rows.length}</div>
                </div>
                <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statDonationsSumLabel}</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{formatEuro(partyDonations.all.reduce((sum, d) => sum + d.amountEuro, 0))}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
                {(
                  [
                    { key: 'parties' as const, title: t.partyLobbyTitle, sub: t.partyLobbySub },
                    { key: 'orgs' as const, title: t.orgsSectionTitle, sub: t.orgsSectionSub },
                    { key: 'conflicts' as const, title: t.crossrefTitle, sub: t.crossrefSub },
                    { key: 'topical' as const, title: t.topicalTiesTitle, sub: t.topicalTiesSub },
                    { key: 'donations' as const, title: t.donationsTitle, sub: t.donationsSub },
                  ]
                ).map((s) => (
                  <div
                    key={s.key}
                    onClick={() => setLobbyTab(s.key)}
                    style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: 16 }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{s.title}</div>
                    <p style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', margin: '0 0 8px' }}>{s.sub}</p>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'oklch(48% 0.12 250)' }}>{t.seeAll} →</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {lobbyTab === 'parties' && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{t.partyLobbyTitle}</h2>
              <p style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', margin: '0 0 14px', maxWidth: 760 }}>{t.partyLobbySub}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
                {partyLobby.summaries.map((p) => (
                  <div
                    key={p.party}
                    onClick={() => openParty(p.party)}
                    style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: '14px 16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: REAL_PARTY_COLORS[p.party] || FALLBACK_PARTY_COLOR, flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{p.party}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'oklch(45% 0.01 260)' }}>{t.partyLobbyOrgCountTemplate.replace('{n}', String(p.orgCount))}</div>
                    <div style={{ fontSize: 12, color: 'oklch(50% 0.01 260)', marginBottom: 8 }}>
                      {t.partyLobbyMemberCountTemplate.replace('{n}', String(p.memberCount))}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'oklch(55% 0.01 260)', marginBottom: 4 }}>
                      {t.partyLobbyTopFieldsLabel}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                      {p.byField.slice(0, 4).map((f) => (
                        <span key={f.field} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'oklch(95% 0.008 260)', color: 'oklch(40% 0.01 260)' }}>
                          {f.field} ({f.orgCount})
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'oklch(50% 0.01 260)', marginBottom: 8 }}>
                      {t.partyLobbySpendLabel}: {formatExpenseBracket(p.expensesEuro)}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'oklch(48% 0.12 250)' }}>{t.seeAll} →</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {lobbyTab === 'orgs' && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{t.orgsSectionTitle}</h2>
              <p style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', margin: '0 0 12px', maxWidth: 700 }}>{t.orgsSectionSub}</p>
              <input
                type="text"
                value={orgSearchQuery}
                onChange={(e) => setOrgSearchQuery(e.target.value)}
                placeholder={t.orgSearchPlaceholder}
                style={{ width: '100%', maxWidth: 420, padding: '9px 12px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 9, fontSize: 13.5, marginBottom: 14, boxSizing: 'border-box' }}
              />
              {filteredOrgs.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.orgsNoResults}</p>
              ) : (
                <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                    <thead>
                      <tr style={{ background: 'oklch(97% 0.006 260)', textAlign: 'left' }}>
                        {[t.colOrg, t.orgSpendLabel, t.colOrgMembers, t.colOrgVotes].map((col) => (
                          <th key={col} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'oklch(45% 0.01 260)' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrgs.slice(0, 100).map((e) => (
                        <tr key={e.org.id} onClick={() => openOrg(e.org.id)} style={{ cursor: 'pointer', borderTop: '1px solid oklch(93% 0.006 260)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>{e.org.name}</td>
                          <td style={{ padding: '10px 14px', color: 'oklch(45% 0.01 260)' }}>{formatExpenseBracket(e.org.expensesEuro) ?? '—'}</td>
                          <td style={{ padding: '10px 14px' }}>{e.affiliatedMemberCount}</td>
                          <td style={{ padding: '10px 14px' }}>{e.lobbiedPollCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollBox>
              )}
            </>
          )}

          {lobbyTab === 'conflicts' && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>{t.crossrefTitle}</h2>
              {crossref.rows.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.crossrefEmpty}</p>
              ) : (
                <>
                  <p style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)', margin: '0 0 10px', maxWidth: 640 }}>{t.tieMatrixSub}</p>
                  <TieMatrix
                    rows={crossref.rows}
                    partyOrder={parties}
                    selected={tieMatrixFilter}
                    onSelect={setTieMatrixFilter}
                    scrollHintText={t.scrollHintText}
                  />
                  {tieMatrixFilter && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 12.5 }}>
                      <span style={{ padding: '4px 10px', borderRadius: 20, background: 'oklch(95% 0.06 40)', color: 'oklch(35% 0.1 40)', fontWeight: 600 }}>
                        {t.matrixFilteredTemplate.replace('{party}', tieMatrixFilter.party).replace('{topic}', tieMatrixFilter.topic)}
                      </span>
                      <button
                        onClick={() => setTieMatrixFilter(null)}
                        style={{ border: 'none', background: 'none', color: 'oklch(45% 0.16 265)', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, padding: 0 }}
                      >
                        {t.matrixClearFilter}
                      </button>
                    </div>
                  )}
                <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                    <thead>
                      <tr style={{ background: 'oklch(97% 0.006 260)', textAlign: 'left' }}>
                        {[t.colMp, t.colOrg, t.colBill, t.colVote, t.colFlag].map((col) => (
                          <th key={col} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'oklch(45% 0.01 260)' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(tieMatrixFilter
                        ? crossref.rows.filter((r) => r.party === tieMatrixFilter.party && r.pollTopic === tieMatrixFilter.topic)
                        : crossref.rows
                      ).map((r) => {
                        const label =
                          r.conflict.vote === 'yes' ? t.voteYes : r.conflict.vote === 'no' ? t.voteNo : t.voteAbstain;
                        return (
                          <tr
                            key={`${r.mandateId}-${r.conflict.pollId}-${r.conflict.orgId}`}
                            onClick={r.politicianId !== null ? () => openMp(String(r.politicianId)) : undefined}
                            style={{ cursor: r.politicianId !== null ? 'pointer' : 'default', borderTop: '1px solid oklch(93% 0.006 260)' }}
                          >
                            <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                              {r.memberName}
                              <div style={{ fontSize: 11.5, fontWeight: 500, color: 'oklch(48% 0.01 260)' }}>{r.party}</div>
                            </td>
                            <td
                              onClick={(e) => {
                                e.stopPropagation();
                                openOrg(r.org.id);
                              }}
                              style={{ padding: '10px 14px', textDecoration: 'underline', textDecorationColor: 'oklch(85% 0.006 260)' }}
                            >
                              {r.org.name}
                            </td>
                            <td style={{ padding: '10px 14px', color: 'oklch(45% 0.01 260)' }}>{r.pollTitle}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: voteBg[r.conflict.vote], color: 'white' }}>
                                {label}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              {r.conflict.againstPosition && (
                                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.16 40)' }}>⬤ {t.lobbyAgainstPosition}</div>
                              )}
                              {r.conflict.againstFraction && (
                                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.14 60)' }}>⬤ {t.lobbyAgainstFraction}</div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollBox>
                </>
              )}
              <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
                {t.lobbyNoPositionNote}
              </p>
            </>
          )}

          {lobbyTab === 'topical' && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{t.topicalTiesTitle}</h2>
              <p style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', margin: '0 0 14px', maxWidth: 760 }}>{t.topicalTiesSub}</p>
              {topicalTieRows.rows.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.topicalTiesEmpty}</p>
              ) : (
                <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(88% 0.02 90)', borderRadius: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'oklch(97% 0.008 90)' }}>
                    <thead>
                      <tr style={{ background: 'oklch(94% 0.015 90)', textAlign: 'left' }}>
                        {[t.colMp, t.colOrg, t.colMatchedField, t.colBill, t.colVote].map((col) => (
                          <th key={col} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'oklch(45% 0.02 90)' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topicalTieRows.rows.slice(0, 60).map((r) => {
                        const label = r.tie.vote === 'yes' ? t.voteYes : r.tie.vote === 'no' ? t.voteNo : t.voteAbstain;
                        return (
                          <tr
                            key={`${r.mandateId}-${r.tie.pollId}-${r.tie.orgId}`}
                            onClick={r.politicianId !== null ? () => openMp(String(r.politicianId)) : undefined}
                            style={{ cursor: r.politicianId !== null ? 'pointer' : 'default', borderTop: '1px solid oklch(90% 0.015 90)' }}
                          >
                            <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                              {r.memberName}
                              <div style={{ fontSize: 11.5, fontWeight: 500, color: 'oklch(48% 0.01 260)' }}>{r.party}</div>
                            </td>
                            <td
                              onClick={(e) => {
                                e.stopPropagation();
                                openOrg(r.org.id);
                              }}
                              style={{ padding: '10px 14px', textDecoration: 'underline', textDecorationColor: 'oklch(85% 0.02 90)' }}
                            >
                              {r.org.name}
                            </td>
                            <td style={{ padding: '10px 14px', color: 'oklch(45% 0.03 90)', fontStyle: 'italic' }}>
                              „{r.tie.matchedField}“
                              {r.tie.onRelevantCommittee && (
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'oklch(48% 0.14 60)', fontStyle: 'normal', marginTop: 3 }}>
                                  ⬤ {t.lobbyOnCommitteeTemplate.replace('{committee}', r.tie.relevantCommitteeNames[0] ?? '')}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', color: 'oklch(45% 0.01 260)' }}>{r.pollTitle}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: voteBg[r.tie.vote], color: 'white' }}>
                                {label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollBox>
              )}
              <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
                {t.topicalTieNote}
              </p>
            </>
          )}

          {lobbyTab === 'donations' && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{t.donationsTitle}</h2>
              <p style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', margin: '0 0 14px', maxWidth: 700 }}>{t.donationsSub}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
                {partyDonations.byFraction.map((p) => (
                  <div key={p.fraction} style={{ background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px', minWidth: 150 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: REAL_PARTY_COLORS[p.fraction] || FALLBACK_PARTY_COLOR, flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.fraction}</span>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 5 }}>{formatEuro(p.total)}</div>
                    <div style={{ fontSize: 11.5, color: 'oklch(50% 0.01 260)' }}>{p.count} ×</div>
                  </div>
                ))}
              </div>
              <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                  <thead>
                    <tr style={{ background: 'oklch(97% 0.006 260)', textAlign: 'left' }}>
                      {[t.donationsColParty, t.donationsColDonor, t.donationsColAmount, t.donationsColDate].map((col) => (
                        <th key={col} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'oklch(45% 0.01 260)' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {partyDonations.all.slice(0, 60).map((d, i) => {
                      const lobbyOrgId = d.donor ? snapshot?.lobbyLinks.donorLinks[d.donor] : undefined;
                      const lobbyOrg = lobbyOrgId ? snapshot?.lobbyLinks.orgs[lobbyOrgId] : undefined;
                      return (
                        <tr key={`${d.publishedOn}-${d.donor}-${d.party}-${i}`} style={{ borderTop: '1px solid oklch(93% 0.006 260)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>{d.party}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {d.donor}
                            {d.donorCity && <span style={{ color: 'oklch(55% 0.01 260)' }}> · {d.donorCity}</span>}
                            {lobbyOrg && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openOrg(lobbyOrg.id);
                                }}
                                style={{ cursor: 'pointer', fontSize: 11.5, color: 'oklch(48% 0.14 60)', fontWeight: 600 }}
                              >
                                ⬤ {t.donationsAlsoLobbyist}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>{formatEuro(d.amountEuro)}</td>
                          <td style={{ padding: '10px 14px', color: 'oklch(45% 0.01 260)' }}>{d.receivedOn}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollBox>
              <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 10 }}>{t.donationsSource}</p>
            </>
          )}
        </main>
      )}

      {view === 'org' && (
        <main style={{ flex: 1, maxWidth: 900, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href="#" onClick={stop(goCrossref)} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToLobbyFinance}
          </a>
          {!orgDetail.org ? (
            <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)', marginTop: 20 }}>{t.orgNotFound}</p>
          ) : (
            <>
              <h1 style={{ fontSize: 26, fontWeight: 800, margin: '20px 0 4px' }}>{orgDetail.org.name}</h1>
              <div style={{ fontSize: 13.5, color: 'oklch(45% 0.01 260)', marginBottom: 20 }}>
                {[orgDetail.org.legalForm, orgDetail.org.city].filter(Boolean).join(' · ')}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 20 }}>
                <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.orgSpendLabel}</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{formatExpenseBracket(orgDetail.org.expensesEuro) ?? '—'}</div>
                </div>
                <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.orgStaffLabel}</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{orgDetail.org.staffFte ?? '—'}</div>
                </div>
              </div>

              {orgDetail.org.fieldsOfInterest.length > 0 && (
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{t.orgFieldsLabel}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {orgDetail.org.fieldsOfInterest.map((f) => (
                      <span key={f} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 10, background: 'oklch(95% 0.008 260)', color: 'oklch(40% 0.01 260)' }}>
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {orgDetail.org.url && (
                <a href={orgDetail.org.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(48% 0.12 250)', display: 'inline-block', marginBottom: 26 }}>
                  {t.viewSource} →
                </a>
              )}

              {orgDetail.donorNames.length > 0 && (
                <div style={{ background: 'oklch(97% 0.02 90)', border: '1px solid oklch(90% 0.03 90)', borderRadius: 12, padding: 16, marginBottom: 26 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{t.orgDonorTitle}</div>
                  <p style={{ fontSize: 12.5, color: 'oklch(40% 0.02 90)', margin: 0 }}>{t.orgDonorNote}</p>
                </div>
              )}

              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{t.orgAffiliatedMembersTitle}</h2>
              {orgDetail.affiliatedMembers.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)', marginBottom: 26 }}>{t.orgNoAffiliatedMembers}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26 }}>
                  {orgDetail.affiliatedMembers.map((a) => (
                    <div
                      key={a.member.id}
                      onClick={() => openMp(String(a.member.id))}
                      style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.member.color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{a.member.name}</span>
                        <span style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>{a.member.party}</span>
                      </div>
                      {a.roles.length > 0 && <div style={{ fontSize: 12.5, color: 'oklch(42% 0.01 260)', marginTop: 4 }}>{a.roles.join(' · ')}</div>}
                    </div>
                  ))}
                </div>
              )}

              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{t.orgLobbiedBillsTitle}</h2>
              {orgDetail.lobbiedPolls.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)', marginBottom: 26 }}>{t.orgNoLobbiedBills}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26 }}>
                  {orgDetail.lobbiedPolls.map((p) => (
                    <div
                      key={p.pollId}
                      onClick={() => openBill(p.pollId)}
                      style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{p.pollTitle}</span>
                        <span style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', flexShrink: 0 }}>{p.pollDate}</span>
                      </div>
                      {p.demands.length > 0 && (
                        <div style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', marginTop: 5, fontStyle: 'italic' }}>„{p.demands[0]}“</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {orgDetail.conflicts.length > 0 && (
                <>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>{t.orgConflictsTitle}</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26 }}>
                    {orgDetail.conflicts.map((c) => {
                      const label = c.vote === 'yes' ? t.voteYes : c.vote === 'no' ? t.voteNo : t.voteAbstain;
                      return (
                        <div
                          key={`${c.mandateId}-${c.pollId}`}
                          onClick={c.politicianId !== null ? () => openMp(String(c.politicianId)) : undefined}
                          style={{ cursor: c.politicianId !== null ? 'pointer' : 'default', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{c.memberName}</span>
                            <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: voteBg[c.vote], color: 'white', flexShrink: 0 }}>
                              {label}
                            </span>
                          </div>
                          <div style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', marginTop: 4 }}>{c.pollTitle}</div>
                          {c.againstPosition && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.16 40)', marginTop: 6 }}>⬤ {t.lobbyAgainstPosition}</div>}
                          {c.againstFraction && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.14 60)', marginTop: 6 }}>⬤ {t.lobbyAgainstFraction}</div>}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {orgDetail.topicalTies.length > 0 && (
                <>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>{t.orgTopicalTitle}</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                    {orgDetail.topicalTies.slice(0, 40).map((tie) => {
                      const label = tie.vote === 'yes' ? t.voteYes : tie.vote === 'no' ? t.voteNo : t.voteAbstain;
                      return (
                        <div
                          key={`${tie.mandateId}-${tie.pollId}`}
                          onClick={tie.politicianId !== null ? () => openMp(String(tie.politicianId)) : undefined}
                          style={{ cursor: tie.politicianId !== null ? 'pointer' : 'default', background: 'oklch(97% 0.008 90)', border: '1px solid oklch(90% 0.015 90)', borderRadius: 10, padding: '12px 16px' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{tie.memberName}</span>
                            <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: voteBg[tie.vote], color: 'white', flexShrink: 0 }}>
                              {label}
                            </span>
                          </div>
                          <div style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', marginTop: 4 }}>{tie.pollTitle}</div>
                          {tie.onRelevantCommittee && (
                            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.14 60)', marginTop: 6 }}>
                              ⬤ {t.lobbyOnCommitteeTemplate.replace('{committee}', tie.relevantCommitteeNames[0] ?? '')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginBottom: 26, lineHeight: 1.6 }}>{t.lobbyNoPositionNote}</p>
                </>
              )}

              <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', lineHeight: 1.6 }}>{t.lobbyNoContactsNote}</p>
            </>
          )}
        </main>
      )}

      {view === 'party' && (
        <main style={{ flex: 1, maxWidth: 900, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href="#" onClick={stop(() => goCrossref('parties'))} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToLobbyFinance}
          </a>
          {(() => {
            const p = partyLobby.summaries.find((s) => s.party === selectedParty);
            if (!p) return <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)', marginTop: 20 }}>{t.partyNotFound}</p>;
            const partyCrossrefRows = crossref.rows.filter((r) => r.party === p.party);
            const partyTopicalRows = topicalTieRows.rows.filter((r) => r.party === p.party);
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 20px' }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: REAL_PARTY_COLORS[p.party] || FALLBACK_PARTY_COLOR, flexShrink: 0 }} />
                  <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>{p.party}</h1>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 26 }}>
                  <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.orgsSectionTitle}</div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{p.orgCount}</div>
                  </div>
                  <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.colOrgMembers}</div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{p.memberCount}</div>
                  </div>
                  <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.partyLobbySpendLabel}</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{formatExpenseBracket(p.expensesEuro)}</div>
                  </div>
                </div>

                <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>{t.partyDetailFieldsTitle}</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 26 }}>
                  {p.byField.map((f) => (
                    <span key={f.field} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 10, background: 'oklch(95% 0.008 260)', color: 'oklch(40% 0.01 260)' }}>
                      {f.field} ({f.orgCount})
                    </span>
                  ))}
                </div>

                <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>{t.partyDetailOrgsTitle}</h2>
                <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14, marginBottom: 26 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                    <thead>
                      <tr style={{ background: 'oklch(97% 0.006 260)', textAlign: 'left' }}>
                        {[t.colOrg, t.orgSpendLabel, t.colOrgMembers].map((col) => (
                          <th key={col} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'oklch(45% 0.01 260)' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {p.topOrgs.map((o) => {
                        const org = snapshot?.lobbyLinks.orgs[o.orgId];
                        if (!org) return null;
                        return (
                          <tr key={o.orgId} onClick={() => openOrg(o.orgId)} style={{ cursor: 'pointer', borderTop: '1px solid oklch(93% 0.006 260)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600 }}>{org.name}</td>
                            <td style={{ padding: '10px 14px', color: 'oklch(45% 0.01 260)' }}>{formatExpenseBracket(org.expensesEuro) ?? '—'}</td>
                            <td style={{ padding: '10px 14px' }}>{o.memberCount}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollBox>

                {partyCrossrefRows.length > 0 && (
                  <>
                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>{t.crossrefTitle}</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26 }}>
                      {partyCrossrefRows.map((r) => {
                        const label = r.conflict.vote === 'yes' ? t.voteYes : r.conflict.vote === 'no' ? t.voteNo : t.voteAbstain;
                        return (
                          <div
                            key={`${r.mandateId}-${r.conflict.pollId}-${r.conflict.orgId}`}
                            onClick={r.politicianId !== null ? () => openMp(String(r.politicianId)) : undefined}
                            style={{ cursor: r.politicianId !== null ? 'pointer' : 'default', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, fontSize: 14 }}>{r.memberName}</span>
                              <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: voteBg[r.conflict.vote], color: 'white', flexShrink: 0 }}>
                                {label}
                              </span>
                            </div>
                            <div style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', marginTop: 4 }}>
                              {r.org.name} · {r.pollTitle}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {partyTopicalRows.length > 0 && (
                  <>
                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>{t.topicalTiesTitle}</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                      {partyTopicalRows.slice(0, 30).map((r) => {
                        const label = r.tie.vote === 'yes' ? t.voteYes : r.tie.vote === 'no' ? t.voteNo : t.voteAbstain;
                        return (
                          <div
                            key={`${r.mandateId}-${r.tie.pollId}-${r.tie.orgId}`}
                            onClick={r.politicianId !== null ? () => openMp(String(r.politicianId)) : undefined}
                            style={{ cursor: r.politicianId !== null ? 'pointer' : 'default', background: 'oklch(97% 0.008 90)', border: '1px solid oklch(90% 0.015 90)', borderRadius: 10, padding: '12px 16px' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, fontSize: 14 }}>{r.memberName}</span>
                              <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: voteBg[r.tie.vote], color: 'white', flexShrink: 0 }}>
                                {label}
                              </span>
                            </div>
                            <div style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', marginTop: 4 }}>
                              {r.org.name} · {r.pollTitle}
                            </div>
                            {r.tie.onRelevantCommittee && (
                              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.14 60)', marginTop: 6 }}>
                                ⬤ {t.lobbyOnCommitteeTemplate.replace('{committee}', r.tie.relevantCommitteeNames[0] ?? '')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </main>
      )}

      {view === 'impressum' && (
        <main style={{ flex: 1, maxWidth: 720, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href="#" onClick={stop(goHome)} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToHome}
          </a>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '20px 0 16px' }}>{t.impressumTitle}</h1>
          <p style={{ fontSize: 14, color: 'oklch(35% 0.01 260)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{t.impressumBody}</p>
        </main>
      )}

      {view === 'disclaimer' && (
        <main style={{ flex: 1, maxWidth: 720, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href="#" onClick={stop(goHome)} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToHome}
          </a>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '20px 0 16px' }}>{t.disclaimerTitle}</h1>
          <p style={{ fontSize: 14, color: 'oklch(35% 0.01 260)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{t.disclaimerBody}</p>
        </main>
      )}

      <footer style={{ borderTop: '1px solid oklch(90% 0.006 260)' }}>
        {(snapshot?.meta.coreGeneratedAt ||
          snapshot?.meta.sidejobsGeneratedAt ||
          snapshot?.meta.lobbyRegisterGeneratedAt ||
          snapshot?.meta.partyDonationsGeneratedAt) && (
          <div
            style={{
              padding: '10px 32px',
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              fontSize: 11,
              color: 'oklch(55% 0.01 260)',
              background: 'oklch(97% 0.006 260)',
            }}
          >
            {snapshot.meta.coreGeneratedAt && <span>{t.dataAsOfTemplate.replace('{date}', formatDateTime(snapshot.meta.coreGeneratedAt, lang))}</span>}
            {snapshot.meta.sidejobsGeneratedAt && (
              <span>{t.sidejobsAsOfTemplate.replace('{date}', formatDateTime(snapshot.meta.sidejobsGeneratedAt, lang))}</span>
            )}
            {snapshot.meta.lobbyRegisterGeneratedAt && (
              <span>{t.lobbyAsOfTemplate.replace('{date}', formatDateTime(snapshot.meta.lobbyRegisterGeneratedAt, lang))}</span>
            )}
            {snapshot.meta.partyDonationsGeneratedAt && (
              <span>{t.donationsAsOfTemplate.replace('{date}', formatDateTime(snapshot.meta.partyDonationsGeneratedAt, lang))}</span>
            )}
          </div>
        )}
        <div
          style={{
            padding: '14px 32px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            fontSize: 12,
            color: 'oklch(52% 0.01 260)',
          }}
        >
          <span>{t.footerNote}</span>
          <div style={{ display: 'flex', gap: 16 }}>
            <a href="#" onClick={stop(goDisclaimer)} style={{ color: 'oklch(52% 0.01 260)' }}>
              {t.disclaimerTitle}
            </a>
            <a href="#" onClick={stop(goImpressum)} style={{ color: 'oklch(52% 0.01 260)' }}>
              {t.impressumTitle}
            </a>
          </div>
          <span>{t.footerSources}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
