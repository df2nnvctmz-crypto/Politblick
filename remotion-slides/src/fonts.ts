import { continueRender, delayRender, staticFile } from "remotion";
import { loadFont } from "@remotion/fonts";

// IBM Plex Sans, self-hosted (public/fonts, sourced from @fontsource/ibm-plex-sans)
// so the render never depends on network access to Google Fonts. The family
// tops out at weight 700 (no 800/ExtraBold cut exists) — 700 is used wherever
// the brief calls for "700-800".
export const fontFamily = "IBM Plex Sans";

const weights: { weight: string; file: string }[] = [
  { weight: "400", file: "ibm-plex-sans-latin-400-normal.woff2" },
  { weight: "600", file: "ibm-plex-sans-latin-600-normal.woff2" },
  { weight: "700", file: "ibm-plex-sans-latin-700-normal.woff2" },
];

const handle = delayRender("Loading IBM Plex Sans");

Promise.all(
  weights.map(({ weight, file }) =>
    loadFont({
      family: fontFamily,
      url: staticFile(`fonts/${file}`),
      weight,
      style: "normal",
    }),
  ),
)
  .then(() => continueRender(handle))
  .catch((err) => {
    console.error("Failed to load IBM Plex Sans", err);
    continueRender(handle);
  });
