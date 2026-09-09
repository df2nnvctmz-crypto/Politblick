import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, MARGIN } from "./theme";
import { fontFamily } from "./fonts";
import { Logo } from "./components";

// ---------------------------------------------------------------------------
// Data — zwei namentliche Abstimmungen aus November 2023, vier Wochen vor der
// Abspaltung des BSW von der Fraktion DIE LINKE. am 15.12.2023.
//
// Zeigt die STIMME, nicht die Kopfzahl: eine frühere Fassung zählte die
// Stimmen als 24 bzw. 19 einzelne Quadrate durch — unruhig, die beiden
// Seiten optisch nicht vergleichbar, und in einer Social-Vorschau nicht
// erkennbar. „alle" trägt die Geschlossenheit, die Zahl im Fließtext ist nur
// noch der Beleg dazu.
//
// Die Seiten bleiben fest (BSW immer links/amber, Linke immer rechts/weiß),
// aber die Stimme selbst dreht sich zwischen den beiden Abstimmungen — das
// ist beabsichtigt und soll auffallen: die Lager standen sich beide Mal
// gegenüber, aber nicht immer auf derselben Seite der Sachfrage.
// ---------------------------------------------------------------------------

const ROWS: {
  dateLabel: string;
  left: { vote: string; note: string };
  right: { vote: string; note: string };
}[] = [
  {
    dateLabel: "10.11.2023 · Stiftungsfinanzierungsgesetz",
    left: { vote: "NEIN", note: "alle 8 der späteren BSW" },
    right: { vote: "JA", note: "alle 24 der späteren Linken" },
  },
  {
    dateLabel: "16.11.2023 · Moldau und Georgien als sichere Herkunftsstaaten",
    left: { vote: "JA", note: "alle 7 der späteren BSW" },
    right: { vote: "NEIN", note: "alle 19 der späteren Linken" },
  },
];

const ROW_WIDTH = 1600;

const VoteWord: React.FC<{
  vote: string;
  note: string;
  color: string;
  align: "left" | "right";
}> = ({ vote, note, color, align }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: align === "left" ? "flex-start" : "flex-end",
      gap: 14,
    }}
  >
    <div style={{ fontFamily, fontWeight: 700, fontSize: 104, color, lineHeight: 1 }}>
      {vote}
    </div>
    <div style={{ fontFamily, fontWeight: 400, fontSize: 24, color: COLORS.grey }}>
      {note}
    </div>
  </div>
);

export const SlideSplit: React.FC = () => {
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
            gap: 30,
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
            {"Vier Wochen vor\nder BSW-Abspaltung."}
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
            Beide Lager saßen noch in einer Fraktion.
          </div>

          <div
            style={{
              width: ROW_WIDTH,
              display: "flex",
              flexDirection: "column",
              gap: 56,
              marginTop: 12,
            }}
          >
            {ROWS.map((row) => (
              <div key={row.dateLabel}>
                <div
                  style={{
                    fontFamily,
                    fontWeight: 400,
                    fontSize: 26,
                    color: COLORS.grey,
                    marginBottom: 18,
                  }}
                >
                  {row.dateLabel}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <VoteWord
                    vote={row.left.vote}
                    note={row.left.note}
                    color={COLORS.amber}
                    align="left"
                  />
                  <VoteWord
                    vote={row.right.vote}
                    note={row.right.note}
                    color={COLORS.white}
                    align="right"
                  />
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              fontFamily,
              fontWeight: 700,
              fontSize: 34,
              color: COLORS.white,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            Fraktion gespalten: 15.12.2023
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
