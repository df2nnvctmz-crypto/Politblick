/**
 * The full search results page (/suche?q=…). Laid out like the MP list: a sticky sidebar with the
 * search field, the result types to narrow by (with counts) and filters where a type has a useful
 * second dimension, next to a heading and white cards in a grid. The header dropdown only previews the
 * first few hits of each group; this is where all of them live.
 */
import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { Lang, Translation } from '../data';
import { formatEuro } from '../lobby';
import { ShowMoreButton } from '../ShowMoreButton';
import { MiniBand } from '../stories/Briefing';
import { FilterMenu, type SingleFilterGroup } from '../ui/FilterMenu';
import { MIN_QUERY_LENGTH, type SearchBill, type SearchOrg, type SearchResults } from './searchModel';

const MUTED = 'oklch(48% 0.01 260)';
const ACCENT = 'oklch(45% 0.16 265)';

type Click = (e: MouseEvent) => void;

export interface SearchResultsLinks {
  mpHref: (id: number) => string;
  onMp: (id: number) => Click;
  billHref: (id: number) => string;
  onBill: (id: number) => Click;
  orgHref: (id: string) => string;
  onOrg: (id: string) => Click;
  partyHref: (name: string) => string;
  onParty: (name: string) => Click;
  committeeHref: (id: string) => string;
  onCommittee: (id: string) => Click;
  storyHref: (week: string) => string;
  onStory: (week: string) => Click;
}

type TypeKey = 'all' | 'mps' | 'bills' | 'orgs' | 'parties' | 'committees' | 'briefings';
type OrgScope = 'all' | 'linked';
type OrgSort = 'relevance' | 'spend';
type BillScope = 'all' | 'current' | 'archive';

/** How many cards a type shows inside "All", and per page within its own tab. */
const PREVIEW_IN_ALL = 6;
const PAGE = 30;

const cardStyle: CSSProperties = {
  display: 'block',
  textDecoration: 'none',
  color: 'inherit',
  background: 'white',
  border: '1px solid oklch(90% 0.006 260)',
  borderRadius: 12,
  padding: '14px 16px',
  minWidth: 0,
};
const titleStyle: CSSProperties = { fontWeight: 700, fontSize: 15, lineHeight: 1.35, overflowWrap: 'anywhere' };
const metaStyle: CSSProperties = { fontSize: 12, color: 'oklch(50% 0.01 260)', marginTop: 5, lineHeight: 1.45 };
const chip = (text: string, bg = 'oklch(95% 0.008 260)', color = 'oklch(40% 0.01 260)') => (
  <span key={text} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: bg, color, whiteSpace: 'nowrap' }}>
    {text}
  </span>
);
const dot = (color: string) => <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />;

const sidebarHeading: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'oklch(45% 0.01 260)', marginBottom: 10 };

