/**
 * The full search results page (/suche?q=…). Laid out like the site's other list pages: heading
 * with an intro line, a tab bar to narrow by type (with counts), filter pills where a type has a
 * useful second dimension, and white cards in a grid. The header dropdown only previews the
 * first few hits of each group; this is where all of them live.
 */
import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { Lang, Translation } from '../data';
import { formatEuro } from '../lobby';
import { ShowMoreButton } from '../ShowMoreButton';
import { SubTabBar } from '../ui/primitives';
import { pillBtn } from '../ui/styles';
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

function PillGroup<K extends string>({ options, active, onChange }: { options: { key: K; label: string }[]; active: K; onChange: (k: K) => void }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid oklch(90% 0.006 260)', borderRadius: 16, overflow: 'hidden', fontSize: 12, fontWeight: 600 }}>
      {options.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)} style={pillBtn(active === o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Grid = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>{children}</div>
);

export function SearchResultsPage({
  query,
  onQueryChange,
  results,
  loadingOrgs,
  links,
  t,
  lang,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: SearchResults;
  loadingOrgs: boolean;
  links: SearchResultsLinks;
  t: Translation;
  lang: Lang;
}) {
  const [type, setType] = useState<TypeKey>('all');
  const [orgScope, setOrgScope] = useState<OrgScope>('all');
  const [orgSort, setOrgSort] = useState<OrgSort>('relevance');
  const [billScope, setBillScope] = useState<BillScope>('all');
  const [mpParty, setMpParty] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

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
  const briefingCard = (w: SearchResults['briefings'][number]) => (
    <a key={`briefing-${w.week}`} href={links.storyHref(w.week)} onClick={links.onStory(w.week)} style={cardStyle}>
      <div style={titleStyle}>{t.resultsBriefingTemplate.replace('{week}', String(w.isoWeek))}</div>
      <div style={metaStyle}>
        {day(w.start)} – {day(w.end)}
      </div>
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

  const sectionHeader = (k: Exclude<TypeKey, 'all'>) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, margin: '0 0 12px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
        {labels[k]} <span style={{ fontWeight: 600, color: 'oklch(60% 0.01 260)' }}>{fmtInt(counts[k])}</span>
      </h2>
      {counts[k] > PREVIEW_IN_ALL && (
        <button onClick={() => setType(k)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: ACCENT, fontFamily: 'inherit' }}>
          {t.resultsShowAllTemplate.replace('{n}', fmtInt(counts[k]))} →
        </button>
      )}
    </div>
  );

  // The filters a type offers, as data: rendered as pill groups on wide screens and as a menu
  // behind a filter icon on phones, where several pill rows would push the results off screen.
  const filterGroups: SingleFilterGroup[] = (() => {
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
  })();

  return (
    <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: 32, boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>{tooShort ? t.resultsTitle : t.resultsHeadingTemplate.replace('{query}', q)}</h1>
      <p style={{ fontSize: 14, color: 'oklch(45% 0.01 260)', margin: '0 0 18px', maxWidth: 640 }}>
        {tooShort
          ? t.resultsPrompt
          : `${results.total === 1 ? t.resultsCountOne : t.resultsCountTemplate.replace('{n}', fmtInt(results.total))}${loadingOrgs ? ` · ${t.searchLoadingOrgs}` : ''}`}
      </p>
      <input
        type="search"
        value={query}
        autoFocus={tooShort}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t.searchPlaceholder}
        aria-label={t.resultsTitle}
        style={{ width: '100%', maxWidth: 480, padding: '9px 12px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 9, fontSize: 13.5, marginBottom: 22, boxSizing: 'border-box', fontFamily: 'inherit' }}
      />

      {!tooShort && results.total === 0 && !loadingOrgs && <p style={{ fontSize: 13.5, color: MUTED }}>{t.resultsNoneTemplate.replace('{query}', q)}</p>}

      {!tooShort && results.total > 0 && (
        <>
          {/* Wide screens: the tab bar. Phones: the same choice as a category button next to the
              filter button — the pattern of the MP list's [Partei] [Sortierung] — pinned under
              the header. */}
          <div className="pb-results-tabs">
            <SubTabBar tabs={tabs} active={activeType} onChange={setType} />
          </div>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
              {order
                .filter((k) => counts[k] > 0)
                .map((k) => (
                  <section key={k}>
                    {sectionHeader(k)}
                    <Grid>{render[k]().slice(0, PREVIEW_IN_ALL)}</Grid>
                  </section>
                ))}
            </div>
          ) : (
            <>
              {filterGroups.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="pb-results-filter-pills" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {filterGroups.map((g) => (
                      <PillGroup key={g.label} options={g.options} active={g.active} onChange={g.onChange} />
                    ))}
                  </div>
                </div>
              )}
              {(() => {
                const cards = render[activeType]();
                if (cards.length === 0) return <p style={{ fontSize: 13.5, color: MUTED }}>{t.searchNoResults}</p>;
                return (
                  <>
                    <Grid>{cards.slice(0, shown)}</Grid>
                    <ShowMoreButton
                      total={cards.length}
                      defaultCount={shown}
                      expanded={false}
                      onToggle={() => setShown((n) => n + PAGE * 3)}
                      showMoreTemplate={t.resultsShowMoreTemplate.replace('{rest}', fmtInt(cards.length - shown))}
                      showLessLabel={t.showLess}
                    />
                  </>
                );
              })()}
            </>
          )}
        </>
      )}
    </main>
  );
}
