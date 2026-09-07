/**
 * The bar/matrix/hemicycle charts.
 *
 * Each one renders to the DOM for the page and, separately, builds the same picture as a
 * standalone SVG string for ChartExportMenu — so what a reader downloads is what they saw.
 */

import { useRef } from 'react';
import { FALLBACK_PARTY_COLOR, REAL_PARTY_COLORS } from '../bundestag';
import { ChartExportMenu, type ChartExportLabels } from '../ChartExportMenu';
import type { ChartSvgExport } from '../chartExport';
import { escapeXml, truncateLabel } from '../format';
import { computeHemicycleSeats } from '../helpers';
import { formatEuro, formatExpenseBracket, type CrossrefRow, type LobbyOrg, type SpendScope } from '../lobby';
import { stop } from '../ui/events';
import { ScrollBox } from '../ui/primitives';

export type MatrixCell = { party: string; topic: string };

export function TieMatrix({
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
export function HemicycleChart({
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
export function DonationBarChart({
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
export function ActorTypeSpendChart({
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
export function SectorBarChart({
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
export function OrgInfluenceBarChart({
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
