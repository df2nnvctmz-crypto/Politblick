/**
 * The Datenstory pages: the index (/datenstories/) and one story (/datenstories/<slug>/).
 *
 * Layout of a story (StoryShell): series bar, headline finding, a short lede, then one numbered
 * section per sub-finding — chart first, two or three sentences, a "what the data shows / doesn't
 * show" box, frozen quotes with their date, and the sources folded underneath. Method, dataset
 * download, partner credit and the link to the next part at the end.
 *
 * Each story module (src/datenstories/<slug>/story.ts) supplies the text; this file supplies the
 * chart and source list per section.
 */
import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { FilterMenu } from '../ui/FilterMenu';
import { ShareBar } from '../ShareBar';
import type { Lang, Translation } from '../data';
import { fetchLocalJson } from '../snapshot';
import { ShowMoreButton } from '../ShowMoreButton';
import { LevyUnitChart, RevolvingDoorTimeline, TREEMAP_SOURCES_ID, UsTreemap, VoteRows, amountLabel, euroRangeLabel, SEAT_C, SUB_C, useNarrow } from './charts';
import { InternalLink, ext, shortEvidence } from './links';
import { StoryPreview } from './previews';
import { BitpandaChart, OverlapChart, PartyBars, SpendDonationsChart } from './geld-charts';
import type { DatenstoryData, DatenstoryListing, FrozenQuote, LevyCamp, LobbyGeldData, ParteispendenData, StoryPartner, SugarLevy, UsGesetzeData, UsLobbyData } from './types';
import * as usLobby from './us-lobby/story';
import * as usGesetze from './us-gesetze/story';
import * as lobbyGeld from './lobby-geld/story';
import * as parteispenden from './parteispenden/story';

export const DATENSTORIES: DatenstoryListing[] = [usLobby.listing, usGesetze.listing, lobbyGeld.listing, parteispenden.listing];

const HAIR = '1px solid oklch(92% 0.006 260)';
const MUTED = 'oklch(48% 0.01 260)';
const ACCENT = 'oklch(45% 0.16 265)';

const cache = new Map<string, DatenstoryData>();
export function useDatenstory(slug: string | null) {
  const [state, setState] = useState<{ data: DatenstoryData | null; error: boolean }>(() => ({ data: slug ? cache.get(slug) ?? null : null, error: false }));
  useEffect(() => {
    if (!slug || !DATENSTORIES.some((s) => s.slug === slug)) {
      setState({ data: null, error: Boolean(slug) });
      return;
    }
    if (cache.has(slug)) {
      setState({ data: cache.get(slug)!, error: false });
      return;
    }
    let live = true;
    setState({ data: null, error: false });
    fetchLocalJson<DatenstoryData>(`/data/datenstories/${slug}.json`)
      .then((d) => {
        cache.set(slug, d);
        if (live) setState({ data: d, error: false });
      })
      .catch(() => live && setState({ data: null, error: true }));
    return () => {
      live = false;
    };
  }, [slug]);
  // Never hand out the previous story's data while the next one loads.
  return state.data && state.data.slug !== slug ? { data: null, error: false } : state;
}

export const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? `{${k}}`);

function fillNodes(template: string, values: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const m = part.match(/^\{(\w+)\}$/);
    return <Fragment key={i}>{m && m[1] in values ? values[m[1]] : part}</Fragment>;
  });
}

const dateDe = (iso: string | null, lang: Lang) =>
  iso ? new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)) : '';

const withBaseAsset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

interface PageProps {
  t: Translation;
  lang: Lang;
  /** Opens an internal path SPA-style (the href stays real for new-tab clicks and crawlers). */
  onNavigate: (path: string) => void;
}

interface StoryNav {
  storyHref: (slug: string) => string;
  onOpenStory: (slug: string) => void;
}

function storyLink(nav: StoryNav, slug: string, children: ReactNode, style?: CSSProperties) {
  return (
    <a
      href={nav.storyHref(slug)}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        nav.onOpenStory(slug);
      }}
      style={style}
    >
      {children}
    </a>
  );
}

/**
 * "Politblick × Res.Publica" byline. The partner link is a normal, followed link on purpose: the
 * research is shared and the credit should count as a real backlink.
 */
function PartnerByline({ p, t }: { p: StoryPartner; t: Translation }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: MUTED }}>
      <span>{t.dsPartnerWith}</span>
      <a href={p.url} target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center' }} title={p.name}>
        <img src={withBaseAsset(p.logo)} alt={p.name} width={110} height={24} style={{ height: 24, width: 'auto', display: 'block' }} />
      </a>
    </div>
  );
}

