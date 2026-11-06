/**
 * Live charts for the Datenstories. Fed straight from public/data/datenstories/<slug>.json, so
 * they redraw with every data update. Plain SVG/HTML, no chart library (like src/charts).
 */
import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { EuroRange, LevyCamp, LevyEntry, RevolvingDoor, SugarLevy, UsLobbyData, UsLobbyGroup, UsVote } from './types';
import { indexablePath, withBase } from '../router';
import { ext } from './links';

export const SEAT_C = 'oklch(45% 0.16 265)';
export const SUB_C = 'oklch(80% 0.13 80)';
const SUB_INK = 'oklch(28% 0.05 70)';
const MUTED = 'oklch(48% 0.01 260)';

const de1 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const amountLabel = (euro: number) => (euro >= 95000 ? `${de1(euro / 1e6)} Mio.` : `${Math.round(euro / 1e3)} Tsd.`);

export function useNarrow(maxWidth = 640) {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${maxWidth}px)`).matches);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [maxWidth]);
  return narrow;
}

// ---- Treemap -----------------------------------------------------------------------------------

interface Tile {
  key: string;
  label: string;
  value: number;
  rest?: boolean;
  count: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
type TileIn = Omit<Tile, 'x' | 'y' | 'w' | 'h'>;

/** Squarified treemap (Bruls et al.) — same algorithm as the Reddit slides' build script. */
export function squarify(items: TileIn[], x: number, y: number, w: number, h: number): Tile[] {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0 || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  const nodes = items.map((i) => ({ ...i, area: i.value * scale }));
  const out: Tile[] = [];
  let rect = { x, y, w, h };
  let row: typeof nodes = [];
  const worst = (r: typeof nodes, side: number) => {
    const s = r.reduce((a, n) => a + n.area, 0);
    const mx = Math.max(...r.map((n) => n.area));
    const mn = Math.min(...r.map((n) => n.area));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const layoutRow = (r: typeof nodes) => {
    const s = r.reduce((a, n) => a + n.area, 0);
    if (rect.w >= rect.h) {
      const cw = s / rect.h;
      let cy = rect.y;
      for (const n of r) {
        const ch = n.area / cw;
        out.push({ ...n, x: rect.x, y: cy, w: cw, h: ch });
        cy += ch;
      }
      rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
    } else {
      const ch = s / rect.w;
      let cx = rect.x;
      for (const n of r) {
        const cw = n.area / ch;
        out.push({ ...n, x: cx, y: rect.y, w: cw, h: ch });
        cx += cw;
      }
      rect = { x: rect.x, y: rect.y + ch, w: rect.w, h: rect.h - ch };
    }
  };
  for (const n of nodes) {
    const side = Math.min(rect.w, rect.h);
    if (row.length === 0 || worst([...row, n], side) <= worst(row, side)) row.push(n);
    else {
      layoutRow(row);
      row = [n];
    }
  }
  if (row.length) layoutRow(row);
  return out;
}

/** Groups below `tailShare` of the zone's sum are merged into one "Weitere n Akteure" column on the right. */
function layoutZone(groups: UsLobbyGroup[], tailShare: number, x: number, y: number, w: number, h: number): Tile[] {
  const sum = groups.reduce((s, g) => s + g.valueEuro, 0);
  const items: TileIn[] = groups.filter((g) => g.valueEuro > 0).map((g) => ({ key: g.parent, label: g.label, value: g.valueEuro, count: g.entries.length }));
  const big = items.filter((i) => i.value >= sum * tailShare);
  const small = items.filter((i) => i.value < sum * tailShare);
  if (small.length < 2) return squarify(items, x, y, w, h);
  const rest: TileIn = { key: 'rest', label: '', value: small.reduce((s, i) => s + i.value, 0), count: small.reduce((s, i) => s + i.count, 0), rest: true };
  const rw = (w * rest.value) / sum;
  return [...squarify(big, x, y, w - rw, h), { ...rest, x: x + w - rw, y, w: rw, h }];
}

function TileLabel({ t, ink, unit }: { t: Tile; ink: string; unit: number }) {
  const label = t.rest ? `Weitere ${t.count} Akteure` : t.label;
  const amount = amountLabel(t.value);
  const pad = 6 * unit;
  // Largest font (15 → 9 units) at which the label and amount fit on two lines.
  for (let fs = 15; fs >= 9; fs -= 1) {
    const f = fs * unit;
    const cw = f * 0.56;
    const fitsW = (label.length * cw <= t.w - 2 * pad || (t.rest && t.w > 60 * unit)) && amount.length * cw <= t.w - 2 * pad;
    if (fitsW && t.h >= f * 2.6 + pad) {
      const words = t.rest ? ['Weitere', `${t.count} Akteure`] : [label];
      return (
        <text x={t.x + pad} y={t.y + pad + f} fill={ink} style={{ fontSize: f, pointerEvents: 'none' }}>
          {words.map((w, i) => (
            <tspan key={i} x={t.x + pad} dy={i === 0 ? 0 : f * 1.15} fontWeight={700}>
              {w}
            </tspan>
          ))}
          <tspan x={t.x + pad} dy={f * 1.2} opacity={0.85}>
            {amount}
          </tspan>
        </text>
      );
    }
  }
  return null;
}

/** Id of the sources block under the treemap; the "Weitere n Akteure" tiles jump there. */
export const TREEMAP_SOURCES_ID = 'quellen-us-lobby';

export function UsTreemap({ data, onNavigate, onShowRest }: { data: UsLobbyData; onNavigate: (path: string) => void; onShowRest: () => void }) {
  const narrow = useNarrow();
  const W = narrow ? 360 : 1000;
  const H = narrow ? 560 : 520;
  const unit = narrow ? 0.85 : 1;
  const gap = 2;
  const { seat, subsidiary } = data.treemap.zones;
  const total = seat.sumEuro + subsidiary.sumEuro;
  const seatH = (H * seat.sumEuro) / total;
  // The seat band is thin, so its tail threshold is higher; otherwise it would be all slivers.
  const seatTiles = layoutZone(seat.groups, narrow ? 0.07 : 0.035, 0, 0, W, seatH - gap);
  const subTiles = layoutZone(subsidiary.groups, narrow ? 0.014 : 0.0095, 0, seatH + gap, W, H - seatH - gap);
  const [hover, setHover] = useState<string | null>(null);
  const tiles = [...seatTiles.map((t) => ({ t, zone: 'seat' as const })), ...subTiles.map((t) => ({ t, zone: 'subsidiary' as const }))];
  // A tile stands for a parent company; it links to the politblick page of that company's
  // largest register entry (entries are sorted by spend in the build).
  const pathOf = (zone: 'seat' | 'subsidiary', key: string) => data.treemap.zones[zone].groups.find((g) => g.parent === key)?.entries.find((e) => e.orgPath)?.orgPath ?? null;
  const hot = tiles.find(({ t, zone }) => `${zone}:${t.key}` === hover) ?? null;
  const tileName = (t: Tile) => (t.rest ? `Weitere ${t.count} Akteure` : t.label);
  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        aria-label={`Treemap: ${seat.count} Einträge mit US-Sitz (${amountLabel(seat.sumEuro)} €), ${subsidiary.count} deutsche Töchter von US-Konzernen (${amountLabel(subsidiary.sumEuro)} €)`}
        style={{ display: 'block', fontFamily: 'inherit' }}
      >
        {tiles.map(({ t, zone }) => {
          const id = `${zone}:${t.key}`;
          const path = t.rest ? null : pathOf(zone, t.key);
          const href = path ? withBase(indexablePath(path), import.meta.env.BASE_URL) : `#${TREEMAP_SOURCES_ID}`;
          const title = `${tileName(t)}: ${amountLabel(t.value)} € pro Jahr${t.count > 1 && !t.rest ? ` (${t.count} Registereinträge)` : ''}`;
          return (
            <a
              key={id}
              href={href}
              aria-label={title}
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                if (path) onNavigate(path);
                else onShowRest();
              }}
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={t.x + 1}
                y={t.y + 1}
                width={Math.max(0, t.w - 2)}
                height={Math.max(0, t.h - 2)}
                rx={3}
                fill={zone === 'seat' ? SEAT_C : SUB_C}
                opacity={hover && hover !== id ? 0.78 : 1}
                stroke={hover === id ? 'oklch(20% 0.02 260)' : 'none'}
                strokeWidth={hover === id ? 2 : 0}
              >
                <title>{title}</title>
              </rect>
              <TileLabel t={t} ink={zone === 'seat' ? 'white' : SUB_INK} unit={unit} />
            </a>
          );
        })}
      </svg>
      <figcaption style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginTop: 10, fontSize: 13, color: MUTED }}>
        <span>
          <Swatch c={SEAT_C} /> Sitz in den USA · {seat.count} Einträge · {amountLabel(seat.sumEuro)} €
        </span>
        <span>
          <Swatch c={SUB_C} /> Deutsche Tochter eines US-Konzerns · {subsidiary.count} Einträge · {amountLabel(subsidiary.sumEuro)} €
        </span>
        <span style={{ color: hot ? 'oklch(25% 0.01 260)' : MUTED, fontWeight: hot ? 600 : 400 }}>
          {hot
            ? `${tileName(hot.t)}: ${amountLabel(hot.t.value)} € pro Jahr${hot.t.count > 1 && !hot.t.rest ? ` · ${hot.t.count} Registereinträge` : ''} · ${hot.zone === 'seat' ? 'Sitz in den USA' : 'deutsche Tochter'}`
            : 'Fläche = Lobbyausgaben pro Jahr · Feld berühren oder anklicken: Organisationsseite'}
        </span>
      </figcaption>
    </figure>
  );
}

