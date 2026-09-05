import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { TRANSLATIONS, type Lang, type Translation } from './data';
import { computeHemicycleSeats, fuzzyIncludes } from './helpers';
import { FALLBACK_PARTY_COLOR, REAL_PARTY_COLORS, useBundestagRoster, type RealMp } from './bundestag';
import { computeAllAlignments, computeDivergences, computeMemberAlignment, isoWeekRange, useAllPollResults, useAllPolls, useMandateVotes, usePartyVotes, usePollResult, useRecentPollResults, useWeeklyResults, type PollResult, type RealPoll } from './polls';
import { buildMemberIncomeScores, useSidejobs } from './sidejobs';
import { useSnapshot, type MemberHistorySummary } from './snapshot';
import { useMemberVoteHistory, usePartyVoteHistory, type DivergenceKind, type HistoricAlignment, type HistoricDivergence } from './voteHistory';
import {
  buildMemberTieCounts,
  drucksacheUrl,
  formatEuro,
  formatExpenseBracket,
  mergeDirectory,
  countMembersWithFunction,
  useCommitteeLobbySummary,
  useCrossrefRows,
  useLobbyDirectory,
  useMemberLobby,
  useOrgDetail,
  useOrgList,
  useOrgPartyNetwork,
  usePartyDonations,
  usePartyLobbySummary,
  usePollLobbying,
  useTopicalTieRows,
  type CrossrefRow,
  type LobbyOrg,
  type OrgListEntry,
  type SpendScope,
} from './lobby';
import { committeeIcon, useCommitteeDetail, useCommitteeList, useMemberCommittees } from './committees';
import { PartyOrgGraph } from './PartyOrgGraph';
import { DonationSankey } from './DonationSankey';
import { DonationTimeline } from './DonationTimeline';
import { ShowMoreButton } from './ShowMoreButton';
import { ChartExportMenu, type ChartExportLabels } from './ChartExportMenu';
import type { ChartSvgExport } from './chartExport';
import { DEFAULT_ROUTE, pathToRoute, routeToPath, stripBase, withBase, type LobbyTab, type PartyTab, type ProfileTab, type View } from './router';

type BillId = string | number;

/** Real polls use numeric ids, demo bills use string ids like 'b1' — a URL segment is always a string, so a purely-numeric one is a real poll id. */
function parseBillId(billId: string | null): BillId | null {
  if (billId === null) return null;
  return /^\d+$/.test(billId) ? Number(billId) : billId;
}

/** Mirrors scripts/build-sitemap.mjs's SITE_URL — used to build the canonical/OG URL for the page currently on screen. */
const SITE_URL = 'https://politblick.de';

declare global {
  interface Window {
    // The count.js script (loaded in index.html) defines this once it's finished loading —
    // undefined until then, and permanently if it's blocked (ad blockers commonly block
    // analytics scripts by domain), so every call site guards with `?.`.
    goatcounter?: { count?: (vars: { path?: string; title?: string; event?: boolean; referrer?: string }) => void };
  }
}

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

/** Wraps a client-side nav action for use as an <a href="..."> onClick. Only intercepts plain,
 * unmodified left-clicks — ctrl/cmd/shift/alt-click and middle-click fall through to the browser's
 * native "open in new tab/window" behavior against the real href instead of being swallowed. */
function stop(fn: () => void) {
  return (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
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

/** Photo is pre-resolved at fetch time (see fetch-core.mjs) and just a static URL now — falls back to colored initials if there's no Wikidata portrait, or if the Commons URL fails to load. */
function MpAvatar({ photoUrl, name, color, initials, size }: { photoUrl: string | null; name: string; color: string; initials: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'oklch(90% 0.006 260)' }}
      />
    );
  }
  return (
    <div
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

/** Whole millions, for stat tiles where a nine-digit euro figure would wrap or crowd out its label. */
function formatMillions(euro: number, lang: Lang): string {
  return Math.round(euro / 1e6).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');
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

/**
 * A small ℹ️ affordance next to jargon (Verflechtung, Auffälligkeit, …) that repeats the term's
 * definition inline — the full explanation already exists in the disclaimer page, but almost
 * nobody reads a footer link before they've decided whether to trust a number on the page.
 */
function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <span ref={containerRef} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', marginLeft: 5 }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Info"
        style={{
          width: 15,
          height: 15,
          borderRadius: '50%',
          border: '1px solid oklch(70% 0.01 260)',
          background: open ? 'oklch(45% 0.16 265)' : 'white',
          color: open ? 'white' : 'oklch(50% 0.01 260)',
          fontSize: 10,
          fontWeight: 700,
          fontStyle: 'italic',
          lineHeight: '13px',
          padding: 0,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        i
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            width: 260,
            background: 'white',
            border: '1px solid oklch(88% 0.006 260)',
            borderRadius: 10,
            boxShadow: '0 4px 16px oklch(0% 0 0 / 0.1)',
            padding: '10px 12px',
            fontSize: 12.5,
            fontWeight: 400,
            lineHeight: 1.5,
            color: 'oklch(30% 0.01 260)',
            zIndex: 40,
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}

/**
 * Tab bar used both for the party page's top-level tabs and for the second-level tabs inside a
 * single Lobby & Finanzen sub-page (Parteien, Organisationen, Verflechtungen, Spenden) — splits
 * content into focused views instead of one long vertical stack. On narrow screens the row can
 * overflow (e.g. "Direkte Verflechtungen" + "Thematische Nähe" don't fit a phone width), so it
 * tracks scroll position the same way ScrollBox does for wide tables and shows a small trailing
 * chevron over the right edge whenever there's more to scroll to, so a later tab never just goes
 * silently missing off-screen. The chevron is mobile-only (see .pb-subtab-arrow in index.css) —
 * desktop either fits every tab or has an always-visible native scrollbar, so the hint would just
 * be noise there.
 */
function SubTabBar<K extends string>({ tabs, active, onChange }: { tabs: { key: K; label: string }[]; active: K; onChange: (key: K) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateOverflow = () => {
    const el = ref.current;
    if (!el) return;
    const next = el.scrollWidth > el.clientWidth + el.scrollLeft + 2;
    setCanScrollRight((prev) => (prev === next ? prev : next));
  };

  useEffect(() => {
    updateOverflow();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateOverflow);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  return (
    <div style={{ position: 'relative', marginBottom: 24 }}>
      <div
        ref={ref}
        onScroll={updateOverflow}
        className="pb-scroll"
        style={{
          display: 'flex',
          gap: 8,
          borderBottom: '1px solid oklch(90% 0.006 260)',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              padding: '10px 4px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 13.5,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              borderBottom: `2px solid ${active === tab.key ? 'oklch(45% 0.16 265)' : 'transparent'}`,
              color: active === tab.key ? 'oklch(20% 0.01 260)' : 'oklch(50% 0.01 260)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {canScrollRight && (
        <span
          aria-hidden
          className="pb-subtab-arrow"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 8,
            right: -4,
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'white',
              border: '1px solid oklch(85% 0.006 260)',
              boxShadow: '0 1px 4px oklch(0% 0 0 / 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="oklch(45% 0.16 265)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </span>
      )}
    </div>
  );
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

function toggleSort(prev: SortState, key: string): SortState {
  if (prev?.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: 'asc' };
}

function compareSortValues(a: string | number | null, b: string | number | null, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const factor = dir === 'asc' ? 1 : -1;
  if (typeof a === 'string' && typeof b === 'string') return factor * a.localeCompare(b, 'de');
  return factor * ((a as number) - (b as number));
}

/** Click-to-sort table header, file-explorer style: first click ascending, click again to reverse. */
function SortableTh({ label, sortKey, sort, onSort }: { label: string; sortKey: string; sort: SortState; onSort: (key: string) => void }) {
  const active = sort?.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '10px 14px',
        fontWeight: 700,
        fontSize: 11.5,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        color: active ? 'oklch(35% 0.14 265)' : 'oklch(45% 0.01 260)',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.3 }}>{active && sort!.dir === 'desc' ? '▼' : '▲'}</span>
    </th>
  );
}

/** An ordered list of sort keys — click order is priority order, so "click Partei then Betrag"
 * sorts by Partei first and uses Betrag only to break ties within a party, not as a competing
 * global sort. A single-key SortState can't express that: clicking a second column would just
 * replace the first, losing the grouping. */
type MultiSortState = { key: string; dir: 'asc' | 'desc' }[];

/** Click cycles a column through three states — unsorted → asc → desc → unsorted (removed) —
 * without disturbing any other column's position in the priority list, so building up "Partei,
 * then Betrag" is just clicking each header once in that order. */
function toggleMultiSort(prev: MultiSortState, key: string): MultiSortState {
  const existing = prev.find((s) => s.key === key);
  if (!existing) return [...prev, { key, dir: 'asc' }];
  if (existing.dir === 'asc') return prev.map((s) => (s.key === key ? { key, dir: 'desc' } : s));
  return prev.filter((s) => s.key !== key);
}

function compareMultiSortValues(sort: MultiSortState, valueOf: (key: string) => [string | number | null, string | number | null]): number {
  for (const { key, dir } of sort) {
    const [a, b] = valueOf(key);
    const cmp = compareSortValues(a, b, dir);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/** Same as SortableTh, but shows a priority number (1, 2, …) alongside the arrow when more than
 * one column is active, so it's visible which key is primary vs. a tiebreaker. */
function MultiSortableTh({ label, sortKey, sort, onSort }: { label: string; sortKey: string; sort: MultiSortState; onSort: (key: string) => void }) {
  const index = sort.findIndex((s) => s.key === sortKey);
  const active = index !== -1;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '10px 14px',
        fontWeight: 700,
        fontSize: 11.5,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        color: active ? 'oklch(35% 0.14 265)' : 'oklch(45% 0.01 260)',
        cursor: 'pointer',
        userSelect: 'none',
        // Unlike SortableTh's short single-word labels, this one also carries the longer
        // donor-total headers ("Spender insgesamt bei CDU/CSU") — letting those wrap onto a
        // second line keeps the column (and so the whole table) from being stretched wide by
        // one long label while every other column stays narrow.
        whiteSpace: 'normal',
        maxWidth: 140,
      }}
    >
      {label}
      <span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.3 }}>
        {active && sort[index].dir === 'desc' ? '▼' : '▲'}
        {sort.length > 1 && active ? index + 1 : ''}
      </span>
    </th>
  );
}

function toggleInSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** Turns an MP's name into a URL-safe, readable slug — German umlauts get their usual ASCII
 * transliteration rather than being stripped, so "Müller" reads as "mueller", not "mller". */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Builds the `/abgeordnete/<id>-<name-slug>` URL segment for an MP — kept ID-first (rather than
 * a bare name slug like the party URLs) because names aren't guaranteed unique across 630+
 * members the way party names are, and it keeps every already-shared/indexed numeric link
 * (`/abgeordnete/175389`) resolving to the same page forever, since the ID is still right there
 * at the front. The slug after it exists purely so the URL reads as a name for sharing/indexing. */
function buildMpUrlParam(id: string, roster: RealMp[]): string {
  const name = roster.find((m) => String(m.id) === id)?.name;
  return name ? `${id}-${slugify(name)}` : id;
}

/** The router treats the whole `/abgeordnete/<param>` segment as opaque — this pulls the actual
 * lookup key (the leading numeric ID) back out, so a slug URL and a bare-ID URL both resolve to
 * the same member via the existing ID-based matching everywhere else in this file. */
function extractMpId(param: string | null): string | null {
  if (!param) return null;
  return param.match(/^\d+/)?.[0] ?? param;
}

/** Generic sibling of buildMpUrlParam, for bill/org/committee URLs — same id-first-then-readable-
 * slug shape, for the same reasons (share-worthy links, stable IDs). */
function buildSlugParam(id: string | number, name: string | null | undefined): string {
  return name ? `${id}-${slugify(name)}` : String(id);
}

/** Generic sibling of extractMpId, for id formats that never contain a hyphen themselves — plain
 * numeric ids (bills, committees) and the Lobbyregister's letter-prefixed org ids (e.g.
 * "R007203") all qualify, so splitting on the first hyphen reliably isolates the id from
 * whatever readable slug got appended after it. */
function extractLeadingId(param: string | null): string | null {
  if (!param) return null;
  const dash = param.indexOf('-');
  return dash === -1 ? param : param.slice(0, dash);
}

/** Bill URLs are keyed by the real poll id. */
function buildBillUrlParam(id: BillId, polls: RealPoll[]): string {
  const title = typeof id === 'number' ? polls.find((p) => p.id === id)?.title : undefined;
  return buildSlugParam(id, title);
}

/** A "diverged from fraction majority" flag is true for both a genuine opposite vote (yes vs no)
 * and an abstention that merely didn't join a yes/no majority — those aren't the same thing, so
 * the label has to say which one actually happened rather than always claiming "voted against". */
function divergenceLabel(vote: 'yes' | 'no' | 'abstain' | 'no_show', against: string, abstained: string): string {
  return vote === 'yes' || vote === 'no' ? against : abstained;
}

/** Distinct values with occurrence counts, biggest first — feeds MultiSelectFilter option lists. */
function countOptions(values: string[]): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'de'));
}

/**
 * The long-run voting record, as one card. Rendered on both the overview and the votes tab, so
 * it lives here rather than being written twice — two copies of a card that makes a factual
 * claim about a named person is exactly the sort of thing that drifts apart unnoticed.
 *
 * `footer` is what differs between the two placements: a link across to the votes tab on the
 * overview, an expand toggle plus the vote-by-vote list on the votes tab itself.
 */
function LongTermRecordCard({
  history,
  t,
  formatPct,
  activeKind,
  activeTopic,
  onSelectKind,
  onSelectTopic,
  footer,
}: {
  history: HistoricAlignment;
  t: Translation;
  formatPct: (value: number) => string;
  /** The kind/topic currently narrowing the detail list, so the chip can show as pressed. */
  activeKind?: DivergenceKind | null;
  activeTopic?: string | null;
  onSelectKind?: (kind: DivergenceKind) => void;
  onSelectTopic?: (topic: string) => void;
  footer?: ReactNode;
}) {
  if (history.error) return null;
  return (
    <div style={{ background: 'oklch(97% 0.006 260)', border: '1px solid oklch(90% 0.008 260)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(30% 0.01 260)', marginBottom: 4 }}>
        {t.historyHeading}
        <InfoTooltip text={t.historyInfo} />
      </div>
      {history.loading ? (
        <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>{t.historyLoading}</div>
      ) : history.ratedCount === 0 ? (
        // Said out loud rather than left blank: 37% of members are in their first term, and an
        // empty space here reads as "nothing to report about their loyalty" instead of "no
        // earlier term exists to measure".
        <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>{t.historyNone}</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'oklch(32% 0.01 260)', marginBottom: 4 }}>
            {t.historyBaseRate
              .replace('{count}', String(history.divergenceCount))
              .replace('{total}', String(history.ratedCount))
              .replace('{pct}', history.alignmentPct == null ? '—' : formatPct(history.alignmentPct))}
          </div>
          {history.fractionAlignmentPct != null && (
            <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 8 }}>
              {t.historyFractionAverage.replace('{pct}', formatPct(history.fractionAlignmentPct))}
            </div>
          )}
          {/* An abstention is not a vote against. Splitting the total keeps the headline number
              from reading as more dissent than actually occurred — across the archive nearly four
              in ten divergences are not opposition. */}
          {history.divergenceCount > 0 && (
            <div style={{ fontSize: 12, color: 'oklch(38% 0.01 260)', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {([
                ['opposed', history.opposedCount, t.historyKindOpposed, t.historyKindOpposedOne],
                ['abstained', history.abstainedCount, t.historyKindAbstained, t.historyKindAbstainedOne],
                ['brokeAbstention', history.brokeAbstentionCount, t.historyKindBrokeAbstention, t.historyKindBrokeAbstentionOne],
              ] as [DivergenceKind, number, string, string][])
                .filter(([, n]) => n > 0)
                .map(([kind, n, plural, singular]) => {
                  const active = activeKind === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={onSelectKind ? () => onSelectKind(kind) : undefined}
                      aria-pressed={active}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 12,
                        fontFamily: 'inherit',
                        cursor: onSelectKind ? 'pointer' : 'default',
                        background: active ? 'oklch(30% 0.01 260)' : 'white',
                        color: active ? 'white' : 'oklch(38% 0.01 260)',
                        border: `1px solid ${active ? 'oklch(30% 0.01 260)' : 'oklch(90% 0.006 260)'}`,
                      }}
                    >
                      {n} {n === 1 ? singular : plural}
                    </button>
                  );
                })}
              <InfoTooltip text={t.historyKindSplitInfo} />
            </div>
          )}
          <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: history.topTopics.length > 0 ? 10 : 0 }}>
            {history.terms
              .map((term) =>
                t.historyTermTemplate
                  .replace('{label}', term.label)
                  .replace('{count}', String(term.divergenceCount))
                  .replace('{total}', String(term.ratedCount)),
              )
              .join(' · ')}
          </div>
          {history.topTopics.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(38% 0.01 260)', marginBottom: 6 }}>{t.historyTopicsLabel}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {history.topTopics.slice(0, 6).map((topic) => {
                  const active = activeTopic === topic.topic;
                  return (
                    <button
                      key={topic.topic}
                      type="button"
                      onClick={onSelectTopic ? () => onSelectTopic(topic.topic) : undefined}
                      aria-pressed={active}
                      style={{
                        fontSize: 11.5,
                        padding: '3px 9px',
                        borderRadius: 10,
                        fontFamily: 'inherit',
                        cursor: onSelectTopic ? 'pointer' : 'default',
                        background: active ? 'oklch(30% 0.01 260)' : 'white',
                        color: active ? 'white' : 'oklch(38% 0.01 260)',
                        border: `1px solid ${active ? 'oklch(30% 0.01 260)' : 'oklch(90% 0.006 260)'}`,
                      }}
                    >
                      {t.historyTopicTemplate
                        .replace('{topic}', topic.topic)
                        .replace('{count}', String(topic.divergences))
                        .replace('{total}', String(topic.rated))}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {footer}
        </>
      )}
    </div>
  );
}

/** The vote-by-vote detail behind the card: every archived divergence, newest first. */
function LongTermDivergenceList({ divergences, t }: { divergences: HistoricDivergence[]; t: Translation }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      {divergences.map((d) => {
        const voteLabel = d.vote === 'yes' ? t.voteYes : d.vote === 'no' ? t.voteNo : t.voteAbstain;
        const majorityLabel = d.majority === 'yes' ? t.voteYes : d.majority === 'no' ? t.voteNo : t.voteAbstain;
        // Singular: each row is one vote, not a count.
        const kindLabel =
          d.kind === 'opposed' ? t.historyKindOpposedOne : d.kind === 'abstained' ? t.historyKindAbstainedOne : t.historyKindBrokeAbstentionOne;
        // Only an opposite vote is coloured as dissent; an abstention is a reservation and is
        // deliberately not dressed up as opposition.
        const kindColor = d.kind === 'opposed' ? 'oklch(48% 0.16 40)' : 'oklch(50% 0.01 260)';
        return (
          <a
            key={`${d.pollId}-${d.date}`}
            href={d.url}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: 'none', color: 'inherit', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</span>
              <span style={{ fontSize: 11.5, color: kindColor, fontWeight: 700, whiteSpace: 'nowrap' }}>{kindLabel}</span>
            </div>
            <div style={{ fontSize: 12, color: 'oklch(45% 0.01 260)', marginTop: 4 }}>
              {t.historyDetailVoteTemplate.replace('{vote}', voteLabel).replace('{party}', d.party).replace('{majority}', majorityLabel)}
            </div>
            <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 3 }}>
              {d.date} · {d.termLabel}
              {d.topics.length > 0 ? ` · ${d.topics.join(', ')}` : ''}
            </div>
          </a>
        );
      })}
    </div>
  );
}