function PartnerCredit({ p, t }: { p: StoryPartner; t: Translation }) {
  return (
    <aside style={{ marginTop: 36, padding: '18px 20px', border: HAIR, borderRadius: 10, background: 'oklch(98.5% 0.008 30)', maxWidth: 720, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <a href={p.url} target="_blank" rel="noopener" style={{ flexShrink: 0 }}>
        <img src={withBaseAsset(p.logo)} alt={p.name} width={147} height={32} style={{ height: 32, width: 'auto', display: 'block' }} />
      </a>
      <div style={{ fontSize: 14, lineHeight: 1.55, flex: '1 1 260px' }}>
        {p.credit}{' '}
        {fillNodes(t.dsPartnerMoreTemplate, {
          name: p.name,
          link: (
            <a href={p.url} target="_blank" rel="noopener" style={{ fontWeight: 600 }}>
              {p.url.replace(/^https?:\/\//, '')}
            </a>
          ),
        })}
      </div>
    </aside>
  );
}

const seriesParts = (listing: DatenstoryListing) =>
  listing.series ? DATENSTORIES.filter((s) => s.series?.name === listing.series!.name).sort((a, b) => a.series!.part - b.series!.part) : [];

/** "US-Lobby in Berlin · Teil 1: Das Geld und die Drehtür · Teil 2: Die Gesetze" — current part bold, others linked. */
function SeriesBar({ listing, nav }: { listing: DatenstoryListing; nav: StoryNav }) {
  const parts = seriesParts(listing);
  if (parts.length < 2) return null;
  return (
    <nav aria-label={listing.series!.name} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 13, padding: '8px 12px', background: 'oklch(97% 0.008 265)', borderRadius: 8, marginBottom: 18 }}>
      <span style={{ fontWeight: 700, color: ACCENT }}>{listing.series!.name}</span>
      {parts.map((p) =>
        p.slug === listing.slug ? (
          <span key={p.slug} aria-current="page" style={{ fontWeight: 700 }}>
            Teil {p.series!.part}: {p.series!.partLabel}
          </span>
        ) : (
          <Fragment key={p.slug}>{storyLink(nav, p.slug, `Teil ${p.series!.part}: ${p.series!.partLabel}`)}</Fragment>
        ),
      )}
    </nav>
  );
}

/** The stories before and after this one, in index order (like the Sitzungswochen-Briefing's week links). */
function neighbours(listing: DatenstoryListing) {
  const i = DATENSTORIES.findIndex((x) => x.slug === listing.slug);
  return { prev: DATENSTORIES[i - 1] ?? null, next: DATENSTORIES[i + 1] ?? null };
}

const partName = (x: DatenstoryListing, from?: DatenstoryListing) =>
  x.series ? `${from?.series?.name === x.series.name ? '' : `${x.series.name}, `}Teil ${x.series.part}: ${x.series.partLabel}` : x.kicker;

/** "← Vorherige Datenstory · Nächste Datenstory →" under the headline, like the weekly briefing. */
function PrevNextLinks({ listing, nav, t }: { listing: DatenstoryListing; nav: StoryNav; t: Translation }) {
  const { prev, next } = neighbours(listing);
  if (!prev && !next) return null;
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, fontWeight: 600, margin: '0 0 22px' }}>
      {prev && storyLink(nav, prev.slug, `← ${t.dsPrev}: ${partName(prev, listing)}`)}
      {next && storyLink(nav, next.slug, `${t.dsNext}: ${partName(next, listing)} →`)}
    </div>
  );
}

/** Previous and next story as cards at the end of a story. */
function PrevNextCards({ listing, nav, t }: { listing: DatenstoryListing; nav: StoryNav; t: Translation }) {
  const { prev, next } = neighbours(listing);
  if (!prev && !next) return null;
  const card = (x: DatenstoryListing, label: string, arrowBefore: boolean) =>
    storyLink(
      nav,
      x.slug,
      <>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT }}>
          {arrowBefore ? '← ' : ''}
          {label}
          {arrowBefore ? '' : ' →'}
        </div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{partName(x, listing)}</div>
        <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2, lineHeight: 1.3 }}>{x.title}</div>
      </>,
      { display: 'block', padding: '16px 18px', border: HAIR, borderRadius: 10, background: 'white', color: 'inherit', textDecoration: 'none', height: '100%', boxSizing: 'border-box' },
    );
  return (
    <nav aria-label={t.dsKicker} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 28, maxWidth: 820 }}>
      {prev ? <div>{card(prev, t.dsPrev, true)}</div> : <div />}
      {next ? <div>{card(next, t.dsNext, false)}</div> : <div />}
    </nav>
  );
}

// ---- Index ---------------------------------------------------------------------------------------

type DsSort = 'newest' | 'oldest' | 'az';

/**
 * Index of all Datenstories. Filtering by series and topic and sorting work like the MP list and
 * the search results: a sidebar on wide screens, the pinned menu-button bar on phones (the same
 * FilterMenu). Free-text search is the site search in the header, which finds Datenstories too.
 */
