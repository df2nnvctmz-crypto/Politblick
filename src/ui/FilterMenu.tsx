/**
 * Phone-sized filter/sort control: an icon button (with a badge counting non-default choices)
 * that opens a small menu of grouped options. Used where a desktop page shows pill groups or a
 * sidebar, which on a phone would push the actual list below the fold — the MP list and the
 * search results page.
 *
 * A group is either single-choice (radio, check mark on the active option; its FIRST option is
 * the default) or multi-choice (checkboxes, e.g. parties; "all selected" is the default).
 */
import { useEffect, useRef, useState } from 'react';

const ACCENT = 'oklch(45% 0.16 265)';
const MIN_WIDTH = 240;

export interface SingleFilterGroup {
  label: string;
  options: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}
export interface MultiFilterGroup {
  label: string;
  options: { key: string; label: string; color?: string }[];
  multi: true;
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** Re-select everything. */
  onAll: () => void;
  allLabel: string;
}
export type FilterGroupSpec = SingleFilterGroup | MultiFilterGroup;

const isMulti = (g: FilterGroupSpec): g is MultiFilterGroup => 'multi' in g;
const isChanged = (g: FilterGroupSpec) => (isMulti(g) ? g.selected.size < g.options.length : g.active !== g.options[0]?.key);

/** Google Material Icons (Apache 2.0, credited in the footer): filter_list, sort, category, expand_more. */
const ICON_PATHS = {
  filter: 'M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z',
  sort: 'M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z',
  category:
    'M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z',
  expand: 'M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z',
} as const;

function Icon({ kind, size = 18 }: { kind: keyof typeof ICON_PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={ICON_PATHS[kind]} />
    </svg>
  );
}

export function FilterMenu({
  groups,
  buttonLabel,
  icon = 'filter',
  align = 'left',
  neutral = false,
}: {
  groups: FilterGroupSpec[];
  buttonLabel: string;
  icon?: 'filter' | 'sort' | 'category';
  align?: 'left' | 'right';
  /** A picker, not a filter (e.g. the result category): never highlighted as "filter active". The label carries the current choice instead. */
  neutral?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);
  // The menu hangs off its button, so a button near the right edge (the filter button next to
  // the category button) pushed it past the screen: the page grew sideways and lost its centring,
  // and phones keep that width even after the menu moves back. So the side it opens to and its
  // width cap are fixed from the button's position before it renders, never corrected after.
  const [placement, setPlacement] = useState<{ side: 'left' | 'right'; maxWidth: number } | null>(null);
  const toggle = () => {
    if (open || !ref.current) {
      setOpen(false);
      return;
    }
    const EDGE = 12;
    const r = ref.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const roomLeftAligned = vw - EDGE - r.left;
    const roomRightAligned = r.right - EDGE;
    const preferred = align === 'left' ? roomLeftAligned : roomRightAligned;
    const side = preferred >= MIN_WIDTH ? align : roomLeftAligned >= roomRightAligned ? 'left' : 'right';
    setPlacement({ side, maxWidth: side === 'left' ? roomLeftAligned : roomRightAligned });
    setOpen(true);
  };
  const changed = neutral ? 0 : groups.filter(isChanged).length;

  const itemStyle = (on: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '9px 14px',
    border: 'none',
    background: on ? 'oklch(96% 0.02 265)' : 'white',
    fontSize: 13.5,
    fontWeight: on ? 700 : 400,
    color: 'oklch(25% 0.01 260)',
    textAlign: 'left' as const,
    cursor: 'pointer',
    fontFamily: 'inherit',
  });

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '7px 13px',
          borderRadius: 16,
          border: `1px solid ${changed ? ACCENT : 'oklch(85% 0.006 260)'}`,
          background: changed ? ACCENT : 'white',
          color: changed ? 'white' : 'oklch(30% 0.01 260)',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        <Icon kind={icon} />
        {buttonLabel}
        {neutral && (
          <span style={{ display: 'inline-flex', marginLeft: -3, opacity: 0.75, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
            <Icon kind="expand" size={18} />
          </span>
        )}
        {changed > 0 && icon === 'filter' && (
          <span style={{ fontSize: 11, fontWeight: 700, background: 'white', color: ACCENT, borderRadius: 9, padding: '0 6px' }}>{changed}</span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            [placement?.side ?? align]: 0,
            marginTop: 6,
            minWidth: Math.min(MIN_WIDTH, placement?.maxWidth ?? MIN_WIDTH),
            maxWidth: placement?.maxWidth,
            maxHeight: '60vh',
            overflowY: 'auto',
            background: 'white',
            border: '1px solid oklch(88% 0.006 260)',
            borderRadius: 12,
            boxShadow: '0 8px 24px oklch(0% 0 0 / 0.12)',
            zIndex: 30,
            padding: '6px 0',
          }}
        >
          {groups.map((g, gi) => (
            <div key={g.label} style={{ borderTop: gi ? '1px solid oklch(93% 0.006 260)' : 'none', paddingTop: gi ? 4 : 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'oklch(55% 0.01 260)', padding: '8px 14px 4px' }}>{g.label}</div>
              {isMulti(g) ? (
                <>
                  <button role="menuitemcheckbox" aria-checked={!isChanged(g)} onClick={g.onAll} style={itemStyle(!isChanged(g))}>
                    <input type="checkbox" readOnly checked={!isChanged(g)} tabIndex={-1} style={{ accentColor: ACCENT, margin: 0 }} />
                    {g.allLabel}
                  </button>
                  {g.options.map((o) => {
                    const on = g.selected.has(o.key);
                    return (
                      // Multi-choice keeps the menu open, so several parties can be toggled in one go.
                      <button key={o.key} role="menuitemcheckbox" aria-checked={on} onClick={() => g.onToggle(o.key)} style={itemStyle(false)}>
                        <input type="checkbox" readOnly checked={on} tabIndex={-1} style={{ accentColor: ACCENT, margin: 0 }} />
                        {o.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.color, flexShrink: 0 }} />}
                        {o.label}
                      </button>
                    );
                  })}
                </>
              ) : (
                g.options.map((o) => (
                  <button
                    key={o.key}
                    role="menuitemradio"
                    aria-checked={g.active === o.key}
                    onClick={() => {
                      g.onChange(o.key);
                      setOpen(false);
                    }}
                    style={{ ...itemStyle(g.active === o.key), justifyContent: 'space-between' }}
                  >
                    {o.label}
                    {g.active === o.key && <span style={{ color: ACCENT, fontWeight: 700 }}>✓</span>}
                  </button>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
