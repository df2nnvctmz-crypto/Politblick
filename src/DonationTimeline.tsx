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

interface DonationRow {
  fraction: string;
  amountEuro: number;
  receivedOn: string | null;
}

interface QuarterBar {
  index: number;
  label: string;
  total: number;
  segments: { fraction: string; amount: number }[];
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
 * Bins donations into quarters and stacks each quarter's bar by fraction, in a fixed order
 * (biggest overall donor-party first) so a party's slice sits at the same relative position in
 * every bar — that's what makes the stack readable as a trend per party, not just per quarter.
 */
function buildTimeline(donations: DonationRow[]): { quarters: QuarterBar[]; stackOrder: string[]; excludedCount: number } {
  const dated = donations.filter((d): d is DonationRow & { receivedOn: string } => Boolean(d.receivedOn));
  const excludedCount = donations.length - dated.length;
  if (dated.length === 0) return { quarters: [], stackOrder: [], excludedCount };

  const fractionTotal = new Map<string, number>();
  const byQuarter = new Map<number, Map<string, number>>();
  for (const d of dated) {
    const idx = quarterIndex(d.receivedOn);
    if (!byQuarter.has(idx)) byQuarter.set(idx, new Map());
    const q = byQuarter.get(idx)!;
    q.set(d.fraction, (q.get(d.fraction) ?? 0) + d.amountEuro);
    fractionTotal.set(d.fraction, (fractionTotal.get(d.fraction) ?? 0) + d.amountEuro);
  }
  const stackOrder = [...fractionTotal.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);

  const indices = [...byQuarter.keys()];
  const minIdx = Math.min(...indices);
  const maxIdx = Math.max(...indices);
  const quarters: QuarterBar[] = [];
  for (let idx = minIdx; idx <= maxIdx; idx++) {
    const byFraction = byQuarter.get(idx);
    const segments = stackOrder.filter((f) => byFraction?.has(f)).map((f) => ({ fraction: f, amount: byFraction!.get(f)! }));
    const total = segments.reduce((sum, s) => sum + s.amount, 0);
    quarters.push({ index: idx, label: quarterLabel(idx), total, segments });
  }
  return { quarters, stackOrder, excludedCount };
}

export function DonationTimeline({
  donations,
  labels,
}: {
  donations: DonationRow[];
  labels: {
    axisMaxTemplate: string;
    excludedTemplate: string;
    empty: string;
    quarterTotalLabel: string;
  };
}) {
  const [active, setActive] = useState<number | null>(null);
  const { quarters, excludedCount } = buildTimeline(donations);

  if (quarters.length === 0) return <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{labels.empty}</p>;

  const max = Math.max(1, ...quarters.map((q) => q.total));
  const width = MARGIN_LEFT + MARGIN_RIGHT + quarters.length * (BAR_WIDTH + GAP) - GAP;
  const height = MARGIN_TOP + CHART_HEIGHT + MARGIN_BOTTOM;
  const activeQuarter = active !== null ? quarters.find((q) => q.index === active) : undefined;

  return (
    <div>
      <div style={{ border: '1px solid oklch(90% 0.006 260)', borderRadius: 14, background: 'white', padding: 16 }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }} onClick={() => setActive(null)}>
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
          {quarters.map((q, i) => {
            const x = MARGIN_LEFT + i * (BAR_WIDTH + GAP);
            const isActive = active === q.index;
            const dimmed = active !== null && !isActive;
            let cursor = MARGIN_TOP + CHART_HEIGHT;
            return (
              <g
                key={q.index}
                onClick={(e) => {
                  e.stopPropagation();
                  setActive((a) => (a === q.index ? null : q.index));
                }}
                style={{ cursor: q.total > 0 ? 'pointer' : 'default' }}
                opacity={dimmed ? 0.35 : 1}
              >
                <rect x={x - GAP / 2} y={MARGIN_TOP} width={BAR_WIDTH + GAP} height={CHART_HEIGHT} fill="transparent" />
                {q.segments.map((s) => {
                  const h = Math.max(q.total > 0 ? 1.5 : 0, (s.amount / max) * CHART_HEIGHT);
                  cursor -= h;
                  return (
                    <rect
                      key={s.fraction}
                      x={x}
                      y={cursor}
                      width={BAR_WIDTH}
                      height={h}
                      fill={REAL_PARTY_COLORS[s.fraction] ?? FALLBACK_PARTY_COLOR}
                      stroke={isActive ? 'oklch(20% 0.01 260)' : 'none'}
                      strokeWidth={isActive ? 1.5 : 0}
                    />
                  );
                })}
                <text
                  x={x + BAR_WIDTH / 2}
                  y={MARGIN_TOP + CHART_HEIGHT + 16}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill={isActive ? 'oklch(25% 0.01 260)' : 'oklch(52% 0.01 260)'}
                  fontWeight={isActive ? 700 : 500}
                >
                  {q.label}
                </text>
              </g>
            );
          })}
        </svg>
        {activeQuarter && activeQuarter.total > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid oklch(93% 0.006 260)', fontSize: 12.5, color: 'oklch(35% 0.01 260)' }}>
            <strong>{activeQuarter.label}</strong> · {labels.quarterTotalLabel} {formatEuro(activeQuarter.total)}
            {activeQuarter.segments.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {activeQuarter.segments.map((s) => (
                  <span
                    key={s.fraction}
                    style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 10, background: 'oklch(97% 0.006 260)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: REAL_PARTY_COLORS[s.fraction] ?? FALLBACK_PARTY_COLOR, flexShrink: 0 }} />
                    {s.fraction} · {formatEuro(s.amount)}
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
