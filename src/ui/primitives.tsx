/** Presentational building blocks with no knowledge of any particular dataset. */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { MultiSortState, SortState } from '../sorting';

/** Photo is pre-resolved at fetch time (see fetch-core.mjs) and just a static URL now — falls back to colored initials if there's no Wikidata portrait, or if the Commons URL fails to load. */
export function MpAvatar({ photoUrl, name, color, initials, size }: { photoUrl: string | null; name: string; color: string; initials: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'oklch(90% 0.006 260)' }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.32,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

/**
 * Wide data tables scroll horizontally on narrow screens. A bare overflow-x:auto container
 * gives no hint that there's more off to the side, so the right-hand columns just look
 * missing on mobile. This adds a small "swipe" caption (mobile only, via .pb-scroll-hint's
 * media query) plus edge shadows that fade in/out based on actual scroll position.
 */
export function ScrollBox({ children, style, hintText }: { children: ReactNode; style: CSSProperties; hintText: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = () => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
    // Bail out when nothing changed so this never becomes an infinite render loop —
    // the ResizeObserver below fires on layout changes that don't move the edges too.
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  };

  useEffect(() => {
    updateEdges();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <div className="pb-scroll-hint" style={{ alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'oklch(50% 0.14 265)', marginBottom: 6 }}>
        <span aria-hidden>↔</span>
        {hintText}
      </div>
      <div ref={ref} onScroll={updateEdges} className="pb-scroll" style={{ overflowX: 'auto', ...style }}>
        {children}
      </div>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 22,
          pointerEvents: 'none',
          borderRadius: '14px 0 0 14px',
          background: 'linear-gradient(to right, oklch(20% 0.02 260 / 0.14), transparent)',
          opacity: edges.left ? 1 : 0,
          transition: 'opacity 150ms',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: 22,
          pointerEvents: 'none',
          borderRadius: '0 14px 14px 0',
          background: 'linear-gradient(to left, oklch(20% 0.02 260 / 0.14), transparent)',
          opacity: edges.right ? 1 : 0,
          transition: 'opacity 150ms',
        }}
      />
    </div>
  );
}

/**
 * A small ℹ️ affordance next to jargon (Verflechtung, Auffälligkeit, …) that repeats the term's
 * definition inline — the full explanation already exists in the disclaimer page, but almost
 * nobody reads a footer link before they've decided whether to trust a number on the page.
 */
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <span ref={containerRef} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', marginLeft: 5 }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Info"
        style={{
          width: 15,
          height: 15,
          borderRadius: '50%',
          border: '1px solid oklch(70% 0.01 260)',
          background: open ? 'oklch(45% 0.16 265)' : 'white',
          color: open ? 'white' : 'oklch(50% 0.01 260)',
          fontSize: 10,
          fontWeight: 700,
          fontStyle: 'italic',
          lineHeight: '13px',
          padding: 0,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        i
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            width: 260,
            background: 'white',
            border: '1px solid oklch(88% 0.006 260)',
            borderRadius: 10,
            boxShadow: '0 4px 16px oklch(0% 0 0 / 0.1)',
            padding: '10px 12px',
            fontSize: 12.5,
            fontWeight: 400,
            lineHeight: 1.5,
            color: 'oklch(30% 0.01 260)',
            zIndex: 40,
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}

/**
 * Tab bar used both for the party page's top-level tabs and for the second-level tabs inside a
 * single Lobby & Finanzen sub-page (Parteien, Organisationen, Verflechtungen, Spenden) — splits
 * content into focused views instead of one long vertical stack. On narrow screens the row can
 * overflow (e.g. "Direkte Verflechtungen" + "Thematische Nähe" don't fit a phone width), so it
 * tracks scroll position the same way ScrollBox does for wide tables and shows a small trailing
 * chevron over the right edge whenever there's more to scroll to, so a later tab never just goes
 * silently missing off-screen. The chevron is mobile-only (see .pb-subtab-arrow in index.css) —
 * desktop either fits every tab or has an always-visible native scrollbar, so the hint would just
 * be noise there.
 */
export function SubTabBar<K extends string>({ tabs, active, onChange }: { tabs: { key: K; label: string }[]; active: K; onChange: (key: K) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateOverflow = () => {
    const el = ref.current;
    if (!el) return;
    const next = el.scrollWidth > el.clientWidth + el.scrollLeft + 2;
    setCanScrollRight((prev) => (prev === next ? prev : next));
  };

  useEffect(() => {
    updateOverflow();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateOverflow);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  return (
    <div style={{ position: 'relative', marginBottom: 24 }}>
      <div
        ref={ref}
        onScroll={updateOverflow}
        className="pb-scroll"
        style={{
          display: 'flex',
          gap: 8,
          borderBottom: '1px solid oklch(90% 0.006 260)',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              padding: '10px 4px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 13.5,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              borderBottom: `2px solid ${active === tab.key ? 'oklch(45% 0.16 265)' : 'transparent'}`,
              color: active === tab.key ? 'oklch(20% 0.01 260)' : 'oklch(50% 0.01 260)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {canScrollRight && (
        <span
          aria-hidden
          className="pb-subtab-arrow"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 8,
            right: -4,
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'white',
              border: '1px solid oklch(85% 0.006 260)',
              boxShadow: '0 1px 4px oklch(0% 0 0 / 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="oklch(45% 0.16 265)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </span>
      )}
    </div>
  );
}

/** Click-to-sort table header, file-explorer style: first click ascending, click again to reverse. */
export function SortableTh({ label, sortKey, sort, onSort }: { label: string; sortKey: string; sort: SortState; onSort: (key: string) => void }) {
  const active = sort?.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '10px 14px',
        fontWeight: 700,
        fontSize: 11.5,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        color: active ? 'oklch(35% 0.14 265)' : 'oklch(45% 0.01 260)',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.3 }}>{active && sort!.dir === 'desc' ? '▼' : '▲'}</span>
    </th>
  );
}

