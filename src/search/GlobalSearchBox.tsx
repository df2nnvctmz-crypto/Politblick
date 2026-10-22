/**
 * Header search: a mixed typeahead over every kind of page (see search/searchModel.ts). It only
 * previews the best few hits per group; Enter or "show all results" opens the /suche page with
 * every match. The ranking is computed by the caller so dropdown and results page always agree.
 *
 * On the /suche page itself (`live`) it is that page's search field: it holds the current query,
 * every keystroke updates the results below, and there is no dropdown — the page is the preview.
 */
import { Fragment, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { Translation } from '../data';
import { stop } from '../ui/events';
import { MIN_QUERY_LENGTH, type SearchGroup, type SearchResults } from './searchModel';
import type { SearchResultsLinks } from './SearchResultsPage';

const PREVIEW = 4;

export function GlobalSearchBox({
  query,
  onQueryChange,
  results,
  loadingOrgs,
  links,
  resultsHref,
  onShowAll,
  live = false,
  t,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: SearchResults;
  /** The full lobby register is still loading — organisation hits may be incomplete. */
  loadingOrgs: boolean;
  links: SearchResultsLinks;
  resultsHref: (q: string) => string;
  onShowAll: (q: string) => void;
  /** On the results page: edits that page's query directly instead of previewing in a dropdown. */
  live?: boolean;
  t: Translation;
}) {
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
  // An empty /suche page asks for a query, so arriving there puts the cursor in this field. (The
  // header stays mounted across pages, so autoFocus would only ever fire on the first load.)
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (live && q.length < MIN_QUERY_LENGTH) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  const showDropdown = !live && open && q.length >= MIN_QUERY_LENGTH;

  const showAll = () => {
    if (q.length < MIN_QUERY_LENGTH) return;
    onShowAll(q);
    onQueryChange('');
    setOpen(false);
  };
  /** Runs the link's own handler; if it took over the click (plain left-click), close and reset. */
  const pick = (handler: (e: MouseEvent) => void) => (e: MouseEvent) => {
    handler(e);
    if (e.defaultPrevented) {
      onQueryChange('');
      setOpen(false);
    }
  };

  const groupHeaderStyle: CSSProperties = {
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'oklch(55% 0.01 260)',
    padding: '10px 16px 4px',
  };
  const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', cursor: 'pointer', textDecoration: 'none', color: 'inherit' };
  const titleStyle: CSSProperties = { fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const subStyle: CSSProperties = { fontSize: 12, color: 'oklch(48% 0.01 260)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const dot = (color: string) => <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />;

  const group = (label: string, rows: ReactNode[]) =>
    rows.length > 0 && (
      <>
        <div style={groupHeaderStyle}>{label}</div>
        {rows}
      </>
    );

  // Rendered in the search's best-match order (results.groupOrder), like the results page.
  const sections: Record<SearchGroup, ReactNode> = {
    mps: group(
            t.searchGroupMps,
            results.mps.slice(0, PREVIEW).map((m) => (
              <a key={m.id} href={links.mpHref(m.id)} onClick={pick(links.onMp(m.id))} style={rowStyle}>
                {dot(m.color)}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={titleStyle}>{m.name}</div>
                  <div style={subStyle}>
                    {m.party} · {m.constituency}
                  </div>
                </div>
              </a>
            )),
          ),
    bills: group(
            t.searchGroupBills,
            results.bills.slice(0, PREVIEW).map((b) => (
              <a key={b.id} href={links.billHref(b.id)} onClick={pick(links.onBill(b.id))} style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={titleStyle}>{b.title}</div>
                  <div style={subStyle}>
                    {b.topic} · {b.date}
                    {/* Only archived hits carry a term, and it is what stops a 2006 vote reading as a current one. */}
                    {b.term ? ` · ${b.term}` : ''}
                  </div>
                </div>
              </a>
            )),
          ),
    orgs: group(
            t.searchGroupOrgs,
            results.orgs.slice(0, PREVIEW).map((o) => (
              <a key={o.id} href={links.orgHref(o.id)} onClick={pick(links.onOrg(o.id))} style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={titleStyle}>{o.name}</div>
                  {o.city && <div style={subStyle}>{o.city}</div>}
                </div>
              </a>
            )),
          ),
    parties: group(
            t.searchGroupParties,
            results.parties.slice(0, PREVIEW).map((p) => (
              <a key={p.name} href={links.partyHref(p.name)} onClick={pick(links.onParty(p.name))} style={rowStyle}>
                {dot(p.color)}
                <div style={titleStyle}>{p.name}</div>
              </a>
            )),
          ),
    committees: group(
            t.searchGroupCommittees,
            results.committees.slice(0, PREVIEW).map((c) => (
              <a key={c.id} href={links.committeeHref(c.id)} onClick={pick(links.onCommittee(c.id))} style={rowStyle}>
                <div style={titleStyle}>{c.name}</div>
              </a>
            )),
          ),
    briefings: group(
            t.searchGroupBriefings,
            results.briefings.slice(0, 2).map((w) => (
              <a key={w.week} href={links.storyHref(w.week)} onClick={pick(links.onStory(w.week))} style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={titleStyle}>{t.resultsBriefingTemplate.replace('{week}', String(w.isoWeek))}</div>
                  <div style={subStyle}>
                    {w.start} – {w.end}
                  </div>
                </div>
              </a>
            )),
          ),
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          // Live, the results are already on screen; Enter just closes a phone's keyboard.
          if (e.key === 'Enter') {
            if (live) e.currentTarget.blur();
            else showAll();
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        ref={inputRef}
        placeholder={t.searchPlaceholder}
        aria-label={t.resultsTitle}
        style={{
          width: '100%',
          padding: '9px 14px 9px 34px',
          borderRadius: 8,
          border: '1px solid oklch(90% 0.006 260)',
          background: 'oklch(97% 0.006 260)',
          fontSize: 13.5,
          outline: 'none',
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: 13,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 13,
          color: 'oklch(60% 0.006 260)',
        }}
      >
        ⌕
      </span>
      {showDropdown && (
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
            maxHeight: 460,
            overflowY: 'auto',
          }}
        >
          {results.total === 0 && !loadingOrgs && (
            <div style={{ padding: '14px 16px', fontSize: 13, color: 'oklch(45% 0.01 260)' }}>{t.findMpNoResultsTemplate.replace('{query}', q)}</div>
          )}
          {results.groupOrder.map((g) => (
            <Fragment key={g}>{sections[g]}</Fragment>
          ))}
          {loadingOrgs && <div style={{ padding: '6px 16px 8px', fontSize: 11.5, color: 'oklch(55% 0.01 260)' }}>{t.searchLoadingOrgs}</div>}
          {results.total > 0 && (
            <a
              href={resultsHref(q)}
              onClick={stop(showAll)}
              style={{
                display: 'block',
                padding: '10px 16px',
                fontSize: 12.5,
                fontWeight: 700,
                borderTop: '1px solid oklch(93% 0.006 260)',
              }}
            >
              {t.searchSeeAllResultsTemplate.replace('{query}', q)} →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
