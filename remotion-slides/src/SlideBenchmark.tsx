import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, MARGIN } from "./theme";
import { fontFamily } from "./fonts";
import { Logo } from "./components";

// ---------------------------------------------------------------------------
// Data — Jan Dieren (SPD), Fraktionstreue über 148 namentliche Abstimmungen
// der Wahlperiode 2021-2025, gegen die Treuequote seiner eigenen Fraktion
// über dieselben Abstimmungen. Aus vote-history-summary.json:
// ratedCount 148 · alignmentPct 83,1 · fractionAlignmentPct 99,1 · termCount 1.
//
// Die 25/23/19/4-Zahlen unten sind eine ANDERE, kompatible Kennzahl (die
// Gesamtabweichungen des Profils auf politblick.de, nicht die "nur er allein
// abweichend"-Zählung mit 12 Treffern — die ist ein eigener Slide, s.
// SlideDiscipline-Nachfolger, nicht hier verwenden):
// - 25 Abweichungen gesamt = 21 Gegenstimmen + 4 Enthaltungen.
// - Themenfeld Verteidigung: 23 von 39 Abstimmungen, davon 19-mal Nein und
//   4-mal Enthaltung — in jedem der 23 Fälle war die SPD-Fraktionslinie Ja.
//   Keine "23-mal dagegen" schreiben: eine Enthaltung ist keine Gegenstimme.
//
// Alternative mit mehr Wahlperioden: Corinna Rüffer (Grüne), 83,7 % gegen
// 96,8 %, 418 Abstimmungen, 3 Wahlperioden — Struktur identisch, nur Zahlen
// und Name tauschen.
// ---------------------------------------------------------------------------

const VALUE_SIZE = 220;

const ValueColumn: React.FC<{
  value: string;
  color: string;
  name: string;
  nameColor: string;
  sub: string;
}> = ({ value, color, name, nameColor, sub }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
    <div style={{ fontFamily, fontWeight: 700, fontSize: VALUE_SIZE, color, lineHeight: 1 }}>
      {value}
    </div>
    <div style={{ fontFamily, fontWeight: 700, fontSize: 30, color: nameColor }}>{name}</div>
    <div style={{ fontFamily, fontWeight: 400, fontSize: 24, color: COLORS.grey }}>{sub}</div>
  </div>
);

export const SlideBenchmark: React.FC = () => {
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
            {"Niemand schert\nso oft aus."}
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
            Größter Abstand zur eigenen Fraktion — von 400 Abgeordneten mit Langzeit-Bilanz
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 160, marginTop: 8 }}>
            <ValueColumn
              value="83,1 %"
              color={COLORS.amber}
              name="Jan Dieren"
              nameColor={COLORS.white}
              sub="SPD"
            />
            <ValueColumn
              value="99,1 %"
              color={COLORS.white}
              name="seine Fraktion"
              nameColor={COLORS.grey}
              sub="dieselben Abstimmungen"
            />
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
            25-mal wich er von seiner Fraktion ab.
          </div>

          {/* Nennt WORÜBER und in WELCHE RICHTUNG — nie nur das Thema ohne die
              Stimme, sonst liest es sich falsch herum. Keine Motivzuschreibung. */}
          <div
            style={{
              fontFamily,
              fontWeight: 400,
              fontSize: 27,
              color: COLORS.grey,
              textAlign: "center",
            }}
          >
            23 davon bei Bundeswehr-Einsätzen — 19-mal Nein, 4-mal Enthaltung.
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
