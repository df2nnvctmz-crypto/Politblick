import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { cloneSvgForExport, downloadCsv, downloadPng, downloadSvg, type ChartCsvExport, type ChartSvgExport } from './chartExport';

export interface ChartExportLabels {
  buttonLabel: string;
  csv: string;
  svg: string;
  png: string;
}

const menuItemStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '9px 14px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 12.5,
  color: 'oklch(30% 0.01 260)',
};

/**
 * Floating download button for a chart — CSV of the underlying data, or a static SVG/PNG image
 * of exactly what's on screen right now (selection/highlight state included). Give it `svgRef`
 * when the chart already renders a real <svg> (the export just clones the live node); give it
 * `getSvg` instead for charts built out of HTML/CSS (the two bar charts) or an HTML table (the
 * tie matrix), where a matching SVG has to be hand-built at export time.
 */
export function ChartExportMenu({
  filenameBase,
  getCsv,
  svgRef,
  getSvg,
  labels,
}: {
  filenameBase: string;
  getCsv: () => ChartCsvExport;
  svgRef?: RefObject<SVGSVGElement | null>;
  getSvg?: () => ChartSvgExport;
  labels: ChartExportLabels;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const resolveSvg = (): ChartSvgExport | null => {
    if (svgRef?.current) return cloneSvgForExport(svgRef.current);
    if (getSvg) return getSvg();
    return null;
  };

  return (
    <div ref={containerRef} style={{ position: 'absolute', top: 10, right: 10, zIndex: 5 }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={labels.buttonLabel}
        aria-label={labels.buttonLabel}
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          border: '1px solid oklch(88% 0.006 260)',
          background: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px oklch(0% 0 0 / 0.12)',
          padding: 0,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="oklch(40% 0.01 260)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M4 19h16" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            background: 'white',
            border: '1px solid oklch(88% 0.006 260)',
            borderRadius: 10,
            boxShadow: '0 4px 16px oklch(0% 0 0 / 0.15)',
            minWidth: 200,
            overflow: 'hidden',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              downloadCsv(`${filenameBase}.csv`, getCsv());
              setOpen(false);
            }}
            style={menuItemStyle}
          >
            {labels.csv}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const s = resolveSvg();
              if (s) downloadSvg(`${filenameBase}.svg`, s);
              setOpen(false);
            }}
            style={menuItemStyle}
          >
            {labels.svg}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const s = resolveSvg();
              if (s) downloadPng(`${filenameBase}.png`, s);
              setOpen(false);
            }}
            style={menuItemStyle}
          >
            {labels.png}
          </button>
        </div>
      )}
    </div>
  );
}
