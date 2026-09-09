import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, MARGIN } from "./theme";
import { fontFamily } from "./fonts";
import { Logo } from "./components";

// ---------------------------------------------------------------------------
// Data — Abweichungsquote (Divergenz von der eigenen Fraktion) je Wahlperiode,
// aus dem Abstimmungsarchiv (666 namentliche Abstimmungen, 2005-09-18 bis
// 2025-03-24, plus laufende Wahlperiode 2025-29 bis Stand).
// ---------------------------------------------------------------------------

const TERMS: { label: string; value: number }[] = [
  { label: "2005–09", value: 5.49 },
  { label: "2009–13", value: 2.78 },
  { label: "2013–17", value: 2.89 },
  { label: "2017–21", value: 1.84 },
  { label: "2021–25", value: 1.18 },
  { label: "2025–29", value: 0.35 },
];

const CURRENT_TERM_NOTE = "laufende Wahlperiode, 63 Abstimmungen";

// ---------------------------------------------------------------------------
// Chart geometry
// ---------------------------------------------------------------------------

const CHART_WIDTH = 1700;
const CHART_HEIGHT = 460;
const PAD_X = 80;
const PLOT_TOP = 100;
const PLOT_HEIGHT = 220;
const SCALE_MAX = 6; // percent — leaves headroom above the 5,49 % start value
const AXIS_LABEL_Y = PLOT_TOP + PLOT_HEIGHT + 50;
const CAPTION_Y = AXIS_LABEL_Y + 36;

const STEP_X = (CHART_WIDTH - PAD_X * 2) / (TERMS.length - 1);

const points = TERMS.map((t, i) => ({
  x: PAD_X + i * STEP_X,
  y: PLOT_TOP + (1 - t.value / SCALE_MAX) * PLOT_HEIGHT,
  ...t,
}));

// Catmull-Rom -> cubic Bezier smoothing. Passes exactly through every data
// point (the values are the story) while giving the line soft corners
// instead of sharp elbows.
const smoothPath = (pts: { x: number; y: number }[]): string => {
  if (pts.length < 2) return "";
  const d = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`);
  }
  return d.join(" ");
};

const linePath = smoothPath(points);
const first = points[0];
const last = points[points.length - 1];

export const SlideDiscipline: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: COLORS.bg, fontFamily }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: MARGIN,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Logo size={28} textSize={23} gap={10} />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 28,
          }}
        >
          <div
            style={{
              fontFamily,
              fontWeight: 700,
              fontSize: 96,
              lineHeight: 1.12,
              color: COLORS.white,
              textAlign: "center",
              whiteSpace: "pre-line",
            }}
          >
            {"Die Parteien im Bundestag\nstimmen so geschlossen wie nie."}
          </div>

          <div
            style={{
              fontFamily,
              fontWeight: 400,
              fontSize: 30,
              color: COLORS.grey,
              textAlign: "center",
            }}
          >
            Abweichungen von der eigenen Fraktion, 666 namentliche Abstimmungen seit 2005
          </div>

          <svg
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          >
            <path
              d={linePath}
              fill="none"
              stroke={COLORS.amber}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {points.map((p, i) => {
              const isLast = i === points.length - 1;
              return (
                <circle
                  key={p.label}
                  cx={p.x}
                  cy={p.y}
                  r={9}
                  fill={isLast ? COLORS.bg : COLORS.amber}
                  stroke={COLORS.amber}
                  strokeWidth={isLast ? 5 : 0}
                />
              );
            })}

            <text
              x={first.x}
              y={first.y - 32}
              textAnchor="middle"
              fontFamily={fontFamily}
              fontWeight={700}
              fontSize={44}
              fill={COLORS.white}
            >
              5,49 %
            </text>
            <text
              x={last.x}
              y={last.y - 32}
              textAnchor="middle"
              fontFamily={fontFamily}
              fontWeight={700}
              fontSize={44}
              fill={COLORS.white}
            >
              0,35 %
            </text>

            {points.map((p) => (
              <text
                key={`axis-${p.label}`}
                x={p.x}
                y={AXIS_LABEL_Y}
                textAnchor="middle"
                fontFamily={fontFamily}
                fontWeight={400}
                fontSize={24}
                fill={COLORS.grey}
              >
                {p.label}
              </text>
            ))}

            {/* Right-anchored so this longer caption never bleeds past the
                canvas edge near the last (rightmost) point. */}
            <text
              x={last.x}
              y={CAPTION_Y}
              textAnchor="end"
              fontFamily={fontFamily}
              fontWeight={400}
              fontSize={20}
              fill={COLORS.grey}
            >
              {CURRENT_TERM_NOTE}
            </text>
          </svg>
        </div>

        <div
          style={{
            fontFamily,
            fontWeight: 400,
            fontSize: 20,
            color: COLORS.grey,
            textAlign: "center",
          }}
        >
          politblick.de · Quelle: abgeordnetenwatch.de, eigene Auswertung · Stand 09.09.2026
        </div>
      </div>
    </AbsoluteFill>
  );
};
