import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import {
  BILLS,
  DEMO_MPS,
  DEMO_PARTY_META,
  TRANSLATIONS,
  type Lang,
} from './data';
import { computeHemicycleSeats, fuzzyIncludes, initials, trendPoints } from './helpers';
import { FALLBACK_PARTY_COLOR, REAL_PARTY_COLORS, useBundestagRoster, type RealMp } from './bundestag';
import { computeAllAlignments, computeDivergences, computeMemberAlignment, isoWeekRange, useAllPollResults, useAllPolls, useMandateVotes, usePartyVotes, usePollResult, useRecentPollResults, useWeeklyResults, type PollResult, type RealPoll } from './polls';
import { buildMemberIncomeScores, useSidejobs } from './sidejobs';
import { useSnapshot } from './snapshot';
import {
  buildMemberTieCounts,
  drucksacheUrl,
  formatEuro,
  formatExpenseBracket,
  useCrossrefRows,
  useMemberLobby,
  useOrgDetail,
  useOrgList,
  useOrgPartyNetwork,
  usePartyDonations,
  usePartyLobbySummary,
  usePollLobbying,
  useTopicalTieRows,
  type CrossrefRow,
  type OrgListEntry,
} from './lobby';
import { useCommitteeDetail, useCommitteeList, useMemberCommittees } from './committees';
import { PartyOrgGraph } from './PartyOrgGraph';
import { DonationSankey } from './DonationSankey';
import { DonationTimeline } from './DonationTimeline';
import { ShowMoreButton } from './ShowMoreButton';
import { ChartExportMenu, type ChartExportLabels } from './ChartExportMenu';
import type { ChartSvgExport } from './chartExport';
import { pathToRoute, routeToPath, stripBase, withBase, type LobbyTab, type PartyTab, type ProfileTab, type View } from './router';

type BillId = string | number;

/** Real polls use numeric ids, demo bills use string ids like 'b1' — a URL segment is always a string, so a purely-numeric one is a real poll id. */
function parseBillId(billId: string | null): BillId | null {
  if (billId === null) return null;
  return /^\d+$/.test(billId) ? Number(billId) : billId;
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
function buildMpUrlParam(id: string, roster: RealMp[], demoMps: { id: string; name: string }[]): string {
  const name = roster.find((m) => String(m.id) === id)?.name ?? demoMps.find((m) => m.id === id)?.name;
  return name ? `${id}-${slugify(name)}` : id;
}

/** The router treats the whole `/abgeordnete/<param>` segment as opaque — this pulls the actual
 * lookup key (the leading numeric ID) back out, so a slug URL and a bare-ID URL both resolve to
 * the same member via the existing ID-based matching everywhere else in this file. */
function extractMpId(param: string | null): string | null {
  if (!param) return null;
  return param.match(/^\d+/)?.[0] ?? param;
}

/** Distinct values with occurrence counts, biggest first — feeds MultiSelectFilter option lists. */
function countOptions(values: string[]): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'de'));
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
  isPartyRoutable,
  filenameBase,
  exportLabels,
}: {
  parties: { name: string; seats: number; color: string }[];
  seatsLabel: string;
  onOpenParty: (party: string) => void;
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
            <div
              key={p.name}
              onClick={routable ? () => onOpenParty(p.name) : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: routable ? 'pointer' : 'default' }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, textDecoration: routable ? 'underline' : 'none', textDecorationColor: 'oklch(85% 0.006 260)' }}>{p.name}</span>
              <span style={{ color: 'oklch(50% 0.01 260)' }}>{p.seats}</span>
            </div>
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

