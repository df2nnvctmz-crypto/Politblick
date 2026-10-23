import type { CSSProperties } from 'react';
import type { Lang, Translation } from './data';

/**
 * The one "show more" control for every list on the site.
 *
 * A list tracks how many rows it shows (a number, starting at `initial`). While more than one
 * step remains, the control is a single pill split in two — "10 weitere" | "Alle 68" — so the
 * reader picks between a small step and everything. When at most one step is left, both halves
 * would do the same thing, so it collapses to one button. Once everything is shown it becomes
 * "Weniger", back to `initial`. The labels leave out "anzeigen": under a list it is implied, and
 * the short form fits a phone at its natural width. Screen readers, which get no visual
 * context, hear the full sentence through aria-label.
 *
 * "All" is offered on every list, the full Lobbyregister included: measured in a production build
 * in 2026-10, rendering all ~6,100 register rows took ~0.5 s on a desktop including layout — a
 * noticeable pause on a phone, but only after the reader explicitly asked for everything.
 *
 * maxWidth 100% on the frame is the last guard: a very long count still cannot push the control
 * past the screen edge.
 */
export function ShowMoreButton({
  shown,
  total,
  initial,
  onChange,
  t,
  lang,
  step = 10,
}: {
  shown: number;
  total: number;
  initial: number;
  onChange: (next: number) => void;
  t: Translation;
  lang: Lang;
  step?: number;
}) {
  if (total <= initial) return null;
  const fmt = (n: number) => n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');
  const rest = total - shown;

  if (rest <= 0) {
    return (
      <div style={wrap}>
        <button onClick={() => onChange(initial)} style={{ ...pill, ...single, color: 'oklch(45% 0.01 260)' }}>
          {t.listLess}
        </button>
      </div>
    );
  }

  const next = Math.min(step, rest);
  const offerAll = rest > step;
  if (!offerAll) {
    return (
      <div style={wrap}>
        <button onClick={() => onChange(shown + next)} aria-label={t.listMoreAria.replace('{n}', fmt(next))} style={{ ...pill, ...single }}>
          {t.listMoreTemplate.replace('{n}', fmt(next))}
        </button>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div role="group" style={splitFrame}>
        <button onClick={() => onChange(shown + next)} aria-label={t.listMoreAria.replace('{n}', fmt(next))} style={pill}>
          {t.listMoreTemplate.replace('{n}', fmt(next))}
        </button>
        <button onClick={() => onChange(total)} aria-label={t.listAllAria.replace('{n}', fmt(total))} style={{ ...pill, borderLeft: '1px solid oklch(85% 0.006 260)' }}>
          {t.listAllTemplate.replace('{n}', fmt(total))}
        </button>
      </div>
    </div>
  );
}

const wrap: CSSProperties = { display: 'flex', justifyContent: 'center', marginTop: 14, maxWidth: '100%' };

const splitFrame: CSSProperties = {
  display: 'inline-flex',
  maxWidth: '100%',
  border: '1px solid oklch(85% 0.006 260)',
  borderRadius: 20,
  overflow: 'hidden',
  background: 'white',
};

const pill: CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  background: 'white',
  fontSize: 12.5,
  fontWeight: 700,
  color: 'oklch(45% 0.16 265)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
};

const single: CSSProperties = { border: '1px solid oklch(85% 0.006 260)', borderRadius: 20 };
