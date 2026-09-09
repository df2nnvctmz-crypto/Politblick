import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, MARGIN } from "./theme";
import { fontFamily } from "./fonts";
import { Logo } from "./components";

// ---------------------------------------------------------------------------
// Data — Friedrich Merz, Bundestag 2005-2009 (erste Zeit als Abgeordneter,
// vor seiner Rückkehr). Vier Abweichungen von der CDU/CSU-Fraktionslinie in
// namentlichen Abstimmungen, geprüft gegen das Archiv:
//
// - 29.06.2006 Antidiskriminierungsgesetz (AGG): Merz Nein, Linie Ja. Mit ihm
//   16 weitere aus der Fraktion. Angenommen.
// - 02.02.2007 Gesundheitsreform: Merz Nein, Linie Ja. Mit ihm 23 weitere.
//   Angenommen.
// - 25.05.2007 Unternehmenssteuerreform: Merz Enthaltung, Linie Ja — einer
//   von nur zwei Enthaltungen bei null Gegenstimmen. Angenommen.
// - 26.11.2008 Erbschaftssteuerreform: Merz Nein, Linie Ja. Mit ihm 28
//   weitere. Angenommen.
//
// Bei keiner dieser vier stand er allein — "als Einziger" / "im Alleingang"
// sind hier NICHT zutreffend (anders als beim Dieren-Slide).
//
// Langzeit-Bilanz (nicht auf diesem Slide, nur zur Einordnung): 6
// Abweichungen bei 180 bewerteten Abstimmungen insgesamt (96,7 % gegenüber
// 98,6 % der eigenen Fraktion). Die zwei hier nicht gezeigten: Postmindestlohn
// (14.12.2007, Nein) und Diätenerhöhung (16.11.2007, Enthaltung).
// Aufgeteilt nach Wahlperiode: 2005-2009: 6 von 36 · 2021-2025: 0 von 144 —
// das ist der Zahlenbogen, den der Slide zieht.
// ---------------------------------------------------------------------------

const VOTES: { law: string; year: string; vote: string }[] = [
  { law: "Antidiskriminierungsgesetz", year: "2006", vote: "NEIN" },
  { law: "Gesundheitsreform", year: "2007", vote: "NEIN" },
  { law: "Unternehmenssteuerreform", year: "2007", vote: "ENTHALTUNG" },
  { law: "Erbschaftssteuerreform", year: "2008", vote: "NEIN" },
];

const LIST_WIDTH = 1500;

const VoteRow: React.FC<{ law: string; year: string; vote: string }> = ({
  law,
  year,
  vote,
}) => (
  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
      <span style={{ fontFamily, fontWeight: 400, fontSize: 36, color: COLORS.white }}>
        {law}
      </span>
      <span style={{ fontFamily, fontWeight: 400, fontSize: 24, color: COLORS.grey }}>
        {year}
      </span>
    </div>
    <span style={{ fontFamily, fontWeight: 700, fontSize: 36, color: COLORS.amber }}>
      {vote}
    </span>
  </div>
);

export const SlideMerz: React.FC = () => {
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
            gap: 26,
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
            {"Als Merz noch\ngegen die Union stimmte."}
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
            Seine erste Zeit im Bundestag, 2005–2009
          </div>

          <div
            style={{
              width: LIST_WIDTH,
              display: "flex",
              flexDirection: "column",
              gap: 30,
              marginTop: 8,
            }}
          >
            {VOTES.map((v) => (
              <VoteRow key={v.law} law={v.law} year={v.year} vote={v.vote} />
            ))}
          </div>

          <div
            style={{
              fontFamily,
              fontWeight: 400,
              fontSize: 28,
              color: COLORS.grey,
              textAlign: "center",
            }}
          >
            Die CDU/CSU-Fraktion stimmte jedes Mal mit Ja.
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              marginTop: 8,
            }}
          >
            <div style={{ fontFamily, fontWeight: 700, fontSize: 34, color: COLORS.white }}>
              2005–2009: 6 Abweichungen bei 36 Abstimmungen.
            </div>
            <div style={{ fontFamily, fontWeight: 700, fontSize: 34, color: COLORS.white }}>
              2021–2025: <span style={{ color: COLORS.amber }}>0</span> bei 144.
            </div>
          </div>
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