export function DatenstoryListPage({ t, lang, storyHref, onOpenStory }: PageProps & StoryNav) {
  const [series, setSeries] = useState('');
  const [topic, setTopic] = useState('');
  const [sort, setSort] = useState<DsSort>('newest');
  const seriesOptions = useMemo(() => [...new Set(DATENSTORIES.map((s) => s.series?.name).filter((x): x is string => Boolean(x)))], []);
  const topicOptions = useMemo(() => [...new Set(DATENSTORIES.flatMap((s) => s.topics))].sort((a, b) => a.localeCompare(b, 'de')), []);
  const shown = useMemo(() => {
    const rows = DATENSTORIES.map((s, i) => ({ s, i }))
      .filter((x) => !series || x.s.series?.name === series)
      .filter((x) => !topic || x.s.topics.includes(topic));
    const byDate = (a: (typeof rows)[number], b: (typeof rows)[number]) => b.s.publishedOn.localeCompare(a.s.publishedOn) || b.i - a.i;
    if (sort === 'az') rows.sort((a, b) => a.s.title.localeCompare(b.s.title, 'de'));
    else if (sort === 'oldest') rows.sort((a, b) => -byDate(a, b));
    else rows.sort(byDate);
    return rows.map((x) => x.s);
  }, [series, topic, sort]);

  const heading: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'oklch(45% 0.01 260)', marginBottom: 10 };
  const seriesList = [{ key: '', label: t.dsFilterAll }, ...seriesOptions.map((n) => ({ key: n, label: n }))];
  const topicList = [{ key: '', label: t.dsFilterAll }, ...topicOptions.map((n) => ({ key: n, label: n }))];
  const sortList = [
    { key: 'newest', label: t.dsSortNewest },
    { key: 'oldest', label: t.dsSortOldest },
    { key: 'az', label: t.dsSortAz },
  ];
  const seriesGroup = { label: t.dsFilterSeries, options: seriesList, active: series, onChange: setSeries };
  const topicGroup = { label: t.dsFilterTopic, options: topicList, active: topic, onChange: setTopic };
  const sortGroup = { label: t.dsFilterSort, options: sortList, active: sort, onChange: (k: string) => setSort(k as DsSort) };
  const radios = (g: { label: string; options: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) => (
    <div>
      <div style={heading}>{g.label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {g.options.map((o) => (
          <label key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="radio" name={`ds-${g.label}`} checked={g.active === o.key} onChange={() => g.onChange(o.key)} style={{ accentColor: ACCENT, margin: 0 }} />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
  // Same frame as the MP list and the search results: filters in a sidebar at the far left, and
  // title, count and cards in the column beside it (phones: the pinned menu-button bar instead).
  return (
    <main style={{ flex: 1, maxWidth: 1200, margin: '0 auto', width: '100%', padding: 32, boxSizing: 'border-box', display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <aside className="pb-search-sidebar" style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {radios(seriesGroup)}
        {radios(topicGroup)}
        <div>
          <div style={heading}>{sortGroup.label}</div>
          <select
            value={sort}
            onChange={(e) => sortGroup.onChange(e.target.value)}
            aria-label={sortGroup.label}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid oklch(90% 0.006 260)', fontSize: 13.5, background: 'white', fontFamily: 'inherit' }}
          >
            {sortList.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>{t.dsListTitle}</h1>
          <span style={{ fontSize: 13.5, color: MUTED }}>{fill(t.dsCountTemplate, { n: String(shown.length) })}</span>
        </div>
        <p style={{ color: 'oklch(45% 0.01 260)', fontSize: 14, lineHeight: 1.5, margin: '0 0 20px', maxWidth: 640 }}>{t.dsListIntro}</p>

        {/* Phones: the sidebar is hidden (index.css) and these menu buttons stay pinned under the header. */}
        <div className="pb-mobile-sticky pb-results-mobile-bar">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 0' }}>
            <FilterMenu buttonLabel={t.resultsFilterButton} groups={[seriesGroup, topicGroup]} />
            <FilterMenu icon="sort" buttonLabel={t.dsFilterSort} groups={[sortGroup]} />
          </div>
        </div>

        {shown.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'oklch(48% 0.01 260)' }}>{t.dsNoMatch}</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 20 }}>
            {shown.map((s) => (
              <StoryCard key={s.slug} s={s} t={t} lang={lang} nav={{ storyHref, onOpenStory }} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

/** One story card: the chart thumbnail on top, then kicker, headline and (full size) teaser, date and partner. */
function StoryCard({ s, t, lang, nav, compact = false }: { s: DatenstoryListing; t: Translation; lang: Lang; nav: StoryNav; compact?: boolean }) {
  return storyLink(
    nav,
    s.slug,
    <>
      <div style={{ aspectRatio: '480 / 230', background: 'oklch(97.5% 0.006 260)', borderBottom: HAIR, overflow: 'hidden', pointerEvents: 'none' }}>
        <StoryCardPreview slug={s.slug} />
      </div>
      <div style={{ padding: compact ? '12px 18px 16px' : '12px 20px 18px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT }}>
          {s.kicker}
          {s.series ? ` · Teil ${s.series.part}` : ''}
        </div>
        <div style={{ fontSize: compact ? 16 : 17, fontWeight: 800, margin: '5px 0 6px', lineHeight: 1.3 }}>{s.title}</div>
        {!compact && <div style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.5 }}>{s.teaser}</div>}
        <div style={{ marginTop: compact ? 8 : 12, fontSize: 12.5, color: MUTED, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>{fill(t.dsPublishedTemplate, { date: dateDe(s.publishedOn, lang) })}</span>
          {!compact && s.partner && (
            <>
              <span>·</span>
              <span>{t.dsPartnerWith}</span>
              <img src={withBaseAsset(s.partner.logo)} alt={s.partner.name} width={92} height={20} style={{ height: 20, width: 'auto' }} />
            </>
          )}
          <span>·</span>
          <span style={{ color: ACCENT, fontWeight: 600 }}>{t.dsRead} →</span>
        </div>
      </div>
    </>,
    { display: 'block', border: HAIR, borderRadius: 12, overflow: 'hidden', color: 'inherit', textDecoration: 'none', background: 'white', boxShadow: '0 1px 2px oklch(0% 0 0 / 0.04)' },
  );
}

/** How many stories the landing page shows; the full list is on the index page. */
const TEASER_MAX = 2;

/** Newest first: by publication date, and among equal dates the one added last (DATENSTORIES is in the order stories were added). */
const newestStories = () =>
  DATENSTORIES.map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.publishedOn.localeCompare(a.s.publishedOn) || b.i - a.i)
    .slice(0, TEASER_MAX)
    .map((x) => x.s);

/** Landing-page section after the Sitzungswochen-Briefing: same header and grid, one compact card per story. */
export function DatenstoryTeaser({ t, lang, storyHref, onOpenStory, listHref, onOpenList }: PageProps & StoryNav & { listHref: string; onOpenList: (e: React.MouseEvent) => void }) {
  return (
    <section style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 32px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>{t.dsListTitle}</h2>
        <a href={listHref} onClick={onOpenList} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(48% 0.12 250)', whiteSpace: 'nowrap' }}>
          {t.dsAll} →
        </a>
      </div>
      <p style={{ fontSize: 13.5, color: MUTED, margin: '0 0 18px', maxWidth: 680 }}>{t.dsTeaserSub}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
        {newestStories().map((s) => (
          <StoryCard key={s.slug} s={s} t={t} lang={lang} nav={{ storyHref, onOpenStory }} compact />
        ))}
      </div>
    </section>
  );
}

// ---- Story shell ---------------------------------------------------------------------------------

/** Accent of the highlighted half of a headline (same as the h1's). */
const WARM = 'oklch(58% 0.14 70)';

interface ShellSection {
  id: string;
  heading: string;
  headingAccent?: string;
  body: string[];
  shows: string;
  notShows: string;
  quotes?: FrozenQuote[];
  chart: ReactNode;
  sources: ReactNode;
}

interface ShellProps extends PageProps {
  nav: StoryNav;
  listing: DatenstoryListing;
  data: DatenstoryData;
  text: { kicker: string; title: string; titleAccent: string; lede: string[]; method: string[] };
  slots: Record<string, string>;
  nodeSlots: Record<string, ReactNode>;
  sections: ShellSection[];
  onDownload: () => void;
}

function StoryShell({ t, lang, nav, listing, data, text, slots: s, nodeSlots, sections, onDownload }: ShellProps) {
  return (
    <main data-datenstory-ready="" style={{ flex: 1, width: '100%', boxSizing: 'border-box', maxWidth: 1040, margin: '0 auto', padding: '28px 24px 64px' }}>
      <SeriesBar listing={listing} nav={nav} />
      <header style={{ maxWidth: 820 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT }}>
          {t.dsKicker} · {text.kicker}
          <span style={{ color: MUTED, fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}> · {fill(t.dsPublishedTemplate, { date: dateDe(listing.publishedOn, lang) })}</span>
        </div>
        <h1 style={{ fontSize: 'clamp(26px, 4.4vw, 40px)', lineHeight: 1.15, fontWeight: 800, margin: '10px 0 14px', textWrap: 'balance' }}>
          {fill(text.title, s)}: <span style={{ color: WARM }}>{fill(text.titleAccent, s)}</span>
        </h1>
        {text.lede.map((p, i) => (
          <p key={i} style={{ fontSize: 18, lineHeight: 1.55, margin: '0 0 12px' }}>
            {fillNodes(p, nodeSlots)}
          </p>
        ))}
        <p style={{ fontSize: 13, color: MUTED, margin: '14px 0 10px' }}>
          {data.curatedCheckedOn ? fill(t.dsLiveNoteTemplate, { date: dateDe(data.generatedAt, lang), asOf: dateDe(data.curatedCheckedOn, lang) }) : fill(t.dsLiveOnlyTemplate, { date: dateDe(data.generatedAt, lang) })}
          {lang === 'en' && <> · {t.dsGermanOnly}</>}
        </p>
        {listing.partner && <PartnerByline p={listing.partner} t={t} />}
      </header>
      <div style={{ marginTop: 18 }}>
        <ShareBar t={t} where="top" title={`${fill(text.title, s)}: ${fill(text.titleAccent, s)}`} url={`https://politblick.de/datenstories/${listing.slug}/`} image={`/og/datenstories-${listing.slug}.png`} />
      </div>
      <div style={{ marginTop: 20 }}>
        <PrevNextLinks listing={listing} nav={nav} t={t} />
      </div>

      {sections.map((sec, i) => (
        <section key={sec.id} id={sec.id} style={{ marginTop: 48, paddingTop: 28, borderTop: HAIR }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', maxWidth: 820 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
            <h2 style={{ fontSize: 'clamp(20px, 3vw, 26px)', lineHeight: 1.25, fontWeight: 800, margin: 0, textWrap: 'balance' }}>
              {fill(sec.heading, s)}
              {sec.headingAccent && <span style={{ color: WARM }}> {fill(sec.headingAccent, s)}</span>}
            </h2>
          </div>
          <div style={{ margin: '20px 0 18px' }}>{sec.chart}</div>
          <div style={{ maxWidth: 720 }}>
            {sec.body.map((p, j) => (
              <p key={j} style={{ fontSize: 16, lineHeight: 1.6, margin: '0 0 12px' }}>
                {fillNodes(p, nodeSlots)}
              </p>
            ))}
          </div>
          {sec.quotes && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, margin: '18px 0' }}>
              {sec.quotes.map((q) => (
                <blockquote key={q.who} style={{ margin: 0, padding: '14px 16px', borderLeft: `3px solid ${SUB_C}`, background: 'oklch(98% 0.01 80)', borderRadius: 4 }}>
                  <div style={{ fontSize: 13 }}>
                    <strong>{q.who}</strong> <span style={{ color: MUTED }}>· {q.role}</span>
                  </div>
                  <p style={{ fontSize: 16, lineHeight: 1.5, fontStyle: 'italic', margin: '6px 0' }}>„{q.text}“</p>
                  <div style={{ fontSize: 12, color: MUTED }}>
                    <a href={q.sourceUrl} {...ext}>
                      {t.dsRegisterEntry}
                    </a>
                    , {fill(t.dsAsOfTemplate, { date: dateDe(q.asOf, lang) })}
                  </div>
                </blockquote>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, maxWidth: 820, margin: '16px 0' }}>
            <ShowsBox title={t.dsShows} text={sec.shows} tone="pos" />
            <ShowsBox title={t.dsNotShows} text={sec.notShows} tone="neg" />
          </div>
          {sec.sources}
        </section>
      ))}

      <section style={{ marginTop: 48, paddingTop: 28, borderTop: HAIR, maxWidth: 720 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>{t.dsMethod}</h2>
        {text.method.map((p, i) => (
          <p key={i} style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 10px', color: 'oklch(30% 0.01 260)' }}>
            {fill(p, s)}
          </p>
        ))}
        <button
          type="button"
          onClick={onDownload}
          style={{ marginTop: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${ACCENT}`, background: 'white', color: ACCENT, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          {t.dsDownloadCsv}
        </button>
      </section>

      {listing.partner && <PartnerCredit p={listing.partner} t={t} />}
      {listing.discussion && (
        <p style={{ marginTop: 28, fontSize: 15 }}>
          <a href={listing.discussion.url} target="_blank" rel="noopener" style={{ color: ACCENT, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <img src={withBaseAsset('/images/reddit.svg')} alt="" width={22} height={22} style={{ display: 'block' }} />
            <span>{fill(t.dsDiscussion, { name: listing.discussion.name })} →</span>
          </a>
        </p>
      )}
      <div style={{ marginTop: 36 }}>
        <ShareBar t={t} where="end" title={`${fill(text.title, s)}: ${fill(text.titleAccent, s)}`} url={`https://politblick.de/datenstories/${listing.slug}/`} image={`/og/datenstories-${listing.slug}.png`} />
      </div>
      <PrevNextCards listing={listing} nav={nav} t={t} />
    </main>
  );
}

function ShowsBox({ title, text, tone }: { title: string; text: string; tone: 'pos' | 'neg' }) {
  return (
    <div style={{ border: HAIR, borderRadius: 8, padding: '12px 14px', background: tone === 'pos' ? 'oklch(98.5% 0.01 155)' : 'oklch(98.5% 0.008 40)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: tone === 'pos' ? 'oklch(42% 0.11 155)' : 'oklch(48% 0.13 40)' }}>{title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 4 }}>{text}</div>
    </div>
  );
}

// ---- The two stories -----------------------------------------------------------------------------

export function DatenstoryView({ data, ...props }: PageProps & StoryNav & { data: DatenstoryData }) {
  if (data.slug === 'us-lobby') return <UsLobbyStoryPage {...props} data={data} />;
  if (data.slug === 'lobby-geld') return <LobbyGeldStoryPage {...props} data={data} />;
  if (data.slug === 'parteispenden') return <ParteispendenStoryPage {...props} data={data} />;
  return <UsGesetzeStoryPage {...props} data={data} />;
}

function UsLobbyStoryPage({ t, lang, onNavigate, storyHref, onOpenStory, data }: PageProps & StoryNav & { data: UsLobbyData }) {
  const s = usLobby.slots(data);
  // The "Weitere n Akteure" tiles have no single org page; they open the source list instead.
  const [treemapSourcesOpen, setTreemapSourcesOpen] = useState(false);
  const showTreemapSources = () => {
    setTreemapSourcesOpen(true);
    requestAnimationFrame(() => document.getElementById(TREEMAP_SOURCES_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const today = (data.generatedAt ?? new Date().toISOString()).slice(0, 10);
  const sections: ShellSection[] = usLobby.story.sections.map((sec) => ({
    ...sec,
    chart:
      sec.chart === 'treemap' ? (
        <UsTreemap data={data} onNavigate={onNavigate} onShowRest={showTreemapSources} />
      ) : (
        <RevolvingDoorTimeline door={data.revolvingDoor} today={today} onNavigate={onNavigate} />
      ),
    sources:
      sec.chart === 'treemap' ? (
        <TreemapSources data={data} t={t} lang={lang} onNavigate={onNavigate} open={treemapSourcesOpen} onToggle={() => setTreemapSourcesOpen(!treemapSourcesOpen)} />
      ) : (
        <DoorSources data={data} t={t} lang={lang} onNavigate={onNavigate} />
      ),
  }));
  return (
    <StoryShell
      t={t}
      lang={lang}
      onNavigate={onNavigate}
      nav={{ storyHref, onOpenStory }}
      listing={usLobby.listing}
      data={data}
      text={usLobby.story}
      slots={s}
      nodeSlots={s}
      sections={sections}
      onDownload={() => downloadUsEntriesCsv(data)}
    />
  );
}

function UsGesetzeStoryPage({ t, lang, onNavigate, storyHref, onOpenStory, data }: PageProps & StoryNav & { data: UsGesetzeData }) {
  const s = usGesetze.slots(data);
  const gkv = data.sugarLevy.gkvBill;
  const nodeSlots: Record<string, ReactNode> = {
    ...s,
    gkvBill: gkv ? (
      <InternalLink path={gkv.path} onNavigate={onNavigate}>
        {gkv.title}
      </InternalLink>
    ) : (
      'GKV-Reform'
    ),
  };
  const sections: ShellSection[] = usGesetze.story.sections.map((sec) => ({
    ...sec,
    chart:
      sec.chart === 'votes' ? (
        <VoteRows votes={data.votes} pollNotes={usGesetze.pollNotes} orgNotes={usGesetze.orgNotes} onNavigate={onNavigate} />
      ) : (
        <LevyUnitChart levy={data.sugarLevy} onNavigate={onNavigate} />
      ),
    sources: sec.chart === 'votes' ? <VoteSources data={data} t={t} lang={lang} onNavigate={onNavigate} /> : <LevySources levy={data.sugarLevy} t={t} lang={lang} onNavigate={onNavigate} />,
  }));
  return (
    <StoryShell
      t={t}
      lang={lang}
      onNavigate={onNavigate}
      nav={{ storyHref, onOpenStory }}
      listing={usGesetze.listing}
      data={data}
      text={usGesetze.story}
      slots={s}
      nodeSlots={nodeSlots}
      sections={sections}
      onDownload={() => downloadVotesCsv(data)}
    />
  );
}

// ---- Source lists (collapsed by default) ---------------------------------------------------------

const thStyle = { textAlign: 'left', fontWeight: 600, color: MUTED, padding: '6px 8px', borderBottom: HAIR, fontSize: 12 } as const;
const tdStyle = { padding: '6px 8px', borderBottom: HAIR, verticalAlign: 'top' } as const;

const SOURCES_INITIAL = 10;

/** Collapsed-by-default heading of a source list. Opened, the list shows SOURCES_INITIAL rows plus the site's "n weitere | Alle" control. */
function SourcesToggle({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <h3 style={{ fontSize: 14, fontWeight: 700, margin: '20px 0 6px' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: ACCENT, cursor: 'pointer', display: 'inline-flex', alignItems: 'baseline', gap: 6 }}
      >
        <span aria-hidden style={{ display: 'inline-block', width: 12, fontSize: 13 }}>
          {open ? '▾' : '▸'}
        </span>
        <span>{children}</span>
      </button>
    </h3>
  );
}

const orgLink = (path: string | null, label: string, onNavigate: (p: string) => void) =>
  path ? (
    <InternalLink path={path} onNavigate={onNavigate}>
      {label}
    </InternalLink>
  ) : (
    label
  );

const registerId = (id: string, url: string) => (
  <a href={url} {...ext} style={{ color: MUTED, fontSize: 12 }}>
    {id}
  </a>
);

function TreemapSources({ data, t, lang, onNavigate, open, onToggle }: { data: UsLobbyData; t: Translation; lang: Lang; onNavigate: (p: string) => void; open: boolean; onToggle: () => void }) {
  const rows = (['seat', 'subsidiary'] as const).flatMap((zone) =>
    data.treemap.zones[zone].groups.flatMap((g) => g.entries.map((e) => ({ zone, group: g.label, e }))),
  );
  const [shown, setShown] = useState(SOURCES_INITIAL);
  const narrow = useNarrow();
  return (
    <div id={TREEMAP_SOURCES_ID} style={{ maxWidth: 900, scrollMarginTop: 140 }}>
      <SourcesToggle open={open} onToggle={onToggle}>
        {fill(t.dsSourcesCountTemplate, { n: String(rows.length) })}
      </SourcesToggle>
      {open && narrow && (
        <>
          {/* Phones: one stacked row per entry instead of a four-column table. */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14 }}>
            {rows.slice(0, shown).map(({ zone, group, e }) => (
              <li key={e.id} style={{ padding: '9px 0', borderBottom: HAIR }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: zone === 'seat' ? SEAT_C : SUB_C, flexShrink: 0, alignSelf: 'center' }} />
                  <strong>{group}</strong>
                  <span style={{ marginLeft: 'auto', color: MUTED, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{amountLabel(e.midEuro)} €</span>
                </div>
                <div style={{ marginTop: 2, paddingLeft: 16 }}>{orgLink(e.orgPath, e.name, onNavigate)}</div>
                <div style={{ marginTop: 2, paddingLeft: 16, fontSize: 12, color: MUTED, display: 'flex', flexWrap: 'wrap', gap: '0 12px' }}>
                  <a href={e.registerUrl} {...ext} style={{ color: MUTED }}>
                    Lobbyregister {e.id}
                  </a>
                  {e.evidenceUrl && (
                    <a href={e.evidenceUrl} {...ext} style={{ color: MUTED }}>
                      Beleg: {shortEvidence(e.evidenceType)}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <ShowMoreButton shown={shown} total={rows.length} initial={SOURCES_INITIAL} onChange={setShown} t={t} lang={lang} />
        </>
      )}
      {open && !narrow && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Konzern</th>
                  <th style={thStyle}>{t.dsRegisterEntry}</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>€ / Jahr</th>
                  <th style={thStyle}>{t.dsEvidence}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map(({ zone, group, e }) => (
                  <tr key={e.id}>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: zone === 'seat' ? SEAT_C : SUB_C, marginRight: 6 }} />
                      {group}
                    </td>
                    <td style={tdStyle}>
                      {orgLink(e.orgPath, e.name, onNavigate)} {registerId(e.id, e.registerUrl)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{amountLabel(e.midEuro)}</td>
                    <td style={tdStyle}>
                      {e.evidenceUrl ? (
                        <a href={e.evidenceUrl} {...ext}>
                          {shortEvidence(e.evidenceType)}
                        </a>
                      ) : (
                        shortEvidence(e.evidenceType)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ShowMoreButton shown={shown} total={rows.length} initial={SOURCES_INITIAL} onChange={setShown} t={t} lang={lang} />
        </>
      )}
    </div>
  );
}

/** One block per named person: who named them, for which US client, with the register entries. */
function DoorSources({ data, t, lang, onNavigate }: { data: UsLobbyData; t: Translation; lang: Lang; onNavigate: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  const people = data.revolvingDoor.people;
  return (
    <div style={{ maxWidth: 900 }}>
      <SourcesToggle open={open} onToggle={() => setOpen(!open)}>
        {fill(t.dsSourcesCountTemplate, { n: String(people.length) })} · <span style={{ fontWeight: 400, color: MUTED }}>{fill(t.dsAsOfTemplate, { date: dateDe(data.generatedAt, lang) })}</span>
      </SourcesToggle>
      {open && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14 }}>
          {people.map((p) => (
            <li key={p.name} style={{ padding: '9px 0', borderBottom: HAIR }}>
              <div>
                <strong>{p.name}</strong>
                <span style={{ color: MUTED }}>
                  {' '}
                  · laut Register: {[p.position ?? (p.kind === 'HOUSE_OF_REPRESENTATIVES' ? 'Mitglied des Bundestages' : null), p.authority].filter(Boolean).join(', ')}
                  {p.endDate ? `, bis ${p.endDate.slice(5, 7)}/${p.endDate.slice(0, 4)}` : ''}
                </span>
              </div>
              <div style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: '2px 14px', fontSize: 13 }}>
                {p.via ? (
                  <span>
                    Genannt von: {p.via.orgPath && p.via.name ? orgLink(p.via.orgPath, p.via.name, onNavigate) : p.via.name}
                    {p.via.id && p.via.registerUrl ? <> {registerId(p.via.id, p.via.registerUrl)}</> : null}
                  </span>
                ) : (
                  <span>Genannt im eigenen Eintrag</span>
                )}
                {p.clients.map((c) => (
                  <span key={c.id}>
                    {p.via ? 'Auftrag: ' : ''}
                    {orgLink(c.orgPath, c.name, onNavigate)} {registerId(c.id, c.registerUrl)}
                    {c.euro ? <span style={{ color: MUTED }}> · {euroRangeLabel(c.euro)}</span> : null}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Every US entry per vote with its demands in full register wording. */
function VoteSources({ data, t, lang, onNavigate }: { data: UsGesetzeData; t: Translation; lang: Lang; onNavigate: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(SOURCES_INITIAL);
  const rows = data.votes.flatMap((v) => v.usOrgs.map((o) => ({ v, o })));
  return (
    <div style={{ maxWidth: 900 }}>
      <SourcesToggle open={open} onToggle={() => setOpen(!open)}>
        {fill(t.dsSourcesCountTemplate, { n: String(rows.length) })}
      </SourcesToggle>
      {open && (
        <>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14 }}>
            {rows.slice(0, shown).map(({ v, o }) => (
              <li key={`${v.id}-${o.id}`} style={{ padding: '9px 0', borderBottom: HAIR }}>
                <div>
                  {orgLink(o.orgPath, o.name, onNavigate)} {registerId(o.id, o.registerUrl)} <span style={{ color: MUTED }}>zu</span> {orgLink(v.path, usGesetze.pollNotes[v.id]?.short ?? v.title, onNavigate)}
                </div>
                {o.demands.length > 0 && <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Anliegen laut Register: {o.demands.map((d) => `„${d}“`).join(' · ')}</div>}
              </li>
            ))}
          </ul>
          <ShowMoreButton shown={shown} total={rows.length} initial={SOURCES_INITIAL} onChange={setShown} t={t} lang={lang} />
        </>
      )}
    </div>
  );
}

const CAMP_DE: Record<LevyCamp, string> = { against: 'dagegen', for: 'dafür', shape: 'gestalten / offen', agency: 'Agentur / Person (nicht gezählt)' };

function LevySources({ levy, t, lang, onNavigate }: { levy: SugarLevy; t: Translation; lang: Lang; onNavigate: (p: string) => void }) {
  const order: LevyCamp[] = ['against', 'shape', 'for', 'agency'];
  const rows = [...levy.entries].sort((a, b) => order.indexOf(a.camp) - order.indexOf(b.camp) || Number(b.isUs) - Number(a.isUs));
  const [shown, setShown] = useState(SOURCES_INITIAL);
  const [open, setOpen] = useState(false);
  return (
    <div style={{ maxWidth: 900 }}>
      <SourcesToggle open={open} onToggle={() => setOpen(!open)}>
        {fill(t.dsSourcesCountTemplate, { n: String(rows.length) })} · <span style={{ fontWeight: 400, color: MUTED }}>{fill(t.dsAsOfTemplate, { date: dateDe(levy.checkedOn, lang) })}</span>
      </SourcesToggle>
      {open && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t.dsRegisterEntry}</th>
                  <th style={thStyle}>Lager</th>
                  <th style={thStyle}>Kurzbeleg</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((e) => (
                  <tr key={e.id}>
                    <td style={tdStyle}>
                      {orgLink(e.orgPath, e.label, onNavigate)} {registerId(e.id, e.registerUrl)}
                      {e.isUs && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, background: SUB_C, borderRadius: 3, padding: '1px 5px' }}>US</span>}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{CAMP_DE[e.camp]}</td>
                    <td style={tdStyle}>{e.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ShowMoreButton shown={shown} total={rows.length} initial={SOURCES_INITIAL} onChange={setShown} t={t} lang={lang} />
        </>
      )}
    </div>
  );
}

// ---- Downloads -----------------------------------------------------------------------------------


function LobbyGeldStoryPage({ t, lang, onNavigate, storyHref, onOpenStory, data }: PageProps & StoryNav & { data: LobbyGeldData }) {
  const s = lobbyGeld.slots(data);
  const asOf = dateDe(data.generatedAt, lang);
  const sections: ShellSection[] = lobbyGeld.story.sections.map((sec) => ({
    ...sec,
    chart: sec.chart === 'spendDonations' ? <SpendDonationsChart data={data} onNavigate={onNavigate} /> : <OverlapChart data={data} onNavigate={onNavigate} />,
    sources:
      sec.chart === 'spendDonations' ? (
        <LinkSources t={t} asOf={asOf} items={[REGISTER_SOURCE, DONATIONS_SOURCE]} />
      ) : (
        <LinkSources
          t={t}
          asOf={asOf}
          onNavigate={onNavigate}
          items={[
            ...data.overlap.topOrgs.map((o) => ({ label: o.name, url: o.registerUrl, path: o.orgPath, note: `${o.mdbCount} Abgeordnete mit Funktion` })),
            ...data.overlap.donors.map((d) => ({ label: d.name, url: d.registerUrl, path: d.orgPath, note: `Spender, ${Math.round(d.donatedEuro).toLocaleString('de-DE')} €` })),
            DONATIONS_SOURCE,
          ]}
        />
      ),
  }));
  return (
    <StoryShell t={t} lang={lang} onNavigate={onNavigate} nav={{ storyHref, onOpenStory }} listing={lobbyGeld.listing} data={data} text={lobbyGeld.story} slots={s} nodeSlots={s} sections={sections} onDownload={() => downloadLobbyGeldCsv(data)} />
  );
}

function ParteispendenStoryPage({ t, lang, onNavigate, storyHref, onOpenStory, data }: PageProps & StoryNav & { data: ParteispendenData }) {
  const s = parteispenden.slots(data);
  const asOf = dateDe(data.generatedAt, lang);
  const sections: ShellSection[] = parteispenden.story.sections.map((sec) => ({
    ...sec,
    chart: sec.chart === 'partyBars' ? <PartyBars data={data} onNavigate={onNavigate} /> : <BitpandaChart data={data} onNavigate={onNavigate} />,
    sources:
      sec.chart === 'partyBars' ? (
        <LinkSources t={t} asOf={asOf} items={[DONATIONS_SOURCE]} />
      ) : (
        <LinkSources
          t={t}
          asOf={asOf}
          onNavigate={onNavigate}
          items={[
            ...(data.bitpanda ? [{ label: data.bitpanda.name, url: data.bitpanda.registerUrl, path: data.bitpanda.orgPath, note: 'Lobbyregister-Eintrag' }] : []),
            DONATIONS_SOURCE,
          ]}
        />
      ),
  }));
  return (
    <StoryShell t={t} lang={lang} onNavigate={onNavigate} nav={{ storyHref, onOpenStory }} listing={parteispenden.listing} data={data} text={parteispenden.story} slots={s} nodeSlots={s} sections={sections} onDownload={() => downloadPartyDonationsCsv(data)} />
  );
}

const REGISTER_SOURCE = { label: 'Lobbyregister des Bundestags', url: 'https://www.lobbyregister.bundestag.de/', path: null, note: 'alle aktiven Einträge mit Angaben zu den Ausgaben' };
const DONATIONS_SOURCE = { label: 'Bundestag: Parteispenden über 35.000 €', url: 'https://www.bundestag.de/parlament/praesidium/parteienfinanzierung/fundstellen50000', path: null, note: 'veröffentlichte Großspenden' };

/** Collapsed list of source links for stories whose evidence is a few register entries and one list. */
function LinkSources({ t, asOf, items, onNavigate }: { t: Translation; asOf: string; items: { label: string; url: string; path: string | null; note: string }[]; onNavigate?: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ maxWidth: 900 }}>
      <SourcesToggle open={open} onToggle={() => setOpen(!open)}>
        {fill(t.dsSourcesCountTemplate, { n: String(items.length) })} · <span style={{ fontWeight: 400, color: MUTED }}>{fill(t.dsAsOfTemplate, { date: asOf })}</span>
      </SourcesToggle>
      {open && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14 }}>
          {items.map((i) => (
            <li key={i.url + i.label} style={{ padding: '8px 0', borderBottom: HAIR }}>
              {i.path && onNavigate ? orgLink(i.path, i.label, onNavigate) : <a href={i.url} {...ext}>{i.label}</a>}
              {i.path && (
                <>
                  {' '}
                  <a href={i.url} {...ext} style={{ color: MUTED, fontSize: 12 }}>
                    Register
                  </a>
                </>
              )}
              <span style={{ color: MUTED }}> · {i.note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function downloadCsv(name: string, header: string[], rows: (string | number | boolean | null)[][]) {
  const q = (v: string | number | boolean | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.join(','), ...rows.map((r) => r.map(q).join(','))];
  const blob = new Blob([`﻿${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadUsEntriesCsv(data: UsLobbyData) {
  const rows = (['seat', 'subsidiary'] as const).flatMap((zone) =>
    data.treemap.zones[zone].groups.flatMap((g) => g.entries.map((e) => [e.id, e.name, zone, g.parent, e.midEuro, e.evidenceType, e.evidenceUrl, e.registerUrl])),
  );
  downloadCsv(`politblick-us-lobby-${(data.generatedAt ?? '').slice(0, 10)}.csv`, ['register_id', 'name', 'zone', 'us_parent', 'lobby_spend_mid_eur', 'evidence_type', 'evidence_url', 'register_url'], rows);
}

function downloadVotesCsv(data: UsGesetzeData) {
  const rows = data.votes.flatMap((v) =>
    v.usOrgs.map((o) => [v.id, v.title, v.date, v.accepted, v.totals.yes, v.totals.no, v.totals.abstain, v.lobbyCount, o.id, o.name, o.label, o.demands.join(' | '), o.registerUrl]),
  );
  downloadCsv(
    `politblick-us-gesetze-${(data.generatedAt ?? '').slice(0, 10)}.csv`,
    ['poll_id', 'poll_title', 'poll_date', 'accepted', 'yes', 'no', 'abstain', 'lobby_orgs_total', 'us_register_id', 'us_name', 'us_parent', 'demands', 'register_url'],
    rows,
  );
}

/** <head> title/description for a story once its data is loaded. */

function downloadLobbyGeldCsv(data: LobbyGeldData) {
  const rows: (string | number | null)[][] = [
    ...data.spend.byType.map((t) => ['lobbyausgaben_nach_art', t.label, t.orgCount, t.midEuro]),
    ['grossspenden_gesamt', `seit ${data.donations.firstYear}`, data.donations.count, data.donations.totalEuro],
    ...data.overlap.topOrgs.map((o) => ['abgeordnete_mit_funktion', o.name, o.mdbCount, null]),
    ...data.overlap.donors.map((d) => ['spender_im_register', d.name, d.donationCount, d.donatedEuro]),
  ];
  downloadCsv(`politblick-lobby-geld-${(data.generatedAt ?? '').slice(0, 10)}.csv`, ['block', 'name', 'anzahl', 'betrag_eur'], rows);
}
function downloadPartyDonationsCsv(data: ParteispendenData) {
  const rows = data.parties.flatMap((p) => p.topDonors.map((d) => [p.party, p.sumEuro, p.donorCount, p.top3Share, d.name, d.euro]));
  downloadCsv(`politblick-parteispenden-${(data.generatedAt ?? '').slice(0, 10)}.csv`, ['partei', 'summe_eur', 'spender', 'anteil_top3', 'grosser_spender', 'betrag_eur'], rows);
}

export function datenstoryMeta(data: DatenstoryData) {
  if (data.slug === 'us-lobby') {
    const s = usLobby.slots(data);
    return { title: fill(usLobby.story.metaTitle, s), description: fill(usLobby.story.metaDescription, s) };
  }
  if (data.slug === 'lobby-geld') {
    const s = lobbyGeld.slots(data);
    return { title: fill(lobbyGeld.story.metaTitle, s), description: fill(lobbyGeld.story.metaDescription, s) };
  }
  if (data.slug === 'parteispenden') {
    const s = parteispenden.slots(data);
    return { title: fill(parteispenden.story.metaTitle, s), description: fill(parteispenden.story.metaDescription, s) };
  }
  const s = usGesetze.slots(data);
  return { title: fill(usGesetze.story.metaTitle, s), description: fill(usGesetze.story.metaDescription, s) };
}

function StoryCardPreview({ slug }: { slug: string }) {
  return <StoryPreview slug={slug} data={useDatenstory(slug).data} />;
}