/** Same as SortableTh, but shows a priority number (1, 2, …) alongside the arrow when more than
 * one column is active, so it's visible which key is primary vs. a tiebreaker. */
export function MultiSortableTh({ label, sortKey, sort, onSort }: { label: string; sortKey: string; sort: MultiSortState; onSort: (key: string) => void }) {
  const index = sort.findIndex((s) => s.key === sortKey);
  const active = index !== -1;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '10px 14px',
        fontWeight: 700,
        fontSize: 11.5,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        color: active ? 'oklch(35% 0.14 265)' : 'oklch(45% 0.01 260)',
        cursor: 'pointer',
        userSelect: 'none',
        // Unlike SortableTh's short single-word labels, this one also carries the longer
        // donor-total headers ("Spender insgesamt bei CDU/CSU") — letting those wrap onto a
        // second line keeps the column (and so the whole table) from being stretched wide by
        // one long label while every other column stays narrow.
        whiteSpace: 'normal',
        maxWidth: 140,
      }}
    >
      {label}
      <span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.3 }}>
        {active && sort[index].dir === 'desc' ? '▼' : '▲'}
        {sort.length > 1 && active ? index + 1 : ''}
      </span>
    </th>
  );
}

/** Checkbox-list dropdown filter: click to open, click any checkbox to toggle, click outside to close. */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onToggle,
  onClear,
  allLabel,
  selectedCountTemplate,
  clearLabel,
  searchable,
  searchPlaceholder,
}: {
  label: string;
  options: { value: string; label: string; count: number }[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
  allLabel: string;
  selectedCountTemplate: string;
  clearLabel: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  if (options.length === 0) return null;
  const visibleOptions =
    searchable && query.trim() ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options;
  const buttonText = selected.size === 0 ? allLabel : selectedCountTemplate.replace('{n}', String(selected.size));

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          borderRadius: 20,
          border: `1px solid ${selected.size > 0 ? 'oklch(45% 0.16 265)' : 'oklch(85% 0.006 260)'}`,
          background: selected.size > 0 ? 'oklch(45% 0.16 265 / 0.08)' : 'white',
          color: selected.size > 0 ? 'oklch(40% 0.16 265)' : 'oklch(30% 0.01 260)',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {label}: <span style={{ fontWeight: 700 }}>{buttonText}</span>
        <span style={{ fontSize: 9, opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 6,
              zIndex: 41,
              background: 'white',
              border: '1px solid oklch(88% 0.006 260)',
              borderRadius: 10,
              boxShadow: '0 4px 16px oklch(0% 0 0 / 0.1)',
              width: 260,
              maxHeight: 320,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {searchable && (
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                autoFocus
                style={{
                  margin: 8,
                  padding: '7px 10px',
                  border: '1px solid oklch(88% 0.006 260)',
                  borderRadius: 7,
                  fontSize: 12.5,
                  boxSizing: 'border-box',
                }}
              />
            )}
            <div style={{ overflowY: 'auto', padding: '4px 4px 4px' }}>
              {visibleOptions.length === 0 ? (
                <div style={{ padding: '8px 10px', fontSize: 12, color: 'oklch(55% 0.01 260)' }}>—</div>
              ) : (
                visibleOptions.map((opt) => (
                  <label
                    key={opt.value}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer' }}
                  >
                    <input type="checkbox" checked={selected.has(opt.value)} onChange={() => onToggle(opt.value)} />
                    <span style={{ flex: 1 }}>{opt.label}</span>
                    <span style={{ color: 'oklch(55% 0.01 260)', fontSize: 11 }}>{opt.count}</span>
                  </label>
                ))
              )}
            </div>
            {selected.size > 0 && (
              <button
                onClick={onClear}
                style={{
                  border: 'none',
                  borderTop: '1px solid oklch(93% 0.006 260)',
                  background: 'none',
                  padding: '9px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'oklch(45% 0.16 265)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {clearLabel}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
