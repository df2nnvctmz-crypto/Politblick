import { useRef, useState } from 'react';
import { FALLBACK_PARTY_COLOR, REAL_PARTY_COLORS } from './bundestag';
import { formatEuro } from './lobby';
import { ChartExportMenu, type ChartExportLabels } from './ChartExportMenu';

const WIDTH = 760;
const NODE_WIDTH = 12;
/** Vertical gap between adjacent nodes in the same column. */
const GAP = 3;
const DONOR_X = 130;
/** Reserved for the party column's node + its 3-line label (name / amount / coverage %) — wide
 * enough that "9.459.786 € · 99% of total" never gets clipped by the SVG's edge (SVG doesn't
 * wrap text, and its default overflow:hidden silently crops anything that runs past the
 * viewBox instead of erroring, so this budget has to be generous up front). */
const PARTY_LABEL_WIDTH = 210;
const PARTY_X = WIDTH - PARTY_LABEL_WIDTH - NODE_WIDTH;
/** Extra invisible margin added to every node's hit area — thin slices stay easy to hover/tap. */
const HIT_PAD = 3;
/** Minimum vertical space between two party labels' text blocks, regardless of how thin their
 * actual nodes are — without this, parties with small totals (Volt, SSW, Linke, …) end up with
 * nodes only a few px tall and their 3-line labels visually merge into an unreadable stack. */
const MIN_LABEL_GAP = 40;

interface DonationRow {
  donor: string | null;
  fraction: string;
  amountEuro: number;
}

interface SankeyNode {
  id: string;
  label: string;
  color: string;
  total: number;
  y0: number;
  y1: number;
}

interface SankeyLink {
  donorId: string;
  partyId: string;
  amount: number;
  color: string;
  y0Donor: number;
  y1Donor: number;
  y0Party: number;
  y1Party: number;
}

interface Sankey {
  donorNodes: SankeyNode[];
  partyNodes: SankeyNode[];
  links: SankeyLink[];
  height: number;
  excludedCount: number;
  excludedTotal: number;
}

/**
 * Deterministic two-column layout (donors left, parties right) — no simulation needed, unlike
 * PartyOrgGraph's physics: node order and size follow directly from the donation totals, so the
 * whole thing can be recomputed on every render like the rest of this codebase's derived data.
 */
