import React from "react";
import { COLORS } from "./theme";
import { fontFamily } from "./fonts";
import { PARTY_COLORS, PartyKey } from "./data";

export const Logo: React.FC<{ size?: number; textSize?: number; gap?: number }> = ({
  size = 36,
  textSize = 30,
  gap = 14,
}) => (
  <div style={{ display: "flex", alignItems: "center", gap }}>
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        background: COLORS.logoBlue,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: size * 0.16,
          borderRadius: "50%",
          background: "#ffffff",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: size * 0.4,
          borderRadius: "50%",
          background: COLORS.logoBlue,
        }}
      />
    </div>
    <span
      style={{
        fontFamily,
        fontWeight: 700,
        fontSize: textSize,
        color: COLORS.white,
        letterSpacing: -0.2,
      }}
    >
      Politblick
    </span>
  </div>
);

export const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      display: "inline-block",
      padding: "10px 20px",
      borderRadius: 999,
      background: COLORS.amberPillBg,
      border: `1px solid ${COLORS.amberPillBorder}`,
      color: COLORS.amber,
      fontFamily,
      fontWeight: 700,
      fontSize: 15,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
    }}
  >
    {children}
  </div>
);

export const SectionHeader: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div
    style={{
      fontFamily,
      fontWeight: 600,
      fontSize: 17,
      color: COLORS.grey,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
    }}
  >
    {children}
  </div>
);

export const Bar: React.FC<{ fraction: number; height?: number }> = ({
  fraction,
  height = 22,
}) => {
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <div
      style={{
        width: "100%",
        height,
        borderRadius: 6,
        background: COLORS.trackBar,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${clamped * 100}%`,
          height: "100%",
          borderRadius: 6,
          background: `linear-gradient(90deg, ${COLORS.barFrom}, ${COLORS.barTo})`,
        }}
      />
    </div>
  );
};

export const PartyBadge: React.FC<{
  party: PartyKey;
  fontSize?: number;
  compact?: boolean;
}> = ({ party, fontSize = 19, compact = false }) => {
  const { bg, fg } = PARTY_COLORS[party];
  return (
    <span
      style={{
        display: "inline-block",
        padding: compact ? "3px 8px" : "6px 14px",
        borderRadius: compact ? 4 : 6,
        background: bg,
        color: fg,
        fontFamily,
        fontWeight: 700,
        fontSize,
        lineHeight: 1,
        whiteSpace: "nowrap",
        border: bg === "#000000" ? "1px solid #333c48" : "none",
      }}
    >
      {party}
    </span>
  );
};

export const Divider: React.FC = () => (
  <div style={{ height: 1, width: "100%", background: COLORS.divider }} />
);

export const FooterBlock: React.FC<{
  label: string;
  stand: string;
  source: string;
}> = ({ label, stand, source }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <Logo size={26} textSize={22} gap={10} />
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontFamily, fontSize: 17, lineHeight: 1.4 }}>
        <span style={{ color: COLORS.white, fontWeight: 700 }}>{label}</span>
        <span style={{ color: COLORS.grey, fontWeight: 400 }}> · {stand}</span>
      </div>
      <div
        style={{
          fontFamily,
          fontWeight: 400,
          fontSize: 15,
          color: COLORS.grey,
          lineHeight: 1.4,
        }}
      >
        {source}
      </div>
      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 17,
          color: COLORS.amber,
          marginTop: 4,
        }}
      >
        politblick.de
      </div>
    </div>
  </div>
);

export const SlideShell: React.FC<{
  pill: string;
  headline: string;
  subheadline: string;
  caveat: string;
  footer: { label: string; stand: string; source: string };
  footnote?: string;
  children: React.ReactNode;
  leftColumnWidth: number;
  margin: number;
}> = ({
  pill,
  headline,
  subheadline,
  caveat,
  footer,
  footnote,
  children,
  leftColumnWidth,
  margin,
}) => (
  <div
    style={{
      width: 1920,
      height: 1080,
      background: COLORS.bg,
      display: "flex",
      fontFamily,
    }}
  >
    {/* Left column */}
    <div
      style={{
        width: leftColumnWidth,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: `${margin}px ${margin}px ${margin}px ${margin}px`,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Logo />
        <div>
          <Pill>{pill}</Pill>
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 62,
            lineHeight: 1.08,
            color: COLORS.white,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 700,
            fontSize: 27,
            lineHeight: 1.3,
            color: COLORS.amber,
          }}
        >
          {subheadline}
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 400,
            fontSize: 16,
            lineHeight: 1.5,
            color: COLORS.grey,
          }}
        >
          {caveat}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {footnote ? (
          <div
            style={{
              fontFamily,
              fontWeight: 400,
              fontSize: 14,
              lineHeight: 1.5,
              color: COLORS.grey,
            }}
          >
            {footnote}
          </div>
        ) : null}
        <FooterBlock {...footer} />
      </div>
    </div>

    {/* Divider */}
    <div style={{ width: 1, alignSelf: "stretch", background: COLORS.divider }} />

    {/* Content area */}
    <div
      style={{
        flex: 1,
        boxSizing: "border-box",
        padding: `${margin}px ${margin}px ${margin}px ${margin}px`,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      {children}
    </div>
  </div>
);
