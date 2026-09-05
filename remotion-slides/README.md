# Politblick — Lobby/Spenden Reddit-Slides

Renders two 1920×1080 PNG stills for a Reddit image post, matching the existing
Politblick slide style (dark navy canvas, two-column layout, amber accents).

- `SlideSpend` → `out/politblick-lobby-1.png` — Großspenden vs. gemeldete
  Lobbyausgaben, plus a breakdown by organisation type.
- `SlideTies` → `out/politblick-lobby-2.png` — 204/630 Abgeordnete mit
  Interessenvertretungs-Funktion, mit den Organisationen mit den meisten
  Mandatsträgern und den Groß­spendern, die zugleich im Lobbyregister stehen.

## Usage

```bash
npm install
npm run slides
```

This bundles `src/index.ts` with `@remotion/bundler` and renders both stills
with `@remotion/renderer`'s `renderStill`. On first run, Remotion downloads
its own Chrome Headless Shell (a few hundred MB) if it isn't cached yet —
this needs normal internet access once.

If you're running this in a sandboxed environment where that download host
isn't reachable, point Remotion at any locally installed Chromium/Chrome
instead:

```bash
REMOTION_BROWSER_EXECUTABLE=/path/to/chrome npm run slides
```

## Where the numbers come from

Every figure in `src/data.ts` is copied by hand from politblick.de (which in
turn aggregates the Bundestag's public Lobbyregister, the register of
donations to parties, and MdBs' declared Nebentätigkeiten). Nothing is
fetched at render time — this keeps the slides reproducible and lets you
diff exactly what changed between refreshes.

To refresh the slides for a new "Stand" date:

1. Open politblick.de and re-read each figure used below. All of them are
   on the live site already, so re-check by hand rather than parsing the
   site's data files directly (labels and totals sometimes get regrouped).
2. Update `src/data.ts`:
   - `STAND` — the date shown as "Stand …" in both footers.
   - `spendData.compare` — Großspenden total (4-year window) vs. gemeldete
     Lobbyausgaben (annual total).
   - `spendData.breakdown` — the 7 rows under "Nach Art der Organisation"
     (Melder-Anzahl + Betrag per Organisationsart).
   - `spendData.footnote` — active/„mit Angabe"-Eintragungen and the
     min/max range implied by the register's €10.000 reporting brackets.
   - `tiesData.headline` — the `X von 630 Abgeordneten` count.
   - `tiesData.mandateOrgs` — top organisations by number of MdBs holding a
     declared function there.
   - `tiesData.donorLobby` — donors that are also Lobbyregister entries:
     party/parties donated to, donation total, and the organisation's own
     declared annual lobby-budget bracket (kept as a separate field/label —
     never summed with the donation, see constraints below).
3. Re-run `npm run slides` and check both PNGs at full size for clipping —
   long organisation names (e.g. "Deutsche Gesellschaft für Internationale
   Zusammenarbeit (GIZ)") are the first thing to watch if a name gets
   longer.

## Hard constraints on what these slides may claim

These come from Politblick's editorial rules and are enforced by how the
data is modelled and labelled in `src/data.ts` / the slide components — keep
them in mind if you extend either slide:

1. Never imply a lobby euro reached a party — the register has no recipient
   field. This also governs the framing, not just the figures: the slide 1 pill
   says "WAS INTERESSENVERTRETUNG KOSTET", the register's own statutory term.
   "Einflussnahme" or "Zugang" would assert that the money bought something,
   which the data cannot show — and would misdescribe its own contents, since
   the second-largest declarant is the Verbraucherzentrale Bundesverband and
   Campact is eighth. The total is what organisations declare spending on
   interest representation, most of it their own operating cost for it.
2. Never sum a lobby budget with a donation — they're shown side by side
   under separate labels (`Lobbybudget/Jahr` is always its own line).
3. Never call a declared function a conflict, payment, or meeting.
4. No per-party lobby-spend chart (double-counts organisations, no
   recipient).
5. Keep the period visible next to both comparison figures on slide 1
   ("je Geschäftsjahr" and "über mehr als 3 Jahre"). The donation window runs
   2022-12-30 to 2026-09-02 — 1.342 days, 3,67 years — so "4 Jahre" overstates
   it; 2026 is only recorded to September. Not "pro Jahr" either: the
   register records no financial year, so the total is a sum across entries
   reporting different years, not one calendar year.
6. Don't round away the register's reporting-bracket range in the footnote.
7. One estimator per slide. The headline and the breakdown bars are both
   bracket MIDPOINTS; mixing in the brackets' upper bounds understates the
   unshown remainder by 2,2x.
8. The Abgeordneten figure is 204, not the 211 ties the pipeline joins —
   seven of those members declare only a payment, no function, and the
   caveat on the slide says "keine Zahlung".
9. The donor column lists only donors whose register entry is still ACTIVE.
   Two matches (Viessmann 555.000 €, Aquila 292.000 €) are excluded by that
   rule; the header is present tense.
7. No party logos or politician photos; naming a donor/registrant is
   reporting a public filing, not an accusation.

## Fonts

IBM Plex Sans (400/600/700 — the family has no 800/ExtraBold cut) is
self-hosted from `public/fonts/` (copied from `@fontsource/ibm-plex-sans`,
OFL-licensed, see `public/fonts/OFL-LICENSE.txt`) and loaded locally via
`@remotion/fonts`, so rendering never depends on reaching Google Fonts.
