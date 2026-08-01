import { useState } from 'react';
import { FALLBACK_PARTY_COLOR, REAL_PARTY_COLORS } from './bundestag';
import { formatEuro } from './lobby';

const BAR_WIDTH = 26;
const GAP = 12;
const MARGIN_LEFT = 8;
const MARGIN_RIGHT = 8;
const MARGIN_TOP = 24;
const MARGIN_BOTTOM = 34;
const CHART_HEIGHT = 160;

/** How many individual donors get their own segment/color before the rest are folded into a
 * single "other donors" bucket — past this, per-donor slices would be too thin to read and the
 * palette below would have to repeat colors for unrelated donors. */
const DONOR_TOP_N = 6;
const DONOR_PALETTE = [
  'oklch(58% 0.14 250)',
  'oklch(60% 0.15 20)',
  'oklch(62% 0.14 145)',
  'oklch(60% 0.14 300)',
  'oklch(65% 0.15 80)',
  'oklch(55% 0.12 200)',
];
const OTHER_DONOR_COLOR = 'oklch(75% 0.006 260)';

interface DonationRow {
  donor: string | null;
  fraction: string;
  amountEuro: number;
  receivedOn: string | null;
}

interface QuarterBar {
  index: number;
  label: string;
  total: number;
  segments: { key: string; amount: number }[];
}

/** Year*4 + (0-3 quarter offset) — lets consecutive quarters, including empty ones, be walked
 * with plain integer addition instead of juggling year/quarter rollover by hand. */
function quarterIndex(dateStr: string): number {
  const d = new Date(dateStr);
  return d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
}

function quarterLabel(index: number): string {
  const year = Math.floor(index / 4);
  const q = (index % 4) + 1;
  return `${year} Q${q}`;
}

/**
 * Bins donations into quarters and stacks each quarter's bar by `groupKey`, in a fixed order
 * (biggest overall total first) so a given slice sits at the same relative position in every
 * bar — that's what makes the stack readable as a trend, not just a per-quarter snapshot.
 */
function buildTimeline(donations: DonationRow[], groupKey: (d: DonationRow) => string): { quarters: QuarterBar[]; stackOrder: string[]; excludedCount: number } {
  const dated = donations.filter((d): d is DonationRow & { receivedOn: string } => Boolean(d.receivedOn));
  const excludedCount = donations.length - dated.length;
  if (dated.length === 0) return { quarters: [], stackOrder: [], excludedCount };

  const keyTotal = new Map<string, number>();
  const byQuarter = new Map<number, Map<string, number>>();
  for (const d of dated) {
    const idx = quarterIndex(d.receivedOn);
    const key = groupKey(d);
    if (!byQuarter.has(idx)) byQuarter.set(idx, new Map());
    const q = byQuarter.get(idx)!;
    q.set(key, (q.get(key) ?? 0) + d.amountEuro);
    keyTotal.set(key, (keyTotal.get(key) ?? 0) + d.amountEuro);
  }
  const stackOrder = [...keyTotal.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);

  const indices = [...byQuarter.keys()];
  const minIdx = Math.min(...indices);
  const maxIdx = Math.max(...indices);
  const quarters: QuarterBar[] = [];
  for (let idx = minIdx; idx <= maxIdx; idx++) {
    const byKey = byQuarter.get(idx);
    const segments = stackOrder.filter((k) => byKey?.has(k)).map((k) => ({ key: k, amount: byKey!.get(k)! }));
    const total = segments.reduce((sum, s) => sum + s.amount, 0);
    quarters.push({ index: idx, label: quarterLabel(idx), total, segments });
  }
  return { quarters, stackOrder, excludedCount };
}