const CARD_MIN = 260;
const GRID_GAP = 12;
const Grid = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${CARD_MIN}px), 1fr))`, gap: GRID_GAP }}>{children}</div>
);

/** Same breakpoint as the sidebar/phone-bar switch in index.css. */
const NARROW_QUERY = '(max-width: 720px)';
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

/** An element's width, kept current as it resizes (0 until it mounts). */
function useWidth(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}

export function SearchResultsPage({
  query,
  results,
  loadingOrgs,
  links,
  t,
  lang,
}: {
  query: string;
  results: SearchResults;
  loadingOrgs: boolean;
  links: SearchResultsLinks;
  t: Translation;
  lang: Lang;
}) {
  const [type, setTypeState] = useState<TypeKey>('all');
  // The category and filter controls stay on screen while the results scroll (sticky sidebar,
  // pinned phone bar), so a change can come from deep down the list: start the new list at its top.
  const toTop = () => {
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  };
  const setType = (k: TypeKey) => {
    setTypeState(k);
    toTop();
  };
  const [orgScope, setOrgScope] = useState<OrgScope>('all');
  const [orgSort, setOrgSort] = useState<OrgSort>('relevance');
  const [billScope, setBillScope] = useState<BillScope>('all');
  const [mpParty, setMpParty] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const narrow = useNarrow();
  const [allRef, allWidth] = useWidth();

  const q = query.trim();
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  const fmtInt = (n: number) => n.toLocaleString(locale);
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const tooShort = q.length < MIN_QUERY_LENGTH;

  // A new query or a different type starts from the first page again.
  useEffect(() => setShown(PAGE), [q, type, orgScope, orgSort, billScope, mpParty]);
  // A party filter that the new result set no longer contains would silently hide everything.
  useEffect(() => {
    if (mpParty && !results.mps.some((m) => m.party === mpParty)) setMpParty(null);
  }, [results.mps, mpParty]);

  const mps = useMemo(() => (mpParty ? results.mps.filter((m) => m.party === mpParty) : results.mps), [results.mps, mpParty]);
  const bills = useMemo(
    () => results.bills.filter((b: SearchBill) => (billScope === 'all' ? true : billScope === 'current' ? b.term === null : b.term !== null)),
    [results.bills, billScope],
  );
  const orgs = useMemo(() => {
    const scoped = orgScope === 'linked' ? results.orgs.filter((o: SearchOrg) => o.linked) : results.orgs;
    return orgSort === 'spend' ? [...scoped].sort((a, b) => (b.spendFrom ?? -1) - (a.spendFrom ?? -1)) : scoped;
  }, [results.orgs, orgScope, orgSort]);
  const mpPartyOptions = useMemo(() => [...new Set(results.mps.map((m) => m.party))].sort((a, b) => a.localeCompare(b, 'de')), [results.mps]);

  const counts: Record<Exclude<TypeKey, 'all'>, number> = {
    mps: results.mps.length,
    bills: results.bills.length,
    orgs: results.orgs.length,
    parties: results.parties.length,
    committees: results.committees.length,
    briefings: results.briefings.length,
  };
  const labels: Record<Exclude<TypeKey, 'all'>, string> = {
    mps: t.searchGroupMps,
    bills: t.searchGroupBills,
    orgs: t.searchGroupOrgs,
    parties: t.searchGroupParties,
    committees: t.searchGroupCommittees,
    briefings: t.searchGroupBriefings,
  };
  // Best-matching type first (e.g. the party for "afd"), see searchAll's groupOrder.
  const order: Exclude<TypeKey, 'all'>[] = results.groupOrder;
  const tabs = [
    { key: 'all' as TypeKey, label: `${t.resultsAll} (${fmtInt(results.total)})` },
    ...order.filter((k) => counts[k] > 0).map((k) => ({ key: k as TypeKey, label: `${labels[k]} (${fmtInt(counts[k])})` })),
  ];
  // The active tab may have emptied out after the query changed.
  const activeType: TypeKey = type !== 'all' && counts[type] === 0 ? 'all' : type;

  // ── cards ──────────────────────────────────────────────────────────────────
  const mpCard = (m: SearchResults['mps'][number]) => (
    <a key={`mp-${m.id}`} href={links.mpHref(m.id)} onClick={links.onMp(m.id)} style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {dot(m.color)}
        <span style={titleStyle}>{m.name}</span>
      </div>
      <div style={metaStyle}>
        {m.party} · {m.constituency}
      </div>
    </a>
  );
  const billCard = (b: SearchBill) => (
    <a key={`bill-${b.id}`} href={links.billHref(b.id)} onClick={links.onBill(b.id)} style={cardStyle}>
      <div style={titleStyle}>{b.title}</div>
      <div style={metaStyle}>
        {b.topic ? `${b.topic} · ` : ''}
        {day(b.date)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
        {b.accepted !== undefined &&
          (b.accepted
            ? chip(t.pollAccepted, 'oklch(95% 0.04 155)', 'oklch(38% 0.11 155)')
            : chip(t.pollRejected, 'oklch(95% 0.04 40)', 'oklch(45% 0.14 40)'))}
        {b.term && chip(t.resultsArchivedTemplate.replace('{term}', b.term))}
      </div>
    </a>
  );
  const orgCard = (o: SearchOrg) => (
    <a key={`org-${o.id}`} href={links.orgHref(o.id)} onClick={links.onOrg(o.id)} style={cardStyle}>
      <div style={titleStyle}>{o.name}</div>
      {o.city && <div style={metaStyle}>{o.city}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
        {o.spendFrom !== null && o.spendTo !== null && o.spendTo > 0 && chip(t.resultsOrgSpendTemplate.replace('{amount}', `${formatEuro(o.spendFrom)} – ${formatEuro(o.spendTo)}`))}
        {o.linked && chip(t.resultsOrgLinkedShort, 'oklch(95% 0.03 265)', 'oklch(38% 0.09 265)')}
      </div>
    </a>
  );
  const partyCard = (p: SearchResults['parties'][number]) => (
    <a key={`party-${p.name}`} href={links.partyHref(p.name)} onClick={links.onParty(p.name)} style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {dot(p.color)}
        <span style={titleStyle}>{p.name}</span>
      </div>
    </a>
  );
  const committeeCard = (c: SearchResults['committees'][number]) => (
    <a key={`committee-${c.id}`} href={links.committeeHref(c.id)} onClick={links.onCommittee(c.id)} style={cardStyle}>
      <div style={titleStyle}>{c.name}</div>
      <div style={metaStyle}>{t.resultsCommitteeMembersTemplate.replace('{n}', String(c.memberCount))}</div>
    </a>
  );
  const briefingCounts = (w: SearchResults['briefings'][number]) =>
    `${fmtInt(w.pollCount)} ${w.pollCount === 1 ? t.swTileVotesOne : t.swTileVotes} · ${fmtInt(w.divergingTotal)} ${t.swTileDivergence}`;
  // Wide screens: a small version of the landing-page tile — one band per vote, the week's key
  // counts and its closest vote, so weeks can be told apart without opening each one. Phones: one
  // compact row per week instead, like the older weeks on the home page, since stacked one per
  // row the full cards took a screen each.
  const briefingCard = (w: SearchResults['briefings'][number]) =>
    narrow ? (
      <a
        key={`briefing-${w.week}`}
        href={links.storyHref(w.week)}
        onClick={links.onStory(w.week)}
        style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12 }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...titleStyle, display: 'block' }}>{t.resultsBriefingTemplate.replace('{week}', String(w.isoWeek))}</span>
          <span style={{ ...metaStyle, display: 'block' }}>
            {day(w.start)} – {day(w.end)}
          </span>
          <span style={{ ...metaStyle, display: 'block', marginTop: 2 }}>{briefingCounts(w)}</span>
        </span>
        <span aria-hidden style={{ fontSize: 16, fontWeight: 700, color: ACCENT }}>
          →
        </span>
      </a>
    ) : (
      <a key={`briefing-${w.week}`} href={links.storyHref(w.week)} onClick={links.onStory(w.week)} style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
        <div style={titleStyle}>{t.resultsBriefingTemplate.replace('{week}', String(w.isoWeek))}</div>
        <div style={metaStyle}>
          {day(w.start)} – {day(w.end)}
        </div>
        {w.pollTotals.length > 0 && (
          <div style={{ display: 'grid', gap: 3, marginTop: 12 }}>
            {w.pollTotals.map((tot, i) => (
              <MiniBand key={i} totals={tot} />
            ))}
          </div>
        )}
        <div style={{ ...metaStyle, marginTop: 10, color: 'oklch(38% 0.01 260)' }}>
          {briefingCounts(w)}
          {w.donationCount > 0 && (
            <>
              {' · '}
              {fmtInt(w.donationCount)} {w.donationCount === 1 ? t.swTileDonationsOne : t.swTileDonations}{' '}
              <span style={{ whiteSpace: 'nowrap' }}>({formatEuro(w.donationSumEuro)})</span>
            </>
          )}
        </div>
        {w.closestTitle && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid oklch(93% 0.006 260)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>{t.swTileClosest}</div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                lineHeight: 1.4,
                marginTop: 3,
                overflowWrap: 'anywhere',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {w.closestTitle}
            </div>
          </div>
        )}
      </a>
    );

  const render: Record<Exclude<TypeKey, 'all'>, () => ReactNode[]> = {
    mps: () => mps.map(mpCard),
    bills: () => bills.map(billCard),
    orgs: () => orgs.map(orgCard),
    parties: () => results.parties.map(partyCard),
    committees: () => results.committees.map(committeeCard),
    briefings: () => results.briefings.map(briefingCard),
  };

  // How many cards a type previews inside "All". Briefing cards are tall (a band per vote), so on
  // wide screens they get exactly one row: as many as the grid fits side by side at this width.
  const briefingColumns = Math.max(1, Math.floor((allWidth + GRID_GAP) / (CARD_MIN + GRID_GAP)));
  const previewCount = (k: Exclude<TypeKey, 'all'>) => (k === 'briefings' && !narrow ? briefingColumns : PREVIEW_IN_ALL);

  const sectionHeader = (k: Exclude<TypeKey, 'all'>) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, margin: '0 0 12px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
        {labels[k]} <span style={{ fontWeight: 600, color: 'oklch(60% 0.01 260)' }}>{fmtInt(counts[k])}</span>
      </h2>
      {counts[k] > previewCount(k) && (
        <button onClick={() => setType(k)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: ACCENT, fontFamily: 'inherit' }}>
          {t.resultsShowAllTemplate.replace('{n}', fmtInt(counts[k]))} →
        </button>
      )}
    </div>
  );

  // The filters a type offers, as data: rendered in the sidebar on wide screens and as a menu
  // behind a filter icon on phones, where several pill rows would push the results off screen.
  const filterGroups: SingleFilterGroup[] = ((): SingleFilterGroup[] => {
    if (activeType === 'orgs')
      return [
        {
          label: t.resultsFilterScope,
          options: [
            { key: 'all', label: t.resultsOrgScopeAll },
            { key: 'linked', label: t.resultsOrgScopeLinked },
          ],
          active: orgScope,
          onChange: (k) => setOrgScope(k as OrgScope),
        },
        {
          label: t.resultsFilterSort,
          options: [
            { key: 'relevance', label: t.resultsSortRelevance },
            { key: 'spend', label: t.resultsSortSpend },
          ],
          active: orgSort,
          onChange: (k) => setOrgSort(k as OrgSort),
        },
      ];
    if (activeType === 'bills')
      return [
        {
          label: t.resultsFilterTerm,
          options: [
            { key: 'all', label: t.resultsBillsAll },
            { key: 'current', label: t.resultsBillsCurrent },
            { key: 'archive', label: t.resultsBillsArchive },
          ],
          active: billScope,
          onChange: (k) => setBillScope(k as BillScope),
        },
      ];
    if (activeType === 'mps' && mpPartyOptions.length > 1)
      return [
        {
          label: t.resultsFilterParty,
          options: [{ key: '', label: t.resultsAllParties }, ...mpPartyOptions.map((p) => ({ key: p, label: p }))],
          active: mpParty ?? '',
          onChange: (k) => setMpParty(k || null),
        },
      ];
    return [];
  })().map((g) => ({
    ...g,
    onChange: (k) => {
      g.onChange(k);
      toTop();
    },
  }));

  const categories = [
    { key: 'all' as TypeKey, label: t.resultsAll, count: results.total },
    ...order.filter((k) => counts[k] > 0).map((k) => ({ key: k as TypeKey, label: labels[k], count: counts[k] })),
  ];

  // The query itself is typed into the header search field, which on this page edits it live
  // (GlobalSearchBox `live`). Wide screens, like the MP list: a sticky sidebar on the left with the
  // categories and the active category's filters, so they stay at hand while the results scroll.
  // Phones hide the sidebar (index.css) and use the pinned [Kategorie] [Filter] bar instead.
  return (
    <main style={{ flex: 1, maxWidth: 1200, margin: '0 auto', width: '100%', padding: 32, boxSizing: 'border-box', display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {!tooShort && results.total > 0 && (
        <aside className="pb-search-sidebar" style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <>
            <div>
              <div style={sidebarHeading}>{t.resultsCategory}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {categories.map((c) => {
                  const on = c.key === activeType;
                  return (
                    <button
                      key={c.key}
                      onClick={() => setType(c.key)}
                      aria-pressed={on}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '7px 10px',
                        border: 'none',
                        borderRadius: 8,
                        background: on ? 'oklch(45% 0.16 265 / 0.09)' : 'transparent',
                        color: on ? ACCENT : 'oklch(25% 0.01 260)',
                        fontSize: 13.5,
                        fontWeight: on ? 700 : 500,
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span>{c.label}</span>
                      <span style={{ color: on ? ACCENT : 'oklch(55% 0.01 260)', fontWeight: 600 }}>{fmtInt(c.count)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {activeType !== 'all' &&
              filterGroups.map((g) =>
                // Sorting is a dropdown and narrowing a list of options, as on the MP list (Partei / Sortierung).
                g.label === t.resultsFilterSort || g.options.length > 4 ? (
                  <div key={g.label}>
                    <div style={sidebarHeading}>{g.label}</div>
                    <select
                      value={g.active}
                      onChange={(e) => g.onChange(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid oklch(90% 0.006 260)', fontSize: 13.5, background: 'white', fontFamily: 'inherit' }}
                    >
                      {g.options.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div key={g.label}>
                    <div style={sidebarHeading}>{g.label}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {g.options.map((o) => (
                        <label key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
                          <input type="radio" name={`search-filter-${g.label}`} checked={g.active === o.key} onChange={() => g.onChange(o.key)} style={{ accentColor: ACCENT, margin: 0 }} />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ),
              )}
          </>
        </aside>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>{tooShort ? t.resultsTitle : t.resultsHeadingTemplate.replace('{query}', q)}</h1>
        <p style={{ fontSize: 14, color: 'oklch(45% 0.01 260)', margin: '0 0 18px', maxWidth: 640 }}>
          {tooShort
            ? t.resultsPrompt
            : `${results.total === 1 ? t.resultsCountOne : t.resultsCountTemplate.replace('{n}', fmtInt(results.total))}${loadingOrgs ? ` · ${t.searchLoadingOrgs}` : ''}`}
        </p>
        {!tooShort && results.total === 0 && !loadingOrgs && <p style={{ fontSize: 13.5, color: MUTED }}>{t.resultsNoneTemplate.replace('{query}', q)}</p>}

        {!tooShort && results.total > 0 && (
          <>
            {/* Phones: the sidebar's choices as a category button next to a filter button — the
                pattern of the MP list's [Partei] [Sortierung] — pinned under the header. */}
            <div className="pb-mobile-sticky pb-results-mobile-bar">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 0' }}>
                <FilterMenu
                  neutral
                  icon="category"
                  buttonLabel={tabs.find((tab) => tab.key === activeType)?.label ?? t.resultsAll}
                  groups={[{ label: t.resultsCategory, options: tabs, active: activeType, onChange: (k) => setType(k as TypeKey) }]}
                />
                {activeType !== 'all' && filterGroups.length > 0 && <FilterMenu groups={filterGroups} buttonLabel={t.resultsFilterButton} />}
              </div>
            </div>

            {activeType === 'all' ? (
              <div ref={allRef} style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
                {order
                  .filter((k) => counts[k] > 0)
                  .map((k) => (
                    <section key={k}>
                      {sectionHeader(k)}
                      <Grid>{render[k]().slice(0, previewCount(k))}</Grid>
                    </section>
                  ))}
              </div>
            ) : (
              <>
                {(() => {
                  const cards = render[activeType]();
                  if (cards.length === 0) return <p style={{ fontSize: 13.5, color: MUTED }}>{t.searchNoResults}</p>;
                  return (
                    <>
                      <Grid>{cards.slice(0, shown)}</Grid>
                      {/* Steps of one page (30 cards), so the grid's rows stay full. */}
                      <ShowMoreButton shown={shown} total={cards.length} initial={PAGE} step={PAGE} onChange={setShown} t={t} lang={lang} />
                    </>
                  );
                })()}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
