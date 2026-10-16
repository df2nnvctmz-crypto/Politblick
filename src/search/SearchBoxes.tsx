/** The postcode/constituency finder. (The header search lives in GlobalSearchBox.tsx.) */

import { useEffect, useRef, useState } from 'react';
import type { RealMp } from '../bundestag';
import { fuzzyIncludes } from '../helpers';
import { stop } from '../ui/events';

/**
 * Homepage entry point for "does this affect me": search by city/constituency (or an MP's
 * name) instead of browsing 630 anonymous rows. A place can match more than one MP — the
 * directly-elected member plus regional list-seat members from other parties — so this always
 * shows every match rather than assuming a 1:1 place-to-MP relationship.
 */
export function FindMyMpBox({
  members,
  onSelect,
  mpHref,
  searchHref,
  placeholder,
  noResultsTemplate,
  browseAllLabel,
  onBrowseAll,
}: {
  members: RealMp[];
  onSelect: (id: string) => void;
  mpHref: (id: string) => string;
  searchHref: string;
  placeholder: string;
  noResultsTemplate: string;
  browseAllLabel: string;
  onBrowseAll: () => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const q = query.trim();
  const matches =
    q.length < 2 ? [] : members.filter((m) => fuzzyIncludes(m.constituency, q) || fuzzyIncludes(m.name, q)).slice(0, 8);

  const select = (id: number) => {
    onSelect(String(id));
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', maxWidth: 460, margin: '0 auto' }}>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '14px 18px',
          borderRadius: 12,
          border: '1px solid oklch(85% 0.006 260)',
          fontSize: 15,
          boxShadow: '0 2px 10px oklch(20% 0.02 260 / 0.06)',
        }}
      />
      {open && q.length >= 2 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
            background: 'white',
            border: '1px solid oklch(88% 0.006 260)',
            borderRadius: 12,
            boxShadow: '0 8px 24px oklch(0% 0 0 / 0.12)',
            zIndex: 40,
            overflow: 'hidden',
            textAlign: 'left',
          }}
        >
          {matches.length === 0 ? (
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 13, color: 'oklch(45% 0.01 260)', marginBottom: 8 }}>
                {noResultsTemplate.replace('{query}', query.trim())}
              </div>
              <a
                href={searchHref}
                onClick={stop(onBrowseAll)}
                style={{ fontSize: 12.5, fontWeight: 700 }}
              >
                {browseAllLabel} →
              </a>
            </div>
          ) : (
            matches.map((m) => (
              <a
                key={m.id}
                href={mpHref(String(m.id))}
                onClick={stop(() => select(m.id))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.party} · {m.constituency}
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}