export function DonationTimeline({
  donations,
  labels,
  stackBy = 'fraction',
}: {
  donations: DonationRow[];
  labels: {
    axisMaxTemplate: string;
    excludedTemplate: string;
    empty: string;
    quarterTotalLabel: string;
    rangeLabelTemplate: string;
    otherDonorsLabel: string;
  };
  /** 'fraction' stacks each bar by receiving party (used where a mix of parties can appear in
   * the same dataset); 'donor' stacks by the individual donor instead — for a single-party view,
   * where "which party" is constant and "who gave it" is the interesting breakdown. */
  stackBy?: 'fraction' | 'donor';
}) {
  const [active, setActive] = useState<number | null>(null);
  // null = full range (the default — every quarter shown). Indices are positions into `quarters`,
  // not quarter numbers themselves, so they stay valid across re-renders regardless of which
  // calendar quarters actually exist in the data.
  const [customRange, setCustomRange] = useState<[number, number] | null>(null);
  // Hover shows a segment's name; a click pins it (so it survives the mouse leaving — needed for
  // touch, which never hovers). `key` alone (no quarter index) drives cross-bar highlighting —
  // hovering one of a donor's bars highlights that donor's slice in every other quarter too.
  const [hoveredSegment, setHoveredSegment] = useState<{ index: number; key: string } | null>(null);
  const [pinnedSegment, setPinnedSegment] = useState<{ index: number; key: string } | null>(null);
  const activeSegment = pinnedSegment ?? hoveredSegment;

  // Donors past the top N collapse into a single "other donors" bucket, computed from the whole
  // dataset (not per-quarter) so a donor's bucket assignment — and thus its color — stays the
  // same across every quarter's bar.
  const topDonors = new Set<string>();
  if (stackBy === 'donor') {
    const totals = new Map<string, number>();
    for (const d of donations) {
      if (!d.donor) continue;
      totals.set(d.donor, (totals.get(d.donor) ?? 0) + d.amountEuro);
    }
    for (const [donor] of [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, DONOR_TOP_N)) topDonors.add(donor);
  }
  const groupKey = (d: DonationRow): string => {
    if (stackBy !== 'donor') return d.fraction;
    return d.donor && topDonors.has(d.donor) ? d.donor : labels.otherDonorsLabel;
  };

  const { quarters, stackOrder, excludedCount } = buildTimeline(donations, groupKey);

  if (quarters.length === 0) return <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{labels.empty}</p>;

  const colorByKey = new Map<string, string>();
  stackOrder.forEach((key, i) => {
    if (stackBy === 'fraction') colorByKey.set(key, REAL_PARTY_COLORS[key] ?? FALLBACK_PARTY_COLOR);
    else colorByKey.set(key, key === labels.otherDonorsLabel ? OTHER_DONOR_COLOR : DONOR_PALETTE[i % DONOR_PALETTE.length]);
  });
  const colorFor = (key: string) => colorByKey.get(key) ?? FALLBACK_PARTY_COLOR;

  const lastIdx = quarters.length - 1;
  const [rawStart, rawEnd] = customRange ?? [0, lastIdx];
  const rangeStart = Math.min(Math.max(0, rawStart), lastIdx);
  const rangeEnd = Math.min(Math.max(rangeStart, rawEnd), lastIdx);
  const visibleQuarters = quarters.slice(rangeStart, rangeEnd + 1);

  const max = Math.max(1, ...visibleQuarters.map((q) => q.total));
  // Total width is pinned to the FULL quarter count, not the visible subset — that keeps the
  // axis line, margins and font sizes fixed regardless of the slider, so narrowing the range
  // never re-scales the chart. Instead, the per-bar step grows to fill that fixed plot width
  // with fewer, wider bars (same bar:gap ratio as the full view).
  const width = MARGIN_LEFT + MARGIN_RIGHT + quarters.length * (BAR_WIDTH + GAP) - GAP;
  const height = MARGIN_TOP + CHART_HEIGHT + MARGIN_BOTTOM;
  const plotWidth = width - MARGIN_LEFT - MARGIN_RIGHT;
  const barStep = plotWidth / visibleQuarters.length;
  const gapWidth = barStep * (GAP / (BAR_WIDTH + GAP));
  const barWidth = barStep - gapWidth;
  const activeQuarter = active !== null ? visibleQuarters.find((q) => q.index === active) : undefined;
  // Populated while walking the bars below, then rendered as a final pass so the label always
  // paints on top of every bar — a mid-stack segment's label would otherwise land underneath
  // whichever segment is stacked above it, since SVG draws in document order.
  const segmentLabels: { x: number; y: number; text: string }[] = [];

  return (
    <div>
      {lastIdx > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(35% 0.01 260)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {labels.rangeLabelTemplate.replace('{from}', quarters[rangeStart].label).replace('{to}', quarters[rangeEnd].label)}
          </label>
          <div style={{ position: 'relative', flex: 1, height: 20 }}>
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: 0,
                right: 0,
                height: 4,
                marginTop: -2,
                borderRadius: 2,
                background: 'oklch(90% 0.006 260)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '50%',
                height: 4,
                marginTop: -2,
                borderRadius: 2,
                background: 'oklch(45% 0.16 265)',
                left: `${(rangeStart / lastIdx) * 100}%`,
                width: `${((rangeEnd - rangeStart) / lastIdx) * 100}%`,
              }}
            />
            <input
              type="range"
              className="pb-range-dual"
              min={0}
              max={lastIdx}
              value={rangeStart}
              onChange={(e) => setCustomRange([Math.min(Number(e.target.value), rangeEnd), rangeEnd])}
              style={{ height: 20 }}
            />
            <input
              type="range"
              className="pb-range-dual"
              min={0}
              max={lastIdx}
              value={rangeEnd}
              onChange={(e) => setCustomRange([rangeStart, Math.max(Number(e.target.value), rangeStart)])}
              style={{ height: 20 }}
            />
          </div>
        </div>
      )}
      <div style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14, background: 'white', padding: 16 }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onClick={() => {
            setActive(null);
            setPinnedSegment(null);
          }}
        >
          <text x={MARGIN_LEFT} y={MARGIN_TOP - 8} fontSize={10.5} fill="oklch(55% 0.01 260)">
            {labels.axisMaxTemplate.replace('{amount}', formatEuro(max))}
          </text>
          <line
            x1={MARGIN_LEFT}
            y1={MARGIN_TOP + CHART_HEIGHT}
            x2={width - MARGIN_RIGHT}
            y2={MARGIN_TOP + CHART_HEIGHT}
            stroke="oklch(88% 0.006 260)"
            strokeWidth={1}
          />
          {visibleQuarters.map((q, i) => {
            const x = MARGIN_LEFT + i * barStep;
            const isActive = active === q.index;
            const dimmed = active !== null && !isActive;
            let cursor = MARGIN_TOP + CHART_HEIGHT;
            return (
              <g
                key={q.index}
                onClick={(e) => {
                  e.stopPropagation();
                  setActive((a) => (a === q.index ? null : q.index));
                  setPinnedSegment(null);
                }}
                style={{ cursor: q.total > 0 ? 'pointer' : 'default' }}
                opacity={dimmed ? 0.35 : 1}
              >
                <rect x={x - gapWidth / 2} y={MARGIN_TOP} width={barStep} height={CHART_HEIGHT} fill="transparent" />
                {q.segments.map((s) => {
                  const h = Math.max(q.total > 0 ? 1.5 : 0, (s.amount / max) * CHART_HEIGHT);
                  cursor -= h;
                  const segTop = cursor;
                  const isThisSegment = activeSegment !== null && activeSegment.index === q.index && activeSegment.key === s.key;
                  const isKeyHighlighted = activeSegment !== null && activeSegment.key === s.key;
                  if (isThisSegment) {
                    segmentLabels.push({ x: x + barWidth / 2, y: segTop - 6, text: `${s.key} · ${formatEuro(s.amount)}` });
                  }
                  return (
                    <rect
                      key={s.key}
                      x={x}
                      y={segTop}
                      width={barWidth}
                      height={h}
                      fill={colorFor(s.key)}
                      stroke={isThisSegment ? 'oklch(20% 0.01 260)' : 'none'}
                      strokeWidth={isThisSegment ? 1.5 : 0}
                      opacity={activeSegment === null ? 1 : isKeyHighlighted ? 1 : 0.25}
                      onMouseEnter={() => setHoveredSegment({ index: q.index, key: s.key })}
                      onMouseLeave={() => setHoveredSegment((cur) => (cur?.index === q.index && cur?.key === s.key ? null : cur))}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPinnedSegment((cur) => (cur?.index === q.index && cur?.key === s.key ? null : { index: q.index, key: s.key }));
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  );
                })}
                <text
                  x={x + barWidth / 2}
                  y={MARGIN_TOP + CHART_HEIGHT + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill={isActive ? 'oklch(25% 0.01 260)' : 'oklch(52% 0.01 260)'}
                  fontWeight={isActive ? 700 : 500}
                >
                  Q{(q.index % 4) + 1}
                </text>
                {/* Year printed only at the first quarter of each year — "YYYY Q1" on every bar
                    doesn't fit the per-bar width once a party has more than ~8 quarters of history. */}
                {q.index % 4 === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={MARGIN_TOP + CHART_HEIGHT + 26}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={700}
                    fill="oklch(40% 0.01 260)"
                  >
                    {Math.floor(q.index / 4)}
                  </text>
                )}
              </g>
            );
          })}
          {segmentLabels.map((l, i) => (
            <text
              key={i}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="oklch(20% 0.01 260)"
              paintOrder="stroke"
              stroke="white"
              strokeWidth={4}
              style={{ pointerEvents: 'none' }}
            >
              {l.text}
            </text>
          ))}
        </svg>
        {activeQuarter && activeQuarter.total > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid oklch(93% 0.006 260)', fontSize: 12.5, color: 'oklch(35% 0.01 260)' }}>
            <strong>{activeQuarter.label}</strong> · {labels.quarterTotalLabel} {formatEuro(activeQuarter.total)}
            {activeQuarter.segments.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {activeQuarter.segments.map((s) => (
                  <span
                    key={s.key}
                    style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 10, background: 'oklch(97% 0.006 260)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorFor(s.key), flexShrink: 0 }} />
                    {s.key} · {formatEuro(s.amount)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {excludedCount > 0 && (
        <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 8 }}>{labels.excludedTemplate.replace('{n}', String(excludedCount))}</p>
      )}
    </div>
  );
}