export type SectorMetric = 'members' | 'orgs' | 'spend';

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
  data: { field: string; memberCount: number; orgCount: number; spend: { from: number; to: number } | null }[];
  metric: SectorMetric;
  selected: Set<string>;
  onSelect: (field: string) => void;
  membersTemplate: string;
  orgsTemplate: string;
  filenameBase: string;
  exportLabels: ChartExportLabels;
}) {
  if (data.length === 0) return null;
  const valueFor = (d: (typeof data)[number]) => (metric === 'members' ? d.memberCount : metric === 'orgs' ? d.orgCount : ((d.spend?.from ?? 0) + (d.spend?.to ?? 0)) / 2);
  const max = Math.max(1, ...data.map(valueFor));
  const getCsv = () => ({
    headers: ['Field of interest', 'Tied MPs', 'Organizations', 'Spend from (EUR)', 'Spend to (EUR)'],
    rows: data.map((d) => [d.field, d.memberCount, d.orgCount, d.spend?.from ?? null, d.spend?.to ?? null]),
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
        const valueText = `${membersTemplate.replace('{n}', String(d.memberCount))} · ${orgsTemplate.replace('{n}', String(d.orgCount))}${d.spend ? ` · ${escapeXml(formatExpenseBracket(d.spend) ?? '')}` : ''}`;
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
                {d.spend && ` · ${formatExpenseBracket(d.spend)}`}
              </span>
            </div>
          </div>
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
  placeholder,
  noResultsTemplate,
  browseAllLabel,
  onBrowseAll,
}: {
  members: RealMp[];
  onSelect: (id: string) => void;
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
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onBrowseAll();
                }}
                style={{ fontSize: 12.5, fontWeight: 700 }}
              >
                {browseAllLabel} →
              </a>
            </div>
          ) : (
            matches.map((m) => (
              <div
                key={m.id}
                onClick={() => select(m.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer' }}
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
              </div>
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
  const billMatches = showDropdown ? polls.filter((p) => fuzzyIncludes(p.title, q) || fuzzyIncludes(p.topic, q)).slice(0, 4) : [];
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
                    <div key={m.id} onClick={() => selectMp(m.id)} style={rowStyle}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={titleStyle}>{m.name}</div>
                        <div style={subStyle}>
                          {m.party} · {m.constituency}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {billMatches.length > 0 && (
                <>
                  <div style={groupHeaderStyle}>{groupBillsLabel}</div>
                  {billMatches.map((p) => (
                    <div key={p.id} onClick={() => selectBill(p.id)} style={rowStyle}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={titleStyle}>{p.title}</div>
                        <div style={subStyle}>
                          {p.topic} · {p.date}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {orgMatches.length > 0 && (
                <>
                  <div style={groupHeaderStyle}>{groupOrgsLabel}</div>
                  {orgMatches.map((e) => (
                    <div key={e.org.id} onClick={() => selectOrg(e.org.id)} style={rowStyle}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={titleStyle}>{e.org.name}</div>
                        {e.org.city && <div style={subStyle}>{e.org.city}</div>}
                      </div>
                    </div>
                  ))}
                </>
              )}
              {partyMatches.length > 0 && (
                <>
                  <div style={groupHeaderStyle}>{groupPartiesLabel}</div>
                  {partyMatches.map((p) => (
                    <div key={p.name} onClick={() => selectParty(p.name)} style={rowStyle}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={titleStyle}>{p.name}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {mpMatchesAll.length > 0 && (
                <a
                  href="#"
                  onClick={(ev) => {
                    ev.preventDefault();
                    submit();
                  }}
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
  const [selectedBillId, setSelectedBillId] = useState<BillId | null>(parseBillId(initialRoute.billId));
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(initialRoute.orgId);
  const [selectedParty, setSelectedParty] = useState<string | null>(initialRoute.party);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string | null>(initialRoute.committeeId);
  const [orgSearchQuery, setOrgSearchQuery] = useState('');
  const [sectorMetric, setSectorMetric] = useState<SectorMetric>('members');
  const [profileTab, setProfileTab] = useState<ProfileTab>(initialRoute.profileTab);
  const [lobbyTab, setLobbyTab] = useState<LobbyTab>(initialRoute.lobbyTab);
  const [partyTab, setPartyTab] = useState<PartyTab>(initialRoute.partyTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [partyFilter, setPartyFilter] = useState<Record<string, boolean>>({});
  const [rosterSort, setRosterSort] = useState<'default' | 'income' | 'ties'>('default');
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [hoveredAlignmentPoint, setHoveredAlignmentPoint] = useState<number | null>(null);
  const alignmentSvgRef = useRef<SVGSVGElement>(null);
  const [tieMatrixFilter, setTieMatrixFilter] = useState<MatrixCell | null>(null);
  const [orgsExpanded, setOrgsExpanded] = useState(false);
  const [conflictsExpanded, setConflictsExpanded] = useState(false);
  const [topicalExpanded, setTopicalExpanded] = useState(false);
  const [donationsExpanded, setDonationsExpanded] = useState(false);
  const [votesExpanded, setVotesExpanded] = useState(false);
  const [flaggedVotesExpanded, setFlaggedVotesExpanded] = useState(false);
  const [pollLobbyingExpanded, setPollLobbyingExpanded] = useState(false);
  const [orgsSort, setOrgsSort] = useState<SortState>(null);
  const [conflictsSort, setConflictsSort] = useState<SortState>(null);
  const [topicalSort, setTopicalSort] = useState<SortState>(null);
  const [donationsSort, setDonationsSort] = useState<SortState>(null);
  const [partyOrgsSort, setPartyOrgsSort] = useState<SortState>(null);
  const [partyDonationsSort, setPartyDonationsSort] = useState<SortState>(null);
  const [partyDonationsExpanded, setPartyDonationsExpanded] = useState(false);
  const [partyVotesExpanded, setPartyVotesExpanded] = useState(false);
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
  const [lobbyNavOpen, setLobbyNavOpen] = useState(false);
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

  // Declared here (ahead of where it's conceptually used, further down) because the URL-sync
  // effect just below needs it in its dependency array to upgrade a bare-ID profile URL into a
  // full name slug once the roster finishes loading.
  const roster = useBundestagRoster();

  // Browser back/forward: re-derive route state from the URL rather than replaying setView
  // calls. isPopStateRef suppresses the push effect below for this one render, so going back
  // doesn't immediately push the page we just navigated away from back onto the stack.
  const isPopStateRef = useRef(false);
  useEffect(() => {
    const onPopState = () => {
      isPopStateRef.current = true;
      const r = pathToRoute(stripBase(window.location.pathname, import.meta.env.BASE_URL));
      setView(r.view);
      setSelectedMpId(extractMpId(r.mpId));
      setSelectedBillId(parseBillId(r.billId));
      setSelectedOrgId(r.orgId);
      setSelectedParty(r.party);
      setSelectedCommitteeId(r.committeeId);
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
    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }
    const path = routeToPath({
      view,
      mpId: selectedMpId ? buildMpUrlParam(selectedMpId, roster.members, demoMps) : null,
      profileTab,
      billId: selectedBillId !== null ? String(selectedBillId) : null,
      orgId: selectedOrgId,
      party: selectedParty,
      partyTab,
      lobbyTab,
      committeeId: selectedCommitteeId,
    });
    const fullPath = withBase(path, import.meta.env.BASE_URL);
    if (window.location.pathname !== fullPath) window.history.pushState(null, '', fullPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedMpId, profileTab, selectedBillId, selectedOrgId, selectedParty, partyTab, lobbyTab, selectedCommitteeId, roster.members]);

  const { snapshot } = useSnapshot();
  const pollsState = useAllPolls();
  const weekly = useWeeklyResults(pollsState.polls);
  // Shared across the whole app: the search list computes every visible member's alignment
  // from this same fetch (no per-row network calls), and the profile page reuses it too.
  const recentPolls = useRecentPollResults(pollsState.polls);
  const allPollResults = useAllPollResults(pollsState.polls);
  const mandateToMember = new Map(roster.members.map((m) => [m.mandateId, m]));

  const t = TRANSLATIONS[lang];
  const exportLabels: ChartExportLabels = { buttonLabel: t.chartExportLabel, csv: t.chartExportCsv, svg: t.chartExportSvg, png: t.chartExportPng };

  const goHome = () => setView('home');
  const goSearch = () => setView('search');
  const goCrossref = (tab: LobbyTab = 'overview') => {
    setView('crossref');
    setLobbyTab(tab);
  };
  const goPartyList = () => setView('partyList');
  const goCommitteeList = () => setView('committeeList');
  const goPollList = () => setView('pollList');
  const openCommittee = (id: string) => {
    setView('committee');
    setSelectedCommitteeId(id);
  };
  const goImpressum = () => setView('impressum');
  const goDisclaimer = () => setView('disclaimer');
  const goDatenschutz = () => setView('datenschutz');
  const goDaten = () => setView('daten');
  const openMp = (id: string) => {
    setView('profile');
    setSelectedMpId(id);
    setProfileTab('overview');
    setVotesExpanded(false);
  };
  const openBill = (id: BillId) => {
    setView('bill');
    setSelectedBillId(id);
    setFlaggedVotesExpanded(false);
    setPollLobbyingExpanded(false);
  };
  const openOrg = (id: string) => {
    setView('org');
    setSelectedOrgId(id);
  };
  const openParty = (party: string, origin: 'partyList' | 'crossref' = 'partyList') => {
    setView('party');
    setSelectedParty(party);
    setPartyTab('overview');
    setPartyDonationsExpanded(false);
    setPartyVotesExpanded(false);
    setPartyTopicalExpanded(false);
    setPartyOrigin(origin);
  };
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
  const filteredMps = roster.members
    .filter((m) => {
      if (partyFilter[m.party] === false) return false;
      if (q && !fuzzyIncludes(m.name, q) && !fuzzyIncludes(m.constituency, q)) return false;
      return true;
    })
    .sort((a, b) => {
      if (rosterSort === 'income') return (incomeScoreByMandate.get(b.mandateId) ?? 0) - (incomeScoreByMandate.get(a.mandateId) ?? 0);
      if (rosterSort === 'ties') return (tieCountByMandate.get(b.mandateId) ?? 0) - (tieCountByMandate.get(a.mandateId) ?? 0);
      return 0;
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
  const mandateVotes = useMandateVotes(realMatch ? realMatch.mandateId : null);
  const partyVotes = usePartyVotes(selectedParty);
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

  const memberCommittees = useMemberCommittees(profile.kind === 'real' ? profile.mp.mandateId : null);
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
  const pollDetailDivergences = pollDetail.result ? computeDivergences(pollDetail.result) : [];

  // Real cross-references: a member voting on a bill that an organisation they are personally
  // tied to registered lobbying on. Sourced from the Lobbyregister + members' own declarations.
  const crossref = useCrossrefRows();
  const topicalTieRows = useTopicalTieRows();
  const orgNetwork = useOrgPartyNetwork();
  const partyDonations = usePartyDonations();
  const pollLobbying = usePollLobbying(realPollId);
  const partyLobby = usePartyLobbySummary();
  // Only the sitting Bundestag fractions have their own party page (partyLobby.summaries is
  // scoped to those) — independents ("Fraktionslos") and parties that received large donations
  // without holding seats (e.g. FDP, BSW, Volt in some terms) don't. Crosslinks everywhere else
  // in the app check this before rendering a party name as clickable, so they never point at a
  // page that can only ever show "no data for this party".
  const routablePartyNames = new Set(partyLobby.summaries.map((s) => s.party));
  const orgList = useOrgList();
  const orgDetail = useOrgDetail(selectedOrgId);
  const committeeList = useCommitteeList();
  const committeeDetail = useCommitteeDetail(selectedCommitteeId);
  const filteredOrgs = orgList.orgs.filter((e) => {
    if (!e.org.name.toLowerCase().includes(orgSearchQuery.trim().toLowerCase())) return false;
    if (orgPartyFilter.size > 0 && !e.parties.some((p) => orgPartyFilter.has(p))) return false;
    if (orgActorTypeFilter.size > 0 && (!e.org.actorType || !orgActorTypeFilter.has(e.org.actorType))) return false;
    if (orgFieldFilter.size > 0 && !e.org.fieldsOfInterest.some((f) => orgFieldFilter.has(f))) return false;
    return true;
  });
  const orgPartyOptions = countOptions(orgList.orgs.flatMap((e) => e.parties));
  const orgActorTypeOptions = countOptions(orgList.orgs.map((e) => e.org.actorType).filter((v): v is string => Boolean(v)));
  const orgFieldOptions = countOptions(orgList.orgs.flatMap((e) => e.org.fieldsOfInterest));
  // Top fields of interest by tied MP count — an org contributes its full member/spend count to
  // every field it declares, since the register doesn't split an org's activity across its fields.
  const sectorStats = (() => {
    const byField = new Map<string, { orgCount: number; memberCount: number; from: number; to: number; hasSpend: boolean }>();
    for (const e of orgList.orgs) {
      for (const f of e.org.fieldsOfInterest) {
        const cur = byField.get(f) ?? { orgCount: 0, memberCount: 0, from: 0, to: 0, hasSpend: false };
        cur.orgCount += 1;
        cur.memberCount += e.affiliatedMemberCount;
        if (e.org.expensesEuro) {
          cur.from += e.org.expensesEuro.from;
          cur.to += e.org.expensesEuro.to;
          cur.hasSpend = true;
        }
        byField.set(f, cur);
      }
    }
    const spendMid = (v: { from: number; to: number; hasSpend: boolean }) => (v.hasSpend ? (v.from + v.to) / 2 : 0);
    const sortValue = (v: { orgCount: number; memberCount: number; spendMid: number }) =>
      sectorMetric === 'members' ? v.memberCount : sectorMetric === 'orgs' ? v.orgCount : v.spendMid;
    return [...byField.entries()]
      .map(([field, v]) => ({ field, orgCount: v.orgCount, memberCount: v.memberCount, spend: v.hasSpend ? { from: v.from, to: v.to } : null, spendMid: spendMid(v) }))
      .sort((a, b) => sortValue(b) - sortValue(a) || b.orgCount - a.orgCount)
      .slice(0, 8);
  })();

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
          <a onClick={stop(goHome)} href="#" style={navStyle(view === 'home')}>
            {t.navHome}
          </a>
          <div
            style={{ position: 'relative' }}
            onMouseEnter={openMpsNav}
            onMouseLeave={scheduleCloseMpsNav}
          >
            <a
              onClick={stop(() => {
                goSearch();
                setMpsNavOpen(false);
              })}
              href="#"
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
                  href="#"
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
                  href="#"
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
                  href="#"
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
                  href="#"
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
            style={{ position: 'relative' }}
            onMouseEnter={openLobbyNav}
            onMouseLeave={scheduleCloseLobbyNav}
          >
            <a
              onClick={stop(() => {
                goCrossref();
                setLobbyNavOpen(false);
              })}
              href="#"
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
                    { key: 'parties' as const, label: t.lobbyTabParties },
                    { key: 'orgs' as const, label: t.lobbyTabOrgs },
                    { key: 'conflicts' as const, label: t.lobbyTabConflicts },
                    { key: 'donations' as const, label: t.lobbyTabDonations },
                  ]
                ).map((opt) => {
                  const active = view === 'crossref' && lobbyTab === opt.key;
                  return (
                    <a
                      key={opt.key}
                      href="#"
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
              <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statFlagsLabel}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'oklch(55% 0.16 40)' }}>{demoFlagCount}</div>
              </div>
              <div
                onClick={() => goCrossref('donations')}
                style={{ cursor: 'pointer', background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 18 }}
              >
                <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statDonationsSumLabel}</div>
                <div style={{ fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {formatEuro(partyDonations.all.reduce((sum, d) => sum + d.amountEuro, 0))}
                </div>
              </div>
              <div
                onClick={() => goCrossref('orgs')}
                style={{ cursor: 'pointer', background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 18 }}
              >
                <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statOrgsReferencedLabel}</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{Object.keys(snapshot?.lobbyLinks.orgs ?? {}).length}</div>
              </div>
              <div
                onClick={() => goCrossref('conflicts')}
                style={{ cursor: 'pointer', background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 18 }}
              >
                <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statConflictsLabel}</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{crossref.rows.length}</div>
              </div>
              <div
                onClick={() => goCrossref('conflicts')}
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
              <a href="#" onClick={stop(() => goCrossref('conflicts'))} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(48% 0.12 250)', whiteSpace: 'nowrap' }}>
                {t.seeAllConflicts} →
              </a>
            </div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>{t.feedTitle}</h2>
              <a href="#" onClick={stop(goPollList)} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(48% 0.12 250)', whiteSpace: 'nowrap' }}>
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
              <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(45% 0.01 260)', marginBottom: 10 }}>{t.filterSort}</div>
              <select
                value={rosterSort}
                onChange={(e) => setRosterSort(e.target.value as typeof rosterSort)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid oklch(90% 0.006 260)', fontSize: 13.5, background: 'white' }}
              >
                <option value="default">{t.sortDefault}</option>
                <option value="income">{t.sortIncome}</option>
                <option value="ties">{t.sortTies}</option>
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
                    <MpAvatar photoUrl={m.photoUrl} name={m.name} color={m.color} initials={m.initials} size={44} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                      <div style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)' }}>
                        {routablePartyNames.has(m.party) ? (
                          <span
                            onClick={(e) => {
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
                      <span
                        onClick={() => openParty(profile.mp.party)}
                        style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'oklch(80% 0.006 260)' }}
                      >
                        {profile.mp.party}
                      </span>
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
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(42% 0.16 40)', marginBottom: 8 }}>
                          {t.flagsHeading}
                          <InfoTooltip text={t.infoAuffaelligkeit} />
                        </div>
                        {realMpFlaggedVotes.map((p) => (
                          <div key={p.poll.id} style={{ fontSize: 13, color: 'oklch(32% 0.14 40)', padding: '4px 0' }}>
                            · {p.poll.title}: {t.realAgainstPartyTemplate.replace('{party}', p.party)}
                          </div>
                        ))}
                      </div>
                    )}
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
                              <div
                                key={r.committee.id}
                                onClick={() => openCommittee(String(r.committee.id))}
                                style={{ cursor: 'pointer', fontSize: 12.5, padding: '7px 12px', borderRadius: 10, background: 'white', border: '1px solid oklch(90% 0.006 260)' }}
                              >
                                {r.committee.name}
                                {roleLabel && <span style={{ fontWeight: 700, color: 'oklch(45% 0.16 265)' }}> · {roleLabel}</span>}
                              </div>
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

              {profileTab === 'votes' &&
                (profile.kind === 'demo' ? (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {profile.mp.voteHistoryResolved.slice(0, votesExpanded ? profile.mp.voteHistoryResolved.length : 10).map((v, i) => (
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
                    <ShowMoreButton
                      total={profile.mp.voteHistoryResolved.length}
                      defaultCount={10}
                      expanded={votesExpanded}
                      onToggle={() => setVotesExpanded((v) => !v)}
                      showMoreTemplate={t.showMoreTemplate}
                      showLessLabel={t.showLess}
                    />
                  </>
                ) : mandateVotes.loading && mandateVotes.votes.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.pollsLoading}</p>
                ) : mandateVotes.error ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.16 40)' }}>{t.pollsError}</p>
                ) : mandateVotes.votes.length === 0 ? (
                  <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.noMandateVotesYet}</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {mandateVotes.votes.slice(0, votesExpanded ? mandateVotes.votes.length : 10).map((v) => {
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
                      <a href="https://www.lobbyregister.bundestag.de/" target="_blank" rel="noreferrer" style={{ color: 'oklch(48% 0.12 250)' }}>
                        {t.lobbyRegisterSource}
                      </a>
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
                    {routablePartyNames.has(pb.party) ? (
                      <span
                        onClick={() => openParty(pb.party)}
                        style={{ width: 90, fontSize: 12.5, fontWeight: 600, flexShrink: 0, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'oklch(85% 0.006 260)' }}
                      >
                        {pb.party}
                      </span>
                    ) : (
                      <span style={{ width: 90, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>{pb.party}</span>
                    )}
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

                  {pollDetail.result.poll.summary && (
                    <p style={{ fontSize: 14.5, color: 'oklch(35% 0.01 260)', lineHeight: 1.7, whiteSpace: 'pre-line', margin: '0 0 22px', maxWidth: 640 }}>
                      {pollDetail.result.poll.summary}
                    </p>
                  )}

                  <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{t.voteBreakdown}</div>
                    {pollDetail.result.partyBreakdown.map((pb) => {
                      const total = pb.yes + pb.no + pb.abstain + pb.noShow || 1;
                      return (
                        <div key={pb.party} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          {routablePartyNames.has(pb.party) ? (
                            <span
                              onClick={() => openParty(pb.party)}
                              style={{ width: 90, fontSize: 12.5, fontWeight: 600, flexShrink: 0, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'oklch(85% 0.006 260)' }}
                            >
                              {pb.party}
                            </span>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pollDetailDivergences.slice(0, flaggedVotesExpanded ? pollDetailDivergences.length : 10).map((d, i) => {
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
                              {t.realAgainstPartyTemplate.replace('{party}', d.member.party)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <ShowMoreButton
                    total={pollDetailDivergences.length}
                    defaultCount={10}
                    expanded={flaggedVotesExpanded}
                    onToggle={() => setFlaggedVotesExpanded((v) => !v)}
                    showMoreTemplate={t.showMoreTemplate}
                    showLessLabel={t.showLess}
                  />
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                        {pollLobbying.entries.slice(0, pollLobbyingExpanded ? pollLobbying.entries.length : 10).map((e) => {
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
                      <ShowMoreButton
                        total={pollLobbying.entries.length}
                        defaultCount={10}
                        expanded={pollLobbyingExpanded}
                        onToggle={() => setPollLobbyingExpanded((v) => !v)}
                        showMoreTemplate={t.showMoreTemplate}
                        showLessLabel={t.showLess}
                      />
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
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>{t.navLobbyFinance}</h1>
          <p style={{ fontSize: 14, color: 'oklch(45% 0.01 260)', margin: '0 0 28px', maxWidth: 640 }}>{t.crossrefSub}</p>

          {lobbyTab === 'overview' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginBottom: 28 }}>
                <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statOrgsReferencedLabel}</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{Object.keys(snapshot?.lobbyLinks.orgs ?? {}).length}</div>
                </div>
                <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>
                    {t.statConflictsLabel}
                    <InfoTooltip text={t.infoVerflechtung} />
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{crossref.rows.length}</div>
                </div>
                <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>
                    {t.statTopicalTiesLabel}
                    <InfoTooltip text={t.infoThemenfeld} />
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{topicalTieRows.rows.length}</div>
                </div>
                <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.statDonationsSumLabel}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {formatEuro(partyDonations.all.reduce((sum, d) => sum + d.amountEuro, 0))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
                {(
                  [
                    { key: 'parties' as const, title: t.partyLobbyTitle, sub: t.partyLobbySub },
                    { key: 'orgs' as const, title: t.orgsSectionTitle, sub: t.orgsSectionSub },
                    { key: 'conflicts' as const, title: t.crossrefTitle, sub: t.crossrefSub },
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
              <p style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', margin: '0 0 20px', maxWidth: 760 }}>{t.partyLobbySub}</p>

              <PartyOrgGraph
                orgs={orgNetwork.orgs}
                parties={parties}
                onOpenOrg={openOrg}
                onOpenParty={(party) => openParty(party, 'crossref')}
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

              <h3 style={{ fontSize: 15, fontWeight: 700, margin: '28px 0 12px' }}>{t.partyDetailOrgsTitle}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
                {partyLobby.summaries.map((p) => (
                  <div
                    key={p.party}
                    onClick={() => openParty(p.party, 'crossref')}
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
              {sectorStats.length > 0 && (
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
                      <button onClick={() => setSectorMetric('spend')} style={pillBtn(sectorMetric === 'spend')}>
                        {t.sectorMetricSpend}
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
                      <option value="spend">{t.sectorMetricSpend}</option>
                    </select>
                  </div>
                  <p style={{ fontSize: 12, color: 'oklch(45% 0.01 260)', margin: '0 0 14px', maxWidth: 640 }}>{t.sectorChartSub}</p>
                  <SectorBarChart
                    data={sectorStats}
                    metric={sectorMetric}
                    selected={orgFieldFilter}
                    onSelect={(field) => setOrgFieldFilter((prev) => toggleInSet(prev, field))}
                    membersTemplate={t.sectorChartMembersTemplate}
                    orgsTemplate={t.sectorChartOrgsTemplate}
                    filenameBase="politblick-interessengebiete"
                    exportLabels={exportLabels}
                  />
                </div>
              )}
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
                  const orgValue = (e: (typeof filteredOrgs)[number], key: string): string | number | null => {
                    switch (key) {
                      case 'name': return e.org.name;
                      case 'spend': return e.org.expensesEuro ? e.org.expensesEuro.from : null;
                      case 'members': return e.affiliatedMemberCount;
                      case 'votes': return e.lobbiedPollCount;
                      default: return null;
                    }
                  };
                  const sortedOrgs = orgsSort
                    ? [...filteredOrgs].sort((a, b) => compareSortValues(orgValue(a, orgsSort.key), orgValue(b, orgsSort.key), orgsSort.dir))
                    : filteredOrgs;
                  return (
                    <>
                      <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                          <thead>
                            <tr style={{ background: 'oklch(97% 0.006 260)', textAlign: 'left' }}>
                              <SortableTh label={t.colOrg} sortKey="name" sort={orgsSort} onSort={(k) => setOrgsSort((prev) => toggleSort(prev, k))} />
                              <SortableTh label={t.orgSpendLabel} sortKey="spend" sort={orgsSort} onSort={(k) => setOrgsSort((prev) => toggleSort(prev, k))} />
                              <SortableTh label={t.colOrgMembers} sortKey="members" sort={orgsSort} onSort={(k) => setOrgsSort((prev) => toggleSort(prev, k))} />
                              <SortableTh label={t.colOrgVotes} sortKey="votes" sort={orgsSort} onSort={(k) => setOrgsSort((prev) => toggleSort(prev, k))} />
                            </tr>
                          </thead>
                          <tbody>
                            {sortedOrgs.slice(0, orgsExpanded ? sortedOrgs.length : 10).map((e) => (
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
                      <ShowMoreButton
                        total={filteredOrgs.length}
                        defaultCount={10}
                        expanded={orgsExpanded}
                        onToggle={() => setOrgsExpanded((v) => !v)}
                        showMoreTemplate={t.showMoreTemplate}
                        showLessLabel={t.showLess}
                      />
                    </>
                  );
                })()
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
                                        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'oklch(48% 0.14 60)' }}>⬤ {t.lobbyAgainstFraction}</div>
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

              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '32px 0 4px' }}>{t.topicalTiesTitle}</h2>
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

          {lobbyTab === 'donations' && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{t.donationsTitle}</h2>
              <p style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', margin: '0 0 14px', maxWidth: 700 }}>{t.donationsSub}</p>
              <div style={{ background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
                <DonationBarChart data={partyDonations.byFraction} filenameBase="politblick-grossspenden-nach-partei" exportLabels={exportLabels} />
              </div>

              <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>{t.donationTimelineTitle}</h3>
              <p style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', margin: '0 0 12px', maxWidth: 700 }}>{t.donationTimelineSub}</p>
              <div style={{ marginBottom: 18 }}>
                <DonationTimeline
                  donations={partyDonations.all}
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

              <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>{t.donationSankeyTitle}</h3>
              <p style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', margin: '0 0 12px', maxWidth: 700 }}>{t.donationSankeySub}</p>
              <div style={{ marginBottom: 18 }}>
                <DonationSankey
                  donations={partyDonations.all}
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

              {(() => {
                const donationValue = (d: (typeof partyDonations.all)[number], key: string): string | number | null => {
                  switch (key) {
                    case 'party': return d.party;
                    case 'donor': return d.donor;
                    case 'amount': return d.amountEuro;
                    case 'date': return d.receivedOn;
                    default: return null;
                  }
                };
                const sortedDonations = donationsSort
                  ? [...partyDonations.all].sort((a, b) => compareSortValues(donationValue(a, donationsSort.key), donationValue(b, donationsSort.key), donationsSort.dir))
                  : partyDonations.all;
                return (
                  <>
                    <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                        <thead>
                          <tr style={{ background: 'oklch(97% 0.006 260)', textAlign: 'left' }}>
                            <SortableTh label={t.donationsColParty} sortKey="party" sort={donationsSort} onSort={(k) => setDonationsSort((prev) => toggleSort(prev, k))} />
                            <SortableTh label={t.donationsColDonor} sortKey="donor" sort={donationsSort} onSort={(k) => setDonationsSort((prev) => toggleSort(prev, k))} />
                            <SortableTh label={t.donationsColAmount} sortKey="amount" sort={donationsSort} onSort={(k) => setDonationsSort((prev) => toggleSort(prev, k))} />
                            <SortableTh label={t.donationsColDate} sortKey="date" sort={donationsSort} onSort={(k) => setDonationsSort((prev) => toggleSort(prev, k))} />
                          </tr>
                        </thead>
                        <tbody>
                          {sortedDonations.slice(0, donationsExpanded ? sortedDonations.length : 10).map((d, i) => {
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
                      total={partyDonations.all.length}
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

      {view === 'committeeList' && (
        <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>{t.committeesTitle}</h1>
          <p style={{ fontSize: 14, color: 'oklch(45% 0.01 260)', margin: '0 0 28px', maxWidth: 640 }}>{t.committeesSub}</p>

          {committeeList.entries.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.committeesEmpty}</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
              {committeeList.entries.map(({ committee, memberCount }) => (
                <div
                  key={committee.id}
                  onClick={() => openCommittee(String(committee.id))}
                  style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: '14px 16px' }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{committee.name}</div>
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
                </div>
              ))}
            </div>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {pollWeekGroups.map((group) => (
                <div key={group.range.start.toISOString()}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: 'oklch(48% 0.01 260)', margin: '0 0 12px' }}>
                    {t.weekOf} {formatWeekRange(group.range, lang)}
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 16 }}>
                    {group.results.map((r) => (
                      <div
                        key={r.poll.id}
                        onClick={() => openBill(r.poll.id)}
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
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {view === 'committee' && (
        <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href="#" onClick={stop(goCommitteeList)} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToCommittees}
          </a>
          {!committeeDetail.detail ? (
            <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)', marginTop: 20 }}>{t.committeeNotFound}</p>
          ) : (
            <>
              <h1 style={{ fontSize: 26, fontWeight: 800, margin: '20px 0 12px' }}>{committeeDetail.detail.committee.name}</h1>

              {committeeDetail.detail.committee.topics.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 22 }}>
                  {committeeDetail.detail.committee.topics.map((f) => (
                    <span key={f} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 10, background: 'oklch(95% 0.008 260)', color: 'oklch(40% 0.01 260)' }}>
                      {f}
                    </span>
                  ))}
                </div>
              )}

              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>
                {committeeDetail.detail.members.length} {t.committeeMembersCountLabel}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 12 }}>
                {committeeDetail.detail.members.map((row) => {
                  const roleLabel =
                    row.role === 'chairperson' || row.role === 'foreperson' ? t.committeeRoleChair
                    : row.role === 'vice_chairperson' ? t.committeeRoleViceChair
                    : row.role === 'spokesperson' ? t.committeeRoleSpokesperson
                    : row.role === 'alternate_member' ? t.committeeRoleAlternate
                    : null;
                  return (
                    <div
                      key={row.mandateId}
                      onClick={row.member ? () => openMp(String(row.member!.id)) : undefined}
                      style={{
                        cursor: row.member ? 'pointer' : 'default',
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
                      <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginTop: 3 }}>
                        {row.member?.party}
                        {roleLabel && <span style={{ fontWeight: 700, color: 'oklch(45% 0.16 265)' }}> · {roleLabel}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
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
                  <div
                    key={lobby.party}
                    onClick={() => openParty(lobby.party, 'partyList')}
                    style={{ cursor: 'pointer', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: '14px 16px' }}
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
                  </div>
                );
              })}
          </div>
        </main>
      )}

      {view === 'party' && (
        <main style={{ flex: 1, maxWidth: 900, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href="#" onClick={stop(() => (partyOrigin === 'crossref' ? goCrossref('parties') : goPartyList()))} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
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
                  {partyTabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setPartyTab(tab.key)}
                      style={{
                        padding: '10px 4px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: 13.5,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        borderBottom: `2px solid ${partyTab === tab.key ? 'oklch(45% 0.16 265)' : 'transparent'}`,
                        color: partyTab === tab.key ? 'oklch(20% 0.01 260)' : 'oklch(50% 0.01 260)',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

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
                      <div style={{ background: 'oklch(97% 0.006 260)', borderRadius: 12, padding: 16 }}>
                        <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 6 }}>{t.partyLobbySpendLabel}</div>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{formatExpenseBracket(p.expensesEuro)}</div>
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
                    {partyVotes.loading && partyVotes.votes.length === 0 ? (
                      <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.pollsLoading}</p>
                    ) : partyVotes.error ? (
                      <p style={{ fontSize: 13.5, color: 'oklch(48% 0.16 40)' }}>{t.pollsError}</p>
                    ) : partyVotes.votes.length === 0 ? (
                      <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.partyVotesEmpty}</p>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {partyVotes.votes.slice(0, partyVotesExpanded ? partyVotes.votes.length : 10).map(({ poll, tally }) => {
                            const majorityLabel =
                              tally.majority === 'yes' ? t.voteYes
                              : tally.majority === 'no' ? t.voteNo
                              : tally.majority === 'abstain' ? t.voteAbstain
                              : tally.majority === 'no_show' ? t.voteNoShow
                              : t.voteSplit;
                            return (
                              <div
                                key={poll.id}
                                onClick={() => openBill(poll.id)}
                                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px', gap: 12 }}
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
                              </div>
                            );
                          })}
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
                                <tr key={o.orgId} onClick={() => openOrg(o.orgId)} style={{ cursor: 'pointer', borderTop: '1px solid oklch(93% 0.006 260)' }}>
                                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{org.name}</td>
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
                              goCrossref('conflicts');
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 20 }}>
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
                    </div>
                    {partyDonationList.length === 0 ? (
                      <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.partyDonationsEmpty}</p>
                    ) : (
                      (() => {
                        const donationValue = (d: (typeof partyDonationList)[number], key: string): string | number | null => {
                          switch (key) {
                            case 'donor': return d.donor;
                            case 'amount': return d.amountEuro;
                            case 'date': return d.receivedOn;
                            default: return null;
                          }
                        };
                        const sortedPartyDonations = partyDonationsSort
                          ? [...partyDonationList].sort((a, b) => compareSortValues(donationValue(a, partyDonationsSort.key), donationValue(b, partyDonationsSort.key), partyDonationsSort.dir))
                          : partyDonationList;
                        return (
                          <>
                            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>{t.donationTimelineTitle}</h3>
                            <p style={{ fontSize: 12.5, color: 'oklch(45% 0.01 260)', margin: '0 0 12px', maxWidth: 700 }}>{t.donationTimelinePartySub}</p>
                            <div style={{ marginBottom: 22 }}>
                              <DonationTimeline
                                donations={partyDonationList}
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

                            <ScrollBox hintText={t.scrollHintText} style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14 }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
                                <thead>
                                  <tr style={{ background: 'oklch(97% 0.006 260)', textAlign: 'left' }}>
                                    <SortableTh label={t.donationsColDonor} sortKey="donor" sort={partyDonationsSort} onSort={(k) => setPartyDonationsSort((prev) => toggleSort(prev, k))} />
                                    <SortableTh label={t.donationsColAmount} sortKey="amount" sort={partyDonationsSort} onSort={(k) => setPartyDonationsSort((prev) => toggleSort(prev, k))} />
                                    <SortableTh label={t.donationsColDate} sortKey="date" sort={partyDonationsSort} onSort={(k) => setPartyDonationsSort((prev) => toggleSort(prev, k))} />
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedPartyDonations.slice(0, partyDonationsExpanded ? sortedPartyDonations.length : 10).map((d, i) => {
                                    const lobbyOrgId = d.donor ? snapshot?.lobbyLinks.donorLinks[d.donor] : undefined;
                                    const lobbyOrg = lobbyOrgId ? snapshot?.lobbyLinks.orgs[lobbyOrgId] : undefined;
                                    return (
                                      <tr key={`${d.publishedOn}-${d.donor}-${i}`} style={{ borderTop: '1px solid oklch(93% 0.006 260)' }}>
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
                              total={partyDonationList.length}
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
          <a href="#" onClick={stop(goHome)} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
            ← {t.backToHome}
          </a>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '20px 0 16px' }}>{t.datenschutzTitle}</h1>
          <p style={{ fontSize: 14, color: 'oklch(35% 0.01 260)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{t.datenschutzBody}</p>
        </main>
      )}

      {view === 'daten' && (
        <main style={{ flex: 1, maxWidth: 820, margin: '0 auto', width: '100%', padding: 32 }}>
          <a href="#" onClick={stop(goHome)} style={{ fontSize: 13, color: 'oklch(48% 0.01 260)' }}>
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
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 14,
            color: 'oklch(40% 0.01 260)',
            background: 'oklch(95% 0.01 265)',
          }}
        >
          <span>{t.footerDisclaimer}</span>
          <a
            href="https://www.paypal.me/oskarleenders"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              border: '1px solid oklch(45% 0.16 265 / 0.35)',
              color: 'oklch(45% 0.16 265)',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {t.footerSupportLabel}
          </a>
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
            <a href="#" onClick={stop(goDisclaimer)} style={{ color: 'oklch(52% 0.01 260)' }}>
              {t.disclaimerTitle}
            </a>
            <a href="#" onClick={stop(goImpressum)} style={{ color: 'oklch(52% 0.01 260)' }}>
              {t.impressumTitle}
            </a>
            <a href="#" onClick={stop(goDatenschutz)} style={{ color: 'oklch(52% 0.01 260)' }}>
              {t.datenschutzTitle}
            </a>
            <a href="#" onClick={stop(goDaten)} style={{ color: 'oklch(52% 0.01 260)' }}>
              {t.datenTitle}
            </a>
          </div>
          <span>{t.footerSources}</span>
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
