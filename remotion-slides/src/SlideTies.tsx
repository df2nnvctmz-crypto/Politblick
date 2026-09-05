import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, MARGIN, LEFT_COLUMN_WIDTH } from "./theme";
import { fontFamily } from "./fonts";
import { formatEUR } from "./format";
import { tiesData } from "./data";
import { Bar, Divider, PartyBadge, SectionHeader, SlideShell } from "./components";

const MandateRow: React.FC<{ label: string; mdb: number; fraction: number }> = ({
  label,
  mdb,
  fraction,
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <span style={{ fontFamily, fontWeight: 600, fontSize: 20, color: COLORS.white, lineHeight: 1.25 }}>
      {label}
    </span>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Bar fraction={fraction} height={14} />
      </div>
      <span
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 20,
          color: COLORS.amber,
          flexShrink: 0,
          minWidth: 76,
          textAlign: "right",
        }}
      >
        {mdb} MdB
      </span>
    </div>
    <div style={{ paddingTop: 2 }}>
      <Divider />
    </div>
  </div>
);

const DonorRow: React.FC<{
  label: string;
  parties: string[];
  donation: number;
  lobbyBudget: string;
}> = ({ label, parties, donation, lobbyBudget }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
      <span
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 18,
          color: COLORS.white,
          lineHeight: 1.15,
          minWidth: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 19,
          color: COLORS.amber,
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        {formatEUR(donation)}
      </span>
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <div style={{ display: "flex", gap: 5, flexWrap: "nowrap", minWidth: 0 }}>
        {parties.map((p) => (
          <PartyBadge key={p} party={p as any} fontSize={12} compact />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0, whiteSpace: "nowrap" }}>
        <span style={{ fontFamily, fontWeight: 400, fontSize: 12, color: COLORS.grey }}>
          Lobbybudget/Jahr
        </span>
        <span style={{ fontFamily, fontWeight: 600, fontSize: 14, color: COLORS.white }}>
          {lobbyBudget}
        </span>
      </div>
    </div>
    <div style={{ paddingTop: 3 }}>
      <Divider />
    </div>
  </div>
);

export const SlideTies: React.FC = () => {
  const { mandateOrgs, donorLobby } = tiesData;
  const maxMdb = Math.max(...mandateOrgs.map((o) => o.mdb));

  return (
    <AbsoluteFill>
      <SlideShell
        pill={tiesData.pill}
        headline={tiesData.headline}
        subheadline={tiesData.subheadline}
        caveat={tiesData.caveat}
        footer={tiesData.footer}
        leftColumnWidth={LEFT_COLUMN_WIDTH}
        margin={MARGIN}
      >
        <div style={{ display: "flex", gap: 56, flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 22 }}>
            <SectionHeader>{tiesData.mandateHeader}</SectionHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {mandateOrgs.map((o) => (
                <MandateRow key={o.label} label={o.label} mdb={o.mdb} fraction={o.mdb / maxMdb} />
              ))}
            </div>
          </div>

          <div style={{ width: 1, alignSelf: "stretch", background: COLORS.divider }} />

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
            <SectionHeader>{tiesData.donorHeader}</SectionHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {donorLobby.map((d) => (
                <DonorRow
                  key={d.label}
                  label={d.label}
                  parties={d.parties}
                  donation={d.donation}
                  lobbyBudget={d.lobbyBudget}
                />
              ))}
            </div>
            <div
              style={{
                fontFamily,
                fontWeight: 400,
                fontSize: 14,
                lineHeight: 1.4,
                color: COLORS.grey,
              }}
            >
              {tiesData.donorNote}
            </div>
          </div>
        </div>
      </SlideShell>
    </AbsoluteFill>
  );
};
