import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const jobs = [
  { id: "SlideSpend", output: "out/politblick-lobby-1.png" },
  { id: "SlideTies", output: "out/politblick-lobby-2.png" },
];

// Use the Playwright Chromium already installed in this environment instead
// of letting Remotion download its own Chrome Headless Shell (that host is
// not on this sandbox's network allowlist).
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || undefined;

console.log("Bundling…");
const serveUrl = await bundle({
  entryPoint: path.join(__dirname, "src", "index.ts"),
  onProgress: () => {},
});

for (const job of jobs) {
  const composition = await selectComposition({
    serveUrl,
    id: job.id,
    browserExecutable,
  });
  const outputPath = path.join(__dirname, job.output);
  console.log(`Rendering ${job.id} -> ${job.output}`);
  await renderStill({
    composition,
    serveUrl,
    output: outputPath,
    imageFormat: "png",
    browserExecutable,
  });
}

console.log("Done.");