function buildSankey(donations: DonationRow[], topN: number): Sankey {
  const donorTotal = new Map<string, number>();
  for (const d of donations) {
    if (!d.donor) continue;
    donorTotal.set(d.donor, (donorTotal.get(d.donor) ?? 0) + d.amountEuro);
  }

  const rankedDonors = [...donorTotal.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const donorOrder = rankedDonors.slice(0, topN).map(([donor]) => donor);
  const topDonorIds = new Set(donorOrder);
  const excludedCount = Math.max(0, rankedDonors.length - topN);
  const excludedTotal = rankedDonors.slice(topN).reduce((sum, [, total]) => sum + total, 0);

  if (donorOrder.length === 0) {
    return { donorNodes: [], partyNodes: [], links: [], height: 0, excludedCount, excludedTotal };
  }

  const linkTotals = new Map<string, number>();
  const partyTotal = new Map<string, number>();
  for (const d of donations) {
    if (!d.donor || !topDonorIds.has(d.donor)) continue;
    const key = `${d.donor} ${d.fraction}`;
    linkTotals.set(key, (linkTotals.get(key) ?? 0) + d.amountEuro);
    partyTotal.set(d.fraction, (partyTotal.get(d.fraction) ?? 0) + d.amountEuro);
  }
  const partyOrder = [...partyTotal.entries()].sort((a, b) => b[1] - a[1]).map(([party]) => party);

  const grandTotal = donorOrder.reduce((sum, donor) => sum + (donorTotal.get(donor) ?? 0), 0);
  // The donor column needs `donorOrder.length * ~20px` to keep every slice tappable; the party
  // column needs `partyOrder.length * MIN_LABEL_GAP` so its (up to 3-line) labels never
  // collide. Neither column's own requirement can shrink the other's, so height is whichever
  // of the two actually needs more room.
  const donorHeightNeed = donorOrder.length * 20;
  const partyHeightNeed = partyOrder.length * MIN_LABEL_GAP;
  const height = Math.max(320, Math.min(900, Math.max(donorHeightNeed, partyHeightNeed)));
  const scale = (height - GAP * Math.max(0, donorOrder.length - 1)) / grandTotal;

  const donorNodes: SankeyNode[] = [];
  let cursor = 0;
  for (const donor of donorOrder) {
    const total = donorTotal.get(donor) ?? 0;
    const h = total * scale;
    donorNodes.push({ id: donor, label: donor, color: 'oklch(72% 0.012 260)', total, y0: cursor, y1: cursor + h });
    cursor += h + GAP;
  }

  // Same scale as the donor column, but centered — with fewer, larger party nodes the
  // occupied height is naturally shorter than the donor column's, so this balances it
  // vertically instead of bunching every party node toward the top.
  const partyContentHeight = partyOrder.reduce((sum, p) => sum + (partyTotal.get(p) ?? 0) * scale, 0) + GAP * Math.max(0, partyOrder.length - 1);
  let partyCursor = (height - partyContentHeight) / 2;
  const partyNodes: SankeyNode[] = [];
  for (const party of partyOrder) {
    const total = partyTotal.get(party) ?? 0;
    const h = total * scale;
    partyNodes.push({ id: party, label: party, color: REAL_PARTY_COLORS[party] ?? FALLBACK_PARTY_COLOR, total, y0: partyCursor, y1: partyCursor + h });
    partyCursor += h + GAP;
  }

  // Walking donors top-to-bottom (outer loop) and parties in the same canonical order
  // (inner loop) means each party's incoming slices stack in donor-rank order too — the
  // biggest donors' ribbons land at the top of every party node they touch, not in
  // whatever order the flat donation list happened to list them.
  const donorCursor = new Map(donorNodes.map((n) => [n.id, n.y0]));
  const partyCursorByFraction = new Map(partyNodes.map((n) => [n.id, n.y0]));
  const partyById = new Map(partyNodes.map((n) => [n.id, n]));
  const links: SankeyLink[] = [];
  for (const donor of donorOrder) {
    for (const party of partyOrder) {
      const amount = linkTotals.get(`${donor} ${party}`);
      if (!amount) continue;
      const h = amount * scale;
      const y0Donor = donorCursor.get(donor)!;
      const y1Donor = y0Donor + h;
      donorCursor.set(donor, y1Donor);
      const y0Party = partyCursorByFraction.get(party)!;
      const y1Party = y0Party + h;
      partyCursorByFraction.set(party, y1Party);
      links.push({ donorId: donor, partyId: party, amount, color: partyById.get(party)!.color, y0Donor, y1Donor, y0Party, y1Party });
    }
  }

  return { donorNodes, partyNodes, links, height, excludedCount, excludedTotal };
}

/** Label Y positions that never sit closer than MIN_LABEL_GAP, even when several party nodes
 * are packed within a few px of each other. Only the TEXT moves — the colored node rect above
 * still renders at its true (possibly tiny) position, so the diagram itself stays accurate;
 * this just keeps the reading aid next to it legible. Parties are already top-to-bottom order
 * (partyNodes follows partyOrder, laid out with an increasing y-cursor), so a single forward
 * pass is enough — no need to also pull earlier labels back down after a later push. */
function layoutLabels(nodes: SankeyNode[]): number[] {
  const ys: number[] = [];
  let prev = -Infinity;
  for (const n of nodes) {
    const desired = (n.y0 + n.y1) / 2;
    const y = Math.max(desired, prev + MIN_LABEL_GAP);
    ys.push(y);
    prev = y;
  }
  return ys;
}

function linkPath(x0: number, y0top: number, y0bottom: number, x1: number, y1top: number, y1bottom: number): string {
  const xi = (x0 + x1) / 2;
  return `M${x0},${y0top} C${xi},${y0top} ${xi},${y1top} ${x1},${y1top} L${x1},${y1bottom} C${xi},${y1bottom} ${xi},${y0bottom} ${x0},${y0bottom} Z`;
}

function truncate(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export function DonationSankey({
  donations,
  fractionTotals,
  defaultTopN = 10,
  minTopN = 5,
  maxTopN = 40,
  onOpenParty,
  isPartyRoutable,
  labels,
  filenameBase,
  exportLabels,
}: {
  donations: DonationRow[];
  /** Each party's true total across ALL donors (not just the ones drawn here) — lets every party
   * node show what share of its real total this subset actually covers, so a smaller total here
   * than in the bar chart above reads as "partial view", never as "these two charts disagree". */
  fractionTotals: Record<string, number>;
  defaultTopN?: number;
  minTopN?: number;
  maxTopN?: number;
  onOpenParty: (party: string) => void;
  /** Many donation recipients (e.g. parties without Bundestag seats) have no party page of their
   * own — this gates the "view party" link so it never points at a page that can only show
   * "no data for this party". */
  isPartyRoutable: (party: string) => boolean;
  labels: {
    noteTemplate: string;
    excludedTemplate: string;
    coverageTemplate: string;
    sliderLabelTemplate: string;
    viewParty: string;
  };
  filenameBase: string;
  exportLabels: ChartExportLabels;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<{ kind: 'donor' | 'party'; id: string } | null>(null);
  const [pinned, setPinned] = useState<{ kind: 'donor' | 'party'; id: string } | null>(null);
  const [topN, setTopN] = useState(defaultTopN);

  const { donorNodes, partyNodes, links, height, excludedCount, excludedTotal } = buildSankey(donations, topN);
  const getCsv = () => ({
    headers: ['Donor', 'Party', 'Amount (EUR)'],
    rows: links.map((l) => [l.donorId, l.partyId, l.amount]),
  });
  const partyLabelY = layoutLabels(partyNodes);
  if (donorNodes.length === 0) return null;

  const active = pinned ?? hovered;
  const activeNode =
    active?.kind === 'donor' ? donorNodes.find((n) => n.id === active.id) : active?.kind === 'party' ? partyNodes.find((n) => n.id === active.id) : undefined;

  function selectNode(kind: 'donor' | 'party', id: string) {
    setPinned((p) => (p?.kind === kind && p.id === id ? null : { kind, id }));
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(35% 0.01 260)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {labels.sliderLabelTemplate.replace('{n}', String(topN))}
        </label>
        <input
          type="range"
          min={minTopN}
          max={maxTopN}
          value={topN}
          onChange={(e) => setTopN(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'oklch(45% 0.16 265)', cursor: 'pointer' }}
        />
      </div>
      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'oklch(40% 0.01 260)', marginTop: 0, marginBottom: 10 }}>
        {labels.noteTemplate.replace('{n}', String(donorNodes.length))}
        {excludedCount > 0 && ` ${labels.excludedTemplate.replace('{n}', String(excludedCount)).replace('{amount}', formatEuro(excludedTotal))}`}
      </p>
      <div style={{ position: 'relative', border: '1px solid oklch(90% 0.006 260)', borderRadius: 14, background: 'white', padding: 16 }}>
        <ChartExportMenu filenameBase={filenameBase} getCsv={getCsv} svgRef={svgRef} labels={exportLabels} />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onClick={() => setPinned(null)}
        >
          {links.map((l, i) => {
            const isActive = active ? (active.kind === 'donor' ? l.donorId === active.id : l.partyId === active.id) : null;
            const dimmed = active !== null && !isActive;
            return (
              <path
                key={i}
                d={linkPath(DONOR_X + NODE_WIDTH, l.y0Donor, l.y1Donor, PARTY_X, l.y0Party, l.y1Party)}
                fill={l.color}
                opacity={dimmed ? 0.05 : isActive ? 0.75 : 0.28}
              />
            );
          })}
          {donorNodes.map((n) => {
            const isActive = active?.kind === 'donor' && active.id === n.id;
            const h = Math.max(1, n.y1 - n.y0);
            return (
              <g
                key={n.id}
                onMouseEnter={() => setHovered({ kind: 'donor', id: n.id })}
                onMouseLeave={() => setHovered((h2) => (h2?.id === n.id ? null : h2))}
                onClick={(e) => {
                  e.stopPropagation();
                  selectNode('donor', n.id);
                }}
                style={{ cursor: 'pointer' }}
              >
                <rect x={DONOR_X - HIT_PAD} y={n.y0 - HIT_PAD} width={NODE_WIDTH + HIT_PAD * 2} height={h + HIT_PAD * 2} fill="transparent" />
                <rect x={DONOR_X} y={n.y0} width={NODE_WIDTH} height={h} rx={2} fill={n.color} opacity={isActive ? 1 : 0.85} />
                {isActive && (
                  <text
                    x={DONOR_X - 8}
                    y={(n.y0 + n.y1) / 2}
                    textAnchor="end"
                    dominantBaseline="central"
                    fontSize={11}
                    fontWeight={700}
                    fill="oklch(25% 0.01 260)"
                    paintOrder="stroke"
                    stroke="white"
                    strokeWidth={4}
                  >
                    {truncate(n.label, 30)}
                  </text>
                )}
              </g>
            );
          })}
          {partyNodes.map((n, i) => {
            const isActive = active?.kind === 'party' && active.id === n.id;
            const h = Math.max(1, n.y1 - n.y0);
            const fullTotal = fractionTotals[n.id] ?? n.total;
            const coveragePct = fullTotal > 0 ? Math.round((n.total / fullTotal) * 100) : 100;
            const labelY = partyLabelY[i];
            const textColor = isActive ? n.color : 'oklch(20% 0.01 260)';
            return (
              <g
                key={n.id}
                onMouseEnter={() => setHovered({ kind: 'party', id: n.id })}
                onMouseLeave={() => setHovered((h2) => (h2?.id === n.id ? null : h2))}
                onClick={(e) => {
                  e.stopPropagation();
                  selectNode('party', n.id);
                }}
                style={{ cursor: 'pointer' }}
              >
                <rect x={PARTY_X - HIT_PAD} y={n.y0 - HIT_PAD} width={NODE_WIDTH + HIT_PAD * 2} height={h + HIT_PAD * 2} fill="transparent" />
                <rect x={PARTY_X} y={n.y0} width={NODE_WIDTH} height={h} rx={2} fill={n.color} opacity={isActive ? 1 : 0.9} />
                {/* A thin leader line whenever the label had to move away from the node's true
                    (possibly tiny) position — otherwise a label pushed 20+px down would look
                    like it belongs to a neighboring node instead of this one. */}
                {Math.abs(labelY - (n.y0 + n.y1) / 2) > 2 && (
                  <line x1={PARTY_X + NODE_WIDTH} y1={(n.y0 + n.y1) / 2} x2={PARTY_X + NODE_WIDTH + 6} y2={labelY} stroke="oklch(80% 0.006 260)" strokeWidth={1} />
                )}
                <text x={PARTY_X + NODE_WIDTH + 8} y={labelY - 9} fontSize={12} fontWeight={700} fill={textColor}>
                  {truncate(n.label, 26)}
                </text>
                <text x={PARTY_X + NODE_WIDTH + 8} y={labelY + 5} fontSize={10.5} fill="oklch(50% 0.01 260)">
                  {formatEuro(n.total)}
                </text>
                {coveragePct < 100 && (
                  <text x={PARTY_X + NODE_WIDTH + 8} y={labelY + 17} fontSize={9.5} fill="oklch(58% 0.01 260)">
                    {labels.coverageTemplate.replace('{pct}', String(coveragePct))}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {active && activeNode && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid oklch(93% 0.006 260)', fontSize: 12.5, color: 'oklch(35% 0.01 260)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>
              <strong>{activeNode.label}</strong> · {formatEuro(activeNode.total)}
            </span>
            {active.kind === 'party' && isPartyRoutable(activeNode.id) && (
              <button
                onClick={() => onOpenParty(activeNode.id)}
                style={{ border: 'none', background: 'none', color: 'oklch(45% 0.16 265)', fontWeight: 700, cursor: 'pointer', fontSize: 12.5, padding: 0 }}
              >
                {labels.viewParty} →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
