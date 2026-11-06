// Share-preview images: one 1200 x 630 PNG per Datenstory, one per Sitzungswochen-Briefing and a
// default for every other page, written to dist/og/<name>.png. The pages name them in og:image /
// twitter:image (src/App.tsx), which is what X, Reddit, Facebook, LinkedIn and messengers show
// next to a shared link.
//
// Runs after `vite build` (which also builds og/index.html, the card page src/og.tsx draws): opens
// that page headless once per target with the same data files the site serves, waits for the card,
// and screenshots it. The card page itself is deleted afterwards, so it is never published or
// crawled. Runs after prerender.mjs, whose own preview server has closed by then.
import { preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';

const PORT = 4174;
const DIST = 'dist';

const targets = [{ name: 'default', query: 'kind=default' }];
if (existsSync('public/data/datenstories')) {
  for (const f of readdirSync('public/data/datenstories').filter((x) => x.endsWith('.json')).sort()) {
    const slug = f.slice(0, -5);
    targets.push({ name: `datenstories-${slug}`, query: `kind=datenstory&slug=${encodeURIComponent(slug)}` });
  }
}
if (existsSync('public/data/stories.json')) {
  const issues = JSON.parse(readFileSync('public/data/stories.json', 'utf-8')).issues ?? [];
  for (const i of issues) targets.push({ name: `sitzungswoche-${i.week}`, query: `kind=briefing&week=${encodeURIComponent(i.week)}` });
}

if (!existsSync(`${DIST}/og/index.html`)) {
  console.error('dist/og/index.html is missing: vite.config.ts must build og/index.html as a second entry.');
  process.exit(1);
}

const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'error' });
const base = server.resolvedUrls?.local[0]?.replace(/\/$/, '');
if (!base) throw new Error('vite preview did not resolve a local URL');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
let failed = 0;
for (const t of targets) {
  try {
    await page.goto(`${base}/og/?${t.query}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#og-card[data-og-ready]', { timeout: 10000 });
    await page.waitForSelector('html[data-fonts-ready]', { timeout: 10000 });
    await page.locator('#og-card').screenshot({ path: `${DIST}/og/${t.name}.png` });
  } catch (err) {
    failed += 1;
    console.error(`  FAILED ${t.name}: ${err instanceof Error ? err.message : err}`);
  }
}
await browser.close();
await server.close();
// The card page was only a tool for the screenshots.
rmSync(`${DIST}/og/index.html`, { force: true });
console.log(`Share previews: ${targets.length - failed}/${targets.length} images in dist/og/.`);
if (failed) process.exit(1);