const Swatch = ({ c }: { c: string }) => (
  <span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 2, background: c, verticalAlign: '-1px', marginRight: 4 }} />
);

// ---- Sugar levy unit chart -------------------------------------------------------------------

const CAMP_LABEL: Record<Exclude<LevyCamp, 'agency'>, string> = { against: 'Dagegen', shape: 'Gestalten / offen', for: 'Dafür' };
const CAMP_C: Record<Exclude<LevyCamp, 'agency'>, string> = {
  against: 'oklch(30% 0.01 260)',
  shape: 'oklch(72% 0.01 260)',
  for: SEAT_C,
};

export function LevyUnitChart({ levy, onNavigate }: { levy: SugarLevy; onNavigate: (path: string) => void }) {
  const narrow = useNarrow();
  const camps = ['against', 'shape', 'for'] as const;
  const [hover, setHover] = useState<LevyEntry | null>(null);
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(110px, auto) 1fr', gap: narrow ? '4px 0' : '14px 16px', alignItems: 'center' }}>
        {camps.map((camp) => {
          // US actors first, so they line up at the start of every row.
          const entries = levy.entries.filter((e) => e.camp === camp).sort((a, b) => Number(b.isUs) - Number(a.isUs));
          return (
            <LevyRow key={camp} label={CAMP_LABEL[camp]} color={CAMP_C[camp]} entries={entries} onNavigate={onNavigate} narrow={narrow} hover={hover} onHover={setHover} />
          );
        })}
      </div>
      <div aria-live="polite" style={{ minHeight: 44, marginTop: 12, padding: '8px 12px', borderRadius: 6, background: 'oklch(97.5% 0.006 260)', fontSize: 14, lineHeight: 1.45 }}>
        {hover ? (
          <>
            <strong>{hover.label}</strong>
            {hover.isUs && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, background: SUB_C, borderRadius: 3, padding: '1px 5px' }}>US</span>}
            <span style={{ color: MUTED }}> · {CAMP_LABEL[hover.camp as Exclude<LevyCamp, 'agency'>]} · </span>
            {hover.note}
          </>
        ) : (
          <span style={{ color: MUTED }}>Kästchen berühren: Position laut Registereintrag. Anklicken: Organisationsseite.</span>
        )}
      </div>
      <figcaption style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginTop: 10, fontSize: 13, color: MUTED }}>
        <span>
          <Swatch c={SUB_C} /> US-Konzern oder US-Akteur
        </span>
        <span>Ein Kästchen = eine Organisation · ohne {levy.counts.agency} Agenturen und Einzelpersonen</span>
      </figcaption>
    </figure>
  );
}

