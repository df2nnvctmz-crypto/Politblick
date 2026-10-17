/**
 * Shared "download this chart" plumbing for every chart in the app — CSV of the underlying
 * data, or a static image (SVG/PNG) of exactly what's currently on screen, selection/highlight
 * state included. Charts that render as real <svg> hand a live element in; the HTML/CSS bar
 * charts and the tie-matrix table hand in a hand-built SVG string instead — both paths converge
 * on the same framing (title, legend, source; see composeExport) and download code below.
 */

const FONT = "'IBM Plex Sans', system-ui, sans-serif";

export interface ChartSvgExport {
  /** A complete `<svg ...>...</svg>` string — viewBox set, no watermark yet. */
  svgString: string;
  width: number;
  height: number;
}

export interface ChartCsvExport {
  headers: string[];
  rows: (string | number | null)[][];
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string | number | null): string {
  if (value === null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, data: ChartCsvExport) {
  const lines = [data.headers, ...data.rows].map((row) => row.map(csvEscape).join(','));
  triggerDownload(filename, new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
}


/** Clones a live, currently-rendered SVG element (so any selection/hover/pinned styling already
 * applied via inline style shows up for free) into a standalone, self-contained SVG string. */
export function cloneSvgForExport(svg: SVGSVGElement): ChartSvgExport {
  const viewBox = svg.viewBox.baseVal;
  const rect = svg.getBoundingClientRect();
  const width = viewBox.width || rect.width;
  const height = viewBox.height || rect.height;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  // On the live page, every text element gets 'IBM Plex Sans' from the site's global `* {}`
  // CSS rule — that's a stylesheet, not an inline style, so it never travels with a cloned node.
  // Setting it directly on the root makes every descendant <text> inherit it (SVG attribute
  // inheritance mirrors CSS here), so a standalone-opened export doesn't fall back to serif.
  clone.setAttribute('font-family', FONT);
  // The "marching ants" flow animation on highlighted org-graph edges depends on a page
  // stylesheet that a standalone export doesn't have — freeze it to its static dash pattern
  // instead of losing the dash entirely.
  clone.querySelectorAll('.pb-flow-edge').forEach((el) => el.setAttribute('stroke-dasharray', '6 6'));
  clone.querySelectorAll('input').forEach((el) => el.remove());
  const svgString = new XMLSerializer().serializeToString(clone);
  return { svgString, width, height };
}

/** One legend entry of an exported graphic: a colour swatch, its label and an optional value
 * (e.g. "CDU/CSU 208"). `shape` matches how the colour appears in the chart. */
export interface ExportLegendItem {
  label: string;
  color: string;
  value?: string;
  shape?: 'dot' | 'line' | 'dashed' | 'ring';
}

/** The static part of an export frame, handed down from the page that places the chart: title,
 * optional subtitle (current filter/metric/scope) and the source line. Charts add the legend. */
export interface ExportInfo {
  title: string;
  subtitle?: string;
  /** Context the chart can't be read fairly without, once it leaves the page — e.g. that a
   * "tie" is a self-declared link and no claim of influence. Printed above the source line. */
  caveat?: string;
  source: string;
}

/**
 * Everything an exported graphic carries besides the chart itself, so it stands on its own when
 * shared: title, optional subtitle (the current filter/range/metric), a legend built from what is
 * on screen right now, an optional caveat, and the data source with its date. Charts build this
 * at click time, so the legend always matches the data shown.
 */
export interface ExportFrame {
  title: string;
  subtitle?: string;
  caveat?: string;
  legend?: ExportLegendItem[];
  source: string;
}

const INK = '#13161b';
const MUTED = '#5a5f6b';
const FAINT = '#878c96';
const ACCENT = '#284cac';
const HAIRLINE = '#e3e5e9';

let measureCtx: CanvasRenderingContext2D | null = null;
/** Text width with the site's own (already loaded) font, so wrapping matches what's rendered. */
function textWidth(text: string, size: number, weight = 400): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * size * 0.55;
  measureCtx.font = `${weight} ${size}px 'IBM Plex Sans', system-ui, sans-serif`;
  return measureCtx.measureText(text).width;
}

function wrapText(text: string, maxWidth: number, size: number, weight = 400): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, weight) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let fontCss: Promise<string> | null = null;
/** The site font as an embedded @font-face. An SVG drawn into a canvas (the PNG path) can't load
 * web fonts, and a downloaded SVG opened elsewhere doesn't have them either — without this, both
 * fall back to whatever sans-serif the viewer has. Fetched once per page load (~45 KB). */