/** Checkbox-list dropdown filter: click to open, click any checkbox to toggle, click outside to close. */
function MultiSelectFilter({
  label,
  options,
  selected,
  onToggle,
  onClear,
  allLabel,
  selectedCountTemplate,
  clearLabel,
  searchable,
  searchPlaceholder,
}: {
  label: string;
  options: { value: string; label: string; count: number }[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
  allLabel: string;
  selectedCountTemplate: string;
  clearLabel: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  if (options.length === 0) return null;
  const visibleOptions =
    searchable && query.trim() ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options;
  const buttonText = selected.size === 0 ? allLabel : selectedCountTemplate.replace('{n}', String(selected.size));

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          borderRadius: 20,
          border: `1px solid ${selected.size > 0 ? 'oklch(45% 0.16 265)' : 'oklch(85% 0.006 260)'}`,
          background: selected.size > 0 ? 'oklch(45% 0.16 265 / 0.08)' : 'white',
          color: selected.size > 0 ? 'oklch(40% 0.16 265)' : 'oklch(30% 0.01 260)',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {label}: <span style={{ fontWeight: 700 }}>{buttonText}</span>
        <span style={{ fontSize: 9, opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 6,
              zIndex: 41,
              background: 'white',
              border: '1px solid oklch(88% 0.006 260)',
              borderRadius: 10,
              boxShadow: '0 4px 16px oklch(0% 0 0 / 0.1)',
              width: 260,
              maxHeight: 320,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {searchable && (
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                autoFocus
                style={{
                  margin: 8,
                  padding: '7px 10px',
                  border: '1px solid oklch(88% 0.006 260)',
                  borderRadius: 7,
                  fontSize: 12.5,
                  boxSizing: 'border-box',
                }}
              />
            )}
            <div style={{ overflowY: 'auto', padding: '4px 4px 4px' }}>
              {visibleOptions.length === 0 ? (
                <div style={{ padding: '8px 10px', fontSize: 12, color: 'oklch(55% 0.01 260)' }}>—</div>
              ) : (
                visibleOptions.map((opt) => (
                  <label
                    key={opt.value}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer' }}
                  >
                    <input type="checkbox" checked={selected.has(opt.value)} onChange={() => onToggle(opt.value)} />
                    <span style={{ flex: 1 }}>{opt.label}</span>
                    <span style={{ color: 'oklch(55% 0.01 260)', fontSize: 11 }}>{opt.count}</span>
                  </label>
                ))
              )}
            </div>
            {selected.size > 0 && (
              <button
                onClick={onClear}
                style={{
                  border: 'none',
                  borderTop: '1px solid oklch(93% 0.006 260)',
                  background: 'none',
                  padding: '9px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'oklch(45% 0.16 265)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {clearLabel}
              </button>
            )}
          </div>
        </>
      )}
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
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncateLabel(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/** First paragraph of a `\n\n`-separated text block, for a collapsed preview that never cuts off mid-sentence. */
function firstParagraph(text: string): string {
  return text.split(/\n{2,}/)[0];
}

function normalizeSearchText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Substring match first (so "cdu" hits "CDU/CSU" outright), falling back to an in-order
 * subsequence match (so "kwhitt" still hits "Kai Whittaker") — cheap enough for the list sizes
 * these searches run over, no need for a scored fuzzy library.
 *
 * The subsequence fallback is capped to a tight span (query length + slack) — an uncapped
 * subsequence match against long prose (an org's name plus its lobbying demand) turns almost
 * any short query into a hit, since 4-5 letters are near-certain to appear somewhere in order
 * across a long string. Real near-misses (a typo, a skipped letter) still fit the cap; unrelated
 * matches scattered across a whole sentence don't.
 */
function fuzzyMatch(query: string, target: string): boolean {
  const q = normalizeSearchText(query.trim());
  if (!q) return true;
  const t = normalizeSearchText(target);
  if (t.includes(q)) return true;
  if (q.length < 3) return false;
  let qi = 0;
  let firstIndex = -1;
  let lastIndex = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstIndex === -1) firstIndex = ti;
      lastIndex = ti;
      qi++;
    }
  }
  if (qi !== q.length) return false;
  return lastIndex - firstIndex + 1 <= q.length + 4;
}

function TieMatrix({
  rows,
  partyOrder,
  selected,
  onSelect,
  scrollHintText,
  filenameBase,
  exportLabels,
}: {
  rows: CrossrefRow[];
  partyOrder: { name: string; color: string }[];
  selected: MatrixCell | null;
  onSelect: (cell: MatrixCell | null) => void;
  scrollHintText: string;
  filenameBase: string;
  exportLabels: ChartExportLabels;
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

  const getCsv = () => ({
    headers: ['Party', 'Topic', 'Count'],
    rows: activeParties.flatMap((p) => topics.map((topic) => [p.name, topic, counts.get(`${p.name}|${topic}`) ?? 0])),
  });

  const getSvg = (): ChartSvgExport => {
    const CELL_W = 68;
    const CELL_H = 34;
    const LABEL_W = 150;
    const HEADER_H = 100;
    const PAD = 12;
    const width = PAD * 2 + LABEL_W + topics.length * CELL_W;
    const height = PAD * 2 + HEADER_H + activeParties.length * CELL_H;
    const header = topics
      .map((topic, ci) => {
        const x = PAD + LABEL_W + ci * CELL_W + CELL_W / 2;
        const y = PAD + HEADER_H - 8;
        return `<text x="${x}" y="${y}" text-anchor="start" font-size="10.5" font-weight="700" fill="#5a5f6b" transform="rotate(-40 ${x} ${y})">${escapeXml(truncateLabel(topic, 30))}</text>`;
      })
      .join('');
    const body = activeParties
      .map((p, ri) => {
        const y = PAD + HEADER_H + ri * CELL_H;
        const label = `<text x="${PAD}" y="${y + CELL_H / 2}" dominant-baseline="middle" font-size="12.5" font-weight="700" fill="#1a1d23">${escapeXml(p.name)}</text>`;
        const cells = topics
          .map((topic, ci) => {
            const x = PAD + LABEL_W + ci * CELL_W;
            const n = counts.get(`${p.name}|${topic}`) ?? 0;
            const { bg, fg } = heat(n);
            const isSelected = selected?.party === p.name && selected?.topic === topic;
            const text = n > 0 ? `<text x="${x + CELL_W / 2}" y="${y + CELL_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12.5" font-weight="700" fill="${fg}">${n}</text>` : '';
            return `<rect x="${x + 3}" y="${y + 3}" width="${CELL_W - 6}" height="${CELL_H - 6}" rx="6" fill="${bg}" stroke="${isSelected ? '#284cac' : 'none'}" stroke-width="2"/>${text}`;
          })
          .join('');
        return label + cells;
      })
      .join('');
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'IBM Plex Sans', sans-serif">${header}${body}</svg>`;
    return { svgString, width, height };
  };

  return (
    <div style={{ position: 'relative' }}>
      <ChartExportMenu filenameBase={filenameBase} getCsv={getCsv} getSvg={getSvg} labels={exportLabels} />
      <ScrollBox hintText={scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14, marginTop: 44, marginBottom: 14 }}>
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
    </div>
  );
}

/** Classic semicircle parliament seating chart — replaces flat seat-count tiles with the standard, instantly-recognizable graphic. */
function HemicycleChart({
  parties,
  seatsLabel,
  onOpenParty,
  partyHref,
  isPartyRoutable,
  filenameBase,
  exportLabels,
}: {
  parties: { name: string; seats: number; color: string }[];
  seatsLabel: string;
  onOpenParty: (party: string) => void;
  partyHref: (party: string) => string;
  isPartyRoutable: (party: string) => boolean;
  filenameBase: string;
  exportLabels: ChartExportLabels;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const seats = computeHemicycleSeats(parties, { rows: 9, rMin: 55, rMax: 200, cx: 260, cy: 220 });
  const total = parties.reduce((sum, p) => sum + p.seats, 0);
  const getCsv = () => ({ headers: ['Party', 'Seats'], rows: parties.map((p) => [p.name, p.seats]) });
  return (
    <div style={{ position: 'relative', background: 'oklch(97% 0.006 260)', borderRadius: 14, padding: '18px 18px 14px', height: '100%' }}>
      <ChartExportMenu filenameBase={filenameBase} getCsv={getCsv} svgRef={svgRef} labels={exportLabels} />
      <svg ref={svgRef} viewBox="0 0 520 250" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {seats.map((s, i) => {
          const routable = isPartyRoutable(s.party);
          return (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={5.4}
              fill={s.color}
              style={{ cursor: routable ? 'pointer' : 'default' }}
              onClick={routable ? () => onOpenParty(s.party) : undefined}
            />
          );
        })}
        <text x={260} y={214} textAnchor="middle" fontSize={24} fontWeight={800} fill="oklch(20% 0.01 260)">
          {total}
        </text>
        <text x={260} y={233} textAnchor="middle" fontSize={11} fill="oklch(48% 0.01 260)">
          {seatsLabel}
        </text>
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 16px', marginTop: 2 }}>
        {parties.map((p) => {
          const routable = isPartyRoutable(p.name);
          return (
            <a
              key={p.name}
              href={routable ? partyHref(p.name) : undefined}
              onClick={routable ? stop(() => onOpenParty(p.name)) : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: routable ? 'pointer' : 'default', textDecoration: 'none', color: 'inherit' }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, textDecoration: routable ? 'underline' : 'none', textDecorationColor: 'oklch(85% 0.006 260)' }}>{p.name}</span>
              <span style={{ color: 'oklch(50% 0.01 260)' }}>{p.seats}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Horizontal bars, not a pie/stacked-bar: donation totals here span ~190x (90K to
 * 17M), so a part-to-whole encoding (pie or one stacked bar) would render most
 * parties as an unreadable sliver. Independent bars stay legible at any magnitude —
 * this is a ranking/comparison job, not a proportion-of-total one.
 */
function DonationBarChart({
  data,
  filenameBase,
  exportLabels,
}: {
  data: { fraction: string; total: number; count: number }[];
  filenameBase: string;
  exportLabels: ChartExportLabels;
}) {
  if (data.length === 0) return null;
  const max = data[0].total;
  const ROW_H = 30;
  const BAR_H = 18;
  const LABEL_W = 170;
  const PLOT_W = 340;
  const VALUE_W = 170;
  const PAD = 10;
  const getCsv = () => ({ headers: ['Party', 'Total (EUR)', 'Count'], rows: data.map((p) => [p.fraction, p.total, p.count]) });
  const getSvg = (): ChartSvgExport => {
    const width = PAD * 2 + LABEL_W + PLOT_W + VALUE_W;
    const height = PAD * 2 + data.length * ROW_H;
    const body = data
      .map((p, i) => {
        const y = PAD + i * ROW_H;
        const pct = Math.max(1, (p.total / max) * 100);
        const barW = (pct / 100) * PLOT_W;
        const color = REAL_PARTY_COLORS[p.fraction] || FALLBACK_PARTY_COLOR;
        return `<circle cx="${PAD + 5}" cy="${y + BAR_H / 2}" r="4.5" fill="${color}"/>
          <text x="${PAD + 16}" y="${y + BAR_H / 2}" dominant-baseline="middle" font-size="12.5" font-weight="600" fill="#1a1d23">${escapeXml(p.fraction)}</text>
          <rect x="${PAD + LABEL_W}" y="${y}" width="${PLOT_W}" height="${BAR_H}" rx="4" fill="#eef0f2"/>
          <rect x="${PAD + LABEL_W}" y="${y}" width="${barW}" height="${BAR_H}" rx="4" fill="${color}"/>
          <text x="${PAD + LABEL_W + PLOT_W + 10}" y="${y + BAR_H / 2}" dominant-baseline="middle" font-size="11.5" fill="#6b7280">${escapeXml(formatEuro(p.total))} · ${p.count}×</text>`;
      })
      .join('');
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'IBM Plex Sans', sans-serif">${body}</svg>`;
    return { svgString, width, height };
  };
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 44 }}>
      <ChartExportMenu filenameBase={filenameBase} getCsv={getCsv} getSvg={getSvg} labels={exportLabels} />
      {data.map((p) => {
        const pct = Math.max(1, (p.total / max) * 100);
        return (
          <div key={p.fraction} className="donation-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="donation-label" style={{ width: 168, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: REAL_PARTY_COLORS[p.fraction] || FALLBACK_PARTY_COLOR, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.fraction}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0, background: 'oklch(95% 0.006 260)', borderRadius: 4 }}>
              <div
                style={{
                  height: 18,
                  width: `${pct}%`,
                  minWidth: 3,
                  background: REAL_PARTY_COLORS[p.fraction] || FALLBACK_PARTY_COLOR,
                  borderTopRightRadius: 4,
                  borderBottomRightRadius: 4,
                }}
              />
            </div>
            <span className="donation-value" style={{ fontSize: 11.5, color: 'oklch(45% 0.01 260)', whiteSpace: 'nowrap', flexShrink: 0, width: 150 }}>
              {formatEuro(p.total)} · {p.count}×
            </span>
          </div>
        );
      })}
    </div>
  );
}

export type SectorMetric = 'members' | 'orgs';

/**
 * Declared lobbying spend grouped by the register's own actor-type classification.
 *
 * This is the only grouping `expensesEuro` supports. Every organisation carries exactly one actor
 * type, so no budget lands in two rows. Grouping by field of interest instead would hand each of
 * an organisation's ~12 declared fields its entire budget and overstate the total roughly
 * 17-fold, which is why that metric no longer exists. Party, bill and time axes are absent here
 * because the register records no euro against any of them — not because they were left out.
 */
function ActorTypeSpendChart({
  scope,
  orgsTemplate,
  filenameBase,
  exportLabels,
}: {
  scope: SpendScope;
  orgsTemplate: string;
  filenameBase: string;
  exportLabels: ChartExportLabels;
}) {
  const rows = scope.byActorType.filter((a) => a.to > 0);
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((a) => a.to));
  const getCsv = () => ({
    headers: ['Actor type', 'Organizations', 'Organizations declaring a figure', 'Spend from (EUR)', 'Spend to (EUR)'],
    rows: rows.map((a) => [a.actorType, a.orgCount, a.declaringCount, a.from, a.to]),
  });
  const getSvg = (): ChartSvgExport => {
    const ROW_H = 48;
    const BAR_H = 18;
    const PLOT_W = 380;
    const VALUE_W = 300;
    const PAD = 10;
    const width = PAD * 2 + PLOT_W + VALUE_W;
    const height = PAD * 2 + rows.length * ROW_H;
    const body = rows
      .map((a, i) => {
        const y = PAD + i * ROW_H;
        const barW = Math.max(2, (a.to / max) * PLOT_W);
        const valueText = `${orgsTemplate.replace('{n}', String(a.declaringCount))} · ${escapeXml(formatExpenseBracket({ from: a.from, to: a.to }) ?? '')}`;
        return `<text x="${PAD}" y="${y + 12}" font-size="12.5" font-weight="600" fill="#1a1d23">${escapeXml(a.actorType)}</text>
          <rect x="${PAD}" y="${y + 18}" width="${PLOT_W}" height="${BAR_H}" rx="4" fill="#eef0f2"/>
          <rect x="${PAD}" y="${y + 18}" width="${barW}" height="${BAR_H}" rx="4" fill="#5c86d6"/>
          <text x="${PAD + PLOT_W + 10}" y="${y + 18 + BAR_H / 2}" dominant-baseline="middle" font-size="11" fill="#6b7280">${valueText}</text>`;
      })
      .join('');
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'IBM Plex Sans', sans-serif">${body}</svg>`;
    return { svgString, width, height };
  };
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 44 }}>
      <ChartExportMenu filenameBase={filenameBase} getCsv={getCsv} getSvg={getSvg} labels={exportLabels} />
      {rows.map((a) => (
        <div key={a.actorType}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}>{a.actorType}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0, background: 'oklch(95% 0.006 260)', borderRadius: 4 }}>
              <div
                style={{
                  height: 18,
                  width: `${Math.max(1, (a.to / max) * 100)}%`,
                  minWidth: 3,
                  background: 'oklch(58% 0.13 265)',
                  borderTopRightRadius: 4,
                  borderBottomRightRadius: 4,
                }}
              />
            </div>
            {/* Same fixed-width trailing column as SectorBarChart, so every bar track is the
                same length regardless of how long that row's own value text runs. */}
            <span style={{ fontSize: 11.5, color: 'oklch(45% 0.01 260)', width: 240, flexShrink: 0 }}>
              {orgsTemplate.replace('{n}', String(a.declaringCount))} · {formatExpenseBracket({ from: a.from, to: a.to })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Ranked horizontal bar chart for a category count (e.g. field-of-interest → tied MPs) — bars
 * are clickable to drill into the filtered list they summarize. The label sits on its own line
 * above the bar (rather than a fixed-width side column) so long field-of-interest names never
 * get truncated. */
function SectorBarChart({
  data,
  metric,
  selected,
  onSelect,
  membersTemplate,
  orgsTemplate,
  filenameBase,
  exportLabels,
}: {
  data: { field: string; memberCount: number; orgCount: number }[];
  metric: SectorMetric;
  selected: Set<string>;
  onSelect: (field: string) => void;
  membersTemplate: string;
  orgsTemplate: string;
  filenameBase: string;
  exportLabels: ChartExportLabels;
}) {
  if (data.length === 0) return null;
  const valueFor = (d: (typeof data)[number]) => (metric === 'members' ? d.memberCount : d.orgCount);
  const max = Math.max(1, ...data.map(valueFor));
  const getCsv = () => ({
    headers: ['Field of interest', 'Tied MPs (distinct)', 'Organizations'],
    rows: data.map((d) => [d.field, d.memberCount, d.orgCount]),
  });
  const getSvg = (): ChartSvgExport => {
    const ROW_H = 48;
    const BAR_H = 18;
    const PLOT_W = 380;
    const VALUE_W = 280;
    const PAD = 10;
    const width = PAD * 2 + PLOT_W + VALUE_W;
    const height = PAD * 2 + data.length * ROW_H;
    const body = data
      .map((d, i) => {
        const y = PAD + i * ROW_H;
        const isSelected = selected.has(d.field);
        const pct = Math.max(1, (valueFor(d) / max) * 100);
        const barW = (pct / 100) * PLOT_W;
        const color = isSelected ? '#284cac' : '#5c86d6';
        const valueText = `${membersTemplate.replace('{n}', String(d.memberCount))} · ${orgsTemplate.replace('{n}', String(d.orgCount))}`;
        return `<text x="${PAD}" y="${y + 12}" font-size="12.5" font-weight="${isSelected ? 700 : 600}" fill="#1a1d23">${escapeXml(d.field)}</text>
          <rect x="${PAD}" y="${y + 18}" width="${PLOT_W}" height="${BAR_H}" rx="4" fill="#eef0f2"/>
          <rect x="${PAD}" y="${y + 18}" width="${barW}" height="${BAR_H}" rx="4" fill="${color}"/>
          <text x="${PAD + PLOT_W + 10}" y="${y + 18 + BAR_H / 2}" dominant-baseline="middle" font-size="11" fill="#6b7280">${valueText}</text>`;
      })
      .join('');
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'IBM Plex Sans', sans-serif">${body}</svg>`;
    return { svgString, width, height };
  };
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 44 }}>
      <ChartExportMenu filenameBase={filenameBase} getCsv={getCsv} getSvg={getSvg} labels={exportLabels} />
      {data.map((d) => {
        const pct = Math.max(1, (valueFor(d) / max) * 100);
        const isSelected = selected.has(d.field);
        return (
          <div key={d.field} onClick={() => onSelect(d.field)} style={{ cursor: 'pointer' }}>
            <div style={{ fontSize: 12.5, fontWeight: isSelected ? 700 : 600, marginBottom: 5 }}>{d.field}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0, background: 'oklch(95% 0.006 260)', borderRadius: 4 }}>
                <div
                  style={{
                    height: 18,
                    width: `${pct}%`,
                    minWidth: 3,
                    background: isSelected ? 'oklch(45% 0.16 265)' : 'oklch(58% 0.13 265)',
                    borderTopRightRadius: 4,
                    borderBottomRightRadius: 4,
                  }}
                />
              </div>
              {/* Fixed width (not nowrap) so every row reserves the same trailing space —
                  otherwise the flex:1 bar track above ends up a different length on every row,
                  since its remaining space depends on how long that row's own value text is. */}
              <span style={{ fontSize: 11.5, color: 'oklch(45% 0.01 260)', width: 220, flexShrink: 0 }}>
                {membersTemplate.replace('{n}', String(d.memberCount))} · {orgsTemplate.replace('{n}', String(d.orgCount))}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Ranked horizontal bar chart of organisations by number of tied members — used on the
 * committee page to show which registered lobbyists have the most members on a given
 * committee. Each row links to that organisation's detail page. */
function OrgInfluenceBarChart({
  data,
  orgHref,
  onSelectOrg,
  membersTemplate,
  filenameBase,
  exportLabels,
}: {
  data: { org: LobbyOrg; memberCount: number }[];
  orgHref: (id: string) => string;
  onSelectOrg: (id: string) => void;
  membersTemplate: string;
  filenameBase: string;
  exportLabels: ChartExportLabels;
}) {
  if (data.length === 0) return null;
  const max = data[0].memberCount;
  const ROW_H = 30;
  const BAR_H = 18;
  const LABEL_W = 220;
  const PLOT_W = 340;
  const VALUE_W = 110;
  const PAD = 10;
  const getCsv = () => ({
    headers: ['Organization', 'Tied members'],
    rows: data.map((d) => [d.org.name, d.memberCount]),
  });
  const getSvg = (): ChartSvgExport => {
    const width = PAD * 2 + LABEL_W + PLOT_W + VALUE_W;
    const height = PAD * 2 + data.length * ROW_H;
    const body = data
      .map((d, i) => {
        const y = PAD + i * ROW_H;
        const pct = Math.max(1, (d.memberCount / max) * 100);
        const barW = (pct / 100) * PLOT_W;
        return `<circle cx="${PAD + 5}" cy="${y + BAR_H / 2}" r="4.5" fill="#5c86d6"/>
          <text x="${PAD + 16}" y="${y + BAR_H / 2}" dominant-baseline="middle" font-size="12.5" font-weight="600" fill="#1a1d23">${escapeXml(d.org.name)}</text>
          <rect x="${PAD + LABEL_W}" y="${y}" width="${PLOT_W}" height="${BAR_H}" rx="4" fill="#eef0f2"/>
          <rect x="${PAD + LABEL_W}" y="${y}" width="${barW}" height="${BAR_H}" rx="4" fill="#5c86d6"/>
          <text x="${PAD + LABEL_W + PLOT_W + 10}" y="${y + BAR_H / 2}" dominant-baseline="middle" font-size="11.5" fill="#6b7280">${escapeXml(membersTemplate.replace('{n}', String(d.memberCount)))}</text>`;
      })
      .join('');
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'IBM Plex Sans', sans-serif">${body}</svg>`;
    return { svgString, width, height };
  };
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 44 }}>
      <ChartExportMenu filenameBase={filenameBase} getCsv={getCsv} getSvg={getSvg} labels={exportLabels} />
      {data.map((d) => {
        const pct = Math.max(1, (d.memberCount / max) * 100);
        return (
          <a
            key={d.org.id}
            href={orgHref(d.org.id)}
            onClick={stop(() => onSelectOrg(d.org.id))}
            className="org-bar-row"
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <div className="org-bar-label" style={{ width: 200, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'oklch(58% 0.13 265)', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.org.name}>
                {d.org.name}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0, background: 'oklch(95% 0.006 260)', borderRadius: 4 }}>
              <div
                style={{
                  height: 18,
                  width: `${pct}%`,
                  minWidth: 3,
                  background: 'oklch(58% 0.13 265)',
                  borderTopRightRadius: 4,
                  borderBottomRightRadius: 4,
                }}
              />
            </div>
            <span className="org-bar-value" style={{ fontSize: 11.5, color: 'oklch(45% 0.01 260)', whiteSpace: 'nowrap', flexShrink: 0, width: 100 }}>
              {membersTemplate.replace('{n}', String(d.memberCount))}
            </span>
          </a>
        );
      })}
    </div>
  );
}

/**
 * Homepage entry point for "does this affect me": search by city/constituency (or an MP's
 * name) instead of browsing 630 anonymous rows. A place can match more than one MP — the
 * directly-elected member plus regional list-seat members from other parties — so this always
 * shows every match rather than assuming a 1:1 place-to-MP relationship.
 */
function FindMyMpBox({
  members,
  onSelect,
  mpHref,
  searchHref,
  placeholder,
  noResultsTemplate,
  browseAllLabel,
  onBrowseAll,
}: {
  members: RealMp[];
  onSelect: (id: string) => void;
  mpHref: (id: string) => string;
  searchHref: string;
  placeholder: string;
  noResultsTemplate: string;
  browseAllLabel: string;
  onBrowseAll: () => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const q = query.trim();
  const matches =
    q.length < 2 ? [] : members.filter((m) => fuzzyIncludes(m.constituency, q) || fuzzyIncludes(m.name, q)).slice(0, 8);

  const select = (id: number) => {
    onSelect(String(id));
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', maxWidth: 460, margin: '0 auto' }}>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '14px 18px',
          borderRadius: 12,
          border: '1px solid oklch(85% 0.006 260)',
          fontSize: 15,
          boxShadow: '0 2px 10px oklch(20% 0.02 260 / 0.06)',
        }}
      />
      {open && q.length >= 2 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
            background: 'white',
            border: '1px solid oklch(88% 0.006 260)',
            borderRadius: 12,
            boxShadow: '0 8px 24px oklch(0% 0 0 / 0.12)',
            zIndex: 40,
            overflow: 'hidden',
            textAlign: 'left',
          }}
        >
          {matches.length === 0 ? (
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', marginBottom: 8 }}>
                {noResultsTemplate.replace('{query}', query.trim())}
              </div>
              <a
                href={searchHref}
                onClick={stop(onBrowseAll)}
                style={{ fontSize: 12.5, fontWeight: 700 }}
              >
                {browseAllLabel} →
              </a>
            </div>
          ) : (
            matches.map((m) => (
              <a
                key={m.id}
                href={mpHref(String(m.id))}
                onClick={stop(() => select(m.id))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.party} · {m.constituency}
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Header search: a mixed typeahead across the three entity types that have their own detail
 * pages — MPs, bills/votes, and organizations. Picking a result navigates straight there.
 * Enter (or the "see all MPs" link) falls back to the existing MP browse/filter page, which is
 * the one entity type with a dedicated full-list view with its own filters.
 */
function GlobalSearchBox({
  query,
  onQueryChange,
  onSubmit,
  members,
  polls,
  orgs,
  parties,
  onSelectMp,
  onSelectBill,
  onSelectOrg,
  onSelectParty,
  searchHref,
  mpHref,
  billHref,
  orgHref,
  partyHref,
  placeholder,
  groupMpsLabel,
  groupBillsLabel,
  groupOrgsLabel,
  groupPartiesLabel,
  noResultsTemplate,
  seeAllMpsTemplate,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onSubmit: () => void;
  members: RealMp[];
  polls: RealPoll[];
  orgs: OrgListEntry[];
  parties: { name: string; color: string; seats: number }[];
  onSelectMp: (id: number) => void;
  onSelectBill: (id: number) => void;
  onSelectOrg: (id: string) => void;
  onSelectParty: (name: string) => void;
  searchHref: string;
  mpHref: (id: string) => string;
  billHref: (id: number) => string;
  orgHref: (id: string) => string;
  partyHref: (name: string) => string;
  placeholder: string;
  groupMpsLabel: string;
  groupBillsLabel: string;
  groupOrgsLabel: string;
  groupPartiesLabel: string;
  noResultsTemplate: string;
  seeAllMpsTemplate: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const q = query.trim();
  const showDropdown = open && q.length >= 2;
  const mpMatchesAll = showDropdown ? members.filter((m) => fuzzyIncludes(m.name, q) || fuzzyIncludes(m.constituency, q)) : [];
  // Searches every topic the poll carries, not just the displayed primary one — otherwise a
  // search for "Verkehr" finds nothing, because that label only ever appears as a poll's
  // second topic and so never reaches `topic`.
  const billMatches = showDropdown
    ? polls.filter((p) => fuzzyIncludes(p.title, q) || p.topics.some((topic) => fuzzyIncludes(topic, q))).slice(0, 4)
    : [];
  const orgMatches = showDropdown ? orgs.filter((e) => fuzzyIncludes(e.org.name, q)).slice(0, 4) : [];
  const partyMatches = showDropdown ? parties.filter((p) => fuzzyIncludes(p.name, q)).slice(0, 4) : [];
  const mpMatches = mpMatchesAll.slice(0, 4);
  const hasResults = mpMatches.length + billMatches.length + orgMatches.length + partyMatches.length > 0;

  const submit = () => {
    onSubmit();
    setOpen(false);
  };
  const selectMp = (id: number) => {
    onSelectMp(id);
    onQueryChange('');
    setOpen(false);
  };
  const selectBill = (id: number) => {
    onSelectBill(id);
    onQueryChange('');
    setOpen(false);
  };
  const selectOrg = (id: string) => {
    onSelectOrg(id);
    onQueryChange('');
    setOpen(false);
  };
  const selectParty = (name: string) => {
    onSelectParty(name);
    onQueryChange('');
    setOpen(false);
  };

  const groupHeaderStyle: CSSProperties = {
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'oklch(55% 0.01 260)',
    padding: '10px 16px 4px',
  };
  const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', cursor: 'pointer' };
  const titleStyle: CSSProperties = { fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const subStyle: CSSProperties = { fontSize: 12, color: 'oklch(48% 0.01 260)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
      <input
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder={placeholder}
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
      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
            background: 'white',
            border: '1px solid oklch(88% 0.006 260)',
            borderRadius: 12,
            boxShadow: '0 8px 24px oklch(0% 0 0 / 0.12)',
            zIndex: 40,
            overflow: 'hidden',
            textAlign: 'left',
            maxHeight: 420,
            overflowY: 'auto',
          }}
        >
          {!hasResults ? (
            <div style={{ padding: '14px 16px', fontSize: 13, color: 'oklch(45% 0.01 260)' }}>
              {noResultsTemplate.replace('{query}', query.trim())}
            </div>
          ) : (
            <>
              {mpMatches.length > 0 && (
                <>
                  <div style={groupHeaderStyle}>{groupMpsLabel}</div>
                  {mpMatches.map((m) => (
                    <a key={m.id} href={mpHref(String(m.id))} onClick={stop(() => selectMp(m.id))} style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={titleStyle}>{m.name}</div>
                        <div style={subStyle}>
                          {m.party} · {m.constituency}
                        </div>
                      </div>
                    </a>
                  ))}
                </>
              )}
              {billMatches.length > 0 && (
                <>
                  <div style={groupHeaderStyle}>{groupBillsLabel}</div>
                  {billMatches.map((p) => (
                    <a key={p.id} href={billHref(p.id)} onClick={stop(() => selectBill(p.id))} style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={titleStyle}>{p.title}</div>
                        <div style={subStyle}>
                          {p.topic} · {p.date}
                        </div>
                      </div>
                    </a>
                  ))}
                </>
              )}
              {orgMatches.length > 0 && (
                <>
                  <div style={groupHeaderStyle}>{groupOrgsLabel}</div>
                  {orgMatches.map((e) => (
                    <a key={e.org.id} href={orgHref(e.org.id)} onClick={stop(() => selectOrg(e.org.id))} style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={titleStyle}>{e.org.name}</div>
                        {e.org.city && <div style={subStyle}>{e.org.city}</div>}
                      </div>
                    </a>
                  ))}
                </>
              )}
              {partyMatches.length > 0 && (
                <>
                  <div style={groupHeaderStyle}>{groupPartiesLabel}</div>
                  {partyMatches.map((p) => (
                    <a key={p.name} href={partyHref(p.name)} onClick={stop(() => selectParty(p.name))} style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={titleStyle}>{p.name}</div>
                      </div>
                    </a>
                  ))}
                </>
              )}
              {mpMatchesAll.length > 0 && (
                <a
                  href={searchHref}
                  onClick={stop(submit)}
                  style={{
                    display: 'block',
                    padding: '10px 16px',
                    fontSize: 12.5,
                    fontWeight: 700,
                    borderTop: '1px solid oklch(93% 0.006 260)',
                  }}
                >
                  {seeAllMpsTemplate.replace('{query}', query.trim())} →
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  // The single source of truth for "which page": read once from the URL on first render, then
  // kept in sync with it by the history effects further down. Everything else in this file
  // (filters, sort, search text, expanded tables) deliberately stays out of the URL — see router.ts.
  const [initialRoute] = useState(() => pathToRoute(stripBase(window.location.pathname, import.meta.env.BASE_URL)));
  const [view, setView] = useState<View>(initialRoute.view);
  const [lang, setLang] = useState<Lang>('de');
  const [selectedMpId, setSelectedMpId] = useState<string | null>(extractMpId(initialRoute.mpId));
  const [selectedBillId, setSelectedBillId] = useState<BillId | null>(parseBillId(extractLeadingId(initialRoute.billId)));
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(extractLeadingId(initialRoute.orgId));
  const [selectedParty, setSelectedParty] = useState<string | null>(initialRoute.party);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string | null>(extractLeadingId(initialRoute.committeeId));
  const [orgSearchQuery, setOrgSearchQuery] = useState('');
  const [sectorMetric, setSectorMetric] = useState<SectorMetric>('members');
  const [spendScope, setSpendScope] = useState<'all' | 'linked'>('all');
  const [orgScope, setOrgScope] = useState<'all' | 'linked'>('all');
  const [profileTab, setProfileTab] = useState<ProfileTab>(initialRoute.profileTab);
  const [lobbyTab, setLobbyTab] = useState<LobbyTab>(initialRoute.lobbyTab);
  // Second-level tabs within a single Lobby & Finanzen sub-page — local only, not URL-routed (see SubTabBar).
  const [lobbyTiesSubTab, setLobbyTiesSubTab] = useState<'network' | 'byParty' | 'direct' | 'topical'>('network');
  const [lobbyOrgsSubTab, setLobbyOrgsSubTab] = useState<'distribution' | 'fields' | 'list'>('distribution');
  const [lobbyDonationsSubTab, setLobbyDonationsSubTab] = useState<'totals' | 'timeline' | 'topDonors' | 'all'>('totals');
  const [partyTab, setPartyTab] = useState<PartyTab>(initialRoute.partyTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [partyFilter, setPartyFilter] = useState<Record<string, boolean>>({});
  const [rosterSort, setRosterSort] = useState<'default' | 'income' | 'ties' | 'loyalty' | 'divergences'>('default');
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [hoveredAlignmentPoint, setHoveredAlignmentPoint] = useState<number | null>(null);
  const alignmentSvgRef = useRef<SVGSVGElement>(null);
  const [tieMatrixFilter, setTieMatrixFilter] = useState<MatrixCell | null>(null);
  // A count rather than an expanded/collapsed flag: the list runs to ~6,000 rows now, and
  // rendering all of them at once locks the page up for seconds while burying the collapse
  // control kilometres down the page.
  const ORGS_PAGE_SIZE = 100;
  const ORGS_INITIAL_COUNT = 25;
  const [orgsVisibleCount, setOrgsVisibleCount] = useState(ORGS_INITIAL_COUNT);
  const [conflictsExpanded, setConflictsExpanded] = useState(false);
  const [topicalExpanded, setTopicalExpanded] = useState(false);
  const [donationsExpanded, setDonationsExpanded] = useState(false);
  const [orgDescExpanded, setOrgDescExpanded] = useState(false);
  const [orgMembersShown, setOrgMembersShown] = useState(5);
  const [pollSummaryExpanded, setPollSummaryExpanded] = useState(false);
  const [flaggedVotesSearch, setFlaggedVotesSearch] = useState('');
  const [pollLobbyingSearch, setPollLobbyingSearch] = useState('');
  const [committeeMemberSearch, setCommitteeMemberSearch] = useState('');
  const [committeeListSearch, setCommitteeListSearch] = useState('');
  const [committeeMembersExpanded, setCommitteeMembersExpanded] = useState(false);
  const [votesExpanded, setVotesExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  // Chips on the long-run card double as filters over its detail list — with 40+ divergences
  // across five terms, scanning for "the energy ones" by eye is not realistic.
  const [historyKindFilter, setHistoryKindFilter] = useState<DivergenceKind | null>(null);
  const [historyTopicFilter, setHistoryTopicFilter] = useState<string | null>(null);
  const [flaggedVotesExpanded, setFlaggedVotesExpanded] = useState(false);
  const [pollLobbyingExpanded, setPollLobbyingExpanded] = useState(false);
  // Multi-key, like the donations table: click order is priority order, so "Akteurstyp" then
  // "Gemeldete Lobbyausgaben" groups by type and orders by spend inside each group.
  const [orgsSort, setOrgsSort] = useState<MultiSortState>([]);
  const [conflictsSort, setConflictsSort] = useState<SortState>(null);
  const [topicalSort, setTopicalSort] = useState<SortState>(null);
  const [donationsSort, setDonationsSort] = useState<MultiSortState>([]);
  const [donationsPartyFilter, setDonationsPartyFilter] = useState<Set<string>>(new Set());
  const [donationsDonorQuery, setDonationsDonorQuery] = useState('');
  const [donationsOnlyLobbyists, setDonationsOnlyLobbyists] = useState(false);
  const [partyOrgsSort, setPartyOrgsSort] = useState<SortState>(null);
  const [partyDonationsSort, setPartyDonationsSort] = useState<MultiSortState>([]);
  const [partyDonationsDonorQuery, setPartyDonationsDonorQuery] = useState('');
  const [partyDonationsExpanded, setPartyDonationsExpanded] = useState(false);
  const [partyVotesExpanded, setPartyVotesExpanded] = useState(false);
  // The card itself is always shown on the Abstimmungen tab; this only controls whether the
  // vote list runs past the first six, which is the length that reads as a summary rather than
  // a data dump.
  const [partyDissentExpanded, setPartyDissentExpanded] = useState(false);
  /** Which divided-vote rows are open. A set, so several can be compared side by side. */
  const [openDividedVotes, setOpenDividedVotes] = useState<Set<string>>(new Set());
  /** Divided votes whose deviator list is shown in full rather than capped at 20 names. */
  const [fullDeviatorLists, setFullDeviatorLists] = useState<Set<string>>(new Set());
  const [partyTopicalExpanded, setPartyTopicalExpanded] = useState(false);
  const [partyTopicalSearchQuery, setPartyTopicalSearchQuery] = useState('');
  const [partyTopicalFieldFilter, setPartyTopicalFieldFilter] = useState<Set<string>>(new Set());
  // Where the party detail page's back link should point — set by whichever entry point opened it.
  // Ephemeral UI state, deliberately left out of the URL (see router.ts's comment on that policy).
  const [partyOrigin, setPartyOrigin] = useState<'partyList' | 'crossref'>('partyList');
  const [orgPartyFilter, setOrgPartyFilter] = useState<Set<string>>(new Set());
  const [orgActorTypeFilter, setOrgActorTypeFilter] = useState<Set<string>>(new Set());
  const [orgFieldFilter, setOrgFieldFilter] = useState<Set<string>>(new Set());
  const [topicalSearchQuery, setTopicalSearchQuery] = useState('');
  const [topicalPartyFilter, setTopicalPartyFilter] = useState<Set<string>>(new Set());
  const [topicalFieldFilter, setTopicalFieldFilter] = useState<Set<string>>(new Set());
  // Touch devices have no real hover, but tapping a link still fires a synthetic mouseenter
  // right before the click — so the hover-to-open behavior below must be skipped on touch,
  // otherwise the dropdown opens and the same tap's click immediately navigates and closes it.
  const [isTouchNav] = useState(() => typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
  const [lobbyNavOpen, setLobbyNavOpen] = useState(false);
  const lobbyNavRef = useRef<HTMLDivElement>(null);
  const lobbyNavCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openLobbyNav = () => {
    if (lobbyNavCloseTimer.current) {
      clearTimeout(lobbyNavCloseTimer.current);
      lobbyNavCloseTimer.current = null;
    }
    setLobbyNavOpen(true);
  };
  const scheduleCloseLobbyNav = () => {
    lobbyNavCloseTimer.current = setTimeout(() => setLobbyNavOpen(false), 250);
  };
  const [mpsNavOpen, setMpsNavOpen] = useState(false);
  const mpsNavRef = useRef<HTMLDivElement>(null);
  const mpsNavCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openMpsNav = () => {
    if (mpsNavCloseTimer.current) {
      clearTimeout(mpsNavCloseTimer.current);
      mpsNavCloseTimer.current = null;
    }
    setMpsNavOpen(true);
  };
  const scheduleCloseMpsNav = () => {
    mpsNavCloseTimer.current = setTimeout(() => setMpsNavOpen(false), 250);
  };
  // On touch, the first tap on a trigger only reveals its dropdown; a second tap (or a tap on
  // an actual submenu item) is what navigates. Tapping anywhere else closes it.
  const touchNavTriggerClick = (open: boolean, setOpen: (v: boolean) => void, navigate: () => void) => (e: MouseEvent) => {
    if (isTouchNav && !open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
      return;
    }
    stop(() => {
      navigate();
      setOpen(false);
    })(e);
  };
  useEffect(() => {
    if (!isTouchNav || (!mpsNavOpen && !lobbyNavOpen)) return;
    const onOutside = (e: globalThis.MouseEvent) => {
      if (mpsNavOpen && mpsNavRef.current && !mpsNavRef.current.contains(e.target as Node)) setMpsNavOpen(false);
      if (lobbyNavOpen && lobbyNavRef.current && !lobbyNavRef.current.contains(e.target as Node)) setLobbyNavOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [isTouchNav, mpsNavOpen, lobbyNavOpen]);

  // Declared here (ahead of where they're conceptually used, further down) because the URL-sync
  // effect just below needs them to upgrade bare-ID profile/bill/org/committee URLs into full
  // name slugs once the underlying data finishes loading.
  const roster = useBundestagRoster();
  const { snapshot } = useSnapshot();
  const pollsState = useAllPolls();

  // Browser back/forward: re-derive route state from the URL rather than replaying setView
  // calls. isPopStateRef suppresses the push effect below for this one render, so going back
  // doesn't immediately push the page we just navigated away from back onto the stack.
  const isPopStateRef = useRef(false);
  // Counts real in-app navigations (pushState calls) since this tab loaded. "← Back" links use
  // this to decide whether window.history.back() has anywhere real to go: if the user arrived
  // here via an in-app link, going back returns to the actual page they came from (an MP profile,
  // a search, wherever) instead of always landing on a fixed parent page. If this page was the
  // entry point (a direct link, a refresh), there's no in-app history to unwind, so the caller
  // falls back to its normal destination instead of leaving the site via browser history.
  const appNavCountRef = useRef(0);
  // Identifies "which page" independent of slug resolution — see its use below, where it stops
  // the URL's bare-ID-to-slug upgrade from being miscounted as a real navigation.
  const pageKeyRef = useRef<string | null>(null);
  // Same idea, for the GoatCounter pageview count in the document-head effect further down —
  // separate ref since it's set on every page (including the very first), while pageKeyRef above
  // is only ever touched by real pushState navigations.
  const lastCountedPageKeyRef = useRef<string | null>(null);
  // Remembers where the MP list was scrolled to when a profile is opened from it, so returning
  // to the list (back button or the "← zurück" link) can restore that position instead of always
  // snapping to the top — restoring via the browser's native scroll restoration doesn't work here
  // since the list's <main> is unmounted/remounted on view change, and native restore fires before
  // React finishes re-rendering it back to full height. prevViewRef guards against reusing a stale
  // saved position if the user reaches 'search' some other way after leaving the profile.
  const searchScrollYRef = useRef<number | null>(null);
  const prevViewRef = useRef<View>(initialRoute.view);
  // The browser's own scroll restoration would otherwise fight the scroll handling below: it
  // snapshots each history entry's scroll position independently and can reapply it after our
  // effect runs, silently overwriting whatever we just set (including the MP-list restore).
  // Owning this fully ourselves avoids that race.
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);
  useEffect(() => {
    const onPopState = () => {
      isPopStateRef.current = true;
      const r = pathToRoute(stripBase(window.location.pathname, import.meta.env.BASE_URL));
      setView(r.view);
      setSelectedMpId(extractMpId(r.mpId));
      setSelectedBillId(parseBillId(extractLeadingId(r.billId)));
      setSelectedOrgId(extractLeadingId(r.orgId));
      setSelectedParty(r.party);
      setSelectedCommitteeId(extractLeadingId(r.committeeId));
      setProfileTab(r.profileTab);
      setLobbyTab(r.lobbyTab);
      setPartyTab(r.partyTab);
      setPartyOrigin('partyList');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Keeps the address bar in sync whenever "which page" state changes — filters/sort/search
  // text are intentionally excluded from the dependency array, so refining a list in place
  // never pushes a history entry.
  useEffect(() => {
    const prevView = prevViewRef.current;
    prevViewRef.current = view;
    // The raw, pre-slug-resolution identity of "which page" — deliberately built from the
    // selected ids/tabs rather than the routeToPath() output below, since that output changes
    // (bare id -> full slug) once `snapshot` loads even though the page itself hasn't changed.
    const prevPageKey = pageKeyRef.current;
    const pageKey = [view, selectedMpId, profileTab, selectedBillId, selectedOrgId, selectedParty, partyTab, lobbyTab, selectedCommitteeId].join('|');
    pageKeyRef.current = pageKey;
    const returningToListFromProfile = view === 'search' && prevView === 'profile' && searchScrollYRef.current !== null;
    // A client-side pushState never triggers the browser's own scroll reset the way a real page
    // load does, so without this, opening any new page just inherits whatever scroll position
    // was left over from the one before it — this applies on popstate too (back/forward), rather
    // than leaning on the browser's native scroll restoration: that races the view's
    // unmount/remount on every navigation here and reliably loses, landing near the top anyway.
    // The one deliberate exception is the MP list, which restores its own remembered position
    // (see searchScrollYRef, set in openMp) instead of resetting to the top.
    if (returningToListFromProfile) {
      window.scrollTo(0, searchScrollYRef.current!);
      searchScrollYRef.current = null;
    } else {
      // Left the profile some other way (not back to the list it was opened from) — the
      // remembered position no longer applies to wherever "search" is reached from next.
      if (view !== prevView && prevView === 'profile' && view !== 'search') searchScrollYRef.current = null;
      window.scrollTo(0, 0);
    }
    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }
    const path = routeToPath({
      view,
      mpId: selectedMpId ? buildMpUrlParam(selectedMpId, roster.members) : null,
      profileTab,
      billId: selectedBillId !== null ? buildBillUrlParam(selectedBillId, pollsState.polls) : null,
      orgId: selectedOrgId ? buildSlugParam(selectedOrgId, snapshot?.lobbyLinks.orgs[selectedOrgId]?.name) : null,
      party: selectedParty,
      partyTab,
      lobbyTab,
      committeeId: selectedCommitteeId
        ? buildSlugParam(selectedCommitteeId, snapshot?.committees.find((c) => String(c.id) === selectedCommitteeId)?.name)
        : null,
    });
    const fullPath = withBase(path, import.meta.env.BASE_URL);
    if (window.location.pathname !== fullPath) {
      window.history.pushState(null, '', fullPath);
      // Only counts as a real navigation if the underlying page identity actually changed —
      // a bare-ID URL upgrading to its full slug once `snapshot` finishes loading pushes a new
      // path too, but it's still the same page, and must not make goBack() think there's
      // somewhere real to unwind back to.
      if (prevPageKey !== null && prevPageKey !== pageKey) appNavCountRef.current += 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    view,
    selectedMpId,
    profileTab,
    selectedBillId,
    selectedOrgId,
    selectedParty,
    partyTab,
    lobbyTab,
    selectedCommitteeId,
    roster.members,
    pollsState.polls,
    snapshot,
  ]);
  const weekly = useWeeklyResults(pollsState.polls);
  // Shared across the whole app: the search list computes every visible member's alignment
  // from this same fetch (no per-row network calls), and the profile page reuses it too.
  const recentPolls = useRecentPollResults(pollsState.polls);
  const allPollResults = useAllPollResults(pollsState.polls);
  const mandateToMember = new Map(roster.members.map((m) => [m.mandateId, m]));

  const t = TRANSLATIONS[lang];
  const exportLabels: ChartExportLabels = { buttonLabel: t.chartExportLabel, csv: t.chartExportCsv, svg: t.chartExportSvg, png: t.chartExportPng };

  /** "← Back" links call this instead of jumping straight to a fixed parent page — see appNavCountRef. */
  const goBack = (fallback: () => void) => {
    if (appNavCountRef.current > 0) window.history.back();
    else fallback();
  };
  const goHome = () => setView('home');
  const goSearch = () => setView('search');
  const goCrossref = (tab: LobbyTab = 'overview') => {
    setView('crossref');
    setLobbyTab(tab);
  };
  const goPartyList = () => setView('partyList');
  const goCommitteeList = () => {
    setView('committeeList');
    setCommitteeListSearch('');
  };
  const goPollList = () => setView('pollList');
  const openCommittee = (id: string) => {
    setView('committee');
    setSelectedCommitteeId(id);
    setCommitteeMemberSearch('');
    setCommitteeMembersExpanded(false);
  };
  const goImpressum = () => setView('impressum');
  const goDisclaimer = () => setView('disclaimer');
  const goDatenschutz = () => setView('datenschutz');
  const goDaten = () => setView('daten');
  const openMp = (id: string) => {
    if (view === 'search') searchScrollYRef.current = window.scrollY;
    setView('profile');
    setSelectedMpId(id);
    setProfileTab('overview');
    setVotesExpanded(false);
    // A filter set on one member's record would otherwise silently carry over to the next one,
    // hiding most of their divergences for a reason the reader never chose.
    setHistoryExpanded(false);
    setHistoryKindFilter(null);
    setHistoryTopicFilter(null);
  };
  const openBill = (id: BillId) => {
    setView('bill');
    setSelectedBillId(id);
    setFlaggedVotesExpanded(false);
    setPollLobbyingExpanded(false);
    setPollSummaryExpanded(false);
    setFlaggedVotesSearch('');
    setPollLobbyingSearch('');
  };
  const openOrg = (id: string) => {
    setView('org');
    setSelectedOrgId(id);
    setOrgDescExpanded(false);
    setOrgMembersShown(5);
  };
  const openParty = (party: string, origin: 'partyList' | 'crossref' = 'partyList') => {
    setView('party');
    setSelectedParty(party);
    setPartyTab('overview');
    setPartyDissentExpanded(false);
    setOpenDividedVotes(new Set());
    setFullDeviatorLists(new Set());
    setPartyDonationsExpanded(false);
    setPartyVotesExpanded(false);
    setPartyTopicalExpanded(false);
    setPartyOrigin(origin);
  };
  // Real hrefs for every client-side-routed target, computed the same way the address-bar sync
  // effect above does. Paired with the openX()/goX() state setters via stop(): the href lets
  // ctrl/cmd/middle-click and long-press-to-open-in-new-tab work like a normal link, while a plain
  // left-click is intercepted by stop() and handled with the existing SPA state transition instead
  // of a real page load.
  const BASE_URL = import.meta.env.BASE_URL;
  const homeHref = withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'home' }), BASE_URL);
  const searchHref = withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'search' }), BASE_URL);
  const partyListHref = withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'partyList' }), BASE_URL);
  const committeeListHref = withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'committeeList' }), BASE_URL);
  const pollListHref = withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'pollList' }), BASE_URL);
  const impressumHref = withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'impressum' }), BASE_URL);
  const disclaimerHref = withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'disclaimer' }), BASE_URL);
  const datenschutzHref = withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'datenschutz' }), BASE_URL);
  const datenHref = withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'daten' }), BASE_URL);
  const crossrefHref = (tab: LobbyTab = 'overview') => withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'crossref', lobbyTab: tab }), BASE_URL);
  const mpHref = (id: string) => withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'profile', mpId: buildMpUrlParam(id, roster.members) }), BASE_URL);
  const billHref = (id: BillId) => withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'bill', billId: buildBillUrlParam(id, pollsState.polls) }), BASE_URL);
  const orgHref = (id: string) => withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'org', orgId: buildSlugParam(id, snapshot?.lobbyLinks.orgs[id]?.name) }), BASE_URL);
  const partyHref = (party: string, tab: PartyTab = 'overview') => withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'party', party, partyTab: tab }), BASE_URL);
  const committeeHref = (id: string) =>
    withBase(routeToPath({ ...DEFAULT_ROUTE, view: 'committee', committeeId: buildSlugParam(id, snapshot?.committees.find((c) => String(c.id) === id)?.name) }), BASE_URL);
  // Party → roster crosslink: narrows the search/browse view down to this party's own MPs
  // instead of adding a separate "members" page, since the roster view already has everything
  // (avatar, constituency, alignment) that a party-members list would otherwise duplicate.
  const viewPartyMembers = (party: string) => {
    setPartyFilter(Object.fromEntries(roster.parties.map((p) => [p.name, p.name === party])));
    setView('search');
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

  const q = searchQuery.trim();
  const incomeScoreByMandate = snapshot ? buildMemberIncomeScores(snapshot.sidejobsByMandate) : new Map<number, number>();
  const tieCountByMandate = snapshot ? buildMemberTieCounts(snapshot.lobbyLinks) : new Map<number, number>();
  // Keyed by politician id (stable across terms), unlike the two maps above which key on the
  // per-term mandate id.
  const historyByPolitician = snapshot?.historyByPolitician ?? new Map<number, MemberHistorySummary>();
  const filteredMps = roster.members
    .filter((m) => {
      if (partyFilter[m.party] === false) return false;
      if (q && !fuzzyIncludes(m.name, q) && !fuzzyIncludes(m.constituency, q)) return false;
      return true;
    })
    .sort((a, b) => {
      if (rosterSort === 'income') return (incomeScoreByMandate.get(b.mandateId) ?? 0) - (incomeScoreByMandate.get(a.mandateId) ?? 0);
      if (rosterSort === 'ties') return (tieCountByMandate.get(b.mandateId) ?? 0) - (tieCountByMandate.get(a.mandateId) ?? 0);
      if (rosterSort === 'loyalty') {
        // Sorts on the LONG-RUN figure only. The ten-vote number this list used to show is 100%
        // for 602 of 630 members, so ranking by it would order the roster essentially at random.
        //
        // Members with no earlier term are sorted last rather than treated as 0% (which would
        // top a "least loyal" list) or 100% (which would claim a loyalty nobody measured). Their
        // absence is missing data, and missing data must not become a position in a ranking.
        const pa = historyByPolitician.get(a.id)?.alignmentPct;
        const pb = historyByPolitician.get(b.id)?.alignmentPct;
        if (pa === undefined && pb === undefined) return 0;
        if (pa === undefined) return 1;
        if (pb === undefined) return -1;
        return pa - pb;
      }
      if (rosterSort === 'divergences') {
        // The raw count answers a different question from the rate: "how many times" rather than
        // "how often". It favours long service, which is why both are offered rather than one.
        return (historyByPolitician.get(b.id)?.divergenceCount ?? -1) - (historyByPolitician.get(a.id)?.divergenceCount ?? -1);
      }
      return 0;
    });
  const alignmentByMandate = computeAllAlignments(recentPolls.results);

  // Real data for the current sitting week: recent-votes feed, "against expectation" cards,
  // and the featured-vote widget. Each divergence is a plain statistical fact (this member's
  // vote differed from their own fraction's majority on this specific poll) — never a claim
  // about motive, sourced live from abgeordnetenwatch.de's roll-call vote records.
  const weekLabel = weekly.weekRange ? formatWeekRange(weekly.weekRange, lang) : '';
  /**
   * "2005–2025". Deliberately a closed range: the archive holds only COMPLETED terms, so the
   * current term's votes are not in any long-run figure. An open-ended "seit 2005" read as
   * "through today" and put a member's long-run loyalty directly above a list of current-term
   * votes it does not count.
   */
  const historyCoverageLabel = snapshot?.historyCoverage
    ? `${snapshot.historyCoverage.fromDate.slice(0, 4)}–${snapshot.historyCoverage.toDate.slice(0, 4)}`
    : '';
  /** One decimal place, in the reader's locale — German writes 86,8 where English writes 86.8. */
  const formatPct = (value: number) =>
    value.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // All polls grouped by sitting week (Sitzungswoche), most recent week first, for the full poll list view.
  const pollWeekGroups = (() => {
    const byWeek = new Map<string, { range: { start: Date; end: Date }; results: PollResult[] }>();
    for (const r of allPollResults.results) {
      const range = isoWeekRange(r.poll.date);
      const key = range.start.toISOString();
      if (!byWeek.has(key)) byWeek.set(key, { range, results: [] });
      byWeek.get(key)!.results.push(r);
    }
    return Array.from(byWeek.values()).sort((a, b) => b.range.start.getTime() - a.range.start.getTime());
  })();
  const weeklyFeedItems = weekly.results.map((r) => {
    const divergence = weekly.divergences.find((d) => d.poll.id === r.poll.id);
    return {
      result: r,
      flag: !!divergence,
      flagText: divergence
        ? `${divergence.member.name}: ${divergenceLabel(divergence.member.vote, t.realAgainstPartyTemplate, t.abstainedPartyTemplate).replace('{party}', divergence.member.party)}`
        : '',
    };
  });
  const realAgainstExpectation = weekly.divergences.slice(0, 4).map((d) => {
    const rm = mandateToMember.get(d.member.mandateId);
    const label = d.member.vote === 'yes' ? t.voteYes : d.member.vote === 'no' ? t.voteNo : t.voteAbstain;
    // The long-run context that turns "broke ranks once" into "and here is how often they do".
    // Keyed by politician id — these cards are selected by CURRENT-term behaviour, so adding
    // history to them ranks nothing; a standalone "biggest dissenters" list would instead be
    // sorted by length of service, since only 63% of sitting members have an earlier term.
    const history = rm ? (snapshot?.historyByPolitician.get(rm.id) ?? null) : null;
    return {
      history,
      mpName: d.member.name,
      billTitle: d.poll.title,
      color: REAL_PARTY_COLORS[d.member.party] || FALLBACK_PARTY_COLOR,
      reason: divergenceLabel(d.member.vote, t.realAgainstPartyTemplate, t.abstainedPartyTemplate).replace('{party}', d.member.party),
      voteLabel: label,
      bg: voteBg[d.member.vote],
      href: rm ? mpHref(String(rm.id)) : undefined,
      onOpen: rm ? () => openMp(String(rm.id)) : undefined,
    };
  });
  const featuredResult: PollResult | null = weekly.results[0] ?? null;

  // A profile is either one of the 8 illustrative demo MPs (full sample analysis content)
  // or a real, live-fetched Bundestag member (factual name/party/constituency only — no
  // fabricated votes/lobby/donations are ever attached to a real person).
  const realMatch = roster.members.find((m) => String(m.id) === selectedMpId);
  const mandateVotes = useMandateVotes(realMatch ? realMatch.mandateId : null);
  // Grouped into sitting weeks like the parliament-wide vote list, so a member's record reads with
  // the same rhythm as the page it mirrors — and so a run of votes on one day is visibly one day's
  // work rather than five unrelated rows. Sliced BEFORE grouping, so "show 10" still means ten
  // votes rather than ten weeks.
  const visibleMandateVotes = mandateVotes.votes.slice(0, votesExpanded ? mandateVotes.votes.length : 10);
  const mandateVoteWeeks = (() => {
    const byWeek = new Map<string, { range: { start: Date; end: Date }; votes: typeof visibleMandateVotes }>();
    for (const v of visibleMandateVotes) {
      const range = isoWeekRange(v.poll.date);
      const key = range.start.toISOString();
      if (!byWeek.has(key)) byWeek.set(key, { range, votes: [] });
      byWeek.get(key)!.votes.push(v);
    }
    return [...byWeek.values()].sort((a, b) => b.range.start.getTime() - a.range.start.getTime());
  })();
  const partyVotes = usePartyVotes(selectedParty);
  const partyDissent = usePartyVoteHistory(selectedParty);
  // Same sitting-week grouping as the parliament-wide and per-member vote lists. Sliced before
  // grouping so "show 10" stays ten votes rather than ten weeks.
  const visiblePartyVotes = partyVotes.votes.slice(0, partyVotesExpanded ? partyVotes.votes.length : 10);
  const partyVoteWeeks = (() => {
    const byWeek = new Map<string, { range: { start: Date; end: Date }; votes: typeof visiblePartyVotes }>();
    for (const v of visiblePartyVotes) {
      const range = isoWeekRange(v.poll.date);
      const key = range.start.toISOString();
      if (!byWeek.has(key)) byWeek.set(key, { range, votes: [] });
      byWeek.get(key)!.votes.push(v);
    }
    return [...byWeek.values()].sort((a, b) => b.range.start.getTime() - a.range.start.getTime());
  })();
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
  // Real, cheaply-derivable stats for a real profile's Overview tab. Bills-voted/attendance cover
  // the full term (cheap — already fetched for the Votes tab); party-alignment is derived (no
  // extra network call) from the shared `recentPolls` fetched once for the whole app.
  const realMpBillsVoted = mandateVotes.votes.filter((v) => v.vote !== 'no_show').length;
  const realMpAttendancePct = mandateVotes.votes.length > 0 ? Math.round((realMpBillsVoted / mandateVotes.votes.length) * 100) : null;
  const alignment = computeMemberAlignment(realMatch?.mandateId ?? -1, recentPolls.results);
  const realMpFlaggedVotes = alignment.points.filter((p) => p.aligned === false);
  type Profile =
    | { kind: 'real'; mp: RealMp }
    | { kind: 'loading' }
    | { kind: 'missing' };
  const profile: Profile = realMatch
    ? { kind: 'real', mp: realMatch }
    : selectedMpId && roster.loading
      ? { kind: 'loading' }
      : { kind: 'missing' };

  const memberCommittees = useMemberCommittees(profile.kind === 'real' ? profile.mp.mandateId : null);
  // Keyed by politician id, not mandateId: mandate ids are issued per legislature, so an earlier
  // term knows this person by a different one. Passing null keeps the 1.3 MB archive unfetched
  // for every visitor who never opens a profile.
  const voteHistory = useMemberVoteHistory(profile.kind === 'real' ? profile.mp.id : null);
  const historyFilterActive = historyKindFilter !== null || historyTopicFilter !== null;
  const filteredDivergences = voteHistory.divergences.filter(
    (d) => (!historyKindFilter || d.kind === historyKindFilter) && (!historyTopicFilter || d.topics.includes(historyTopicFilter)),
  );
  // Clicking a chip is a request to see those votes, so it opens the list rather than silently
  // narrowing something still collapsed. Clicking the same chip again clears it.
  const toggleHistoryKind = (kind: DivergenceKind) => {
    setHistoryKindFilter((current) => (current === kind ? null : kind));
    setHistoryExpanded(true);
  };
  const toggleHistoryTopic = (topic: string) => {
    setHistoryTopicFilter((current) => (current === topic ? null : topic));
    setHistoryExpanded(true);
  };
  const clearHistoryFilter = () => {
    setHistoryKindFilter(null);
    setHistoryTopicFilter(null);
  };
  const isFollowing = !!(selectedMpId && following[selectedMpId]);

  const profileTabs: { key: ProfileTab; label: string }[] = [
    { key: 'overview', label: t.tabOverview },
    { key: 'votes', label: t.tabVotes },
    { key: 'lobby', label: t.tabLobby },
    { key: 'finance', label: profile.kind === 'real' ? t.tabSidejobs : t.tabFinance },
  ];

  const realPollId = typeof selectedBillId === 'number' ? selectedBillId : null;
  const pollDetail = usePollResult(realPollId);
  const pollDetailDivergences = pollDetail.result ? computeDivergences(pollDetail.result) : [];
  const filteredFlaggedVotes = pollDetailDivergences.filter((d) => fuzzyMatch(flaggedVotesSearch, `${d.member.name} ${d.member.party}`));

  // Real cross-references: a member voting on a bill that an organisation they are personally
  // tied to registered lobbying on. Sourced from the Lobbyregister + members' own declarations.
  const crossref = useCrossrefRows();
  const topicalTieRows = useTopicalTieRows();
  const orgNetwork = useOrgPartyNetwork();
  const partyDonations = usePartyDonations();
  const pollLobbying = usePollLobbying(realPollId);
  const filteredPollLobbying = pollLobbying.entries.filter((e) => fuzzyMatch(pollLobbyingSearch, e.org.name));
  const partyLobby = usePartyLobbySummary();
  // Only the sitting Bundestag fractions have their own party page (partyLobby.summaries is
  // scoped to those) — independents ("Fraktionslos") and parties that received large donations
  // without holding seats (e.g. FDP, BSW, Volt in some terms) don't. Crosslinks everywhere else
  // in the app check this before rendering a party name as clickable, so they never point at a
  // page that can only ever show "no data for this party".
  const routablePartyNames = new Set(partyLobby.summaries.map((s) => s.party));
  const orgList = useOrgList();
  // The full register is fetched only where it is actually browsed: the organisation list, and an
  // organisation page whose id is not one of the few hundred the snapshot already carries.
  const needsDirectory =
    (view === 'crossref' && lobbyTab === 'orgs' && lobbyOrgsSubTab === 'list') ||
    (view === 'org' && selectedOrgId !== null && !snapshot?.lobbyLinks.orgs[selectedOrgId]);
  const lobbyDirectory = useLobbyDirectory(needsDirectory);
  const orgDetail = useOrgDetail(selectedOrgId, lobbyDirectory.orgs);
  // Only the browsable list widens to the whole register; tie-based views keep their own scope.
  // Memoised because it merges and sorts ~6,000 entries, and this component re-renders on every
  // keystroke in the search box.
  const directoryOrgs = useMemo(() => mergeDirectory(orgList.orgs, lobbyDirectory.orgs), [orgList.orgs, lobbyDirectory.orgs]);
  const committeeList = useCommitteeList();
  const committeeDetail = useCommitteeDetail(selectedCommitteeId);
  const committeeLobby = useCommitteeLobbySummary(selectedCommitteeId);
  const filteredCommitteeMembers = (committeeDetail.detail?.members ?? []).filter((row) =>
    fuzzyMatch(committeeMemberSearch, `${row.member?.name ?? ''} ${row.member?.party ?? ''}`),
  );

  // Sets the browser tab title plus <meta description>/canonical/OG tags for whatever page is on
  // screen, and — since it already knows exactly when the page has changed — also fires a manual
  // GoatCounter pageview count for client-side navigations, which its own count.js never sees
  // (see the comment further down). The title/meta half matters for real users (correct tabs,
  // bookmarks, social-share previews — today every page just says "Politblick"), but the more
  // important reason is scripts/prerender.mjs: it captures the DOM after this effect has run, so
  // every one of the ~1000+ prerendered static files gets its own real title/description instead
  // of the same generic one on all of them.
  useEffect(() => {
    let title = 'Politblick';
    let description = t.metaHomeDescription;
    switch (view) {
      case 'home':
        break;
      case 'search':
        title = `${t.navMpsSearch} – Politblick`;
        description = t.metaSearchDescription;
        break;
      case 'profile':
        if (profile.kind === 'real') {
          title = `${profile.mp.name} – Politblick`;
          description = t.metaMpDescTemplate.replace('{name}', profile.mp.name).replace('{party}', profile.mp.party);
        }
        break;
      case 'bill': {
        // Real polls only — the demo bill fixtures this used to fall back to are gone.
        const billTitle = pollDetail.result?.poll.title ?? null;
        if (billTitle) {
          title = `${billTitle} – Politblick`;
          description = t.metaBillDescTemplate.replace('{title}', billTitle);
        }
        break;
      }
      case 'crossref': {
        const tabTitle =
          lobbyTab === 'ties' ? t.tiesTabTitle
          : lobbyTab === 'orgs' ? t.orgsSectionTitle
          : lobbyTab === 'donations' ? t.donationsTitle
          : t.navLobbyFinance;
        const tabSub =
          lobbyTab === 'ties' ? t.tiesTabSub
          : lobbyTab === 'orgs' ? t.orgsSectionSub
          : lobbyTab === 'donations' ? t.donationsSub
          : t.crossrefSub;
        title = `${tabTitle} – Politblick`;
        description = tabSub;
        break;
      }
      case 'org':
        if (orgDetail.org) {
          title = `${orgDetail.org.name} – Politblick`;
          description = t.metaOrgDescTemplate.replace('{name}', orgDetail.org.name);
        }
        break;
      case 'committeeList':
        title = `${t.committeesTitle} – Politblick`;
        description = t.committeesSub;
        break;
      case 'pollList':
        title = `${t.navPolls} – Politblick`;
        description = t.pollListSub;
        break;
      case 'committee':
        if (committeeDetail.detail) {
          title = `${committeeDetail.detail.committee.name} – Politblick`;
          description = t.metaCommitteeDescTemplate.replace('{name}', committeeDetail.detail.committee.name);
        }
        break;
      case 'partyList':
        title = `${t.navParties} – Politblick`;
        description = t.partyListSub;
        break;
      case 'party':
        if (selectedParty) {
          title = `${selectedParty} – Politblick`;
          description = t.metaPartyDescTemplate.replace('{party}', selectedParty);
        }
        break;
      case 'impressum':
        title = `${t.impressumTitle} – Politblick`;
        description = t.metaImpressumDescription;
        break;
      case 'disclaimer':
        title = `${t.disclaimerTitle} – Politblick`;
        description = t.metaDisclaimerDescription;
        break;
      case 'datenschutz':
        title = `${t.datenschutzTitle} – Politblick`;
        description = t.metaDatenschutzDescription;
        break;
      case 'daten':
        title = `${t.datenTitle} – Politblick`;
        description = t.datenIntro;
        break;
    }

    document.title = title;
    const setMeta = (selector: string, attr: string, value: string) => document.querySelector(selector)?.setAttribute(attr, value);
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    // window.location.pathname is already correct by the time this runs — either the browser
    // itself updated it before this render (initial load, popstate back/forward) or the URL-sync
    // effect above (declared earlier, so it commits first) already called pushState this commit.
    const canonicalUrl = `${SITE_URL}${window.location.pathname}`;
    setMeta('link[rel="canonical"]', 'href', canonicalUrl);
    setMeta('meta[property="og:url"]', 'content', canonicalUrl);

    // GoatCounter's count.js only ever fires its own pageview beacon once, on script load, for
    // whichever page a real browser navigation landed on — client-side route changes afterward
    // (pushState, no reload) never re-trigger it, so every click through the app past the first
    // page was going uncounted. pageKey (not window.location.pathname) is what actually decides
    // "did the page change" here — reusing the same identity pageKeyRef above is built from, so a
    // bare-MP-ID URL upgrading to its full slug once data loads doesn't get miscounted as a second
    // pageview of what's still the same page. The very first run of this effect deliberately
    // doesn't count anything itself: that page was already counted by count.js's own on-load
    // beacon moments earlier, however its title read at that point (see index.html) — this only
    // ever fires for a page reached by an in-app navigation, which that beacon could never see.
    const pageKey = [view, selectedMpId, profileTab, selectedBillId, selectedOrgId, selectedParty, partyTab, lobbyTab, selectedCommitteeId].join('|');
    if (lastCountedPageKeyRef.current !== null && lastCountedPageKeyRef.current !== pageKey) {
      window.goatcounter?.count?.({ path: window.location.pathname, title });
    }
    lastCountedPageKeyRef.current = pageKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, lang, selectedMpId, profileTab, selectedBillId, selectedOrgId, selectedParty, partyTab, lobbyTab, selectedCommitteeId, profile, pollDetail.result, orgDetail.org, committeeDetail.detail]);
  // "Linked" means exactly what orgsSectionSub claims: something on this site points at it — a
  // member's role, a lobbied vote, a committee, or a large donation. Re-deriving it from member
  // and vote counts alone would silently drop the donation-only ties.
  const tiedOrgIds = useMemo(() => new Set(orgList.orgs.map((e) => e.org.id)), [orgList.orgs]);
  // Filtering runs over the whole register, so at ~6,000 rows it is too slow to block a keystroke
  // on. Deferring the query lets the input update immediately and the list catch up a frame later.
  const deferredOrgSearchQuery = useDeferredValue(orgSearchQuery);
  const filteredOrgs = useMemo(() => {
    const needle = deferredOrgSearchQuery.trim().toLowerCase();
    return directoryOrgs.filter((e) => {
      if (orgScope === 'linked' && !tiedOrgIds.has(e.org.id)) return false;
      if (needle && !e.org.name.toLowerCase().includes(needle)) return false;
      if (orgPartyFilter.size > 0 && !e.parties.some((p) => orgPartyFilter.has(p))) return false;
      if (orgActorTypeFilter.size > 0 && (!e.org.actorType || !orgActorTypeFilter.has(e.org.actorType))) return false;
      if (orgFieldFilter.size > 0 && !e.org.fieldsOfInterest.some((f) => orgFieldFilter.has(f))) return false;
      return true;
    });
  }, [directoryOrgs, tiedOrgIds, orgScope, deferredOrgSearchQuery, orgPartyFilter, orgActorTypeFilter, orgFieldFilter]);
  // Back to the first page whenever the filters change. Without this, someone who paged two
  // thousand rows deep and then narrowed the search still pays to render everything the new
  // filter happens to match.
  useEffect(() => {
    setOrgsVisibleCount(ORGS_INITIAL_COUNT);
  }, [orgScope, deferredOrgSearchQuery, orgPartyFilter, orgActorTypeFilter, orgFieldFilter]);
  // Hoisted out of the table's render so a sort of several thousand names — localeCompare, which
  // is not cheap — happens when the sort or the filters change, not on every keystroke.
  const sortedOrgs = useMemo(() => {
    if (orgsSort.length === 0) return filteredOrgs;
    const orgValue = (e: OrgListEntry, key: string): string | number | null => {
      switch (key) {
        case 'name': return e.org.name;
        case 'actorType': return e.org.actorType;
        case 'spend': return e.org.expensesEuro ? e.org.expensesEuro.from : null;
        case 'members': return e.affiliatedMemberCount;
        case 'votes': return e.lobbiedPollCount;
        default: return null;
      }
    };
    return [...filteredOrgs].sort((a, b) => compareMultiSortValues(orgsSort, (key) => [orgValue(a, key), orgValue(b, key)]));
  }, [filteredOrgs, orgsSort]);
  // A party is only ever knowable for an organisation a member is tied to, so that filter stays
  // drawn from the tied set however wide the list itself runs.
  const orgPartyOptions = countOptions(orgList.orgs.flatMap((e) => e.parties));
  // ~6,000 organisations declaring ~12 fields each is ~72,000 strings to tally — far too much to
  // redo on every keystroke, and it does not depend on any of the filters.
  const orgActorTypeOptions = useMemo(
    () => countOptions(directoryOrgs.map((e) => e.org.actorType).filter((v): v is string => Boolean(v))),
    [directoryOrgs],
  );
  const orgFieldOptions = useMemo(() => countOptions(directoryOrgs.flatMap((e) => e.org.fieldsOfInterest)), [directoryOrgs]);
  const linkedOrgCount = tiedOrgIds.size;
  // Which registered organisations also show up as large donors, and for how much. `donorLinks`
  // maps a donation row's donor string onto a register id, so the totals come from the published
  // donation records themselves — nothing here is re-derived or matched by name at render time.
  const donationTotalByOrgId = useMemo(() => {
    const links = snapshot?.lobbyLinks.donorLinks ?? {};
    const byOrg = new Map<string, number>();
    for (const d of partyDonations.all) {
      if (!d.donor) continue;
      const orgId = links[d.donor];
      if (!orgId) continue;
      byOrg.set(orgId, (byOrg.get(orgId) ?? 0) + d.amountEuro);
    }
    return byOrg;
  }, [snapshot, partyDonations.all]);
  // Top fields of interest. An organisation counts in every field it declares — that is what a
  // field of interest means in the register — but a member is counted once per field however many
  // of that field's organisations they are tied to, so the MP figure stays a headcount of people.
  //
  // Budgets are deliberately absent. `expensesEuro` belongs to the organisation as a whole, so
  // adding it up per field gives each of an organisation's ~12 fields the entire budget and
  // inflates the total roughly 17-fold. Spend is shown by actor type instead, where every
  // organisation falls into exactly one group.
  const sectorStats = (() => {
    const byField = new Map<string, { orgCount: number; members: Set<string> }>();
    for (const e of orgList.orgs) {
      for (const f of e.org.fieldsOfInterest) {
        const cur = byField.get(f) ?? { orgCount: 0, members: new Set<string>() };
        cur.orgCount += 1;
        for (const mandateId of e.affiliatedMandateIds) cur.members.add(mandateId);
        byField.set(f, cur);
      }
    }
    return [...byField.entries()]
      .map(([field, v]) => ({ field, orgCount: v.orgCount, memberCount: v.members.size }))
      .sort((a, b) => (sectorMetric === 'members' ? b.memberCount - a.memberCount : b.orgCount - a.orgCount) || b.orgCount - a.orgCount)
      .slice(0, 8);
  })();

  // Register-wide spending. Unlike everything else on this page it is not scoped to parliament by
  // default: the register's own total is the honest figure, and the linked subset is offered
  // beside it so the reader can see how little of the register this site actually touches.
  const spendSummary = snapshot?.lobbyLinks.spendSummary ?? null;
  const spendScopeData = spendSummary ? spendSummary[spendScope] : null;
  // The widest concentration bracket this scope has enough declarants to fill.
  const topConcentration = spendScopeData?.concentration.at(-1) ?? null;

  const topicalPartyOptions = countOptions(topicalTieRows.rows.map((r) => r.party));
  const topicalFieldOptions = countOptions(topicalTieRows.rows.map((r) => r.tie.matchedField));
  const topicalSearchLower = topicalSearchQuery.trim().toLowerCase();
  const filteredTopicalRows = topicalTieRows.rows.filter((r) => {
    if (topicalPartyFilter.size > 0 && !topicalPartyFilter.has(r.party)) return false;
    if (topicalFieldFilter.size > 0 && !topicalFieldFilter.has(r.tie.matchedField)) return false;
    if (topicalSearchLower && !r.memberName.toLowerCase().includes(topicalSearchLower) && !r.org.name.toLowerCase().includes(topicalSearchLower) && !r.pollTitle.toLowerCase().includes(topicalSearchLower))
      return false;
    return true;
  });

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
          <a onClick={stop(goHome)} href={homeHref} style={navStyle(view === 'home')}>
            {t.navHome}
          </a>
          <div
            ref={mpsNavRef}
            style={{ position: 'relative' }}
            onMouseEnter={isTouchNav ? undefined : openMpsNav}
            onMouseLeave={isTouchNav ? undefined : scheduleCloseMpsNav}
          >
            <a
              onClick={touchNavTriggerClick(mpsNavOpen, setMpsNavOpen, goSearch)}
              href={searchHref}
              style={{
                ...navStyle(view === 'search' || view === 'party' || view === 'partyList' || view === 'committee' || view === 'committeeList' || view === 'pollList'),
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {t.navParliament}
              <span style={{ fontSize: 8, transform: mpsNavOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
            </a>
            {mpsNavOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 8,
                  background: 'white',
                  border: '1px solid oklch(88% 0.006 260)',
                  borderRadius: 10,
                  boxShadow: '0 4px 16px oklch(0% 0 0 / 0.1)',
                  minWidth: 210,
                  zIndex: 30,
                  overflow: 'hidden',
                  padding: 4,
                }}
              >
                <a
                  href={searchHref}
                  onClick={stop(() => {
                    goSearch();
                    setMpsNavOpen(false);
                  })}
                  style={{
                    display: 'block',
                    padding: '8px 12px',
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: view === 'search' ? 700 : 500,
                    color: view === 'search' ? 'oklch(45% 0.16 265)' : 'oklch(30% 0.01 260)',
                    background: view === 'search' ? 'oklch(45% 0.16 265 / 0.08)' : 'transparent',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.navMpsSearch}
                </a>
                <a
                  href={partyListHref}
                  onClick={stop(() => {
                    goPartyList();
                    setMpsNavOpen(false);
                  })}
                  style={{
                    display: 'block',
                    padding: '8px 12px',
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: view === 'party' || view === 'partyList' ? 700 : 500,
                    color: view === 'party' || view === 'partyList' ? 'oklch(45% 0.16 265)' : 'oklch(30% 0.01 260)',
                    background: view === 'party' || view === 'partyList' ? 'oklch(45% 0.16 265 / 0.08)' : 'transparent',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.navParties}
                </a>
                <a
                  href={committeeListHref}
                  onClick={stop(() => {
                    goCommitteeList();
                    setMpsNavOpen(false);
                  })}
                  style={{
                    display: 'block',
                    padding: '8px 12px',
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: view === 'committee' || view === 'committeeList' ? 700 : 500,
                    color: view === 'committee' || view === 'committeeList' ? 'oklch(45% 0.16 265)' : 'oklch(30% 0.01 260)',
                    background: view === 'committee' || view === 'committeeList' ? 'oklch(45% 0.16 265 / 0.08)' : 'transparent',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.navCommittees}
                </a>
                <a
                  href={pollListHref}
                  onClick={stop(() => {
                    goPollList();
                    setMpsNavOpen(false);
                  })}
                  style={{
                    display: 'block',
                    padding: '8px 12px',
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: view === 'pollList' ? 700 : 500,
                    color: view === 'pollList' ? 'oklch(45% 0.16 265)' : 'oklch(30% 0.01 260)',
                    background: view === 'pollList' ? 'oklch(45% 0.16 265 / 0.08)' : 'transparent',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.navPolls}
                </a>
              </div>
            )}
          </div>
          <div
            ref={lobbyNavRef}
            style={{ position: 'relative' }}
            onMouseEnter={isTouchNav ? undefined : openLobbyNav}
            onMouseLeave={isTouchNav ? undefined : scheduleCloseLobbyNav}
          >
            <a
              onClick={touchNavTriggerClick(lobbyNavOpen, setLobbyNavOpen, () => goCrossref())}
              href={crossrefHref()}
              style={{ ...navStyle(view === 'crossref'), display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {t.navLobbyFinance}
              <span style={{ fontSize: 8, transform: lobbyNavOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
            </a>
            {lobbyNavOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 8,
                  background: 'white',
                  border: '1px solid oklch(88% 0.006 260)',
                  borderRadius: 10,
                  boxShadow: '0 4px 16px oklch(0% 0 0 / 0.1)',
                  minWidth: 210,
                  zIndex: 30,
                  overflow: 'hidden',
                  padding: 4,
                }}
              >
                {(
                  [
                    { key: 'ties' as const, label: t.lobbyTabTies },
                    { key: 'orgs' as const, label: t.lobbyTabOrgs },
                    { key: 'donations' as const, label: t.lobbyTabDonations },
                  ]
                ).map((opt) => {
                  const active = view === 'crossref' && lobbyTab === opt.key;
                  return (
                    <a
                      key={opt.key}
                      href={crossrefHref(opt.key)}
                      onClick={stop(() => {
                        goCrossref(opt.key);
                        setLobbyNavOpen(false);
                      })}
                      style={{
                        display: 'block',
                        padding: '8px 12px',
                        borderRadius: 7,
                        fontSize: 13,
                        fontWeight: active ? 700 : 500,
                        color: active ? 'oklch(45% 0.16 265)' : 'oklch(30% 0.01 260)',
                        background: active ? 'oklch(45% 0.16 265 / 0.08)' : 'transparent',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {opt.label}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
        <div style={{ flex: 1, minWidth: 160, display: 'flex', justifyContent: 'center' }}>
          <GlobalSearchBox
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onSubmit={() => setView('search')}
            members={roster.members}
            polls={pollsState.polls}
            orgs={orgList.orgs}
            parties={roster.parties.filter((p) => routablePartyNames.has(p.name))}
            onSelectMp={(id) => openMp(String(id))}
            onSelectBill={openBill}
            onSelectOrg={openOrg}
            onSelectParty={(name) => openParty(name)}
            searchHref={searchHref}
            mpHref={mpHref}
            billHref={billHref}
            orgHref={orgHref}
            partyHref={partyHref}
            placeholder={t.searchPlaceholder}
            groupMpsLabel={t.searchGroupMps}
            groupBillsLabel={t.searchGroupBills}
            groupOrgsLabel={t.searchGroupOrgs}
            groupPartiesLabel={t.searchGroupParties}
            noResultsTemplate={t.findMpNoResultsTemplate}
            seeAllMpsTemplate={t.searchSeeAllMpsTemplate}
          />
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
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(30% 0.01 260)', marginBottom: 10 }}>{t.findMpKicker}</div>
            <FindMyMpBox
              members={roster.members}
              onSelect={openMp}
              mpHref={mpHref}
              searchHref={searchHref}
              placeholder={t.findMpPlaceholder}
              noResultsTemplate={t.findMpNoResultsTemplate}
              browseAllLabel={t.findMpBrowseAll}
              onBrowseAll={goSearch}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
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

          <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px 32px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
            <div style={{ flex: '2 1 380px' }}>
              <HemicycleChart
                parties={parties}
                seatsLabel={t.seatsLabel}
                onOpenParty={openParty}
                partyHref={partyHref}
                isPartyRoutable={(party) => routablePartyNames.has(party)}
                filenameBase="politblick-sitzverteilung"
                exportLabels={exportLabels}
              />
            </div>
            <div style={{ flex: '1 1 200px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, alignContent: 'start' }}>
              <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statMpsLabel}</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{roster.loading && roster.members.length === 0 ? '…' : roster.members.length}</div>
              </div>
              {/* The strongest signal the site actually has — a member voting on a bill an
                  organisation they are tied to declared lobbying on, document-backed — sits in the
                  most prominent slot. It replaces a tile that summed DEMO_MPS' invented `flags`
                  and rendered that fictional count next to the real ones. */}
              <div
                onClick={() => goCrossref('ties')}
                style={{ cursor: 'pointer', background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 18 }}
              >
                <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statConflictsLabel}</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{crossref.rows.length}</div>
              </div>
              <div
                onClick={() => goCrossref('donations')}
                style={{ cursor: 'pointer', background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 18 }}
              >
                <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statDonationsSumLabel}</div>
                <div style={{ fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {formatEuro(partyDonations.all.reduce((sum, d) => sum + d.amountEuro, 0))}
                </div>
                <div style={{ fontSize: 11, color: 'oklch(50% 0.01 260)', marginTop: 5 }}>
                  {t.statDonationsSumYearsNote.replace('{n}', String(new Set(partyDonations.all.map((d) => d.year)).size))}
                </div>
              </div>
              {/* Deliberately next to the donation total, and deliberately the loudest tile on the
                  page: large donations are the number this debate is usually had over, and they are
                  a fraction of the money organisations declare spending on lobbying in a single
                  year. The two are only comparable if the reader is told one is annual and the
                  other is not, which is what the note under each does. */}
              {spendSummary && (
                <div
                  onClick={() => goCrossref('orgs')}
                  style={{ cursor: 'pointer', background: 'oklch(96% 0.03 262)', border: '1px solid oklch(86% 0.07 262)', borderRadius: 12, padding: 18 }}
                >
                  <div style={{ fontSize: 11.5, lineHeight: 1.35, color: 'oklch(43% 0.05 262)', marginBottom: 6 }}>{t.statLobbySpendLabel}</div>
                  {/* The midpoint, not the bracket. Every bracket the register reports is €9,999
                      wide, so the spread on a total is accumulated bracket width rather than doubt
                      about the magnitude — and a range needs twice the room to say the same thing.
                      The exact bracket is one click away on the Lobbyausgaben tab. */}
                  <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15, whiteSpace: 'nowrap', color: 'oklch(45% 0.18 265)' }}>
                    {t.statLobbySpendValueTemplate.replace(
                      '{n}',
                      formatMillions((spendSummary.all.from + spendSummary.all.to) / 2, lang),
                    )}
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.4, color: 'oklch(43% 0.05 262)', marginTop: 5 }}>{t.statLobbySpendNote}</div>
                </div>
              )}
              <div
                onClick={() => goCrossref('orgs')}
                style={{ cursor: 'pointer', background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 18 }}
              >
                <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statOrgsReferencedLabel}</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{Object.keys(snapshot?.lobbyLinks.orgs ?? {}).length}</div>
              </div>
              <div
                onClick={() => goCrossref('ties')}
                style={{ cursor: 'pointer', background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 18 }}
              >
                <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statTopicalTiesLabel}</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{topicalTieRows.rows.length}</div>
              </div>
            </div>
          </section>

          <section style={{ maxWidth: 1100, margin: '0 auto', padding: '12px 32px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>{t.expectationTitle}</h2>
              <a href={crossrefHref('ties')} onClick={stop(() => goCrossref('ties'))} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(48% 0.12 250)', whiteSpace: 'nowrap' }}>
                {t.seeAllConflicts} →
              </a>
            </div>
            <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)', margin: '0 0 6px', maxWidth: 640 }}>{t.expectationSub}</p>
            {/* Says what "langfristig" on each card actually spans, and reads the year off the
                archive rather than hard-coding it — the covered range changes whenever another
                term is added to HISTORY_PERIOD_IDS. */}
            {snapshot?.historyCoverage && (
              <p style={{ fontSize: 12, color: 'oklch(55% 0.01 260)', margin: '0 0 18px', maxWidth: 640 }}>
                {t.historyCoverageNote.replace('{year}', historyCoverageLabel)}
              </p>
            )}
            {weekly.loading && weekly.results.length === 0 ? (
              <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.pollsLoading}</p>
            ) : realAgainstExpectation.length === 0 ? (
              <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.noPollsThisWeek}</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 14 }}>
                {realAgainstExpectation.map((e, i) => (
                  <a
                    key={i}
                    href={e.href}
                    onClick={e.onOpen ? stop(e.onOpen) : undefined}
                    style={{
                      cursor: e.onOpen ? 'pointer' : 'default',
                      textDecoration: 'none',
                      color: 'inherit',
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
                    {/* One divergence is not a pattern, and this is what lets a reader tell the two
                        apart without leaving the page — so it is set as a readable line rather than
                        grey small print. Both percentages are stated because the comparison is the
                        whole point: asking the reader to divide 5 by 434 in their head and weigh it
                        against the fraction average is asking them not to bother. */}
                    <div style={{ borderTop: '1px solid oklch(93% 0.006 260)', paddingTop: 8 }}>
                      {e.history ? (
                        <>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'oklch(32% 0.01 260)' }}>
                            {t.historyCardHeadline
                              .replace('{pct}', formatPct(e.history.alignmentPct))
                              .replace('{fracPct}', e.history.fractionAlignmentPct == null ? '—' : formatPct(e.history.fractionAlignmentPct))}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'oklch(52% 0.01 260)', marginTop: 2 }}>
                            {t.historyCardDetail
                              .replace('{count}', String(e.history.divergenceCount))
                              .replace('{total}', String(e.history.ratedCount))
                              .replace('{year}', historyCoverageLabel)}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 11.5, color: 'oklch(52% 0.01 260)' }}>{t.historyCardFirstTerm}</div>
                      )}
                    </div>
                  </a>
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
                  <a href={billHref(featuredResult.poll.id)} onClick={stop(() => openBill(featuredResult.poll.id))} style={{ fontSize: 12.5, fontWeight: 700 }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>{t.feedTitle}</h2>
              <a href={pollListHref} onClick={stop(goPollList)} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(48% 0.12 250)', whiteSpace: 'nowrap' }}>
                {t.seeAllPolls} →
              </a>
            </div>
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
                  <a
                    key={f.result.poll.id}
                    href={billHref(f.result.poll.id)}
                    onClick={stop(() => openBill(f.result.poll.id))}
                    style={{
                      cursor: 'pointer',
                      textDecoration: 'none',
                      color: 'inherit',
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
                  </a>
                ))}
              </div>
            )}
          </section>
        </main>
      )}

      {view === 'search' && (
        <main style={{ flex: 1, maxWidth: 1200, margin: '0 auto', width: '100%', padding: 32, display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <aside className="pb-search-sidebar" style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
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
              <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(45% 0.01 260)', marginBottom: 10 }}>{t.filterSort}</div>
              <select
                value={rosterSort}
                onChange={(e) => setRosterSort(e.target.value as typeof rosterSort)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid oklch(90% 0.006 260)', fontSize: 13.5, background: 'white' }}
              >
                <option value="default">{t.sortDefault}</option>
                <option value="income">{t.sortIncome}</option>
                <option value="ties">{t.sortTies}</option>
                <option value="loyalty">{t.sortLoyalty}</option>
                <option value="divergences">{t.sortDivergences}</option>
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
                  <a
                    key={m.id}
                    href={mpHref(String(m.id))}
                    onClick={stop(() => openMp(String(m.id)))}
                    style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}
                  >
                    <MpAvatar photoUrl={m.photoUrl} name={m.name} color={m.color} initials={m.initials} size={44} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                      <div style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)' }}>
                        {routablePartyNames.has(m.party) ? (
                          <span
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openParty(m.party);
                            }}
                            style={{ textDecoration: 'underline', textDecorationColor: 'oklch(85% 0.006 260)' }}
                          >
                            {m.party}
                          </span>
                        ) : (
                          m.party
                        )}{' '}
                        · {m.constituency}
                      </div>
                      {/* The long-run figure, with its denominator. The ten-vote number shown here
                          before was 100% for 602 of 630 members — an identical value down the whole
                          list carries no information. The denominator is not decoration either:
                          85% of 54 votes and 85% of 491 are not the same claim, and without it a
                          short-serving member reads as a rebel. Members with no earlier term keep
                          the recent window, labelled as such rather than silently mixed in. */}
                      {(() => {
                        const longRun = historyByPolitician.get(m.id);
                        if (longRun) {
                          return (
                            <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 2 }}>
                              {t.rosterLoyaltyLong
                                .replace('{pct}', formatPct(longRun.alignmentPct))
                                .replace('{total}', String(longRun.ratedCount))
                                .replace('{year}', historyCoverageLabel)}
                            </div>
                          );
                        }
                        if (memberAlignment?.alignmentPct == null) return null;
                        return (
                          <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 2 }}>
                            {t.rosterLoyaltyRecent
                              .replace('{pct}', String(memberAlignment.alignmentPct))
                              .replace('{total}', String(memberAlignment.ratedCount))}
                          </div>
                        );
                      })()}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </main>
      )}

      {view === 'profile' && (
        <main style={{ flex: 1, maxWidth: 980, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href={searchHref} onClick={stop(() => goBack(goSearch))} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToSearch}
          </a>

          {profile.kind === 'loading' && <p style={{ fontSize: 14, color: 'oklch(48% 0.01 260)', marginTop: 20 }}>{t.loadingProfile}</p>}
          {profile.kind === 'missing' && <p style={{ fontSize: 14, color: 'oklch(48% 0.01 260)', marginTop: 20 }}>{t.profileNotFound}</p>}

          {profile.kind === 'real' && (
            <>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center', margin: '20px 0 24px', flexWrap: 'wrap' }}>
                <MpAvatar
                  key={profile.mp.id}
                  photoUrl={profile.kind === 'real' ? profile.mp.photoUrl : null}
                  name={profile.mp.name}
                  color={profile.mp.color}
                  initials={profile.mp.initials}
                  size={76}
                />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h1 style={{ fontSize: 27, fontWeight: 800, margin: '0 0 4px' }}>{profile.mp.name}</h1>
                  <div style={{ fontSize: 13.5, color: 'oklch(45% 0.01 260)' }}>
                    {routablePartyNames.has(profile.mp.party) ? (
                      <a
                        href={partyHref(profile.mp.party)}
                        onClick={stop(() => openParty(profile.mp.party))}
                        style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'oklch(80% 0.006 260)', color: 'inherit' }}
                      >
                        {profile.mp.party}
                      </a>
                    ) : (
                      profile.mp.party
                    )}{' '}
                    · {profile.mp.constituency}
                  </div>
                  {profile.kind === 'real' && profile.mp.photoUrl && (
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

              <div
                className="pb-scroll"
                style={{
                  display: 'flex',
                  gap: 8,
                  borderBottom: '1px solid oklch(90% 0.006 260)',
                  marginBottom: 24,
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
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
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      borderBottom: `2px solid ${profileTab === tab.key ? 'oklch(45% 0.16 265)' : 'transparent'}`,
                      color: profileTab === tab.key ? 'oklch(20% 0.01 260)' : 'oklch(50% 0.01 260)',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {profileTab === 'overview' &&
                (mandateVotes.loading && mandateVotes.votes.length === 0 ? (
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
                          {/* The long-run figure where there is one. Over ten votes this tile read
                              100% for members with dozens of divergences on record — Klaus-Peter
                              Willsch showed a flawless 100% against an actual 94,1% across 539
                              votes. Whichever window is used, the tile now says which. */}
                          {(() => {
                            const longRun = snapshot?.historyByPolitician.get(profile.mp.id);
                            if (longRun) {
                              return (
                                <>
                                  <div style={{ fontSize: 24, fontWeight: 800 }}>{formatPct(longRun.alignmentPct)}%</div>
                                  <div style={{ fontSize: 11, color: 'oklch(55% 0.01 260)', marginTop: 2 }}>
                                    {t.statWindowLong.replace('{year}', historyCoverageLabel)}
                                  </div>
                                </>
                              );
                            }
                            return (
                              <>
                                <div style={{ fontSize: 24, fontWeight: 800 }}>
                                  {alignment.alignmentPct !== null ? `${alignment.alignmentPct}%` : recentPolls.loading ? '…' : '—'}
                                </div>
                                {alignment.ratedCount > 0 && (
                                  <div style={{ fontSize: 11, color: 'oklch(55% 0.01 260)', marginTop: 2 }}>
                                    {t.statWindowRecent.replace('{count}', String(alignment.ratedCount))}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                          <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statFlags}</div>
                          {/* Same window as the loyalty tile beside it — a 100% next to a count of
                              0 drawn from different spans would be two answers to one question. */}
                          {(() => {
                            const longRun = snapshot?.historyByPolitician.get(profile.mp.id);
                            if (longRun) {
                              return (
                                <>
                                  <div style={{ fontSize: 24, fontWeight: 800 }}>{longRun.divergenceCount}</div>
                                  <div style={{ fontSize: 11, color: 'oklch(55% 0.01 260)', marginTop: 2 }}>
                                    {t.statWindowLong.replace('{year}', historyCoverageLabel)}
                                  </div>
                                </>
                              );
                            }
                            return (
                              <>
                                <div style={{ fontSize: 24, fontWeight: 800 }}>
                                  {recentPolls.loading && alignment.points.length === 0 ? '…' : realMpFlaggedVotes.length}
                                </div>
                                {alignment.ratedCount > 0 && (
                                  <div style={{ fontSize: 11, color: 'oklch(55% 0.01 260)', marginTop: 2 }}>
                                    {t.statWindowRecent.replace('{count}', String(alignment.ratedCount))}
                                  </div>
                                )}
                              </>
                            );
                          })()}
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
                        <ChartExportMenu
                          filenameBase={`politblick-parteitreue-${profile.kind === 'real' ? profile.mp.name : selectedMpId ?? ''}`}
                          getCsv={() => ({
                            headers: ['Date', 'Bill', 'Vote', 'Aligned with party'],
                            rows: alignment.points.map((p) => [p.poll.date, p.poll.title, p.vote, p.aligned === null ? 'n/a' : p.aligned ? 'yes' : 'no']),
                          })}
                          svgRef={alignmentSvgRef}
                          labels={exportLabels}
                        />
                        <svg ref={alignmentSvgRef} viewBox="0 0 400 60" style={{ width: '100%', height: 60, display: 'block' }}>
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
                                  {p.aligned === false && (
                                    <span style={{ fontSize: 11, color: 'oklch(48% 0.16 40)', fontWeight: 600 }}>
                                      {divergenceLabel(p.vote, t.reasonPartyLine, t.abstainedFractionLine)}
                                    </span>
                                  )}
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
                    {/* Deliberately not styled as a warning, and no longer headed "Auffälligkeiten".
                        Diverging from the fraction line is a fact about a vote, not a verdict on a
                        person — and a bare count of divergences is close to meaningless without the
                        number of votes it is drawn from. The base rate underneath is what makes the
                        number readable: 3-of-4 and 3-of-120 are not the same observation. */}
                    {realMpFlaggedVotes.length > 0 && (
                      <div style={{ background: 'oklch(97% 0.006 260)', border: '1px solid oklch(90% 0.008 260)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(30% 0.01 260)', marginBottom: 4 }}>
                          {t.divergencesHeading}
                          <InfoTooltip text={t.infoAuffaelligkeit} />
                        </div>
                        <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: 10 }}>
                          {t.divergencesBaseRate
                            .replace('{count}', String(realMpFlaggedVotes.length))
                            .replace('{total}', String(alignment.ratedCount))
                            .replace('{pct}', alignment.alignmentPct == null ? '—' : String(alignment.alignmentPct))}
                        </div>
                        {realMpFlaggedVotes.map((p) => (
                          <div key={p.poll.id} style={{ fontSize: 13, color: 'oklch(32% 0.01 260)', padding: '4px 0' }}>
                            · {p.poll.title}: {divergenceLabel(p.vote, t.realAgainstPartyTemplate, t.abstainedPartyTemplate).replace('{party}', p.party)}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* The long view. The box above measures ten recent votes, which is far too
                        short a window to tell an outlier from noise — this is the same
                        measurement over every recorded vote of the member's earlier terms, and
                        crucially against what their own fraction did on those same votes. */}
                    <LongTermRecordCard
                      history={voteHistory}
                      t={t}
                      formatPct={formatPct}
                      activeKind={historyKindFilter}
                      activeTopic={historyTopicFilter}
                      // On the overview the chips are still filters, they just have to take the
                      // reader to the list they filter — otherwise the click would appear to do
                      // nothing, since the detail lives on the votes tab.
                      onSelectKind={(kind) => {
                        toggleHistoryKind(kind);
                        setProfileTab('votes');
                      }}
                      onSelectTopic={(topic) => {
                        toggleHistoryTopic(topic);
                        setProfileTab('votes');
                      }}
                      footer={
                        voteHistory.divergences.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setProfileTab('votes');
                              setHistoryExpanded(true);
                            }}
                            style={{ marginTop: 10, padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: 'oklch(48% 0.12 250)' }}
                          >
                            {t.historySeeVotesTab}
                          </button>
                        ) : null
                      }
                    />
                    {memberCommittees.rows.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{t.profileCommitteesTitle}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {memberCommittees.rows.map((r) => {
                            const roleLabel =
                              r.role === 'chairperson' || r.role === 'foreperson' ? t.committeeRoleChair
                              : r.role === 'vice_chairperson' ? t.committeeRoleViceChair
                              : r.role === 'spokesperson' ? t.committeeRoleSpokesperson
                              : r.role === 'alternate_member' ? t.committeeRoleAlternate
                              : null;
                            return (
                              <a
                                key={r.committee.id}
                                href={committeeHref(String(r.committee.id))}
                                onClick={stop(() => openCommittee(String(r.committee.id)))}
                                style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit', fontSize: 12.5, padding: '7px 12px', borderRadius: 10, background: 'white', border: '1px solid oklch(90% 0.006 260)' }}
                              >
                                {r.committee.name}
                                {roleLabel && <span style={{ fontWeight: 700, color: 'oklch(45% 0.16 265)' }}> · {roleLabel}</span>}
                              </a>
                            );
                          })}
                        </div>
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

              {/* The long-run record leads the tab, so the summary comes before the vote list
                  rather than trailing it. Expanding it reveals the vote-by-vote detail in place —
                  that detail belongs to this summary, and stacking it as a second, unrelated list
                  at the bottom of the tab made both harder to read. */}
              {profileTab === 'votes' && (
                <LongTermRecordCard
                  history={voteHistory}
                  t={t}
                  formatPct={formatPct}
                  activeKind={historyKindFilter}
                  activeTopic={historyTopicFilter}
                  onSelectKind={toggleHistoryKind}
                  onSelectTopic={toggleHistoryTopic}
                  footer={
                    voteHistory.divergences.length > 0 ? (
                      <>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                          <button
                            type="button"
                            onClick={() => setHistoryExpanded((v) => !v)}
                            style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: 'oklch(48% 0.12 250)' }}
                          >
                            {historyExpanded
                              ? t.historyHideDetail
                              : historyFilterActive
                                ? t.historyShowFiltered.replace('{count}', String(filteredDivergences.length))
                                : t.historyShowDetail.replace('{count}', String(voteHistory.divergences.length))}
                          </button>
                          {historyFilterActive && (
                            <button
                              type="button"
                              onClick={clearHistoryFilter}
                              style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: 'oklch(48% 0.01 260)', textDecoration: 'underline' }}
                            >
                              {t.historyClearFilter}
                            </button>
                          )}
                        </div>
                        {historyExpanded &&
                          (filteredDivergences.length > 0 ? (
                            <LongTermDivergenceList divergences={filteredDivergences} t={t} />
                          ) : (
                            // Reachable by combining two chips that share no votes — say so rather
                            // than showing an empty area that reads as "no divergences at all".
                            <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginTop: 12 }}>{t.historyNoMatches}</div>
                          ))}
                      </>
                    ) : null
                  }
                />
              )}

              {profileTab === 'votes' &&
                (mandateVotes.loading && mandateVotes.votes.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.pollsLoading}</p>
                ) : mandateVotes.error ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.16 40)' }}>{t.pollsError}</p>
                ) : mandateVotes.votes.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.noMandateVotesYet}</p>
                ) : (
                  <>
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: 'oklch(90% 0.006 260)', borderRadius: 1 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 26, paddingLeft: 28 }}>
                        {mandateVoteWeeks.map((group) => (
                          <div key={group.range.start.toISOString()} style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', left: -28, top: 2, width: 12, height: 12, borderRadius: '50%', background: 'white', border: '2px solid oklch(45% 0.16 265)' }} />
                            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'oklch(48% 0.01 260)', margin: '0 0 12px' }}>
                              {t.weekOf} {formatWeekRange(group.range, lang)}
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {group.votes.map((v) => {
                        const label = v.vote === 'yes' ? t.voteYes : v.vote === 'no' ? t.voteNo : v.vote === 'abstain' ? t.voteAbstain : t.voteNoShow;
                        const lobbyHit = lobbyByPollId.get(v.poll.id);
                        return (
                          <a
                            key={v.poll.id}
                            href={billHref(v.poll.id)}
                            onClick={stop(() => openBill(v.poll.id))}
                            style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px', gap: 12 }}
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
                          </a>
                        );
                      })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <ShowMoreButton
                      total={mandateVotes.votes.length}
                      defaultCount={10}
                      expanded={votesExpanded}
                      onToggle={() => setVotesExpanded((v) => !v)}
                      showMoreTemplate={t.showMoreTemplate}
                      showLessLabel={t.showLess}
                    />
                  </>
                ))}

              {profileTab === 'lobby' &&
                (
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
                                onClick={stop(() => openOrg(org.id))}
                                style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '14px 16px' }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                                  <a href={orgHref(org.id)} onClick={stop(() => openOrg(org.id))} style={{ fontWeight: 600, fontSize: 14, textDecoration: 'none', color: 'inherit' }}>
                                    {org.name}
                                  </a>
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
                                  onClick={stop(() => openBill(c.pollId))}
                                  style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '14px 16px' }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                                    <a href={billHref(c.pollId)} onClick={stop(() => openBill(c.pollId))} style={{ fontWeight: 600, fontSize: 14, textDecoration: 'none', color: 'inherit' }}>
                                      {poll?.title ?? `#${c.pollId}`}
                                    </a>
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
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'oklch(48% 0.14 60)', marginTop: 6 }}>
                                      ⬤ {c.vote === 'yes' || c.vote === 'no' ? t.lobbyAgainstFraction : t.lobbyAbstainedFraction}
                                    </div>
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
                                onClick={stop(() => openBill(tie.pollId))}
                                style={{ cursor: 'pointer', background: 'oklch(97% 0.008 90)', border: '1px solid oklch(88% 0.02 90)', borderRadius: 10, padding: '14px 16px' }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                                  <a href={billHref(tie.pollId)} onClick={stop(() => openBill(tie.pollId))} style={{ fontWeight: 600, fontSize: 14, textDecoration: 'none', color: 'inherit' }}>
                                    {poll?.title ?? `#${tie.pollId}`}
                                  </a>
                                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 12, background: voteBg[tie.vote], color: 'white', flexShrink: 0 }}>
                                    {label}
                                  </span>
                                </div>
                                <a
                                  href={orgHref(tie.org.id)}
                                  onClick={stop(() => openOrg(tie.org.id))}
                                  style={{ fontSize: 12.5, color: 'oklch(42% 0.01 260)', marginTop: 5, textDecoration: 'underline', textDecorationColor: 'oklch(85% 0.02 90)', display: 'inline-block' }}
                                >
                                  {tie.org.name}
                                </a>
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
                      <a href="https://www.lobbyregister.bundestag.de/" target="_blank" rel="noreferrer" style={{ color: 'oklch(48% 0.12 250)' }}>
                        {t.lobbyRegisterSource}
                      </a>
                    </p>
                  </div>
                )}

              {profileTab === 'finance' &&
                (sidejobs.loading && sidejobs.records.length === 0 ? (
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
                    <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 6, lineHeight: 1.6 }}>
                      {t.sidejobsSourceNote}
                      {profile.kind === 'real' && (
                        <>
                          {' '}
                          <a href={profile.mp.profileUrl} target="_blank" rel="noreferrer" style={{ color: 'oklch(48% 0.12 250)' }}>
                            {t.viewSource} →
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                ))}
            </>
          )}
        </main>
      )}

      {view === 'bill' && (
        <main style={{ flex: 1, maxWidth: 900, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href={homeHref} onClick={stop(() => goBack(goHome))} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToHome}
          </a>

          {realPollId !== null && (
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

                  {pollDetail.result.poll.summary && (
                    <div style={{ margin: '0 0 22px', maxWidth: 640 }}>
                      <p
                        style={{
                          fontSize: 14.5,
                          color: 'oklch(35% 0.01 260)',
                          lineHeight: 1.7,
                          whiteSpace: 'pre-line',
                          margin: 0,
                        }}
                      >
                        {pollSummaryExpanded ? pollDetail.result.poll.summary : firstParagraph(pollDetail.result.poll.summary)}
                      </p>
                      {firstParagraph(pollDetail.result.poll.summary) !== pollDetail.result.poll.summary && (
                        <button
                          onClick={() => setPollSummaryExpanded((v) => !v)}
                          style={{
                            marginTop: 6,
                            padding: 0,
                            border: 'none',
                            background: 'none',
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: 'oklch(45% 0.16 265)',
                            cursor: 'pointer',
                          }}
                        >
                          {pollSummaryExpanded ? t.showLess : t.showMoreText}
                        </button>
                      )}
                    </div>
                  )}

                  <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{t.voteBreakdown}</div>
                    {pollDetail.result.partyBreakdown.map((pb) => {
                      const total = pb.yes + pb.no + pb.abstain + pb.noShow || 1;
                      return (
                        <div key={pb.party} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          {routablePartyNames.has(pb.party) ? (
                            <a
                              href={partyHref(pb.party)}
                              onClick={stop(() => openParty(pb.party))}
                              style={{ width: 90, fontSize: 12.5, fontWeight: 600, flexShrink: 0, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'oklch(85% 0.006 260)', color: 'inherit' }}
                            >
                              {pb.party}
                            </a>
                          ) : (
                            <span style={{ width: 90, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>{pb.party}</span>
                          )}
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
                  {pollDetailDivergences.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'oklch(48% 0.01 260)', marginBottom: 20 }}>{t.noFlaggedVotes}</p>
                  ) : (
                  <div style={{ marginBottom: 20 }}>
                  <input
                    type="text"
                    value={flaggedVotesSearch}
                    onChange={(e) => setFlaggedVotesSearch(e.target.value)}
                    placeholder={t.flaggedVotesSearchPlaceholder}
                    style={{ width: '100%', maxWidth: 340, padding: '8px 11px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 9, fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }}
                  />
                  {filteredFlaggedVotes.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>{t.searchNoResults}</p>
                  ) : (
                  <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filteredFlaggedVotes.slice(0, flaggedVotesExpanded ? filteredFlaggedVotes.length : 10).map((d, i) => {
                      const rm = mandateToMember.get(d.member.mandateId);
                      return (
                        <a
                          key={i}
                          href={rm ? mpHref(String(rm.id)) : undefined}
                          onClick={rm ? stop(() => openMp(String(rm.id))) : undefined}
                          style={{
                            cursor: rm ? 'pointer' : 'default',
                            textDecoration: 'none',
                            color: 'inherit',
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '3px 10px',
                                borderRadius: 10,
                                background: voteBg[d.member.vote],
                                color: 'white',
                              }}
                            >
                              {d.member.vote === 'yes' ? t.voteYes : d.member.vote === 'no' ? t.voteNo : t.voteAbstain}
                            </span>
                            <span style={{ fontSize: 12, color: 'oklch(48% 0.16 40)' }}>
                              {divergenceLabel(d.member.vote, t.realAgainstPartyTemplate, t.abstainedPartyTemplate).replace('{party}', d.member.party)}
                            </span>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                  <ShowMoreButton
                    total={filteredFlaggedVotes.length}
                    defaultCount={10}
                    expanded={flaggedVotesExpanded}
                    onToggle={() => setFlaggedVotesExpanded((v) => !v)}
                    showMoreTemplate={t.showMoreTemplate}
                    showLessLabel={t.showLess}
                  />
                  </>
                  )}
                  </div>
                  )}
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
                      <input
                        type="text"
                        value={pollLobbyingSearch}
                        onChange={(e) => setPollLobbyingSearch(e.target.value)}
                        placeholder={t.pollLobbyingSearchPlaceholder}
                        style={{ width: '100%', maxWidth: 340, padding: '8px 11px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 9, fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }}
                      />
                      {filteredPollLobbying.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'oklch(48% 0.01 260)', marginBottom: 12 }}>{t.searchNoResults}</p>
                      ) : (
                      <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                        {filteredPollLobbying.slice(0, pollLobbyingExpanded ? filteredPollLobbying.length : 10).map((e) => {
                          const spend = formatExpenseBracket(e.org.expensesEuro);
                          return (
                            <a
                              key={e.org.id}
                              href={orgHref(e.org.id)}
                              onClick={stop(() => openOrg(e.org.id))}
                              style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit', display: 'block', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{e.org.name}</span>
                                {spend && <span style={{ fontSize: 11.5, color: 'oklch(50% 0.01 260)', flexShrink: 0 }}>{spend}</span>}
                              </div>
                              {e.demands.length > 0 && (
                                <div style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', marginTop: 4, fontStyle: 'italic' }}>„{e.demands[0]}“</div>
                              )}
                            </a>
                          );
                        })}
                      </div>
                      <ShowMoreButton
                        total={filteredPollLobbying.length}
                        defaultCount={10}
                        expanded={pollLobbyingExpanded}
                        onToggle={() => setPollLobbyingExpanded((v) => !v)}
                        showMoreTemplate={t.showMoreTemplate}
                        showLessLabel={t.showLess}
                      />
                      </>
                      )}
                    </>
                  )}

                  <a href={pollDetail.result.poll.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700 }}>
                    {t.viewSource} →
                  </a>

                  {pollDetail.result.poll.drucksachen.length > 0 && (
                    <div style={{ marginTop: 12, fontSize: 12.5 }}>
                      <span style={{ color: 'oklch(55% 0.01 260)', marginRight: 8 }}>{t.viewDrucksacheLabel}</span>
                      {pollDetail.result.poll.drucksachen.map((d) => {
                        const url = drucksacheUrl(d);
                        return url ? (
                          <a key={d} href={url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'oklch(48% 0.12 250)', marginRight: 12 }}>
                            {t.viewDrucksacheTemplate.replace('{number}', d)}
                          </a>
                        ) : null;
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      )}

      {view === 'crossref' && (
        <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: 32 }}>
          {lobbyTab === 'overview' && (
            <>
              <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>{t.navLobbyFinance}</h1>
              <p style={{ fontSize: 14, color: 'oklch(45% 0.01 260)', margin: '0 0 28px', maxWidth: 640 }}>{t.crossrefSub}</p>

              {/* Flex rather than grid: with seven tiles an auto-fit grid leaves the last row
                  half-empty, which reads as missing data. Letting the tiles grow means each row
                  fills the width whatever the count and the viewport. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
                {/* The register's own size and spend come first: everything else on this page is a
                    slice of parliament's contact with it, and those two say how large the thing
                    being sliced actually is. */}
                <div onClick={() => goCrossref('orgs')} style={{ cursor: 'pointer', background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16, flex: '1 1 200px' }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statRegisterOrgsLabel}</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{(spendSummary?.all.orgCount ?? 0).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US')}</div>
                </div>
                {spendSummary && (
                  <div
                    onClick={() => goCrossref('orgs')}
                    style={{ cursor: 'pointer', background: 'oklch(96% 0.03 262)', border: '1px solid oklch(86% 0.07 262)', borderRadius: 12, padding: 16, flex: '1 1 200px' }}
                  >
                    <div style={{ fontSize: 12, lineHeight: 1.35, color: 'oklch(43% 0.05 262)', marginBottom: 6 }}>{t.statLobbySpendLabel}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15, whiteSpace: 'nowrap', color: 'oklch(45% 0.18 265)' }}>
                      {t.statLobbySpendValueTemplate.replace('{n}', formatMillions((spendSummary.all.from + spendSummary.all.to) / 2, lang))}
                    </div>
                    <div style={{ fontSize: 11, lineHeight: 1.4, color: 'oklch(43% 0.05 262)', marginTop: 5 }}>{t.statLobbySpendNote}</div>
                  </div>
                )}
                <div onClick={() => goCrossref('ties')} style={{ cursor: 'pointer', background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16, flex: '1 1 200px' }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statTiedMembersLabel}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {t.statTiedMembersTemplate
                      .replace('{n}', String(countMembersWithFunction(snapshot?.lobbyLinks.affiliations ?? {})))
                      .replace('{total}', String(roster.members.length))}
                  </div>
                </div>
                <div onClick={() => goCrossref('orgs')} style={{ cursor: 'pointer', background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16, flex: '1 1 200px' }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statOrgsReferencedLabel}</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{Object.keys(snapshot?.lobbyLinks.orgs ?? {}).length}</div>
                </div>
                <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16, flex: '1 1 200px' }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>
                    {t.statConflictsLabel}
                    <InfoTooltip text={t.infoVerflechtung} />
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{crossref.rows.length}</div>
                </div>
                <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16, flex: '1 1 200px' }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>
                    {t.statTopicalTiesLabel}
                    <InfoTooltip text={t.infoThemenfeld} />
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{topicalTieRows.rows.length}</div>
                </div>
                <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16, flex: '1 1 200px' }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statDonationsSumLabel}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {formatEuro(partyDonations.all.reduce((sum, d) => sum + d.amountEuro, 0))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
                {(
                  [
                    { key: 'ties' as const, title: t.tiesTabTitle, sub: t.tiesTabSub },
                    { key: 'orgs' as const, title: t.orgsSectionTitle, sub: t.orgsSectionSub },
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

          {lobbyTab === 'ties' && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{t.tiesTabTitle}</h2>
              <p style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', margin: '0 0 16px', maxWidth: 760 }}>{t.tiesTabSub}</p>

              <SubTabBar
                tabs={[
                  { key: 'network' as const, label: t.lobbyTiesSubTabNetwork },
                  { key: 'byParty' as const, label: t.lobbyTiesSubTabByParty },
                  { key: 'direct' as const, label: t.lobbyTiesSubTabDirect },
                  { key: 'topical' as const, label: t.lobbyTiesSubTabTopical },
                ]}
                active={lobbyTiesSubTab}
                onChange={setLobbyTiesSubTab}
              />

              {lobbyTiesSubTab === 'network' && (
                <PartyOrgGraph
                  orgs={orgNetwork.orgs}
                  parties={parties}
                  onOpenOrg={openOrg}
                  onOpenParty={(party) => openParty(party, 'crossref')}
                  orgHref={orgHref}
                  partyHref={(party) => partyHref(party)}
                  isPartyRoutable={(party) => routablePartyNames.has(party)}
                  filenameBase="politblick-lobby-netzwerk"
                  exportLabels={exportLabels}
                  labels={{
                    sub: t.networkSub,
                    crossPartyToggle: t.networkToggleCrossParty,
                    allToggle: t.networkToggleAll,
                    orgCountTemplate: t.networkOrgCountTemplate,
                    viewOrg: t.networkViewOrg,
                    viewParty: t.networkViewParty,
                    empty: t.networkEmpty,
                  }}
                />
              )}

              {lobbyTiesSubTab === 'byParty' && (
                <>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>{t.partyDetailOrgsTitle}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
                    {partyLobby.summaries.map((p) => (
                      <a
                        key={p.party}
                        href={partyHref(p.party)}
                        onClick={stop(() => openParty(p.party, 'crossref'))}
                        style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit', display: 'block', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: '14px 16px' }}
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
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'oklch(48% 0.12 250)' }}>{t.seeAll} →</span>
                      </a>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {lobbyTab === 'orgs' && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{t.orgsSectionTitle}</h2>
              <p style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', margin: '0 0 16px', maxWidth: 700 }}>{t.orgsSectionSub}</p>

              <SubTabBar
                tabs={[
                  { key: 'distribution' as const, label: t.lobbyOrgsSubTabDistribution },
                  { key: 'fields' as const, label: t.lobbyOrgsSubTabFields },
                  { key: 'list' as const, label: t.lobbyOrgsSubTabList },
                ]}
                active={lobbyOrgsSubTab}
                onChange={setLobbyOrgsSubTab}
              />

              {lobbyOrgsSubTab === 'distribution' && spendSummary && spendScopeData && (
                <div style={{ background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 14, padding: 16, marginBottom: 20 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 14.5, fontWeight: 700, margin: 0 }}>{t.spendChartTitle}</h3>
                    {/* The whole register is the honest default; the parliament-linked subset stays
                        reachable because it is what the rest of this page is about — but it is a
                        small and skewed slice, which the counts beside each scope make visible. */}
                    <div className="pb-metric-toggle-buttons" style={{ display: 'flex', border: '1px solid oklch(90% 0.006 260)', borderRadius: 16, overflow: 'hidden', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                      <button onClick={() => setSpendScope('all')} style={pillBtn(spendScope === 'all')}>
                        {t.spendScopeAll} ({spendSummary.all.orgCount})
                      </button>
                      <button onClick={() => setSpendScope('linked')} style={pillBtn(spendScope === 'linked')}>
                        {t.spendScopeLinked} ({spendSummary.linked.orgCount})
                      </button>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'oklch(45% 0.01 260)', margin: '0 0 14px', maxWidth: 640 }}>{t.spendChartSub}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
                    <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: '12px 16px', flex: '1 1 220px' }}>
                      <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.spendTotalLabel}</div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{formatExpenseBracket({ from: spendScopeData.from, to: spendScopeData.to })}</div>
                      <div style={{ fontSize: 11, color: 'oklch(50% 0.01 260)', marginTop: 4 }}>
                        {t.spendDeclaringTemplate.replace('{n}', String(spendScopeData.declaringCount)).replace('{total}', String(spendScopeData.orgCount))}
                      </div>
                    </div>
                    <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: '12px 16px', flex: '1 1 220px' }}>
                      <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.spendStaffLabel}</div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{spendScopeData.staffFte.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US')}</div>
                      {topConcentration && (
                        <div style={{ fontSize: 11, color: 'oklch(50% 0.01 260)', marginTop: 4 }}>
                          {t.spendConcentrationTemplate
                            .replace('{n}', String(topConcentration.n))
                            .replace('{pct}', String(Math.round((topConcentration.to / Math.max(1, spendScopeData.to)) * 100)))}
                        </div>
                      )}
                    </div>
                  </div>
                  <ActorTypeSpendChart
                    scope={spendScopeData}
                    orgsTemplate={t.spendOrgsTemplate}
                    filenameBase="politblick-lobbyausgaben"
                    exportLabels={exportLabels}
                  />
                  <p style={{ fontSize: 11.5, color: 'oklch(50% 0.01 260)', margin: '14px 0 0', maxWidth: 700, lineHeight: 1.5 }}>{t.spendChartNote}</p>
                </div>
              )}

              {lobbyOrgsSubTab === 'fields' && sectorStats.length > 0 && (
                <div style={{ background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 14, padding: 16, marginBottom: 20 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 14.5, fontWeight: 700, margin: 0 }}>{t.sectorChartTitle}</h3>
                    <div className="pb-metric-toggle-buttons" style={{ display: 'flex', border: '1px solid oklch(90% 0.006 260)', borderRadius: 16, overflow: 'hidden', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                      <button onClick={() => setSectorMetric('members')} style={pillBtn(sectorMetric === 'members')}>
                        {t.sectorMetricMembers}
                      </button>
                      <button onClick={() => setSectorMetric('orgs')} style={pillBtn(sectorMetric === 'orgs')}>
                        {t.sectorMetricOrgs}
                      </button>
                    </div>
                    <select
                      className="pb-metric-toggle-select"
                      value={sectorMetric}
                      onChange={(e) => setSectorMetric(e.target.value as SectorMetric)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid oklch(90% 0.006 260)', fontSize: 13.5, background: 'white' }}
                    >
                      <option value="members">{t.sectorMetricMembers}</option>
                      <option value="orgs">{t.sectorMetricOrgs}</option>
                    </select>
                  </div>
                  <p style={{ fontSize: 12, color: 'oklch(45% 0.01 260)', margin: '0 0 14px', maxWidth: 640 }}>{t.sectorChartSub}</p>
                  <SectorBarChart
                    data={sectorStats}
                    metric={sectorMetric}
                    selected={orgFieldFilter}
                    // The list this used to sit above now lives on its own tab, so a click has to
                    // take the reader there rather than filtering something off-screen.
                    onSelect={(field) => {
                      setOrgFieldFilter((prev) => toggleInSet(prev, field));
                      setLobbyOrgsSubTab('list');
                    }}
                    membersTemplate={t.sectorChartMembersTemplate}
                    orgsTemplate={t.sectorChartOrgsTemplate}
                    filenameBase="politblick-interessengebiete"
                    exportLabels={exportLabels}
                  />
                </div>
              )}

              {lobbyOrgsSubTab === 'list' && (
                <>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div className="pb-metric-toggle-buttons" style={{ display: 'flex', border: '1px solid oklch(90% 0.006 260)', borderRadius: 16, overflow: 'hidden', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                  <button onClick={() => setOrgScope('all')} style={pillBtn(orgScope === 'all')}>
                    {t.orgScopeAll} ({directoryOrgs.length})
                  </button>
                  <button onClick={() => setOrgScope('linked')} style={pillBtn(orgScope === 'linked')}>
                    {t.orgScopeLinked} ({linkedOrgCount})
                  </button>
                </div>
                {lobbyDirectory.loading && <span style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)' }}>{t.orgDirectoryLoading}</span>}
                {lobbyDirectory.error && <span style={{ fontSize: 12.5, color: 'oklch(50% 0.19 25)' }}>{t.orgDirectoryError}</span>}
              </div>
              <input
                type="text"
                value={orgSearchQuery}
                onChange={(e) => setOrgSearchQuery(e.target.value)}
                placeholder={t.orgSearchPlaceholder}
                style={{ width: '100%', maxWidth: 420, padding: '9px 12px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 9, fontSize: 13.5, marginBottom: 14, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <MultiSelectFilter
                  label={t.filterParty}
                  options={orgPartyOptions}
                  selected={orgPartyFilter}
                  onToggle={(v) => setOrgPartyFilter((prev) => toggleInSet(prev, v))}
                  onClear={() => setOrgPartyFilter(new Set())}
                  allLabel={t.filterAllLabel}
                  selectedCountTemplate={t.filterSelectedCountTemplate}
                  clearLabel={t.clearAllFilters}
                />
                <MultiSelectFilter
                  label={t.filterActorType}
                  options={orgActorTypeOptions}
                  selected={orgActorTypeFilter}
                  onToggle={(v) => setOrgActorTypeFilter((prev) => toggleInSet(prev, v))}
                  onClear={() => setOrgActorTypeFilter(new Set())}
                  allLabel={t.filterAllLabel}
                  selectedCountTemplate={t.filterSelectedCountTemplate}
                  clearLabel={t.clearAllFilters}
                />
                <MultiSelectFilter
                  label={t.filterFieldOfInterest}
                  options={orgFieldOptions}
                  selected={orgFieldFilter}
                  onToggle={(v) => setOrgFieldFilter((prev) => toggleInSet(prev, v))}
                  onClear={() => setOrgFieldFilter(new Set())}
                  allLabel={t.filterAllLabel}
                  selectedCountTemplate={t.filterSelectedCountTemplate}
                  clearLabel={t.clearAllFilters}
                  searchable
                  searchPlaceholder={t.filterSearchPlaceholder}
                />
                {(orgPartyFilter.size > 0 || orgActorTypeFilter.size > 0 || orgFieldFilter.size > 0) && (
                  <>
                    <span style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)' }}>
                      {filteredOrgs.length} {t.results}
                    </span>
                    <button
                      onClick={() => {
                        setOrgPartyFilter(new Set());
                        setOrgActorTypeFilter(new Set());
                        setOrgFieldFilter(new Set());
                      }}
                      style={{ border: 'none', background: 'none', color: 'oklch(45% 0.16 265)', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, padding: 0 }}
                    >
                      {t.clearAllFilters}
                    </button>
                  </>
                )}
              </div>
              {filteredOrgs.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.orgsNoResults}</p>
              ) : (
                (() => {
                  return (
                    <>
                      <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                          <thead>
                            <tr style={{ background: 'oklch(97% 0.006 260)', textAlign: 'left' }}>
                              <MultiSortableTh label={t.colOrg} sortKey="name" sort={orgsSort} onSort={(k) => setOrgsSort((prev) => toggleMultiSort(prev, k))} />
                              <MultiSortableTh label={t.filterActorType} sortKey="actorType" sort={orgsSort} onSort={(k) => setOrgsSort((prev) => toggleMultiSort(prev, k))} />
                              <MultiSortableTh label={t.orgSpendLabel} sortKey="spend" sort={orgsSort} onSort={(k) => setOrgsSort((prev) => toggleMultiSort(prev, k))} />
                              <MultiSortableTh label={t.colOrgMembers} sortKey="members" sort={orgsSort} onSort={(k) => setOrgsSort((prev) => toggleMultiSort(prev, k))} />
                              <MultiSortableTh label={t.colOrgVotes} sortKey="votes" sort={orgsSort} onSort={(k) => setOrgsSort((prev) => toggleMultiSort(prev, k))} />
                            </tr>
                          </thead>
                          <tbody>
                            {sortedOrgs.slice(0, orgsVisibleCount).map((e) => (
                              <tr key={e.org.id} onClick={stop(() => openOrg(e.org.id))} style={{ cursor: 'pointer', borderTop: '1px solid oklch(93% 0.006 260)' }}>
                                <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                                  <a href={orgHref(e.org.id)} onClick={stop(() => openOrg(e.org.id))} style={{ textDecoration: 'none', color: 'inherit' }}>
                                    {e.org.name}
                                  </a>
                                  {/* The same tie the donations table flags in the other direction:
                                      this organisation lobbies and has also given a reportable
                                      donation to a party. Amount included so it is a fact, not a
                                      hint. */}
                                  {donationTotalByOrgId.has(e.org.id) && (
                                    <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.14 60)' }}>
                                      ⬤ {t.orgDonatedBadge}: {formatEuro(donationTotalByOrgId.get(e.org.id) ?? 0)}
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '10px 14px', color: 'oklch(45% 0.01 260)' }}>{e.org.actorType ?? '—'}</td>
                                <td style={{ padding: '10px 14px', color: 'oklch(45% 0.01 260)' }}>{formatExpenseBracket(e.org.expensesEuro) ?? '—'}</td>
                                <td style={{ padding: '10px 14px' }}>{e.affiliatedMemberCount}</td>
                                <td style={{ padding: '10px 14px' }}>{e.lobbiedPollCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </ScrollBox>
                      {filteredOrgs.length > ORGS_INITIAL_COUNT && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 14 }}>
                          <span style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>
                            {t.orgsShownCountTemplate
                              .replace('{shown}', String(Math.min(orgsVisibleCount, filteredOrgs.length)))
                              .replace('{total}', String(filteredOrgs.length))}
                          </span>
                          {orgsVisibleCount < filteredOrgs.length && (
                            <button
                              onClick={() => setOrgsVisibleCount((n) => n + ORGS_PAGE_SIZE)}
                              style={{ padding: '8px 18px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 20, background: 'white', fontSize: 12.5, fontWeight: 700, color: 'oklch(45% 0.16 265)', cursor: 'pointer' }}
                            >
                              {t.orgsShowMoreTemplate.replace('{n}', String(Math.min(ORGS_PAGE_SIZE, filteredOrgs.length - orgsVisibleCount)))}
                            </button>
                          )}
                          {orgsVisibleCount > ORGS_INITIAL_COUNT && (
                            <button
                              onClick={() => setOrgsVisibleCount(ORGS_INITIAL_COUNT)}
                              style={{ padding: '8px 18px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 20, background: 'white', fontSize: 12.5, fontWeight: 700, color: 'oklch(45% 0.01 260)', cursor: 'pointer' }}
                            >
                              {t.showLess}
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()
              )}
                </>
              )}
            </>
          )}

          {lobbyTab === 'ties' && (
            <>

              {lobbyTiesSubTab === 'direct' && (
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
                    filenameBase="politblick-verflechtungs-matrix"
                    exportLabels={exportLabels}
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
                  {(() => {
                    const baseRows = tieMatrixFilter
                      ? crossref.rows.filter((r) => r.party === tieMatrixFilter.party && r.pollTopic === tieMatrixFilter.topic)
                      : crossref.rows;
                    const conflictValue = (r: (typeof baseRows)[number], key: string): string | number | null => {
                      switch (key) {
                        case 'mp': return r.memberName;
                        case 'org': return r.org.name;
                        case 'bill': return r.pollTitle;
                        case 'vote': return r.conflict.vote;
                        case 'flag': return (r.conflict.againstPosition ? 2 : 0) + (r.conflict.againstFraction ? 1 : 0);
                        default: return null;
                      }
                    };
                    const rows = conflictsSort
                      ? [...baseRows].sort((a, b) => compareSortValues(conflictValue(a, conflictsSort.key), conflictValue(b, conflictsSort.key), conflictsSort.dir))
                      : baseRows;
                    return (
                      <>
                        <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                            <thead>
                              <tr style={{ background: 'oklch(97% 0.006 260)', textAlign: 'left' }}>
                                <SortableTh label={t.colMp} sortKey="mp" sort={conflictsSort} onSort={(k) => setConflictsSort((prev) => toggleSort(prev, k))} />
                                <SortableTh label={t.colOrg} sortKey="org" sort={conflictsSort} onSort={(k) => setConflictsSort((prev) => toggleSort(prev, k))} />
                                <SortableTh label={t.colBill} sortKey="bill" sort={conflictsSort} onSort={(k) => setConflictsSort((prev) => toggleSort(prev, k))} />
                                <SortableTh label={t.colVote} sortKey="vote" sort={conflictsSort} onSort={(k) => setConflictsSort((prev) => toggleSort(prev, k))} />
                                <SortableTh label={t.colFlag} sortKey="flag" sort={conflictsSort} onSort={(k) => setConflictsSort((prev) => toggleSort(prev, k))} />
                              </tr>
                            </thead>
                            <tbody>
                              {rows.slice(0, conflictsExpanded ? rows.length : 10).map((r) => {
                                const label =
                                  r.conflict.vote === 'yes' ? t.voteYes : r.conflict.vote === 'no' ? t.voteNo : t.voteAbstain;
                                return (
                                  <tr
                                    key={`${r.mandateId}-${r.conflict.pollId}-${r.conflict.orgId}`}
                                    onClick={r.politicianId !== null ? stop(() => openMp(String(r.politicianId))) : undefined}
                                    style={{ cursor: r.politicianId !== null ? 'pointer' : 'default', borderTop: '1px solid oklch(93% 0.006 260)' }}
                                  >
                                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                                      {r.politicianId !== null ? (
                                        <a href={mpHref(String(r.politicianId))} onClick={stop(() => openMp(String(r.politicianId!)))} style={{ textDecoration: 'none', color: 'inherit' }}>
                                          {r.memberName}
                                        </a>
                                      ) : (
                                        r.memberName
                                      )}
                                      <div style={{ fontSize: 11.5, fontWeight: 500, color: 'oklch(48% 0.01 260)' }}>{r.party}</div>
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                      <a
                                        href={orgHref(r.org.id)}
                                        onClick={stop(() => openOrg(r.org.id))}
                                        style={{ textDecoration: 'underline', textDecorationColor: 'oklch(85% 0.006 260)', color: 'inherit' }}
                                      >
                                        {r.org.name}
                                      </a>
                                    </td>
                                    <td style={{ padding: '10px 14px', color: 'oklch(45% 0.01 260)' }}>
                                      {r.pollTitle}
                                      {r.conflict.drucksachen.length > 0 && (
                                        <div onClick={(e) => e.stopPropagation()}>
                                          {r.conflict.drucksachen.map((d) => {
                                            const url = drucksacheUrl(d);
                                            return url ? (
                                              <a key={d} href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 600, color: 'oklch(48% 0.12 250)', marginRight: 8 }}>
                                                {t.viewDrucksacheTemplate.replace('{number}', d)}
                                              </a>
                                            ) : null;
                                          })}
                                        </div>
                                      )}
                                    </td>
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
                                        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.14 60)' }}>
                                          ⬤ {r.conflict.vote === 'yes' || r.conflict.vote === 'no' ? t.lobbyAgainstFraction : t.lobbyAbstainedFraction}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </ScrollBox>
                        <ShowMoreButton
                          total={rows.length}
                          defaultCount={10}
                          expanded={conflictsExpanded}
                          onToggle={() => setConflictsExpanded((v) => !v)}
                          showMoreTemplate={t.showMoreTemplate}
                          showLessLabel={t.showLess}
                        />
                      </>
                    );
                  })()}
                </>
              )}
              <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
                {t.lobbyNoPositionNote}
              </p>
                </>
              )}

              {lobbyTiesSubTab === 'topical' && (
                <>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{t.topicalTiesTitle}</h2>
              <p style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', margin: '0 0 14px', maxWidth: 760 }}>{t.topicalTiesSub}</p>
              {topicalTieRows.rows.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.topicalTiesEmpty}</p>
              ) : (
                <>
                  <input
                    type="text"
                    value={topicalSearchQuery}
                    onChange={(e) => setTopicalSearchQuery(e.target.value)}
                    placeholder={t.topicalSearchPlaceholder}
                    style={{ width: '100%', maxWidth: 420, padding: '9px 12px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 9, fontSize: 13.5, marginBottom: 14, boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <MultiSelectFilter
                      label={t.filterParty}
                      options={topicalPartyOptions}
                      selected={topicalPartyFilter}
                      onToggle={(v) => setTopicalPartyFilter((prev) => toggleInSet(prev, v))}
                      onClear={() => setTopicalPartyFilter(new Set())}
                      allLabel={t.filterAllLabel}
                      selectedCountTemplate={t.filterSelectedCountTemplate}
                      clearLabel={t.clearAllFilters}
                    />
                    <MultiSelectFilter
                      label={t.filterFieldOfInterest}
                      options={topicalFieldOptions}
                      selected={topicalFieldFilter}
                      onToggle={(v) => setTopicalFieldFilter((prev) => toggleInSet(prev, v))}
                      onClear={() => setTopicalFieldFilter(new Set())}
                      allLabel={t.filterAllLabel}
                      selectedCountTemplate={t.filterSelectedCountTemplate}
                      clearLabel={t.clearAllFilters}
                      searchable
                      searchPlaceholder={t.filterSearchPlaceholder}
                    />
                    {(topicalPartyFilter.size > 0 || topicalFieldFilter.size > 0 || topicalSearchQuery.trim().length > 0) && (
                      <>
                        <span style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)' }}>
                          {filteredTopicalRows.length} {t.results}
                        </span>
                        <button
                          onClick={() => {
                            setTopicalPartyFilter(new Set());
                            setTopicalFieldFilter(new Set());
                            setTopicalSearchQuery('');
                          }}
                          style={{ border: 'none', background: 'none', color: 'oklch(45% 0.16 265)', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, padding: 0 }}
                        >
                          {t.clearAllFilters}
                        </button>
                      </>
                    )}
                  </div>
                  {filteredTopicalRows.length === 0 ? (
                    <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.topicalNoResults}</p>
                  ) : (
                (() => {
                  const topicalValue = (r: (typeof filteredTopicalRows)[number], key: string): string | number | null => {
                    switch (key) {
                      case 'mp': return r.memberName;
                      case 'org': return r.org.name;
                      case 'field': return r.tie.matchedField;
                      case 'bill': return r.pollTitle;
                      case 'vote': return r.tie.vote;
                      default: return null;
                    }
                  };
                  const sortedTopical = topicalSort
                    ? [...filteredTopicalRows].sort((a, b) => compareSortValues(topicalValue(a, topicalSort.key), topicalValue(b, topicalSort.key), topicalSort.dir))
                    : filteredTopicalRows;
                  return (
                <>
                  <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(88% 0.02 90)', borderRadius: 14 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'oklch(97% 0.008 90)' }}>
                      <thead>
                        <tr style={{ background: 'oklch(94% 0.015 90)', textAlign: 'left' }}>
                          <SortableTh label={t.colMp} sortKey="mp" sort={topicalSort} onSort={(k) => setTopicalSort((prev) => toggleSort(prev, k))} />
                          <SortableTh label={t.colOrg} sortKey="org" sort={topicalSort} onSort={(k) => setTopicalSort((prev) => toggleSort(prev, k))} />
                          <SortableTh label={t.colMatchedField} sortKey="field" sort={topicalSort} onSort={(k) => setTopicalSort((prev) => toggleSort(prev, k))} />
                          <SortableTh label={t.colBill} sortKey="bill" sort={topicalSort} onSort={(k) => setTopicalSort((prev) => toggleSort(prev, k))} />
                          <SortableTh label={t.colVote} sortKey="vote" sort={topicalSort} onSort={(k) => setTopicalSort((prev) => toggleSort(prev, k))} />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTopical.slice(0, topicalExpanded ? sortedTopical.length : 10).map((r) => {
                          const label = r.tie.vote === 'yes' ? t.voteYes : r.tie.vote === 'no' ? t.voteNo : t.voteAbstain;
                          return (
                            <tr
                              key={`${r.mandateId}-${r.tie.pollId}-${r.tie.orgId}`}
                              onClick={r.politicianId !== null ? stop(() => openMp(String(r.politicianId))) : undefined}
                              style={{ cursor: r.politicianId !== null ? 'pointer' : 'default', borderTop: '1px solid oklch(90% 0.015 90)' }}
                            >
                              <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                                {r.politicianId !== null ? (
                                  <a href={mpHref(String(r.politicianId))} onClick={stop(() => openMp(String(r.politicianId!)))} style={{ textDecoration: 'none', color: 'inherit' }}>
                                    {r.memberName}
                                  </a>
                                ) : (
                                  r.memberName
                                )}
                                <div style={{ fontSize: 11.5, fontWeight: 500, color: 'oklch(48% 0.01 260)' }}>{r.party}</div>
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <a
                                  href={orgHref(r.org.id)}
                                  onClick={stop(() => openOrg(r.org.id))}
                                  style={{ textDecoration: 'underline', textDecorationColor: 'oklch(85% 0.02 90)', color: 'inherit' }}
                                >
                                  {r.org.name}
                                </a>
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
                  <ShowMoreButton
                    total={filteredTopicalRows.length}
                    defaultCount={10}
                    expanded={topicalExpanded}
                    onToggle={() => setTopicalExpanded((v) => !v)}
                    showMoreTemplate={t.showMoreTemplate}
                    showLessLabel={t.showLess}
                  />
                </>
                  );
                })()
                  )}
                </>
              )}
              <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
                {t.topicalTieNote}
              </p>
                </>
              )}
            </>
          )}

          {lobbyTab === 'donations' && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{t.donationsTitle}</h2>
              <p style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', margin: '0 0 16px', maxWidth: 700 }}>{t.donationsSub}</p>

              <SubTabBar
                tabs={[
                  { key: 'totals' as const, label: t.lobbyDonationsSubTabTotals },
                  { key: 'timeline' as const, label: t.lobbyDonationsSubTabTimeline },
                  { key: 'topDonors' as const, label: t.lobbyDonationsSubTabTopDonors },
                  { key: 'all' as const, label: t.lobbyDonationsSubTabAll },
                ]}
                active={lobbyDonationsSubTab}
                onChange={setLobbyDonationsSubTab}
              />

              {lobbyDonationsSubTab === 'totals' && (
                <div style={{ background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: '16px 18px' }}>
                  <DonationBarChart data={partyDonations.byFraction} filenameBase="politblick-grossspenden-nach-partei" exportLabels={exportLabels} />
                </div>
              )}

              {lobbyDonationsSubTab === 'timeline' && (
                <>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>{t.donationTimelineTitle}</h3>
              <p style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', margin: '0 0 12px', maxWidth: 700 }}>{t.donationTimelineSub}</p>
              <div>
                <DonationTimeline
                  donations={partyDonations.allCanonical}
                  filenameBase="politblick-grossspenden-alle-parteien"
                  exportLabels={exportLabels}
                  labels={{
                    axisMaxTemplate: t.donationTimelineAxisMaxTemplate,
                    excludedTemplate: t.donationTimelineExcludedTemplate,
                    empty: t.donationTimelineEmpty,
                    quarterTotalLabel: t.donationTimelineQuarterTotalLabel,
                    rangeLabelTemplate: t.donationTimelineRangeLabelTemplate,
                    otherDonorsLabel: t.donationTimelineOtherDonorsLabel,
                  }}
                />
              </div>
                </>
              )}

              {lobbyDonationsSubTab === 'topDonors' && (
                <>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>{t.donationSankeyTitle}</h3>
              <p style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', margin: '0 0 12px', maxWidth: 700 }}>{t.donationSankeySub}</p>
              <div>
                {/* Canonical names: this ranks donors, and four spellings of DVAG would rank as
                    four separate donors — each too small to make the cut. */}
                <DonationSankey
                  donations={partyDonations.allCanonical}
                  fractionTotals={Object.fromEntries(partyDonations.byFraction.map((f) => [f.fraction, f.total]))}
                  onOpenParty={(party) => openParty(party, 'crossref')}
                  isPartyRoutable={(party) => routablePartyNames.has(party)}
                  filenameBase="politblick-spenden-nach-partei-und-spender"
                  exportLabels={exportLabels}
                  labels={{
                    noteTemplate: t.donationSankeyNoteTemplate,
                    excludedTemplate: t.donationSankeyExcludedTemplate,
                    coverageTemplate: t.donationSankeyCoverageTemplate,
                    sliderLabelTemplate: t.donationSankeySliderLabelTemplate,
                    viewParty: t.networkViewParty,
                  }}
                />
              </div>
                </>
              )}

              {lobbyDonationsSubTab === 'all' && (
                <>
              {(() => {
                const donationValue = (d: (typeof partyDonations.all)[number], key: string): string | number | null => {
                  switch (key) {
                    case 'party': return d.fraction;
                    case 'donor': return d.donor;
                    case 'amount': return d.amountEuro;
                    case 'date': return d.receivedOn;
                    case 'donorTotal': return d.donor ? partyDonations.donorTotalFor(d.donor) : null;
                    default: return null;
                  }
                };
                const donationsPartyOptions = countOptions(partyDonations.all.map((d) => d.fraction));
                const donorQueryNorm = donationsDonorQuery.trim().toLowerCase();
                const donorLinks = snapshot?.lobbyLinks.donorLinks ?? {};
                const isRegisteredLobbyist = (d: (typeof partyDonations.all)[number]) => Boolean(d.donor && donorLinks[d.donor]);
                const lobbyistDonationCount = partyDonations.all.filter(isRegisteredLobbyist).length;
                const filteredDonations = partyDonations.all
                  .filter((d) => donationsPartyFilter.size === 0 || donationsPartyFilter.has(d.fraction))
                  .filter((d) => !donorQueryNorm || (d.donor ?? '').toLowerCase().includes(donorQueryNorm))
                  // The badge on individual rows only turns up if you happen to scroll onto one of
                  // them; this makes the overlap something you can actually ask for.
                  .filter((d) => !donationsOnlyLobbyists || isRegisteredLobbyist(d));
                // True multi-key sort: click order is priority order, so "Partei" then "Betrag"
                // groups by party and only uses amount to order rows within a group — clicking
                // Betrag alone still means a single flat sort across every party, same as before.
                const sortedDonations =
                  donationsSort.length > 0
                    ? [...filteredDonations].sort((a, b) => compareMultiSortValues(donationsSort, (key) => [donationValue(a, key), donationValue(b, key)]))
                    : filteredDonations;
                return (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <MultiSelectFilter
                        label={t.filterParty}
                        options={donationsPartyOptions}
                        selected={donationsPartyFilter}
                        onToggle={(v) => setDonationsPartyFilter((prev) => toggleInSet(prev, v))}
                        onClear={() => setDonationsPartyFilter(new Set())}
                        allLabel={t.filterAllLabel}
                        selectedCountTemplate={t.filterSelectedCountTemplate}
                        clearLabel={t.clearAllFilters}
                      />
                      <input
                        type="text"
                        value={donationsDonorQuery}
                        onChange={(e) => setDonationsDonorQuery(e.target.value)}
                        placeholder={t.donorSearchPlaceholder}
                        style={{ padding: '8px 12px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 20, fontSize: 12.5, minWidth: 200, boxSizing: 'border-box' }}
                      />
                      <button
                        onClick={() => setDonationsOnlyLobbyists((v) => !v)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 20,
                          border: `1px solid ${donationsOnlyLobbyists ? 'oklch(48% 0.14 60)' : 'oklch(85% 0.006 260)'}`,
                          background: donationsOnlyLobbyists ? 'oklch(96% 0.05 60)' : 'white',
                          color: donationsOnlyLobbyists ? 'oklch(42% 0.14 60)' : 'oklch(35% 0.01 260)',
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        ⬤ {t.donationsOnlyLobbyistsLabel} ({lobbyistDonationCount})
                      </button>
                      {(donationsPartyFilter.size > 0 || donorQueryNorm || donationsOnlyLobbyists) && (
                        <span style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)' }}>
                          {sortedDonations.length} {t.results}
                        </span>
                      )}
                    </div>
                    <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                        <thead>
                          <tr style={{ background: 'oklch(97% 0.006 260)', textAlign: 'left' }}>
                            <MultiSortableTh label={t.donationsColParty} sortKey="party" sort={donationsSort} onSort={(k) => setDonationsSort((prev) => toggleMultiSort(prev, k))} />
                            <MultiSortableTh label={t.donationsColDonor} sortKey="donor" sort={donationsSort} onSort={(k) => setDonationsSort((prev) => toggleMultiSort(prev, k))} />
                            <MultiSortableTh label={t.donationsColAmount} sortKey="amount" sort={donationsSort} onSort={(k) => setDonationsSort((prev) => toggleMultiSort(prev, k))} />
                            <MultiSortableTh label={t.donationsColDonorTotalAll} sortKey="donorTotal" sort={donationsSort} onSort={(k) => setDonationsSort((prev) => toggleMultiSort(prev, k))} />
                            <MultiSortableTh label={t.donationsColDate} sortKey="date" sort={donationsSort} onSort={(k) => setDonationsSort((prev) => toggleMultiSort(prev, k))} />
                          </tr>
                        </thead>
                        <tbody>
                          {sortedDonations.slice(0, donationsExpanded ? sortedDonations.length : 10).map((d, i) => {
                            const lobbyOrgId = d.donor ? snapshot?.lobbyLinks.donorLinks[d.donor] : undefined;
                            const lobbyOrg = lobbyOrgId ? snapshot?.lobbyLinks.orgs[lobbyOrgId] : undefined;
                            const donorTotal = d.donor ? (partyDonations.donorTotalFor(d.donor) || d.amountEuro) : d.amountEuro;
                            const isRepeatDonor = donorTotal > d.amountEuro;
                            return (
                              <tr key={`${d.publishedOn}-${d.donor}-${d.party}-${i}`} style={{ borderTop: '1px solid oklch(93% 0.006 260)' }}>
                                <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                                  {d.fraction}
                                  {d.fraction !== d.party && <span style={{ display: 'block', fontWeight: 400, fontSize: 11, color: 'oklch(55% 0.01 260)' }}>{d.party}</span>}
                                </td>
                                <td style={{ padding: '10px 14px' }}>
                                  {d.donor}
                                  {d.donorCity && <span style={{ color: 'oklch(55% 0.01 260)' }}> · {d.donorCity}</span>}
                                  {lobbyOrg && (
                                    <a
                                      href={orgHref(lobbyOrg.id)}
                                      onClick={stop(() => openOrg(lobbyOrg.id))}
                                      style={{ cursor: 'pointer', fontSize: 11.5, color: 'oklch(48% 0.14 60)', fontWeight: 600, textDecoration: 'none', display: 'block' }}
                                    >
                                      ⬤ {lobbyOrg.active ? t.donationsAlsoLobbyist : t.donationsAlsoLobbyistFormer}
                                    </a>
                                  )}
                                </td>
                                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{formatEuro(d.amountEuro)}</td>
                                <td style={{ padding: '10px 14px', fontWeight: isRepeatDonor ? 700 : 400, color: isRepeatDonor ? 'oklch(48% 0.14 60)' : 'oklch(55% 0.01 260)' }}>
                                  {formatEuro(donorTotal)}
                                </td>
                                <td style={{ padding: '10px 14px' }}>
                                  <a
                                    href={d.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={t.partyDonationSourceTemplate.replace('{year}', String(d.year))}
                                    style={{ color: 'oklch(45% 0.01 260)' }}
                                  >
                                    {d.receivedOn}
                                  </a>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </ScrollBox>
                    <ShowMoreButton
                      total={sortedDonations.length}
                      defaultCount={10}
                      expanded={donationsExpanded}
                      onToggle={() => setDonationsExpanded((v) => !v)}
                      showMoreTemplate={t.showMoreTemplate}
                      showLessLabel={t.showLess}
                    />
                  </>
                );
              })()}
              <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 10 }}>{t.donationsSource}</p>
                </>
              )}
            </>
          )}
        </main>
      )}

      {view === 'org' && (
        <main style={{ flex: 1, maxWidth: 900, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href={crossrefHref()} onClick={stop(() => goBack(goCrossref))} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
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

              {/* The entry has ended. Said plainly here because every figure below — spend, staff,
                  fields of interest — is the entry as it last stood, not a current declaration. */}
              {orgDetail.org.active === false && (
                <p style={{ fontSize: 12.5, color: 'oklch(42% 0.09 60)', lineHeight: 1.55, background: 'oklch(96% 0.04 60)', border: '1px solid oklch(86% 0.08 60)', borderRadius: 12, padding: '12px 14px', marginBottom: 22, maxWidth: 720 }}>
                  {t.orgInactiveNote}
                </p>
              )}

              {/* Reached from the widened list: an organisation the snapshot never carried. Saying
                  so beats an unexplained page of empty tie sections, which reads like missing data
                  rather than the finding it actually is. */}
              {selectedOrgId !== null && !snapshot?.lobbyLinks.orgs[selectedOrgId] && (
                <p style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', lineHeight: 1.55, background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: '12px 14px', marginBottom: 22, maxWidth: 720 }}>
                  {t.orgDirectoryOnlyNote}
                </p>
              )}

              {orgDetail.org.description && (
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{t.orgDescriptionLabel}</div>
                  <p
                    style={{
                      fontSize: 13.5,
                      lineHeight: 1.55,
                      color: 'oklch(38% 0.01 260)',
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                    }}
                  >
                    {orgDescExpanded ? orgDetail.org.description : firstParagraph(orgDetail.org.description)}
                  </p>
                  {firstParagraph(orgDetail.org.description) !== orgDetail.org.description && (
                    <button
                      onClick={() => setOrgDescExpanded((v) => !v)}
                      style={{
                        marginTop: 6,
                        padding: 0,
                        border: 'none',
                        background: 'none',
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: 'oklch(45% 0.16 265)',
                        cursor: 'pointer',
                      }}
                    >
                      {orgDescExpanded ? t.showLess : t.showMoreText}
                    </button>
                  )}
                </div>
              )}

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
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                    {orgDetail.affiliatedMembers.slice(0, orgMembersShown).map((a) => (
                      <a
                        key={a.member.id}
                        href={mpHref(String(a.member.id))}
                        onClick={stop(() => openMp(String(a.member.id)))}
                        style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit', display: 'block', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.member.color, flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{a.member.name}</span>
                          <span style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>{a.member.party}</span>
                        </div>
                        {a.roles.length > 0 && <div style={{ fontSize: 12.5, color: 'oklch(42% 0.01 260)', marginTop: 4 }}>{a.roles.join(' · ')}</div>}
                      </a>
                    ))}
                  </div>
                  {orgMembersShown < orgDetail.affiliatedMembers.length ? (
                    <button
                      onClick={() => setOrgMembersShown((v) => Math.min(v + 10, orgDetail.affiliatedMembers.length))}
                      style={{
                        display: 'block',
                        margin: '0 auto 26px',
                        padding: '8px 18px',
                        border: '1px solid oklch(85% 0.006 260)',
                        borderRadius: 20,
                        background: 'white',
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: 'oklch(45% 0.16 265)',
                        cursor: 'pointer',
                      }}
                    >
                      {t.showMoreText}
                    </button>
                  ) : (
                    orgDetail.affiliatedMembers.length > 5 && (
                      <button
                        onClick={() => setOrgMembersShown(5)}
                        style={{
                          display: 'block',
                          margin: '0 auto 26px',
                          padding: '8px 18px',
                          border: '1px solid oklch(85% 0.006 260)',
                          borderRadius: 20,
                          background: 'white',
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: 'oklch(45% 0.16 265)',
                          cursor: 'pointer',
                        }}
                      >
                        {t.showLess}
                      </button>
                    )
                  )}
                </>
              )}

              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{t.orgLobbiedBillsTitle}</h2>
              {orgDetail.lobbiedPolls.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)', marginBottom: 26 }}>{t.orgNoLobbiedBills}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26 }}>
                  {orgDetail.lobbiedPolls.map((p) => (
                    <div
                      key={p.pollId}
                      onClick={stop(() => openBill(p.pollId))}
                      style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <a href={billHref(p.pollId)} onClick={stop(() => openBill(p.pollId))} style={{ fontWeight: 600, fontSize: 14, textDecoration: 'none', color: 'inherit' }}>
                          {p.pollTitle}
                        </a>
                        <span style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', flexShrink: 0 }}>{p.pollDate}</span>
                      </div>
                      {p.demands.length > 0 && (
                        <div style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', marginTop: 5, fontStyle: 'italic' }}>„{p.demands[0]}“</div>
                      )}
                      {p.drucksachen.length > 0 && (
                        <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                          {p.drucksachen.map((d) => {
                            const url = drucksacheUrl(d);
                            return url ? (
                              <a key={d} href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.12 250)', marginRight: 10 }}>
                                {t.viewDrucksacheTemplate.replace('{number}', d)}
                              </a>
                            ) : null;
                          })}
                        </div>
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
                          onClick={c.politicianId !== null ? stop(() => openMp(String(c.politicianId))) : undefined}
                          style={{ cursor: c.politicianId !== null ? 'pointer' : 'default', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                            {c.politicianId !== null ? (
                              <a href={mpHref(String(c.politicianId))} onClick={stop(() => openMp(String(c.politicianId!)))} style={{ fontWeight: 600, fontSize: 14, textDecoration: 'none', color: 'inherit' }}>
                                {c.memberName}
                              </a>
                            ) : (
                              <span style={{ fontWeight: 600, fontSize: 14 }}>{c.memberName}</span>
                            )}
                            <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: voteBg[c.vote], color: 'white', flexShrink: 0 }}>
                              {label}
                            </span>
                          </div>
                          <div style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', marginTop: 4 }}>{c.pollTitle}</div>
                          {c.drucksachen.length > 0 && (
                            <div style={{ marginTop: 5 }} onClick={(e) => e.stopPropagation()}>
                              {c.drucksachen.map((d) => {
                                const url = drucksacheUrl(d);
                                return url ? (
                                  <a key={d} href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.12 250)', marginRight: 10 }}>
                                    {t.viewDrucksacheTemplate.replace('{number}', d)}
                                  </a>
                                ) : null;
                              })}
                            </div>
                          )}
                          {c.againstPosition && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.16 40)', marginTop: 6 }}>⬤ {t.lobbyAgainstPosition}</div>}
                          {c.againstFraction && (
                            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.14 60)', marginTop: 6 }}>
                              ⬤ {c.vote === 'yes' || c.vote === 'no' ? t.lobbyAgainstFraction : t.lobbyAbstainedFraction}
                            </div>
                          )}
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
                        <a
                          key={`${tie.mandateId}-${tie.pollId}`}
                          href={tie.politicianId !== null ? mpHref(String(tie.politicianId)) : undefined}
                          onClick={tie.politicianId !== null ? stop(() => openMp(String(tie.politicianId))) : undefined}
                          style={{
                            cursor: tie.politicianId !== null ? 'pointer' : 'default',
                            textDecoration: 'none',
                            color: 'inherit',
                            display: 'block',
                            background: 'oklch(97% 0.008 90)',
                            border: '1px solid oklch(90% 0.015 90)',
                            borderRadius: 10,
                            padding: '12px 16px',
                          }}
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
                        </a>
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

      {view === 'committeeList' && (
        <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>{t.committeesTitle}</h1>
          <p style={{ fontSize: 14, color: 'oklch(45% 0.01 260)', margin: '0 0 20px', maxWidth: 640 }}>{t.committeesSub}</p>

          {committeeList.entries.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.committeesEmpty}</p>
          ) : (
            <>
              <input
                type="text"
                value={committeeListSearch}
                onChange={(e) => setCommitteeListSearch(e.target.value)}
                placeholder={t.committeeListSearchPlaceholder}
                style={{ width: '100%', maxWidth: 340, padding: '9px 12px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 9, fontSize: 13.5, marginBottom: 20, boxSizing: 'border-box' }}
              />
              {(() => {
                const filtered = committeeList.entries.filter(({ committee }) => fuzzyMatch(committeeListSearch, `${committee.name} ${committee.topics.join(' ')}`));
                if (filtered.length === 0) return <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.searchNoResults}</p>;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
                    {filtered.map(({ committee, memberCount }) => (
                      <a
                        key={committee.id}
                        href={committeeHref(String(committee.id))}
                        onClick={stop(() => openCommittee(String(committee.id)))}
                        style={{
                          position: 'relative',
                          cursor: 'pointer',
                          textDecoration: 'none',
                          color: 'inherit',
                          display: 'block',
                          background: 'white',
                          border: '1px solid oklch(90% 0.006 260)',
                          borderRadius: 12,
                          padding: '14px 16px',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, paddingRight: 32 }}>{committee.name}</div>
                        <div style={{ fontSize: 12, color: 'oklch(50% 0.01 260)', marginBottom: 8 }}>
                          {memberCount} {t.committeeMembersCountLabel}
                        </div>
                        {committee.topics.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {committee.topics.map((f) => (
                              <span key={f} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'oklch(95% 0.008 260)', color: 'oklch(40% 0.01 260)' }}>
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                        {(() => {
                          const icon = committeeIcon(committee.id);
                          return <img src={icon.icon} alt={icon.alt} title={icon.alt} width={24} height={24} style={{ position: 'absolute', top: 14, right: 14, opacity: 0.55 }} />;
                        })()}
                      </a>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </main>
      )}

      {view === 'pollList' && (
        <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>{t.navPolls}</h1>
          <p style={{ fontSize: 14, color: 'oklch(45% 0.01 260)', margin: '0 0 28px', maxWidth: 640 }}>{t.pollListSub}</p>

          {allPollResults.error ? (
            <p style={{ fontSize: 13.5, color: 'oklch(48% 0.16 40)' }}>{t.pollsError}</p>
          ) : allPollResults.loading && allPollResults.results.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.pollsLoading}</p>
          ) : allPollResults.results.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.noPollsThisWeek}</p>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: 'oklch(90% 0.006 260)', borderRadius: 1 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32, paddingLeft: 28 }}>
              {pollWeekGroups.map((group) => (
                <div key={group.range.start.toISOString()} style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: -28, top: 2, width: 12, height: 12, borderRadius: '50%', background: 'white', border: '2px solid oklch(45% 0.16 265)' }} />
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: 'oklch(48% 0.01 260)', margin: '0 0 12px' }}>
                    {t.weekOf} {formatWeekRange(group.range, lang)}
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 16 }}>
                    {group.results.map((r) => (
                      <a
                        key={r.poll.id}
                        href={billHref(r.poll.id)}
                        onClick={stop(() => openBill(r.poll.id))}
                        style={{
                          cursor: 'pointer',
                          textDecoration: 'none',
                          color: 'inherit',
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
                            {r.poll.topic}
                          </span>
                          <span style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)' }}>{r.poll.date}</span>
                        </div>
                        <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.3 }}>{r.poll.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: 'oklch(93% 0.006 260)' }}>
                            <div style={{ width: `${r.yesPct}%`, background: 'oklch(50% 0.14 155)' }} />
                            <div style={{ width: `${100 - r.yesPct}%`, background: 'oklch(55% 0.16 40)' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'oklch(48% 0.01 260)', whiteSpace: 'nowrap' }}>
                            {r.yesPct}% {t.voteYes}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: r.poll.accepted ? 'oklch(45% 0.14 155)' : 'oklch(48% 0.16 40)' }}>
                          {r.poll.accepted ? t.pollAccepted : t.pollRejected}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}
        </main>
      )}

      {view === 'committee' && (
        <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href={committeeListHref} onClick={stop(() => goBack(goCommitteeList))} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToCommittees}
          </a>
          {!committeeDetail.detail ? (
            <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)', marginTop: 20 }}>{t.committeeNotFound}</p>
          ) : (
            <>
              <h1 style={{ fontSize: 26, fontWeight: 800, margin: '20px 0 12px' }}>{committeeDetail.detail.committee.name}</h1>

              {committeeDetail.detail.committee.url && (
                <a href={committeeDetail.detail.committee.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(48% 0.12 250)', display: 'inline-block', marginBottom: 14 }}>
                  {t.viewSource} →
                </a>
              )}

              {committeeDetail.detail.committee.topics.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 22 }}>
                  {committeeDetail.detail.committee.topics.map((f) => (
                    <span key={f} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 10, background: 'oklch(95% 0.008 260)', color: 'oklch(40% 0.01 260)' }}>
                      {f}
                    </span>
                  ))}
                </div>
              )}

              {committeeLobby.ties.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{t.committeeLobbyTitle}</h2>
                  <p style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)', margin: '0 0 14px', maxWidth: 640 }}>{t.committeeLobbySub}</p>
                  <div style={{ background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: '16px 18px' }}>
                    <OrgInfluenceBarChart
                      data={committeeLobby.ties}
                      orgHref={orgHref}
                      onSelectOrg={openOrg}
                      membersTemplate={t.sectorChartMembersTemplate}
                      filenameBase={`politblick-ausschuss-verflechtungen-${committeeDetail.detail.committee.id}`}
                      exportLabels={exportLabels}
                    />
                  </div>
                </div>
              )}

              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>
                {committeeDetail.detail.members.length} {t.committeeMembersCountLabel}
              </h2>
              <input
                type="text"
                value={committeeMemberSearch}
                onChange={(e) => setCommitteeMemberSearch(e.target.value)}
                placeholder={t.committeeMemberSearchPlaceholder}
                style={{ width: '100%', maxWidth: 340, padding: '8px 11px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 9, fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
              />
              {filteredCommitteeMembers.length === 0 ? (
                <p style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>{t.searchNoResults}</p>
              ) : (
              <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 12 }}>
                {filteredCommitteeMembers.slice(0, committeeMembersExpanded ? filteredCommitteeMembers.length : 12).map((row) => {
                  const roleLabel =
                    row.role === 'chairperson' || row.role === 'foreperson' ? t.committeeRoleChair
                    : row.role === 'vice_chairperson' ? t.committeeRoleViceChair
                    : row.role === 'spokesperson' ? t.committeeRoleSpokesperson
                    : row.role === 'alternate_member' ? t.committeeRoleAlternate
                    : null;
                  return (
                    <a
                      key={row.mandateId}
                      href={row.member ? mpHref(String(row.member.id)) : undefined}
                      onClick={row.member ? stop(() => openMp(String(row.member!.id))) : undefined}
                      style={{
                        cursor: row.member ? 'pointer' : 'default',
                        textDecoration: 'none',
                        color: 'inherit',
                        display: 'block',
                        background: 'white',
                        border: '1px solid oklch(90% 0.006 260)',
                        borderRadius: 10,
                        padding: '12px 16px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {row.member && <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.member.color, flexShrink: 0 }} />}
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{row.member?.name ?? `#${row.mandateId}`}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                        <span style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>{row.member?.party}</span>
                        {roleLabel && (
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 8,
                              background: 'oklch(93% 0.06 75)',
                              color: 'oklch(40% 0.13 70)',
                            }}
                          >
                            {roleLabel}
                          </span>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>
              <ShowMoreButton
                total={filteredCommitteeMembers.length}
                defaultCount={12}
                expanded={committeeMembersExpanded}
                onToggle={() => setCommitteeMembersExpanded((v) => !v)}
                showMoreTemplate={t.showMoreTemplate}
                showLessLabel={t.showLess}
              />
              </>
              )}
            </>
          )}
        </main>
      )}

      {view === 'partyList' && (
        <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>{t.navParties}</h1>
          <p style={{ fontSize: 14, color: 'oklch(45% 0.01 260)', margin: '0 0 28px', maxWidth: 640 }}>{t.partyListSub}</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
            {/* Only fractions with a party detail page (see the `!p` guard below) are listed here —
                "Fraktionslos" is a bucket of independents, not a fraction with ties/votes of its own. */}
            {partyLobby.summaries
              .map((lobby) => ({ lobby, roster: roster.parties.find((p) => p.name === lobby.party) }))
              .sort((a, b) => (b.roster?.seats ?? 0) - (a.roster?.seats ?? 0))
              .map(({ lobby, roster: rp }) => {
                const donationSum = partyDonations.byFraction.find((f) => f.fraction === lobby.party)?.total;
                return (
                  <a
                    key={lobby.party}
                    href={partyHref(lobby.party)}
                    onClick={stop(() => openParty(lobby.party, 'partyList'))}
                    style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit', display: 'block', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: '14px 16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: rp?.color ?? REAL_PARTY_COLORS[lobby.party] ?? FALLBACK_PARTY_COLOR, flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{lobby.party}</span>
                    </div>
                    {rp && (
                      <div style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', marginBottom: 4 }}>
                        {rp.seats} {t.seatsLabel}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'oklch(50% 0.01 260)', marginBottom: 4 }}>
                      {t.partyLobbyOrgCountTemplate.replace('{n}', String(lobby.orgCount))}
                    </div>
                    {donationSum != null && (
                      <div style={{ fontSize: 12, color: 'oklch(50% 0.01 260)' }}>
                        {t.statDonationsSumLabel}: {formatEuro(donationSum)}
                      </div>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'oklch(48% 0.12 250)', display: 'inline-block', marginTop: 8 }}>{t.seeAll} →</span>
                  </a>
                );
              })}
          </div>
        </main>
      )}

      {view === 'party' && (
        <main style={{ flex: 1, maxWidth: 900, margin: '0 auto', width: '100%', padding: 32 }}>
          <a
            href={partyOrigin === 'crossref' ? crossrefHref('ties') : partyListHref}
            onClick={stop(() => goBack(() => (partyOrigin === 'crossref' ? goCrossref('ties') : goPartyList())))}
            style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}
          >
            ← {partyOrigin === 'crossref' ? t.backToLobbyFinance : t.backToParties}
          </a>
          {(() => {
            const p = partyLobby.summaries.find((s) => s.party === selectedParty);
            if (!p) return <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)', marginTop: 20 }}>{t.partyNotFound}</p>;
            const partyCrossrefRows = crossref.rows.filter((r) => r.party === p.party);
            const partyTopicalRows = topicalTieRows.rows.filter((r) => r.party === p.party);
            const partyTopicalFieldOptions = countOptions(partyTopicalRows.map((r) => r.tie.matchedField));
            const partyTopicalSearchLower = partyTopicalSearchQuery.trim().toLowerCase();
            const filteredPartyTopicalRows = partyTopicalRows.filter((r) => {
              if (partyTopicalFieldFilter.size > 0 && !partyTopicalFieldFilter.has(r.tie.matchedField)) return false;
              if (partyTopicalSearchLower && !r.memberName.toLowerCase().includes(partyTopicalSearchLower) && !r.org.name.toLowerCase().includes(partyTopicalSearchLower) && !r.pollTitle.toLowerCase().includes(partyTopicalSearchLower))
                return false;
              return true;
            });
            const partyDonationSummary = partyDonations.byFraction.find((f) => f.fraction === p.party);
            const partyDonationList = partyDonations.all.filter((d) => d.fraction === p.party);
            // The table shows each donation under the name it was published with; the timeline
            // stacks BY donor, so it needs the spellings reconciled first.
            const partyDonationListCanonical = partyDonations.allCanonical.filter((d) => d.fraction === p.party);

            const partyTabs: { key: PartyTab; label: string }[] = [
              { key: 'overview', label: t.tabOverview },
              { key: 'votes', label: t.tabVotes },
              { key: 'ties', label: t.tabLobby },
              { key: 'donations', label: t.partyTabDonations },
            ];

            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 20px' }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: REAL_PARTY_COLORS[p.party] || FALLBACK_PARTY_COLOR, flexShrink: 0 }} />
                  <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>{p.party}</h1>
                </div>

                <SubTabBar tabs={partyTabs} active={partyTab} onChange={setPartyTab} />

                {partyTab === 'overview' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 26 }}>
                      <div
                        onClick={() => viewPartyMembers(p.party)}
                        style={{ cursor: 'pointer', background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}
                      >
                        <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.seatsLabel}</div>
                        <div style={{ fontSize: 24, fontWeight: 800 }}>{roster.parties.find((rp) => rp.name === p.party)?.seats ?? '—'}</div>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'oklch(48% 0.12 250)', marginTop: 4 }}>{t.partyViewMembers} →</div>
                      </div>
                      <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.orgsSectionTitle}</div>
                        <div style={{ fontSize: 24, fontWeight: 800 }}>{p.orgCount}</div>
                      </div>
                      <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.colOrgMembers}</div>
                        <div style={{ fontSize: 24, fontWeight: 800 }}>{p.memberCount}</div>
                      </div>
                      <div
                        onClick={() => setPartyTab('donations')}
                        style={{ cursor: 'pointer', background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}
                      >
                        <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statDonationsSumLabel}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap' }}>
                          {partyDonationSummary ? formatEuro(partyDonationSummary.total) : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Overview stays an overview: the headline number plus a way through to the
                        detail, which lives at the top of the Abstimmungen tab where the votes it
                        describes already are. */}
                    {!partyDissent.error && partyDissent.ratedCount > 0 && (
                      <div style={{ background: 'oklch(97% 0.006 260)', border: '1px solid oklch(90% 0.008 260)', borderRadius: 12, padding: 16, marginBottom: 22 }}>
                        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 2px' }}>
                          {t.partyDissentTitle}
                          <InfoTooltip text={t.partyDissentInfo} />
                        </h2>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'oklch(32% 0.01 260)', marginTop: 6 }}>
                          {t.partyCohesion
                            .replace('{pct}', partyDissent.cohesionPct == null ? '—' : formatPct(partyDissent.cohesionPct))
                            .replace('{total}', partyDissent.ratedCount.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US'))}
                        </div>
                        <div style={{ fontSize: 12, color: 'oklch(50% 0.01 260)', marginTop: 3 }}>
                          {t.partyDissentSummary
                            .replace('{divided}', String(partyDissent.dividedVotes.length))
                            .replace('{total}', String(partyDissent.pollCount))}
                        </div>
                        {/* Enough to be worth reading on its own — the three sharpest splits and
                            who turns up most — without reproducing the full section that lives on
                            the Abstimmungen tab. */}
                        {partyDissent.dividedVotes.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: '12px 0 4px' }}>
                            {partyDissent.dividedVotes.slice(0, 3).map((v) => (
                              <div key={`${v.pollId}-${v.date}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, flexWrap: 'wrap' }}>
                                <span style={{ color: 'oklch(32% 0.01 260)' }}>{v.title}</span>
                                <span style={{ color: 'oklch(48% 0.01 260)', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                  {t.partyDividedTemplate
                                    .replace('{count}', String(v.deviators))
                                    .replace('{total}', String(v.rated))
                                    .replace('{pct}', formatPct(v.sharePct))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {partyDissent.topDeviators.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                            {partyDissent.topDeviators.slice(0, 5).map((d) => (
                              <a
                                key={d.politicianId}
                                href={mpHref(String(d.politicianId))}
                                onClick={stop(() => openMp(String(d.politicianId)))}
                                style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 10, background: 'white', border: '1px solid oklch(90% 0.006 260)', color: 'oklch(35% 0.01 260)', textDecoration: 'none' }}
                              >
                                {d.name} · {d.count}
                              </a>
                            ))}
                          </div>
                        )}
                        {partyDissent.dividedVotes.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPartyTab('votes');
                              setPartyDissentExpanded(true);
                            }}
                            style={{ marginTop: 10, padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: 'oklch(48% 0.12 250)' }}
                          >
                            {t.partyDissentSeeVotes}
                          </button>
                        )}
                      </div>
                    )}

                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>{t.partyDetailFieldsTitle}</h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {p.byField.map((f) => (
                        <span key={f.field} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 10, background: 'oklch(95% 0.008 260)', color: 'oklch(40% 0.01 260)' }}>
                          {f.field} ({f.orgCount})
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {partyTab === 'votes' && (
                  <>
                    {/* The full section, shown outright rather than behind a toggle: on this tab
                        it is the substance, not an extra. The trailing control only widens the
                        vote list beyond the first handful. */}
                    {!partyDissent.error && partyDissent.dividedVotes.length > 0 && (
                      <div style={{ background: 'oklch(97% 0.006 260)', border: '1px solid oklch(90% 0.008 260)', borderRadius: 12, padding: 18, marginBottom: 22 }}>
                        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 2px' }}>
                          {t.partyDissentTitle}
                          <InfoTooltip text={t.partyDissentInfo} />
                        </h2>
                        <p style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)', margin: '0 0 10px' }}>
                          {t.partyDissentSub.replace('{year}', historyCoverageLabel)}
                        </p>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'oklch(32% 0.01 260)', marginBottom: 14 }}>
                          {t.partyCohesion
                            .replace('{pct}', partyDissent.cohesionPct == null ? '—' : formatPct(partyDissent.cohesionPct))
                            .replace('{total}', partyDissent.ratedCount.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US'))}
                        </div>

                        <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(38% 0.01 260)', marginBottom: 6 }}>{t.partyDividedTitle}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                          {partyDissent.dividedVotes.slice(0, partyDissentExpanded ? 10 : 3).map((v) => {
                            const key = `${v.pollId}-${v.date}`;
                            const open = openDividedVotes.has(key);
                            const majorityLabel =
                              v.majority === 'yes' ? t.voteYes : v.majority === 'no' ? t.voteNo : t.voteAbstain;
                            return (
                              // A row, not a link: clicking used to throw the reader off the site
                              // mid-thought. It opens the fraction's actual tally in place, and the
                              // trip to abgeordnetenwatch is its own explicit link below.
                              <div
                                key={key}
                                style={{ background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '10px 14px' }}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenDividedVotes((current) => {
                                      const next = new Set(current);
                                      if (next.has(key)) next.delete(key);
                                      else next.add(key);
                                      return next;
                                    })
                                  }
                                  aria-expanded={open}
                                  style={{ width: '100%', textAlign: 'left', padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                                      {open ? '▾' : '▸'} {v.title}
                                    </span>
                                    <span style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', color: 'oklch(38% 0.01 260)' }}>
                                      {t.partyDividedTemplate
                                        .replace('{count}', String(v.deviators))
                                        .replace('{total}', String(v.rated))
                                        .replace('{pct}', formatPct(v.sharePct))}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 3 }}>
                                    {v.date} · {v.termLabel}
                                  </div>
                                </button>
                                {open && (
                                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid oklch(93% 0.006 260)' }}>
                                    {/* The share alone says how split the fraction was but not which
                                        way it went — this is the line the deviators departed from. */}
                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'oklch(32% 0.01 260)' }}>
                                      {t.partyVoteLine.replace('{majority}', majorityLabel)}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'oklch(45% 0.01 260)', marginTop: 3 }}>
                                      {t.partyVoteTally
                                        .replace('{yes}', String(v.yes))
                                        .replace('{no}', String(v.no))
                                        .replace('{abstain}', String(v.abstain))}
                                      {v.noShow > 0 ? ` · ${t.partyVoteNoShow.replace('{count}', String(v.noShow))}` : ''}
                                    </div>
                                    {v.topics.length > 0 && (
                                      <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 4 }}>{v.topics.join(', ')}</div>
                                    )}
                                    {/* The names are the point. On a one-member divergence the
                                        whole story is who it was; on a large split they are what
                                        let a reader recognise the same people recurring. Each
                                        carries how they voted, since a fraction that splits
                                        102/113 has deviators on only one side of the line. */}
                                    {v.deviatorList.length > 0 && (
                                      <>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(38% 0.01 260)', margin: '10px 0 5px' }}>
                                          {t.partyDeviatorsOnVote}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                          {v.deviatorList.slice(0, fullDeviatorLists.has(key) ? v.deviatorList.length : 20).map((d) => (
                                            <a
                                              key={d.politicianId}
                                              href={mpHref(String(d.politicianId))}
                                              onClick={stop(() => openMp(String(d.politicianId)))}
                                              style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 10, background: 'oklch(97% 0.006 260)', border: '1px solid oklch(90% 0.006 260)', color: 'oklch(35% 0.01 260)', textDecoration: 'none' }}
                                            >
                                              {d.name} · {d.vote === 'yes' ? t.voteYes : d.vote === 'no' ? t.voteNo : t.voteAbstain}
                                            </a>
                                          ))}
                                          {/* The cut-off names are not decoration — on a 91-way
                                              split the reader may be looking for one particular
                                              person, and "+71 weitere" hid exactly the ones they
                                              could not already see. */}
                                          {v.deviatorList.length > 20 && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setFullDeviatorLists((current) => {
                                                  const next = new Set(current);
                                                  if (next.has(key)) next.delete(key);
                                                  else next.add(key);
                                                  return next;
                                                })
                                              }
                                              style={{ fontSize: 11.5, padding: '3px 9px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'oklch(48% 0.12 250)' }}
                                            >
                                              {fullDeviatorLists.has(key)
                                                ? t.showLess
                                                : t.partyDeviatorsMore.replace('{count}', String(v.deviatorList.length - 20))}
                                            </button>
                                          )}
                                        </div>
                                      </>
                                    )}
                                    <a
                                      href={v.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: 'oklch(48% 0.12 250)' }}
                                    >
                                      {t.viewSource} →
                                    </a>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {partyDissent.topDeviators.length > 0 && (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(38% 0.01 260)', marginBottom: 6 }}>{t.partyDeviatorsTitle}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {partyDissent.topDeviators.map((d) => (
                                <a
                                  key={d.politicianId}
                                  href={mpHref(String(d.politicianId))}
                                  onClick={stop(() => openMp(String(d.politicianId)))}
                                  style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 10, background: 'white', border: '1px solid oklch(90% 0.006 260)', color: 'oklch(35% 0.01 260)', textDecoration: 'none' }}
                                >
                                  {d.name} · {t.partyDeviatorTemplate.replace('{count}', String(d.count))}
                                </a>
                              ))}
                            </div>
                          </>
                        )}

                        {partyDissent.dividedVotes.length > 3 && (
                          <button
                            type="button"
                            onClick={() => setPartyDissentExpanded((v) => !v)}
                            style={{ marginTop: 14, padding: 0, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: 'oklch(48% 0.12 250)' }}
                          >
                            {partyDissentExpanded
                              ? t.partyHideDetail
                              : t.partyShowDetail.replace('{count}', String(partyDissent.dividedVotes.length))}
                          </button>
                        )}
                      </div>
                    )}
                    {partyVotes.loading && partyVotes.votes.length === 0 ? (
                      <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.pollsLoading}</p>
                    ) : partyVotes.error ? (
                      <p style={{ fontSize: 13.5, color: 'oklch(48% 0.16 40)' }}>{t.pollsError}</p>
                    ) : partyVotes.votes.length === 0 ? (
                      <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.partyVotesEmpty}</p>
                    ) : (
                      <>
                        <div style={{ position: 'relative' }}>
                          <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: 'oklch(90% 0.006 260)', borderRadius: 1 }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 26, paddingLeft: 28 }}>
                            {partyVoteWeeks.map((group) => (
                              <div key={group.range.start.toISOString()} style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', left: -28, top: 2, width: 12, height: 12, borderRadius: '50%', background: 'white', border: '2px solid oklch(45% 0.16 265)' }} />
                                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'oklch(48% 0.01 260)', margin: '0 0 12px' }}>
                                  {t.weekOf} {formatWeekRange(group.range, lang)}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {group.votes.map(({ poll, tally }) => {
                            const majorityLabel =
                              tally.majority === 'yes' ? t.voteYes
                              : tally.majority === 'no' ? t.voteNo
                              : tally.majority === 'abstain' ? t.voteAbstain
                              : tally.majority === 'no_show' ? t.voteNoShow
                              : t.voteSplit;
                            return (
                              <a
                                key={poll.id}
                                href={billHref(poll.id)}
                                onClick={stop(() => openBill(poll.id))}
                                style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px', gap: 12 }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 14, fontWeight: 600 }}>{poll.title}</div>
                                  <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)' }}>
                                    {poll.date} · {tally.yes} {t.voteYes} · {tally.no} {t.voteNo} · {tally.abstain} {t.voteAbstain}
                                  </div>
                                </div>
                                <div
                                  style={{
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    padding: '4px 10px',
                                    borderRadius: 12,
                                    background: tally.majority ? voteBg[tally.majority] : 'oklch(70% 0.008 260)',
                                    color: 'white',
                                    flexShrink: 0,
                                  }}
                                >
                                  {majorityLabel}
                                </div>
                              </a>
                            );
                          })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <ShowMoreButton
                          total={partyVotes.votes.length}
                          defaultCount={10}
                          expanded={partyVotesExpanded}
                          onToggle={() => setPartyVotesExpanded((v) => !v)}
                          showMoreTemplate={t.showMoreTemplate}
                          showLessLabel={t.showLess}
                        />
                      </>
                    )}
                  </>
                )}

                {partyTab === 'ties' && (
                  <>
                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>{t.partyDetailOrgsTitle}</h2>
                    {(() => {
                      const resolvedTopOrgs = p.topOrgs
                        .map((o) => ({ o, org: snapshot?.lobbyLinks.orgs[o.orgId] }))
                        .filter((x): x is { o: typeof p.topOrgs[number]; org: NonNullable<typeof x.org> } => Boolean(x.org));
                      const topOrgValue = (x: (typeof resolvedTopOrgs)[number], key: string): string | number | null => {
                        switch (key) {
                          case 'name': return x.org.name;
                          case 'spend': return x.org.expensesEuro ? x.org.expensesEuro.from : null;
                          case 'members': return x.o.memberCount;
                          default: return null;
                        }
                      };
                      const sortedTopOrgs = partyOrgsSort
                        ? [...resolvedTopOrgs].sort((a, b) => compareSortValues(topOrgValue(a, partyOrgsSort.key), topOrgValue(b, partyOrgsSort.key), partyOrgsSort.dir))
                        : resolvedTopOrgs;
                      return (
                        <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14, marginBottom: 26 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                            <thead>
                              <tr style={{ background: 'oklch(97% 0.006 260)', textAlign: 'left' }}>
                                <SortableTh label={t.colOrg} sortKey="name" sort={partyOrgsSort} onSort={(k) => setPartyOrgsSort((prev) => toggleSort(prev, k))} />
                                <SortableTh label={t.orgSpendLabel} sortKey="spend" sort={partyOrgsSort} onSort={(k) => setPartyOrgsSort((prev) => toggleSort(prev, k))} />
                                <SortableTh label={t.colOrgMembers} sortKey="members" sort={partyOrgsSort} onSort={(k) => setPartyOrgsSort((prev) => toggleSort(prev, k))} />
                              </tr>
                            </thead>
                            <tbody>
                              {sortedTopOrgs.map(({ o, org }) => (
                                <tr key={o.orgId} onClick={stop(() => openOrg(o.orgId))} style={{ cursor: 'pointer', borderTop: '1px solid oklch(93% 0.006 260)' }}>
                                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                                    <a href={orgHref(o.orgId)} onClick={stop(() => openOrg(o.orgId))} style={{ textDecoration: 'none', color: 'inherit' }}>
                                      {org.name}
                                    </a>
                                  </td>
                                  <td style={{ padding: '10px 14px', color: 'oklch(45% 0.01 260)' }}>{formatExpenseBracket(org.expensesEuro) ?? '—'}</td>
                                  <td style={{ padding: '10px 14px' }}>{o.memberCount}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </ScrollBox>
                      );
                    })()}

                    {partyCrossrefRows.length > 0 && (
                      <>
                        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>{t.crossrefTitle}</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26 }}>
                          {partyCrossrefRows.map((r) => {
                            const label = r.conflict.vote === 'yes' ? t.voteYes : r.conflict.vote === 'no' ? t.voteNo : t.voteAbstain;
                            return (
                              <div
                                key={`${r.mandateId}-${r.conflict.pollId}-${r.conflict.orgId}`}
                                onClick={r.politicianId !== null ? stop(() => openMp(String(r.politicianId))) : undefined}
                                style={{ cursor: r.politicianId !== null ? 'pointer' : 'default', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                                  {r.politicianId !== null ? (
                                    <a href={mpHref(String(r.politicianId))} onClick={stop(() => openMp(String(r.politicianId!)))} style={{ fontWeight: 600, fontSize: 14, textDecoration: 'none', color: 'inherit' }}>
                                      {r.memberName}
                                    </a>
                                  ) : (
                                    <span style={{ fontWeight: 600, fontSize: 14 }}>{r.memberName}</span>
                                  )}
                                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: voteBg[r.conflict.vote], color: 'white', flexShrink: 0 }}>
                                    {label}
                                  </span>
                                </div>
                                <div style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', marginTop: 4 }}>
                                  {r.org.name} · {r.pollTitle}
                                </div>
                                {r.conflict.drucksachen.length > 0 && (
                                  <div style={{ marginTop: 5 }} onClick={(e) => e.stopPropagation()}>
                                    {r.conflict.drucksachen.map((d) => {
                                      const url = drucksacheUrl(d);
                                      return url ? (
                                        <a key={d} href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.12 250)', marginRight: 10 }}>
                                          {t.viewDrucksacheTemplate.replace('{number}', d)}
                                        </a>
                                      ) : null;
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {partyTopicalRows.length > 0 && (
                      <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{t.topicalTiesTitle}</h2>
                          <button
                            onClick={() => {
                              setTopicalPartyFilter(new Set([p.party]));
                              setTopicalFieldFilter(new Set());
                              setTopicalSearchQuery('');
                              goCrossref('ties');
                            }}
                            style={{ border: 'none', background: 'none', color: 'oklch(45% 0.16 265)', fontWeight: 700, cursor: 'pointer', fontSize: 12.5, padding: 0, whiteSpace: 'nowrap' }}
                          >
                            {t.seeAll} →
                          </button>
                        </div>
                        <input
                          type="text"
                          value={partyTopicalSearchQuery}
                          onChange={(e) => setPartyTopicalSearchQuery(e.target.value)}
                          placeholder={t.topicalSearchPlaceholder}
                          style={{ width: '100%', maxWidth: 420, padding: '9px 12px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 9, fontSize: 13.5, marginBottom: 10, boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                          <MultiSelectFilter
                            label={t.filterFieldOfInterest}
                            options={partyTopicalFieldOptions}
                            selected={partyTopicalFieldFilter}
                            onToggle={(v) => setPartyTopicalFieldFilter((prev) => toggleInSet(prev, v))}
                            onClear={() => setPartyTopicalFieldFilter(new Set())}
                            allLabel={t.filterAllLabel}
                            selectedCountTemplate={t.filterSelectedCountTemplate}
                            clearLabel={t.clearAllFilters}
                            searchable
                            searchPlaceholder={t.filterSearchPlaceholder}
                          />
                          {(partyTopicalFieldFilter.size > 0 || partyTopicalSearchQuery.trim().length > 0) && (
                            <>
                              <span style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)' }}>
                                {filteredPartyTopicalRows.length} {t.results}
                              </span>
                              <button
                                onClick={() => {
                                  setPartyTopicalFieldFilter(new Set());
                                  setPartyTopicalSearchQuery('');
                                }}
                                style={{ border: 'none', background: 'none', color: 'oklch(45% 0.16 265)', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, padding: 0 }}
                              >
                                {t.clearAllFilters}
                              </button>
                            </>
                          )}
                        </div>
                        {filteredPartyTopicalRows.length === 0 ? (
                          <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.topicalNoResults}</p>
                        ) : (
                        <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                          {filteredPartyTopicalRows.slice(0, partyTopicalExpanded ? filteredPartyTopicalRows.length : 10).map((r) => {
                            const label = r.tie.vote === 'yes' ? t.voteYes : r.tie.vote === 'no' ? t.voteNo : t.voteAbstain;
                            return (
                              <a
                                key={`${r.mandateId}-${r.tie.pollId}-${r.tie.orgId}`}
                                href={r.politicianId !== null ? mpHref(String(r.politicianId)) : undefined}
                                onClick={r.politicianId !== null ? stop(() => openMp(String(r.politicianId))) : undefined}
                                style={{
                                  cursor: r.politicianId !== null ? 'pointer' : 'default',
                                  textDecoration: 'none',
                                  color: 'inherit',
                                  display: 'block',
                                  background: 'oklch(97% 0.008 90)',
                                  border: '1px solid oklch(90% 0.015 90)',
                                  borderRadius: 10,
                                  padding: '12px 16px',
                                }}
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
                              </a>
                            );
                          })}
                        </div>
                        <ShowMoreButton
                          total={filteredPartyTopicalRows.length}
                          defaultCount={10}
                          expanded={partyTopicalExpanded}
                          onToggle={() => setPartyTopicalExpanded((v) => !v)}
                          showMoreTemplate={t.showMoreTemplate}
                          showLessLabel={t.showLess}
                        />
                        </>
                        )}
                      </>
                    )}
                  </>
                )}

                {partyTab === 'donations' && (
                  <>
                    <div className="pb-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 20 }}>
                      <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statDonationsSumLabel}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap' }}>
                          {partyDonationSummary ? formatEuro(partyDonationSummary.total) : '—'}
                        </div>
                      </div>
                      <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.partyDonationsCountLabel}</div>
                        <div style={{ fontSize: 24, fontWeight: 800 }}>{partyDonationSummary?.count ?? 0}</div>
                      </div>
                      <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.partyDonorsCountLabel}</div>
                        <div style={{ fontSize: 24, fontWeight: 800 }}>{partyDonationSummary?.donorCount ?? 0}</div>
                      </div>
                    </div>
                    {partyDonationList.length === 0 ? (
                      <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.partyDonationsEmpty}</p>
                    ) : (
                      (() => {
                        // Scoped to this party only, deliberately unlike the global table's column
                        // of the same name — a page already filtered down to one party implies
                        // everything on it is about that party, so a total that silently included
                        // other parties' donations would read as inconsistent with the numbers
                        // visibly summing on the same page, not as a bonus cross-party insight.
                        // Keyed on the canonical name, so a donor the register knows under
                        // several spellings sums once rather than once per spelling.
                        const partyDonorTotals = new Map<string, number>();
                        for (const d of partyDonationList) {
                          if (!d.donor) continue;
                          const key = partyDonations.canonicalDonor(d.donor);
                          partyDonorTotals.set(key, (partyDonorTotals.get(key) ?? 0) + d.amountEuro);
                        }
                        const donationValue = (d: (typeof partyDonationList)[number], key: string): string | number | null => {
                          switch (key) {
                            case 'donor': return d.donor;
                            case 'amount': return d.amountEuro;
                            case 'date': return d.receivedOn;
                            case 'donorTotal': return d.donor ? (partyDonorTotals.get(partyDonations.canonicalDonor(d.donor)) ?? 0) : null;
                            default: return null;
                          }
                        };
                        const partyDonorQueryNorm = partyDonationsDonorQuery.trim().toLowerCase();
                        const filteredPartyDonations = partyDonorQueryNorm
                          ? partyDonationList.filter((d) => (d.donor ?? '').toLowerCase().includes(partyDonorQueryNorm))
                          : partyDonationList;
                        const sortedPartyDonations =
                          partyDonationsSort.length > 0
                            ? [...filteredPartyDonations].sort((a, b) =>
                                compareMultiSortValues(partyDonationsSort, (key) => [donationValue(a, key), donationValue(b, key)]),
                              )
                            : filteredPartyDonations;
                        return (
                          <>
                            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>{t.donationTimelineTitle}</h3>
                            <p style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', margin: '0 0 12px', maxWidth: 700 }}>{t.donationTimelinePartySub}</p>
                            <div style={{ marginBottom: 22 }}>
                              <DonationTimeline
                                donations={partyDonationListCanonical}
                                stackBy="donor"
                                filenameBase={`politblick-grossspenden-${p.party}`}
                                exportLabels={exportLabels}
                                labels={{
                                  axisMaxTemplate: t.donationTimelineAxisMaxTemplate,
                                  excludedTemplate: t.donationTimelineExcludedTemplate,
                                  empty: t.donationTimelineEmpty,
                                  quarterTotalLabel: t.donationTimelineQuarterTotalLabel,
                                  rangeLabelTemplate: t.donationTimelineRangeLabelTemplate,
                                  otherDonorsLabel: t.donationTimelineOtherDonorsLabel,
                                }}
                              />
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                              <input
                                type="text"
                                value={partyDonationsDonorQuery}
                                onChange={(e) => setPartyDonationsDonorQuery(e.target.value)}
                                placeholder={t.donorSearchPlaceholder}
                                style={{ padding: '8px 12px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 20, fontSize: 12.5, minWidth: 200, boxSizing: 'border-box' }}
                              />
                              {partyDonorQueryNorm && (
                                <span style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)' }}>
                                  {sortedPartyDonations.length} {t.results}
                                </span>
                              )}
                            </div>
                            <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14 }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                                <thead>
                                  <tr style={{ background: 'oklch(97% 0.006 260)', textAlign: 'left' }}>
                                    <MultiSortableTh label={t.donationsColDonor} sortKey="donor" sort={partyDonationsSort} onSort={(k) => setPartyDonationsSort((prev) => toggleMultiSort(prev, k))} />
                                    <MultiSortableTh label={t.donationsColAmount} sortKey="amount" sort={partyDonationsSort} onSort={(k) => setPartyDonationsSort((prev) => toggleMultiSort(prev, k))} />
                                    <MultiSortableTh label={t.donationsColDonorTotalPartyTemplate.replace('{party}', p.party)} sortKey="donorTotal" sort={partyDonationsSort} onSort={(k) => setPartyDonationsSort((prev) => toggleMultiSort(prev, k))} />
                                    <MultiSortableTh label={t.donationsColDate} sortKey="date" sort={partyDonationsSort} onSort={(k) => setPartyDonationsSort((prev) => toggleMultiSort(prev, k))} />
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedPartyDonations.slice(0, partyDonationsExpanded ? sortedPartyDonations.length : 10).map((d, i) => {
                                    const lobbyOrgId = d.donor ? snapshot?.lobbyLinks.donorLinks[d.donor] : undefined;
                                    const lobbyOrg = lobbyOrgId ? snapshot?.lobbyLinks.orgs[lobbyOrgId] : undefined;
                                    const donorTotal = d.donor ? (partyDonorTotals.get(d.donor) ?? d.amountEuro) : d.amountEuro;
                                    const isRepeatDonor = donorTotal > d.amountEuro;
                                    return (
                                      <tr key={`${d.publishedOn}-${d.donor}-${i}`} style={{ borderTop: '1px solid oklch(93% 0.006 260)' }}>
                                        <td style={{ padding: '10px 14px' }}>
                                          {d.donor}
                                          {d.donorCity && <span style={{ color: 'oklch(55% 0.01 260)' }}> · {d.donorCity}</span>}
                                          {lobbyOrg && (
                                            <a
                                              href={orgHref(lobbyOrg.id)}
                                              onClick={stop(() => openOrg(lobbyOrg.id))}
                                              style={{ cursor: 'pointer', fontSize: 11.5, color: 'oklch(48% 0.14 60)', fontWeight: 600, textDecoration: 'none', display: 'block' }}
                                            >
                                              ⬤ {lobbyOrg.active ? t.donationsAlsoLobbyist : t.donationsAlsoLobbyistFormer}
                                            </a>
                                          )}
                                        </td>
                                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{formatEuro(d.amountEuro)}</td>
                                        <td style={{ padding: '10px 14px', fontWeight: isRepeatDonor ? 700 : 400, color: isRepeatDonor ? 'oklch(48% 0.14 60)' : 'oklch(55% 0.01 260)' }}>
                                          {formatEuro(donorTotal)}
                                        </td>
                                        <td style={{ padding: '10px 14px' }}>
                                          <a
                                            href={d.sourceUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            title={t.partyDonationSourceTemplate.replace('{year}', String(d.year))}
                                            style={{ color: 'oklch(45% 0.01 260)' }}
                                          >
                                            {d.receivedOn}
                                          </a>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </ScrollBox>
                            <ShowMoreButton
                              total={sortedPartyDonations.length}
                              defaultCount={10}
                              expanded={partyDonationsExpanded}
                              onToggle={() => setPartyDonationsExpanded((v) => !v)}
                              showMoreTemplate={t.showMoreTemplate}
                              showLessLabel={t.showLess}
                            />
                          </>
                        );
                      })()
                    )}
                    <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 10 }}>{t.donationsSource}</p>
                  </>
                )}
              </>
            );
          })()}
        </main>
      )}

      {view === 'impressum' && (
        <main style={{ flex: 1, maxWidth: 720, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href={homeHref} onClick={stop(() => goBack(goHome))} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToHome}
          </a>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '20px 0 16px' }}>{t.impressumTitle}</h1>
          <p style={{ fontSize: 14, color: 'oklch(35% 0.01 260)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{t.impressumBody}</p>
        </main>
      )}

      {view === 'disclaimer' && (
        <main style={{ flex: 1, maxWidth: 720, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href={homeHref} onClick={stop(() => goBack(goHome))} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToHome}
          </a>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '20px 0 16px' }}>{t.disclaimerTitle}</h1>
          <p style={{ fontSize: 14, color: 'oklch(35% 0.01 260)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{t.disclaimerBody}</p>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: '28px 0 12px' }}>{t.disclaimerTechTitle}</h2>
          <p style={{ fontSize: 14, color: 'oklch(35% 0.01 260)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{t.disclaimerTechBody}</p>
          <a
            href="https://github.com/df2nnvctmz-crypto/Politblick"
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-block', marginTop: 12, fontSize: 13.5, fontWeight: 700, color: 'oklch(48% 0.12 250)' }}
          >
            {t.disclaimerGithubLabel} →
          </a>

          <h2 style={{ fontSize: 19, fontWeight: 800, margin: '28px 0 12px' }}>{t.disclaimerFeedbackTitle}</h2>
          <p style={{ fontSize: 14, color: 'oklch(35% 0.01 260)', lineHeight: 1.7 }}>{t.disclaimerFeedbackBody}</p>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 4 }}>
            <a href="mailto:kontakt@politblick.de" style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(48% 0.12 250)' }}>
              {t.footerFeedbackEmail} →
            </a>
            <a
              href="https://github.com/df2nnvctmz-crypto/Politblick/issues"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(48% 0.12 250)' }}
            >
              {t.footerFeedbackGithub} →
            </a>
          </div>
        </main>
      )}

      {view === 'datenschutz' && (
        <main style={{ flex: 1, maxWidth: 720, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href={homeHref} onClick={stop(() => goBack(goHome))} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToHome}
          </a>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '20px 0 16px' }}>{t.datenschutzTitle}</h1>
          <p style={{ fontSize: 14, color: 'oklch(35% 0.01 260)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{t.datenschutzBody}</p>
        </main>
      )}

      {view === 'daten' && (
        <main style={{ flex: 1, maxWidth: 820, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href={homeHref} onClick={stop(() => goBack(goHome))} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToHome}
          </a>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '20px 0 10px' }}>{t.datenTitle}</h1>
          <p style={{ fontSize: 14, color: 'oklch(35% 0.01 260)', lineHeight: 1.7, maxWidth: 640 }}>{t.datenIntro}</p>
          <p style={{ fontSize: 12.5, color: 'oklch(55% 0.01 260)', lineHeight: 1.6, maxWidth: 640, marginBottom: 26 }}>{t.datenLicenseNote}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {t.datasets.map((d) => {
              const generatedAt = d.metaKey ? snapshot?.meta[d.metaKey] ?? null : null;
              return (
                <div key={d.file} style={{ background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{d.name}</span>
                    <a
                      href={`${import.meta.env.BASE_URL}${d.file.replace(/^\//, '')}`}
                      download
                      style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(48% 0.12 250)', flexShrink: 0 }}
                    >
                      {t.datenDownloadLabel} ({d.file}) ↓
                    </a>
                  </div>
                  <p style={{ fontSize: 13, color: 'oklch(42% 0.01 260)', lineHeight: 1.6, margin: '6px 0 8px' }}>{d.description}</p>
                  <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span>
                      {t.datenSourceLabel}{' '}
                      {d.sourceUrl ? (
                        <a href={d.sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'oklch(48% 0.12 250)' }}>
                          {d.source}
                        </a>
                      ) : (
                        d.source
                      )}
                    </span>
                    <span>{generatedAt ? t.datenUpdatedTemplate.replace('{date}', formatDateTime(generatedAt, lang)) : t.datenNoTimestamp}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      )}

      <footer style={{ borderTop: '1px solid oklch(90% 0.006 260)' }}>
        <div
          style={{
            padding: '12px 32px',
            fontSize: 12,
            fontWeight: 600,
            textAlign: 'center',
            color: 'oklch(40% 0.01 260)',
            background: 'oklch(95% 0.01 265)',
          }}
        >
          {t.footerDisclaimer}
        </div>
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
            <a href={disclaimerHref} onClick={stop(goDisclaimer)} style={{ color: 'oklch(52% 0.01 260)' }}>
              {t.disclaimerTitle}
            </a>
            <a href={impressumHref} onClick={stop(goImpressum)} style={{ color: 'oklch(52% 0.01 260)' }}>
              {t.impressumTitle}
            </a>
            <a href={datenschutzHref} onClick={stop(goDatenschutz)} style={{ color: 'oklch(52% 0.01 260)' }}>
              {t.datenschutzTitle}
            </a>
            <a href={datenHref} onClick={stop(goDaten)} style={{ color: 'oklch(52% 0.01 260)' }}>
              {t.datenTitle}
            </a>
          </div>
          <span>
            {t.footerSources}
            {' · '}
            <a href="https://fonts.google.com/icons" target="_blank" rel="noreferrer" style={{ color: 'oklch(52% 0.01 260)' }}>
              {t.footerIconsSource}
            </a>
          </span>
        </div>
        <div
          style={{
            padding: '0 32px 20px',
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            alignItems: 'center',
            fontSize: 12,
            color: 'oklch(52% 0.01 260)',
          }}
        >
          <span>{t.footerFeedbackLabel}</span>
          <a href="mailto:kontakt@politblick.de" style={{ color: 'oklch(48% 0.12 250)', fontWeight: 600 }}>
            {t.footerFeedbackEmail}
          </a>
          <a
            href="https://github.com/df2nnvctmz-crypto/Politblick/issues"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'oklch(48% 0.12 250)', fontWeight: 600 }}
          >
            {t.footerFeedbackGithub}
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;