function LevyRow({
  label,
  color,
  entries,
  onNavigate,
  narrow,
  hover,
  onHover,
}: {
  label: string;
  color: string;
  entries: LevyEntry[];
  onNavigate: (path: string) => void;
  narrow: boolean;
  hover: LevyEntry | null;
  onHover: (e: LevyEntry | null) => void;
}) {
  return (
    <>
      {/* On a phone the label sits above its squares, with the count beside it. */}
      <div style={narrow ? { display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 10 } : undefined}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{label}</div>
        <div style={{ fontSize: 13, color: MUTED }}>{entries.length}</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {entries.map((e) => (
          <a
            key={e.id}
            href={e.orgPath ? withBase(indexablePath(e.orgPath), import.meta.env.BASE_URL) : e.registerUrl}
            {...(e.orgPath ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
            onClick={(ev) => {
              if (!e.orgPath || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
              ev.preventDefault();
              onNavigate(e.orgPath);
            }}
            onMouseEnter={() => onHover(e)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(e)}
            onBlur={() => onHover(null)}
            style={{
              position: 'relative',
              width: 20,
              height: 20,
              borderRadius: 3,
              background: e.isUs ? SUB_C : color,
              display: 'block',
              outline: hover?.id === e.id ? '2px solid oklch(20% 0.02 260)' : 'none',
              outlineOffset: 1,
            }}
          >
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{e.label}</span>
          </a>
        ))}
      </div>
    </>
  );
}

// ---- Revolving door timeline ----------------------------------------------------------------------

type Person = RevolvingDoor['people'][number];

const ELECTION = '2025-02-23';
const DOOR_LINE = 'oklch(58% 0.17 25)';
const ROW_HOT = 'oklch(97.5% 0.018 265)';
const RULE = '1px solid oklch(92% 0.006 260)';

/** "2025-05" or "2025-02-23" → fractional year, for placing a point on the timeline. */
const yearPos = (d: string) => Number(d.slice(0, 4)) + (Number(d.slice(5, 7)) - 1) / 12 + (d.length > 7 ? (Number(d.slice(8, 10)) - 1) / 365 : 1 / 24);
const monthLabel = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;

/** Register spending range as card text: "250–300 Tsd. €", "bis 50 Tsd. €", "0 €". */
export function euroRangeLabel(r: EuroRange | null) {
  if (!r) return null;
  if (r.to === 0) return '0 €';
  const k = (n: number) => Math.round(n / 1000).toLocaleString('de-DE');
  if (r.from <= 1) return `bis ${k(r.to)} Tsd. €`;
  if (r.to >= 1e6) return `${de1(r.from / 1e6)}–${de1(r.to / 1e6)} Mio. €`;
  return `${k(r.from - 1)}–${k(r.to)} Tsd. €`;
}

function doorCardSub(p: Person) {
  const ranges = [...new Set(p.clients.map((c) => euroRangeLabel(c.euro)).filter(Boolean))];
  const amount = ranges.length === 1 ? `${p.clients.length > 1 ? 'je ' : ''}${ranges[0]}` : ranges.join(' / ');
  if (p.direct) return [`direkt`, p.cardNote ?? amount].filter(Boolean).join(' · ');
  return [`über ${p.via?.name ?? ''}`, amount].filter(Boolean).join(' · ');
}

const registerRole = (p: Person) => [p.position ?? (p.kind === 'HOUSE_OF_REPRESENTATIVES' ? 'Mitglied des Bundestages' : null), p.authority].filter(Boolean).join(', ');

/** "vor 1 Jahr und 8 Monaten" for the months between a YYYY-MM and today. */
function agoLabel(ym: string, today: string) {
  const m = (Number(today.slice(0, 4)) - Number(ym.slice(0, 4))) * 12 + (Number(today.slice(5, 7)) - Number(ym.slice(5, 7)));
  if (m < 1) return 'in diesem Monat';
  const y = Math.floor(m / 12);
  const r = m % 12;
  return `vor ${[y ? `${y} ${y === 1 ? 'Jahr' : 'Jahren'}` : null, r ? `${r} ${r === 1 ? 'Monat' : 'Monaten'}` : null].filter(Boolean).join(' und ')}`;
}

const segBtn = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? SEAT_C : 'oklch(88% 0.006 260)'}`,
  background: active ? SEAT_C : 'white',
  color: active ? 'white' : 'oklch(30% 0.01 260)',
  padding: '3px 12px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
});

function orgA(path: string | null, children: ReactNode, onNavigate: (p: string) => void, style?: CSSProperties) {
  if (!path) return <span style={style}>{children}</span>;
  return (
    <a
      href={withBase(indexablePath(path), import.meta.env.BASE_URL)}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onNavigate(path);
      }}
      style={style}
    >
      {children}
    </a>
  );
}

/** Everything the register says about one person, shown for the selected row. */
function DoorDetail({ p, today, onNavigate }: { p: Person; today: string; onNavigate: (path: string) => void }) {
  const label = { fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED, marginBottom: 3 } as const;
  return (
    <div style={{ margin: '4px 0 6px', padding: '14px 16px', border: '1px solid oklch(90% 0.006 260)', borderLeft: `4px solid ${DOOR_LINE}`, borderRadius: 8, background: 'white' }}>
      <div style={{ fontWeight: 800, fontSize: 17 }}>{p.name}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px 22px', marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
        <div>
          <div style={label}>Früheres Amt laut Register</div>
          <div>{registerRole(p) || p.roleLabel}</div>
          {p.endDate && (
            <div style={{ color: MUTED }}>
              endete {monthLabel(p.endDate)}, {agoLabel(p.endDate, today)}
            </div>
          )}
          {p.note && <div style={{ color: MUTED, fontStyle: 'italic' }}>{p.note}</div>}
        </div>
        <div>
          <div style={label}>Heute genannt bei</div>
          {p.clients.map((c) => (
            <div key={c.id}>
              {orgA(c.orgPath, <strong>{c.name}</strong>, onNavigate)}{' '}
              <a href={c.registerUrl} {...ext} style={{ fontSize: 12, color: MUTED }}>
                {c.id}
              </a>
              {c.euro && <span style={{ color: MUTED }}> · {euroRangeLabel(c.euro)}</span>}
            </div>
          ))}
          <div style={{ color: MUTED }}>
            {p.direct ? (
              'im eigenen Registereintrag der Organisation'
            ) : (
              <>
                als Mitarbeiter der Agentur {p.via?.name ? orgA(p.via.orgPath, p.via.name, onNavigate) : null}
                {p.cardNote ? ` · ${p.cardNote}` : ''}
              </>
            )}
          </div>
          {p.direct && p.cardNote && <div style={{ color: MUTED }}>{p.cardNote}</div>}
        </div>
        <div>
          <div style={label}>{p.topics.kind === 'mandate' ? 'Worum es im Auftrag geht' : p.topics.kind === 'client' ? 'Themen des Auftraggebers im Register' : 'Themen'}</div>
          {p.topics.items.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {p.topics.items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : (
            <div style={{ color: MUTED }}>Im Register sind dazu keine Themen genannt.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RevolvingDoorTimeline({ door, today, onNavigate }: { door: RevolvingDoor; today: string; onNavigate: (path: string) => void }) {
  const narrow = useNarrow();
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [fromYear, setFromYear] = useState<2021 | 2024>(2021);
  const end = yearPos(today);
  const span = end - fromYear;
  const pos = (d: string) => Math.max(0, Math.min(100, ((yearPos(d) - fromYear) / span) * 100));
  const years = Array.from({ length: Math.floor(end) - fromYear + 1 }, (_, i) => fromYear + i);
  const sel = door.people.find((p) => p.name === selected) ?? null;
  const pick = (name: string) => setSelected(selected === name ? null : name);

  const track = (p: Person, showAxis: boolean) => {
    const active = selected === p.name;
    const left = p.endDate && yearPos(p.endDate) < fromYear;
    return (
      <div style={{ position: 'relative', height: showAxis ? 44 : 30 }}>
        {years.map((y) => (
          <div key={y} style={{ position: 'absolute', left: `${pos(`${y}-01`)}%`, top: 0, bottom: 0, borderLeft: RULE }}>
            {showAxis && <span style={{ position: 'absolute', top: 0, left: 3, fontSize: 11, color: MUTED }}>{y}</span>}
          </div>
        ))}
        <div style={{ position: 'absolute', left: `${pos(ELECTION)}%`, top: 0, bottom: 0, borderLeft: '1.5px dashed oklch(70% 0.01 260)' }} />
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, borderLeft: `2px solid ${DOOR_LINE}`, opacity: 0.6 }} />
        {p.endDate && (
          <>
            <div style={{ position: 'absolute', left: `${pos(p.endDate)}%`, right: 0, bottom: 13, height: active ? 5 : 3, marginBottom: active ? -1 : 0, background: DOOR_LINE, borderRadius: 2 }} />
            {left ? (
              <span style={{ position: 'absolute', left: 3, bottom: 19, fontSize: 11, color: MUTED }} title={`Ende von Amt oder Mandat: ${monthLabel(p.endDate)}`}>
                ◂ {monthLabel(p.endDate)}
              </span>
            ) : (
              <div
                title={`Ende von Amt oder Mandat: ${monthLabel(p.endDate)}`}
                style={{
                  position: 'absolute',
                  left: `${pos(p.endDate)}%`,
                  bottom: active ? 5 : 7,
                  width: active ? 19 : 15,
                  height: active ? 19 : 15,
                  marginLeft: active ? -9.5 : -7.5,
                  borderRadius: '50%',
                  background: active ? 'oklch(25% 0.01 260)' : 'white',
                  border: '2.5px solid oklch(25% 0.01 260)',
                  boxSizing: 'border-box',
                  transition: 'all 0.12s',
                }}
              />
            )}
          </>
        )}
      </div>
    );
  };

  const card = (p: Person) => {
    const seat = p.clients.every((c) => c.zone === 'seat');
    const path = p.clients.find((c) => c.orgPath)?.orgPath ?? null;
    return orgA(
      path,
      <>
        <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{p.cardLabel}</div>
        <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>{doorCardSub(p)}</div>
      </>,
      onNavigate,
      { display: 'block', padding: '9px 12px', borderRadius: 6, background: seat ? SEAT_C : SUB_C, color: seat ? 'white' : SUB_INK, textDecoration: 'none' },
    );
  };

  const who = (p: Person) => (
    <>
      <div style={{ fontWeight: 800, fontSize: 17 }}>{p.name}</div>
      <div style={{ fontSize: 13, color: MUTED }}>
        {p.roleLabel}
        {p.endDate ? `, bis ${monthLabel(p.endDate)}` : ''}
      </div>
    </>
  );
  const keySelect = (name: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(name);
    }
  };

  return (
    <figure style={{ margin: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center', fontSize: 13, color: MUTED, marginBottom: 10 }}>
        <span>
          <span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: '50%', border: '2.5px solid oklch(25% 0.01 260)', boxSizing: 'border-box', verticalAlign: '-1px', marginRight: 4 }} />
          Ende von Amt oder Mandat
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 16, height: 3, background: DOOR_LINE, verticalAlign: '3px', marginRight: 4 }} />
          seither
        </span>
        <span>
          <Swatch c={SUB_C} /> heute Lobbyarbeit für US-Tochter
        </span>
        <span>
          <Swatch c={SEAT_C} /> … für Akteur mit US-Sitz
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 0, height: 11, borderLeft: '1.5px dashed oklch(60% 0.01 260)', verticalAlign: '-1px', marginRight: 6 }} />
          Bundestagswahl 2025
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex' }} role="group" aria-label="Zeitachse">
          <button type="button" aria-pressed={fromYear === 2021} onClick={() => setFromYear(2021)} style={{ ...segBtn(fromYear === 2021), borderRadius: '6px 0 0 6px' }}>
            Seit 2021
          </button>
          <button type="button" aria-pressed={fromYear === 2024} onClick={() => setFromYear(2024)} style={{ ...segBtn(fromYear === 2024), borderRadius: '0 6px 6px 0', borderLeft: 'none' }}>
            Seit 2024
          </button>
        </span>
      </div>

      {narrow ? (
        <div>
          {door.people.map((p) => {
            const active = selected === p.name;
            return (
              <div key={p.name} style={{ padding: '10px 0', borderTop: RULE }}>
                <div role="button" tabIndex={0} aria-pressed={active} aria-label={`${p.name}: Details ${active ? 'schließen' : 'öffnen'}`} onClick={() => pick(p.name)} onKeyDown={keySelect(p.name)} style={{ cursor: 'pointer' }}>
                  {who(p)}
                  {p.note && <div style={{ fontSize: 12.5, color: MUTED, fontStyle: 'italic' }}>{p.note}</div>}
                  <div style={{ margin: '4px 0 2px' }}>{track(p, true)}</div>
                </div>
                {card(p)}
                {active && (
                  <div style={{ marginTop: 8 }}>
                    <DoorDetail p={p} today={today} onNavigate={onNavigate} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.2fr) minmax(260px, 1.5fr) minmax(220px, 1fr)', columnGap: 18, alignItems: 'stretch' }}>
            <div />
            {track({ ...door.people[0], endDate: null }, true)}
            <div />
            {door.people.map((p) => {
              const active = selected === p.name;
              const bg = active || hover === p.name ? ROW_HOT : 'transparent';
              const enter = () => setHover(p.name);
              const leave = () => setHover(null);
              const cellStyle: CSSProperties = { borderTop: RULE, background: bg, transition: 'background 0.1s', cursor: 'pointer' };
              return (
                <Fragment key={p.name}>
                  <div role="button" tabIndex={0} aria-pressed={active} aria-label={`${p.name}: Details ${active ? 'schließen' : 'öffnen'}`} onClick={() => pick(p.name)} onKeyDown={keySelect(p.name)} onMouseEnter={enter} onMouseLeave={leave} style={{ ...cellStyle, padding: '10px 8px', borderRadius: '6px 0 0 6px' }}>
                    {who(p)}
                    {p.note && <div style={{ fontSize: 12.5, color: MUTED, fontStyle: 'italic' }}>{p.note}</div>}
                  </div>
                  <div onClick={() => pick(p.name)} onMouseEnter={enter} onMouseLeave={leave} style={{ ...cellStyle, display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '100%' }}>{track(p, false)}</div>
                  </div>
                  <div onMouseEnter={enter} onMouseLeave={leave} style={{ ...cellStyle, padding: '6px 6px 6px 8px', borderRadius: '0 6px 6px 0', cursor: 'default' }}>
                    {card(p)}
                  </div>
                </Fragment>
              );
            })}
          </div>
          <div style={{ marginTop: 12 }}>{sel ? <DoorDetail p={sel} today={today} onNavigate={onNavigate} /> : <div style={{ fontSize: 13, color: MUTED }}>Eine Zeile anklicken: Amt, Auftrag und Themen laut Register.</div>}</div>
        </>
      )}
      <figcaption style={{ fontSize: 13, color: MUTED, marginTop: 10 }}>
        Rechter Rand = heute · Zeile anklicken für Details, Karte öffnet die Organisationsseite · Angaben laut Lobbyregister (Selbstauskunft)
      </figcaption>
    </figure>
  );
}

// ---- Votes with US lobbyists ----------------------------------------------------------------------

const V_YES = 'oklch(52% 0.13 155)';
const V_NO = 'oklch(56% 0.16 40)';
const V_ABSTAIN = 'oklch(80% 0.02 260)';
const V_NOSHOW = 'oklch(93% 0.004 260)';

type PollNote = { short: string; context?: string; stanceTopic?: string };

const STANCE: Record<LevyCamp, { label: string; bg: string; ink: string }> = {
  against: { label: 'dagegen', bg: 'oklch(93% 0.05 40)', ink: 'oklch(42% 0.14 40)' },
  for: { label: 'dafür', bg: 'oklch(93% 0.05 155)', ink: 'oklch(38% 0.11 155)' },
  shape: { label: 'will mitgestalten', bg: 'oklch(94% 0.01 260)', ink: 'oklch(38% 0.02 260)' },
  agency: { label: 'Agentur', bg: 'oklch(94% 0.01 260)', ink: 'oklch(38% 0.02 260)' },
};

/** First sentences of a summary, at most `max` characters, never cut mid-sentence. */
function shorten(text: string, max = 380) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const s of sentences) {
    if (out && (out + ' ' + s).length > max) break;
    out = out ? `${out} ${s}` : s;
  }
  return out.length > max + 120 ? `${out.slice(0, max).trimEnd()} …` : out;
}

const dateDeShort = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.${iso.slice(0, 4)}`;

function ResultBar({ totals, height = 14 }: { totals: UsVote['totals']; height?: number }) {
  const cast = totals.yes + totals.no + totals.abstain;
  const seg = (n: number, c: string, name: string) => (n > 0 ? <div title={`${name}: ${n}`} style={{ width: `${(n / cast) * 100}%`, background: c }} /> : null);
  return (
    <div style={{ display: 'flex', height, borderRadius: 3, overflow: 'hidden', background: V_NOSHOW }}>
      {seg(totals.yes, V_YES, 'Ja')}
      {seg(totals.no, V_NO, 'Nein')}
      {seg(totals.abstain, V_ABSTAIN, 'Enthaltung')}
    </div>
  );
}

function PartyBars({ parties }: { parties: UsVote['parties'] }) {
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {parties.map((p) => {
        const total = p.yes + p.no + p.abstain + p.noShow;
        const seg = (n: number, c: string, name: string) => (n > 0 ? <div title={`${p.party}, ${name}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: c }} /> : null);
        return (
          <div key={p.party} style={{ display: 'grid', gridTemplateColumns: '78px 1fr 92px', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
              {p.party}
            </span>
            <div style={{ display: 'flex', height: 10, borderRadius: 2, overflow: 'hidden', background: V_NOSHOW }}>
              {seg(p.yes, V_YES, 'Ja')}
              {seg(p.no, V_NO, 'Nein')}
              {seg(p.abstain, V_ABSTAIN, 'Enthaltung')}
              {seg(p.noShow, V_NOSHOW, 'nicht abgegeben')}
            </div>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: MUTED, textAlign: 'right' }}>
              {p.yes} : {p.no}
              {p.abstain ? ` · ${p.abstain}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StanceTag({ camp }: { camp: LevyCamp }) {
  const s = STANCE[camp];
  return <span style={{ background: s.bg, color: s.ink, fontWeight: 700, fontSize: 12, padding: '1px 7px', borderRadius: 10, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

export function VoteRows({
  votes,
  pollNotes,
  orgNotes,
  onNavigate,
}: {
  votes: UsVote[];
  pollNotes: Record<number, PollNote>;
  orgNotes: Record<string, string>;
  onNavigate: (path: string) => void;
}) {
  const narrow = useNarrow(760);
  // The vote the sugar levy rides on starts open, so the for/against picture is visible at once.
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const allOpen = votes.length > 0 && votes.every((v) => open.has(v.id));
  const toggle = (id: number) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', alignItems: 'center', fontSize: 13, color: MUTED, marginBottom: 6 }}>
        <span>
          <Swatch c={V_YES} /> Ja
        </span>
        <span>
          <Swatch c={V_NO} /> Nein
        </span>
        <span>
          <Swatch c={V_ABSTAIN} /> Enthaltung
        </span>
        <span>
          <Swatch c={SUB_C} /> US-Konzern mit Lobbyarbeit zum Gesetz
        </span>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(votes.map((v) => v.id)))}
          style={{ marginLeft: 'auto', border: 'none', background: 'none', padding: 0, color: SEAT_C, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
        >
          {allOpen ? 'Alle zuklappen' : 'Alle aufklappen'}
        </button>
      </div>
      {votes.map((v) => {
        const note = pollNotes[v.id];
        const isOpen = open.has(v.id);
        const single = v.usOrgs.length === 1 ? v.usOrgs[0] : null;
        const stances = v.usOrgs.filter((o) => o.stance && o.stance.camp !== 'agency');
        const demand = !stances.length && single ? single.demands.find((d) => d.trim().length > 12) : null;
        const extra = single && orgNotes[single.id];
        return (
          <div key={v.id} style={{ borderTop: RULE, padding: '14px 0 12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(220px, 1.25fr) minmax(170px, 0.8fr) minmax(260px, 1.6fr)', gap: narrow ? 8 : 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.25 }}>{orgA(v.path, note?.short ?? v.title, onNavigate, { color: 'inherit', textDecoration: 'none' })}</div>
                <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
                  {dateDeShort(v.date)}
                  {note?.context ? ` · ${note.context}` : ''}
                  {v.accepted ? ' · angenommen' : ' · abgelehnt'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggle(v.id)}
                aria-label={`${note?.short ?? v.title}: Ergebnis nach Fraktion ${isOpen ? 'ausblenden' : 'anzeigen'}`}
                style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', alignSelf: 'start' }}
              >
                <ResultBar totals={v.totals} />
                <div style={{ fontSize: 13, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {v.totals.yes} : {v.totals.no}
                  {v.totals.abstain ? ` · ${v.totals.abstain} Enth.` : ''}
                </div>
              </button>
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                  {v.usOrgs.map((o) => (
                    <Fragment key={o.id}>
                      {orgA(o.orgPath, orgNotes[o.id] ? o.name.split(/[\s-]/)[0] : o.label, onNavigate, {
                        background: SUB_C,
                        color: SUB_INK,
                        fontWeight: 700,
                        fontSize: 13,
                        padding: '2px 8px',
                        borderRadius: 4,
                        textDecoration: 'none',
                      })}
                    </Fragment>
                  ))}
                  <span style={{ fontSize: 12.5, color: MUTED }}>
                    {v.usOrgs.length} von {v.lobbyCount} Lobbyakteuren
                  </span>
                </div>
                {extra && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 5 }}>{extra}</div>}
                {stances.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center', marginTop: 6, fontSize: 14 }}>
                    {note?.stanceTopic && <strong>{note.stanceTopic}:</strong>}
                    {stances.map((o) => (
                      <span key={o.id} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                        {o.label} <StanceTag camp={o.stance!.camp} />
                      </span>
                    ))}
                  </div>
                )}
                {demand && <div style={{ fontSize: 14, marginTop: 5 }}>Anliegen laut Register: „{demand.trim().length > 130 ? `${demand.trim().slice(0, 127).trimEnd()} […]` : demand.trim()}“</div>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggle(v.id)}
              aria-expanded={isOpen}
              style={{ marginTop: 8, border: 'none', background: 'none', padding: 0, color: SEAT_C, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              {isOpen ? '▾ Details ausblenden' : '▸ Worum es geht, Ergebnis nach Fraktion, Anliegen der US-Konzerne'}
            </button>
            {isOpen && (
              <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(220px, 1.1fr) minmax(250px, 1fr) minmax(250px, 1.3fr)', gap: '16px 24px', marginTop: 10, padding: '14px 16px', background: 'oklch(98.5% 0.004 260)', borderRadius: 8 }}>
                <div>
                  <div style={detailLabel}>Worum es geht</div>
                  {v.summary ? <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.55 }}>{shorten(v.summary)}</p> : <p style={{ margin: 0, fontSize: 14, color: MUTED }}>{v.title}</p>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    {v.topics.map((t) => (
                      <span key={t} style={{ fontSize: 12, background: 'oklch(94% 0.01 260)', borderRadius: 10, padding: '1px 8px' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>
                    {orgA(v.path, 'Abstimmung auf Politblick', onNavigate)}
                    {v.abgeordnetenwatchUrl && (
                      <a href={v.abgeordnetenwatchUrl} {...ext}>
                        Zusammenfassung: abgeordnetenwatch
                      </a>
                    )}
                    {v.drucksachen.length > 0 && <span style={{ color: MUTED }}>Drucksache {v.drucksachen.join(', ')}</span>}
                  </div>
                </div>
                <div>
                  <div style={detailLabel}>Ergebnis nach Fraktion (Ja : Nein · Enth.)</div>
                  <PartyBars parties={v.parties} />
                </div>
                <div>
                  <div style={detailLabel}>US-Konzerne und ihr Anliegen</div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 9, fontSize: 14 }}>
                    {v.usOrgs.map((o) => (
                      <li key={o.id}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', alignItems: 'center' }}>
                          <strong>{orgA(o.orgPath, o.name, onNavigate)}</strong>
                          {o.stance && o.stance.camp !== 'agency' && (
                            <>
                              {note?.stanceTopic && <span style={{ color: MUTED }}>zur {note.stanceTopic}:</span>}
                              <StanceTag camp={o.stance.camp} />
                            </>
                          )}
                        </div>
                        {orgNotes[o.id] && <div style={{ fontSize: 12.5, color: MUTED }}>{orgNotes[o.id]}</div>}
                        {o.stance && (
                          <div style={{ fontSize: 13, marginTop: 1 }}>
                            {o.stance.note}{' '}
                            <a href={o.registerUrl} {...ext} style={{ color: MUTED, fontSize: 12 }}>
                              Registereintrag, Stand {dateDeShort(o.stance.checkedOn)}
                            </a>
                          </div>
                        )}
                        {o.demands.filter((d) => d.trim()).length > 0 && (
                          <div style={{ fontSize: 13, color: MUTED, marginTop: 1 }}>
                            Thema laut Register: {o.demands.filter((d) => d.trim()).map((d) => `„${d.trim()}“`).join(' · ')}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>Ob eine Organisation dafür oder dagegen ist, steht nur dort, wo wir den Wortlaut ihres Registereintrags gelesen haben.</div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <figcaption style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>Titel öffnet die Abstimmung, Konzernname die Organisationsseite, Ergebnisbalken oder „Details“ klappen die Zeile auf</figcaption>
    </figure>
  );
}

const detailLabel = { fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 } as const;
