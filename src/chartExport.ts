/**
 * Shared "download this chart" plumbing for every chart in the app — CSV of the underlying
 * data, or a static image (SVG/PNG) of exactly what's currently on screen, selection/highlight
 * state included. Charts that render as real <svg> hand a live element in; the two HTML/CSS bar
 * charts and the tie-matrix table hand in a hand-built SVG string instead — both paths converge
 * on the same watermarking/serialization/download code below.
 */

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

const WATERMARK_FONT = "'IBM Plex Sans', system-ui, sans-serif";

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
  clone.setAttribute('font-family', WATERMARK_FONT);
  // The "marching ants" flow animation on highlighted org-graph edges depends on a page
  // stylesheet that a standalone export doesn't have — freeze it to its static dash pattern
  // instead of losing the dash entirely.
  clone.querySelectorAll('.pb-flow-edge').forEach((el) => el.setAttribute('stroke-dasharray', '6 6'));
  clone.querySelectorAll('input').forEach((el) => el.remove());
  const svgString = new XMLSerializer().serializeToString(clone);
  return { svgString, width, height };
}

/**
 * Adds the watermark in a dedicated footer strip BELOW the chart's own coordinate space, rather
 * than overlaid on top of it — the chart content's viewBox/height never change, so there is no
 * corner of any chart (bar tops, axis labels, a network graph's spread-out nodes, …) the mark
 * could ever end up sitting on top of. Small and low-opacity on top of that, since it only needs
 * to be legible, not prominent.
 */
function withWatermark(chart: ChartSvgExport): ChartSvgExport {
  const footerHeight = Math.max(18, Math.min(28, chart.height * 0.09));
  const newHeight = chart.height + footerHeight;
  const markR = Math.max(3.5, Math.min(6, chart.width * 0.007));
  const fontSize = markR * 1.5;
  const cy = chart.height + footerHeight / 2;
  const cx = chart.width - markR * 2.6;
  const textX = cx - markR - 5;
  const footer = `<rect x="0" y="${chart.height}" width="${chart.width}" height="${footerHeight}" fill="white"/>
    <g opacity="0.5" font-family="${WATERMARK_FONT}">
      <circle cx="${cx}" cy="${cy}" r="${markR}" fill="none" stroke="#284cac" stroke-width="${markR * 0.32}" />
      <circle cx="${cx}" cy="${cy}" r="${markR * 0.4}" fill="#13161b" />
      <text x="${textX}" y="${cy}" text-anchor="end" dominant-baseline="middle" font-size="${fontSize}" font-weight="600" fill="#13161b">Politblick</text>
    </g>`;
  let svgString = chart.svgString
    .replace(/(<svg[^>]*\sheight=")[^"]*(")/, `$1${newHeight}$2`)
    .replace(/(<svg[^>]*\sviewBox="0 0 [^\s]+ )[^"]*(")/, `$1${newHeight}$2`);
  svgString = svgString.replace(/(<svg[^>]*>)/, `$1<rect x="0" y="0" width="${chart.width}" height="${chart.height}" fill="white"/>`);
  svgString = svgString.replace(/<\/svg>\s*$/, `${footer}</svg>`);
  return { svgString, width: chart.width, height: newHeight };
}

export function downloadSvg(filename: string, chart: ChartSvgExport) {
  const watermarked = withWatermark(chart);
  triggerDownload(filename, new Blob([watermarked.svgString], { type: 'image/svg+xml;charset=utf-8' }));
}

export function downloadPng(filename: string, chart: ChartSvgExport, scale = 2): Promise<void> {
  const watermarked = withWatermark(chart);
  return new Promise((resolve, reject) => {
    const blob = new Blob([watermarked.svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(watermarked.width * scale));
      canvas.height = Math.max(1, Math.round(watermarked.height * scale));
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
