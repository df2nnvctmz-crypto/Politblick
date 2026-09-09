import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, MARGIN, LEFT_COLUMN_WIDTH } from "./theme";
import { fontFamily } from "./fonts";
import { formatEUR, formatInt } from "./format";
import { spendData } from "./data";
import { Bar, Divider, SectionHeader, SlideShell } from "./components";

const HeroStat: React.FC<{
  label: string;
  note: string;
  value: number;
  color: string;
  valueSize: number;
}> = ({ label, note, value, color, valueSize }) => (
  <div style={{ display: "flex", gap: 22, alignItems: "stretch" }}>
    <div style={{ width: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <span style={{ fontFamily, fontWeight: 600, fontSize: 24, color: COLORS.white }}>
          {label}
        </span>
        <span style={{ fontFamily, fontWeight: 600, fontSize: 17, color: COLORS.grey }}>
          {note}
        </span>
      </div>
      <span
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: valueSize,
          color,
          lineHeight: 1,
          letterSpacing: -1,
        }}
      >
        {formatEUR(value)}
      </span>
    </div>
  </div>
);

const BreakdownRow: React.FC<{
  label: string;
  melder: number;
  betrag: number;
  fraction: number;
}> = ({ label, melder, betrag, fraction }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily, fontWeight: 600, fontSize: 22, color: COLORS.white }}>
          {label}
        </span>
        <span style={{ fontFamily, fontWeight: 400, fontSize: 16, color: COLORS.grey }}>
          {formatInt(melder)} Melder
        </span>
      </div>
      <span style={{ fontFamily, fontWeight: 700, fontSize: 24, color: COLORS.amber }}>
        {formatEUR(betrag)}
      </span>
    </div>
    <Bar fraction={fraction} height={16} />
    <div style={{ paddingTop: 6 }}>
      <Divider />
    </div>
  </div>
);

export const SlideSpend: React.FC = () => {
  const { compare, breakdown } = spendData;
  const maxBreakdown = Math.max(...breakdown.map((b) => b.betrag));

  return (
    <AbsoluteFill>
      <SlideShell
        pill={spendData.pill}
        headline={spendData.headline}
        subheadline={spendData.subheadline}
        caveat={spendData.caveat}
        footer={spendData.footer}
        footnote={spendData.footnote}
        leftColumnWidth={LEFT_COLUMN_WIDTH}
        margin={MARGIN}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          <HeroStat
            label={compare.lobbySpend.label}
            note={compare.lobbySpend.note}
            value={compare.lobbySpend.value}
            color={COLORS.amber}
            valueSize={96}
          />
          <HeroStat
            label={compare.donations.label}
            note={compare.donations.note}
            value={compare.donations.value}
            color={COLORS.logoBlue}
            valueSize={52}
          />
          <div
            style={{
              fontFamily,
              fontWeight: 400,
              fontSize: 18,
              lineHeight: 1.4,
              color: COLORS.grey,
            }}
          >
            {spendData.compareNote}
          </div>
        </div>

        <div style={{ height: 30 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 0 }}>
          <SectionHeader>{spendData.breakdownHeader}</SectionHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {breakdown.map((row) => (
              <BreakdownRow
                key={row.label}
                label={row.label}
                melder={row.melder}
                betrag={row.betrag}
                fraction={row.betrag / maxBreakdown}
              />
            ))}
          </div>
        </div>
      </SlideShell>
    </AbsoluteFill>
  );
};
