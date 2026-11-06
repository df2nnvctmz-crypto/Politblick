/**
 * Static, non-interactive thumbnails for the index cards: a small picture of each story's main
 * chart, drawn from the story's own data file (biggest companies with their amounts, the bills
 * with their vote result). Decorative (aria-hidden); the real, linked chart is on the story page.
 */
import { SEAT_C, SUB_C, amountLabel, squarify } from './charts';
import type { DatenstoryData, UsGesetzeData, UsLobbyData } from './types';
import { pollNotes } from './us-gesetze/notes';

const AMBER_INK = 'oklch(28% 0.05 70)';
const YES = 'oklch(52% 0.13 155)';
const NO = 'oklch(56% 0.16 40)';
const GREY = 'oklch(86% 0.01 260)';
const INK = 'oklch(25% 0.01 260)';
const MUTED = 'oklch(48% 0.01 260)';

const frame = { display: 'block', width: '100%', height: '100%' } as const;
const W = 480;
const H = 230;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(3, n - 1)).trimEnd()}…` : s);

/** Part 1: the real treemap of the biggest parent companies (US seat in blue, German subsidiaries in amber). */
function UsLobbyPreview({ data }: { data: UsLobbyData | null }) {
  if (!data) return <svg viewBox={`0 0 ${W} ${H}`} style={frame} aria-hidden />;
  const { seat, subsidiary } = data.treemap.zones;
  const all = [
    ...seat.groups.map((g) => ({ ...g, zone: 'seat' as const })),
    ...subsidiary.groups.map((g) => ({ ...g, zone: 'sub' as const })),
  ].sort((a, b) => b.valueEuro - a.valueEuro);
  const top = all.slice(0, 7);
  const tiles = squarify(
    top.map((g) => ({ key: g.parent, label: g.label, value: g.valueEuro, count: g.entries.length })),
    0,
    0,
    W,
    H,
  );
  const zoneOf = new Map(top.map((g) => [g.parent, g.zone]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" style={frame} aria-hidden>
      {tiles.map((t) => {
        const isSeat = zoneOf.get(t.key) === 'seat';
        const ink = isSeat ? 'white' : AMBER_INK;
        const big = t.w >= 70 && t.h >= 40 && !t.rest;
        const size = t.w > 150 ? 15 : 12;
        return (
          <g key={t.key}>
            <rect x={t.x} y={t.y} width={t.w} height={t.h} fill={t.rest ? GREY : isSeat ? SEAT_C : SUB_C} stroke="white" strokeWidth={1.5} />
            {big && (
              <>
                <text x={t.x + 8} y={t.y + 8 + size} fontSize={size} fontWeight={800} fill={ink}>
                  {clip(t.label, Math.floor((t.w - 12) / (size * 0.55)))}
                </text>
                <text x={t.x + 8} y={t.y + 10 + size * 2} fontSize={11.5} fill={ink} opacity={0.9}>
                  {amountLabel(t.value)} €
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Part 2: the bills with the most lobby entries and their vote result, next to the sugar-levy squares. */
function UsGesetzePreview({ data }: { data: UsGesetzeData | null }) {
  if (!data) return <svg viewBox={`0 0 ${W} ${H}`} style={frame} aria-hidden />;
  const votes = [...data.votes].sort((a, b) => b.lobbyCount - a.lobbyCount).slice(0, 4);
  const BW = 250;
  const c = data.sugarLevy.counts;
  const cells = [...Array(c.against).fill(NO), ...Array(c.for).fill(YES)];
  const COLS = 6;
  const legendY = 40 + Math.ceil(cells.length / COLS) * 22 + 12;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" style={frame} aria-hidden>
      {votes.map((v, i) => {
        const y = 16 + i * 53;
        const tot = v.totals.yes + v.totals.no + v.totals.abstain + v.totals.noShow;
        const yes = (BW * v.totals.yes) / tot;
        const no = (BW * v.totals.no) / tot;
        const rest = (BW * v.totals.abstain) / tot;
        return (
          <g key={v.id}>
            <text x={16} y={y + 11} fontSize={12} fontWeight={800} fill={INK}>
              {clip(pollNotes[v.id]?.short ?? v.title, 22)}
            </text>
            <text x={16 + BW} y={y + 11} fontSize={11} textAnchor="end" fill={MUTED}>
              {v.lobbyCount} Einträge
            </text>
            <rect x={16} y={y + 18} width={yes} height={14} fill={YES} />
            <rect x={16 + yes} y={y + 18} width={no} height={14} fill={NO} />
            <rect x={16 + yes + no} y={y + 18} width={rest} height={14} fill="oklch(80% 0.02 260)" />
          </g>
        );
      })}
      <line x1={288} y1={16} x2={288} y2={214} stroke="oklch(92% 0.006 260)" />
      <text x={304} y={28} fontSize={12} fontWeight={800} fill={INK}>
        Zuckerabgabe
      </text>
      {cells.map((col, i) => (
        <rect key={i} x={304 + (i % COLS) * 28} y={40 + Math.floor(i / COLS) * 22} width={22} height={17} rx={3} fill={col} />
      ))}
      <text x={304} y={legendY} fontSize={11.5} fontWeight={700} fill={NO}>
        {c.against} dagegen
      </text>
      <text x={394} y={legendY} fontSize={11.5} fontWeight={700} fill={YES}>
        {c.for} dafür
      </text>
    </svg>
  );
}

export function StoryPreview({ slug, data }: { slug: string; data: DatenstoryData | null }) {
  if (slug === 'us-lobby') return <UsLobbyPreview data={data && 'treemap' in data ? data : null} />;
  if (slug === 'us-gesetze') return <UsGesetzePreview data={data && 'votes' in data ? data : null} />;
  return null;
}
