import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, MARGIN, LEFT_COLUMN_WIDTH } from "./theme";
import { fontFamily } from "./fonts";
import { formatEUR, formatInt } from "./format";
import { spendData } from "./data";
import { Bar, Divider, SectionHeader, SlideShell } from "./components";

const CompareRow: React.FC<{
  label: string;
  note: string;
  value: number;
  fraction: number;
}> = ({ label, note, value, fraction }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily, fontWeight: 600, fontSize: 25, color: COLORS.white }}>
          {label}
        </span>
        <span style={{ fontFamily, fontWeight: 600, fontSize: 18, color: COLORS.grey }}>
          {note}
        </span>
      </div>
      <span style={{ fontFamily, fontWeight: 700, fontSize: 36, color: COLORS.amber }}>
        {formatEUR(value)}
      </span>
    </div>
    <Bar fraction={fraction} height={48} />
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
  const maxCompare = Math.max(compare.donations.value, compare.lobbySpend.value);
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
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <CompareRow
            label={compare.donations.label}
            note={compare.donations.note}
            value={compare.donations.value}
            fraction={compare.donations.value / maxCompare}
          />
          <CompareRow
            label={compare.lobbySpend.label}
            note={compare.lobbySpend.note}
            value={compare.lobbySpend.value}
            fraction={compare.lobbySpend.value / maxCompare}
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

        <div style={{ height: 34 }} />

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
