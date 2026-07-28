import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
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

type View = 'home' | 'search' | 'profile' | 'bill' | 'crossref' | 'impressum' | 'disclaimer';
type ProfileTab = 'overview' | 'votes' | 'lobby' | 'finance';
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

function App() {
  const [view, setView] = useState<View>('home');
  const [lang, setLang] = useState<Lang>('de');
  const [selectedMpId, setSelectedMpId] = useState<string | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<BillId | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [partyFilter, setPartyFilter] = useState<Record<string, boolean>>({});
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [following, setFollowing] = useState<Record<string, boolean>>({});

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
  const goCrossref = () => setView('crossref');
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
  const debouncedMandateId = useDebounced(realMatch ? realMatch.mandateId : null, 350);
  const debouncedPoliticianId = useDebounced(realMatch ? realMatch.id : null, 350);
  const mandateVotes = useMandateVotes(debouncedMandateId, pollsState.polls);
  const sidejobs = useSidejobs(debouncedMandateId);
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
  const debouncedPollId = useDebounced(realPollId, 350);
  const pollDetail = usePollResult(debouncedPollId, pollsState.polls);

  const crossrefRows = demoMps
    .filter((m) => m.donations.length > 0)
    .flatMap((m) =>
      m.donations.map((d) => {
        const relatedVote = m.voteHistory[0];
        const label = relatedVote.vote === 'yes' ? t.voteYes : relatedVote.vote === 'no' ? t.voteNo : t.voteAbstain;
        return {
          mpName: m.name,
          donor: d.donor,
          industry: d.industry,
          amount: d.amount,
          voteLabel: label,
          bg: voteBg[relatedVote.vote],
          flagged: m.flags.length > 0,
          onOpen: () => openMp(m.id),
        };
      }),
    );

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
                onClick={goCrossref}
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
                      <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                          {t.alignmentTrendRealTemplate.replace('{n}', String(alignment.windowSize))}
                        </div>
                        <svg viewBox="0 0 400 60" style={{ width: '100%', height: 60, display: 'block' }}>
                          <line x1={20} y1={30} x2={380} y2={30} stroke="oklch(90% 0.006 260)" strokeWidth={2} />
                          {alignment.points.map((p, i) => {
                            const x = alignment.points.length > 1 ? 20 + (i * 360) / (alignment.points.length - 1) : 200;
                            const color = p.aligned === null ? 'oklch(80% 0.006 260)' : p.aligned ? 'oklch(50% 0.14 155)' : 'oklch(55% 0.16 40)';
                            return (
                              <circle key={p.poll.id} cx={x} cy={30} r={6} fill={color}>
                                <title>{`${p.poll.title} (${p.poll.date})`}</title>
                              </circle>
                            );
                          })}
                        </svg>
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
                      return (
                        <div
                          key={v.poll.id}
                          onClick={() => openBill(v.poll.id)}
                          style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px', gap: 12 }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{v.poll.title}</div>
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
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.noLobbyData}</p>
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
          <p style={{ fontSize: 14, color: 'oklch(45% 0.01 260)', margin: '0 0 24px', maxWidth: 640 }}>{t.crossrefSub}</p>

          <div className="pb-scroll" style={{ overflowX: 'auto', border: '1px solid oklch(90% 0.006 260)', borderRadius: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
              <thead>
                <tr style={{ background: 'oklch(97% 0.006 260)', textAlign: 'left' }}>
                  {[t.colMp, t.colDonor, t.colIndustry, t.colAmount, t.colVote, t.colFlag].map((col) => (
                    <th key={col} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'oklch(45% 0.01 260)' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {crossrefRows.map((r, i) => (
                  <tr key={i} onClick={r.onOpen} style={{ cursor: 'pointer', borderTop: '1px solid oklch(93% 0.006 260)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.mpName}</td>
                    <td style={{ padding: '10px 14px' }}>{r.donor}</td>
                    <td style={{ padding: '10px 14px', color: 'oklch(45% 0.01 260)' }}>{r.industry}</td>
                    <td style={{ padding: '10px 14px' }}>{r.amount}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: r.bg, color: 'white' }}>{r.voteLabel}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {r.flagged && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.16 40)' }}>⬤ {t.flagged}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      <footer
        style={{
          borderTop: '1px solid oklch(90% 0.006 260)',
          padding: '24px 32px',
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
      </footer>
    </div>
  );
}

export default App;
