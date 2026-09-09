/** The postcode/constituency finder and the global type-ahead. */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { RealMp } from '../bundestag';
import { fuzzyIncludes } from '../helpers';
import type { OrgListEntry } from '../lobby';
import type { RealPoll } from '../polls';
import type { ArchivedPollIndexEntry } from '../snapshot';
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

/**
 * Header search: a mixed typeahead across the three entity types that have their own detail
 * pages — MPs, bills/votes, and organizations. Picking a result navigates straight there.
 * Enter (or the "see all MPs" link) falls back to the existing MP browse/filter page, which is
 * the one entity type with a dedicated full-list view with its own filters.
 */
/** One search hit in the bills group. `term` is set only for archived votes. */
interface BillHit {
  id: number;
  title: string;
  date: string;
  topic: string;
  topics: string[];
  term: string | null;
}

export function GlobalSearchBox({
  query,
  onQueryChange,
  onSubmit,
  members,
  polls,
  archivedPolls,
  orgs,
  parties,
  onSelectMp,
  onSelectBill,
  onSelectOrg,
  onSelectParty,
  searchHref,
  mpHref,
  billHref,
  orgHref,
  partyHref,
  placeholder,
  groupMpsLabel,
  groupBillsLabel,
  groupOrgsLabel,
  groupPartiesLabel,
  noResultsTemplate,
  seeAllMpsTemplate,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onSubmit: () => void;
  members: RealMp[];
  polls: RealPoll[];
  /** Archived roll calls (closed terms) — searched alongside the current ones, labelled by term. */
  archivedPolls: ArchivedPollIndexEntry[];
  orgs: OrgListEntry[];
  parties: { name: string; color: string; seats: number }[];
  onSelectMp: (id: number) => void;
  onSelectBill: (id: number) => void;
  onSelectOrg: (id: string) => void;
  onSelectParty: (name: string) => void;
  searchHref: string;
  mpHref: (id: string) => string;
  billHref: (id: number) => string;
  orgHref: (id: string) => string;
  partyHref: (name: string) => string;
  placeholder: string;
  groupMpsLabel: string;
  groupBillsLabel: string;
  groupOrgsLabel: string;
  groupPartiesLabel: string;
  noResultsTemplate: string;
  seeAllMpsTemplate: string;
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
  const showDropdown = open && q.length >= 2;
  const mpMatchesAll = showDropdown ? members.filter((m) => fuzzyIncludes(m.name, q) || fuzzyIncludes(m.constituency, q)) : [];
  // Searches every topic the poll carries, not just the displayed primary one — otherwise a
  // search for "Verkehr" finds nothing, because that label only ever appears as a poll's
  // second topic and so never reaches `topic`.
  // Current and archived votes are searched as one list. A bill that has a page on this site
  // should be findable by name whichever term it belongs to — before this, typing the exact
  // title of a 2006 vote returned nothing while its page sat there. Sorted newest first, so
  // the current term still leads for a broad query without archived votes being unreachable.
  const billHits: BillHit[] = showDropdown
    ? [
        ...polls.map((p) => ({ id: p.id, title: p.title, date: p.date, topic: p.topic, topics: p.topics, term: null as string | null })),
        ...archivedPolls.map((p) => ({ id: p.id, title: p.title, date: p.date, topic: p.topic, topics: p.topics, term: p.term })),
      ]
        .filter((p) => fuzzyIncludes(p.title, q) || p.topics.some((topic) => fuzzyIncludes(topic, q)))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 4)
    : [];
  const orgMatches = showDropdown ? orgs.filter((e) => fuzzyIncludes(e.org.name, q)).slice(0, 4) : [];
  const partyMatches = showDropdown ? parties.filter((p) => fuzzyIncludes(p.name, q)).slice(0, 4) : [];
  const mpMatches = mpMatchesAll.slice(0, 4);
  const hasResults = mpMatches.length + billHits.length + orgMatches.length + partyMatches.length > 0;

  const submit = () => {
    onSubmit();
    setOpen(false);
  };
  const selectMp = (id: number) => {
    onSelectMp(id);
    onQueryChange('');
    setOpen(false);
  };
  const selectBill = (id: number) => {
    onSelectBill(id);
    onQueryChange('');
    setOpen(false);
  };
  const selectOrg = (id: string) => {
    onSelectOrg(id);
    onQueryChange('');
    setOpen(false);
  };
  const selectParty = (name: string) => {
    onSelectParty(name);
    onQueryChange('');
    setOpen(false);
  };

  const groupHeaderStyle: CSSProperties = {
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'oklch(55% 0.01 260)',
    padding: '10px 16px 4px',
  };
  const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', cursor: 'pointer' };
  const titleStyle: CSSProperties = { fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const subStyle: CSSProperties = { fontSize: 12, color: 'oklch(48% 0.01 260)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
      <input
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder={placeholder}
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
            maxHeight: 420,
            overflowY: 'auto',
          }}
        >
          {!hasResults ? (
            <div style={{ padding: '14px 16px', fontSize: 13, color: 'oklch(45% 0.01 260)' }}>
              {noResultsTemplate.replace('{query}', query.trim())}
            </div>
          ) : (
            <>
              {mpMatches.length > 0 && (
                <>
                  <div style={groupHeaderStyle}>{groupMpsLabel}</div>
                  {mpMatches.map((m) => (
                    <a key={m.id} href={mpHref(String(m.id))} onClick={stop(() => selectMp(m.id))} style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={titleStyle}>{m.name}</div>
                        <div style={subStyle}>
                          {m.party} · {m.constituency}
                        </div>
                      </div>
                    </a>
                  ))}
                </>
              )}
              {billHits.length > 0 && (
                <>
                  <div style={groupHeaderStyle}>{groupBillsLabel}</div>
                  {billHits.map((p) => (
                    <a key={p.id} href={billHref(p.id)} onClick={stop(() => selectBill(p.id))} style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={titleStyle}>{p.title}</div>
                        <div style={subStyle}>
                          {p.topic} · {p.date}
                          {/* Only archived hits carry a term, and it is what stops a 2006 vote reading as a current one. */}
                          {p.term ? ` · ${p.term}` : ''}
                        </div>
                      </div>
                    </a>
                  ))}
                </>
              )}
              {orgMatches.length > 0 && (
                <>
                  <div style={groupHeaderStyle}>{groupOrgsLabel}</div>
                  {orgMatches.map((e) => (
                    <a key={e.org.id} href={orgHref(e.org.id)} onClick={stop(() => selectOrg(e.org.id))} style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={titleStyle}>{e.org.name}</div>
                        {e.org.city && <div style={subStyle}>{e.org.city}</div>}
                      </div>
                    </a>
                  ))}
                </>
              )}
              {partyMatches.length > 0 && (
                <>
                  <div style={groupHeaderStyle}>{groupPartiesLabel}</div>
                  {partyMatches.map((p) => (
                    <a key={p.name} href={partyHref(p.name)} onClick={stop(() => selectParty(p.name))} style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={titleStyle}>{p.name}</div>
                      </div>
                    </a>
                  ))}
                </>
              )}
              {mpMatchesAll.length > 0 && (
                <a
                  href={searchHref}
                  onClick={stop(submit)}
                  style={{
                    display: 'block',
                    padding: '10px 16px',
                    fontSize: 12.5,
                    fontWeight: 700,
                    borderTop: '1px solid oklch(93% 0.006 260)',
                  }}
                >
                  {seeAllMpsTemplate.replace('{query}', query.trim())} →
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