function embeddedFontCss(): Promise<string> {
  fontCss ??= fetch(`${import.meta.env.BASE_URL}fonts/ibm-plex-sans-latin.woff2`)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
    .then((buf) => {
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `@font-face{font-family:'IBM Plex Sans';font-weight:100 900;src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');}`;
    })
    .catch(() => '');
  return fontCss;
}

function logoMark(cx: number, cy: number, r: number): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ACCENT}" stroke-width="${r * 0.2}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="none" stroke="${ACCENT}" stroke-opacity="0.5" stroke-width="${r * 0.16}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.22}" fill="${INK}"/>`;
}

function swatch(item: ExportLegendItem, x: number, cy: number): string {
  if (item.shape === 'dashed') return `<line x1="${x}" y1="${cy}" x2="${x + 18}" y2="${cy}" stroke="${item.color}" stroke-width="3" stroke-dasharray="4 3"/>`;
  if (item.shape === 'line') return `<line x1="${x}" y1="${cy}" x2="${x + 14}" y2="${cy}" stroke="${item.color}" stroke-width="2.5" stroke-linecap="round"/>`;
  if (item.shape === 'ring') return `<circle cx="${x + 5}" cy="${cy}" r="4.5" fill="white" stroke="${item.color}" stroke-width="2"/>`;
  return `<circle cx="${x + 5}" cy="${cy}" r="5" fill="${item.color}"/>`;
}
const swatchWidth = (item: ExportLegendItem) => (item.shape === 'dashed' ? 18 : item.shape === 'line' ? 14 : 10);

/** An entry wider than the whole legend row (e.g. a long list of names in its value) is cut with
 * an ellipsis rather than running off the image. */
function fitLegendItem(item: ExportLegendItem, maxWidth: number): ExportLegendItem {
  const width = (it: ExportLegendItem) => swatchWidth(it) + 7 + textWidth(it.label, 13, 600) + (it.value ? textWidth(it.value, 13) + 5 : 0);
  if (width(item) <= maxWidth) return item;
  const fitted = { ...item };
  if (fitted.value) {
    while (fitted.value.length > 1 && width({ ...fitted, value: `${fitted.value}…` }) > maxWidth) fitted.value = fitted.value.slice(0, -1);
    fitted.value = `${fitted.value.trimEnd()}…`;
  }
  while (fitted.label.length > 1 && width(fitted) > maxWidth) fitted.label = `${fitted.label.slice(0, -2)}…`;
  return fitted;
}

/**
 * Lays the chart out as a self-contained Politblick graphic: logo, title (+ subtitle) on top, the
 * chart, its legend underneath, and a footer with the data source and politblick.de. The chart
 * keeps its own coordinate space (nested <svg>), so nothing it draws can collide with the frame;
 * small charts are scaled up to a minimum width so the frame never dwarfs them.
 */
async function composeExport(chart: ChartSvgExport, frame: ExportFrame): Promise<ChartSvgExport> {
  const PAD = 28;
  const contentW = Math.max(chart.width, 560);
  const width = contentW + PAD * 2;
  const scale = contentW / chart.width;
  const chartH = chart.height * scale;
  const parts: string[] = [];
  let y = PAD;

  // Brand row
  parts.push(logoMark(PAD + 9, y + 9, 9));
  parts.push(`<text x="${PAD + 25}" y="${y + 9}" dominant-baseline="central" font-size="14" font-weight="700" fill="${INK}">Politblick</text>`);
  y += 18 + 16;

  // Title + subtitle
  for (const line of wrapText(frame.title, contentW, 21, 700)) {
    parts.push(`<text x="${PAD}" y="${y + 21}" font-size="21" font-weight="700" fill="${INK}">${esc(line)}</text>`);
    y += 27;
  }
  if (frame.subtitle) {
    y += 2;
    for (const line of wrapText(frame.subtitle, contentW, 13.5)) {
      parts.push(`<text x="${PAD}" y="${y + 14}" font-size="13.5" fill="${MUTED}">${esc(line)}</text>`);
      y += 19;
    }
  }
  y += 18;

  // Chart, in its own coordinate space
  const chartY = y;
  y += chartH;

  // Legend: rows of swatch + label + value, wrapping at the content width
  if (frame.legend?.length) {
    y += 18;
    const ROW = 22;
    let x = PAD;
    let rowY = y;
    for (const raw of frame.legend) {
      const item = fitLegendItem(raw, contentW);
      const labelW = textWidth(item.label, 13, 600);
      const valueW = item.value ? textWidth(item.value, 13) + 5 : 0;
      const w = swatchWidth(item) + 7 + labelW + valueW;
      if (x > PAD && x + w > PAD + contentW) {
        x = PAD;
        rowY += ROW;
      }
      const cy = rowY + 9;
      parts.push(swatch(item, x, cy));
      const tx = x + swatchWidth(item) + 7;
      parts.push(`<text x="${tx}" y="${cy}" dominant-baseline="central" font-size="13" font-weight="600" fill="${INK}">${esc(item.label)}</text>`);
      if (item.value) parts.push(`<text x="${tx + labelW + 5}" y="${cy}" dominant-baseline="central" font-size="13" fill="${MUTED}">${esc(item.value)}</text>`);
      x += w + 20;
    }
    y = rowY + ROW;
  }

  // Caveat: the context the page gives this chart, so it travels with the image.
  if (frame.caveat) {
    y += 16;
    for (const line of wrapText(frame.caveat, contentW, 12.5)) {
      parts.push(`<text x="${PAD}" y="${y + 13}" font-size="12.5" fill="${MUTED}">${esc(line)}</text>`);
      y += 18;
    }
  }

  // Footer: source on the left, politblick.de on the right
  y += 18;
  parts.push(`<line x1="${PAD}" y1="${y}" x2="${PAD + contentW}" y2="${y}" stroke="${HAIRLINE}" stroke-width="1"/>`);
  y += 12;
  const siteW = textWidth('politblick.de', 11.5, 600);
  const sourceLines = wrapText(frame.source, contentW - siteW - 24, 11.5);
  parts.push(`<text x="${PAD + contentW}" y="${y + 12}" text-anchor="end" font-size="11.5" font-weight="600" fill="${ACCENT}">politblick.de</text>`);
  for (const line of sourceLines) {
    parts.push(`<text x="${PAD}" y="${y + 12}" font-size="11.5" fill="${FAINT}">${esc(line)}</text>`);
    y += 16;
  }
  const height = y + PAD - 6;

  // Nest the chart: position it, scale it via its own viewBox, and keep its contents untouched.
  const nested = chart.svgString.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
    // A cloned live <svg> carries the page's style="width: 100%; …" — on a nested <svg> that CSS
    // would override the width/height set here, so it goes along with the old geometry.
    const cleaned = attrs.replace(/\s(x|y|width|height|style)="[^"]*"/g, '');
    return `<svg${cleaned} x="${PAD}" y="${chartY}" width="${contentW}" height="${chartH}">`;
  });

  const font = await embeddedFontCss();
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">` +
    (font ? `<defs><style>${font}</style></defs>` : '') +
    `<rect width="${width}" height="${height}" fill="white"/>${parts.join('')}${nested}</svg>`;
  return { svgString, width, height };
}

export async function downloadSvg(filename: string, chart: ChartSvgExport, frame: ExportFrame) {
  const composed = await composeExport(chart, frame);
  triggerDownload(filename, new Blob([composed.svgString], { type: 'image/svg+xml;charset=utf-8' }));
}

export async function downloadPng(filename: string, chart: ChartSvgExport, frame: ExportFrame, scale = 2): Promise<void> {
  const composed = await composeExport(chart, frame);
  return new Promise((resolve, reject) => {
    const blob = new Blob([composed.svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(composed.width * scale));
      canvas.height = Math.max(1, Math.round(composed.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('no canvas context'));
        return;
      }
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) triggerDownload(filename, pngBlob);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('failed to rasterize chart svg'));
    };
    img.src = url;
  });
}
