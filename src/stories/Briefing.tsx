/**
 * The Sitzungswochen-Briefing.
 *
 * - `SitzungswochenBriefing` renders the landing-page section: one tile per recent sitting week,
 *   an overview only (a line of key numbers). Each tile links to the week's detail page.
 * - `StoryDetailPage` is that detail page (/sitzungswoche/<montag>) — laid out as an editorial
 *   briefing: a masthead with the issue number and ISO week, a hero with the date and a "week in
 *   numbers" rail, then four numbered sections (votes, cohesion, absence, donations).
 *
 * Every sentence is a `t.sw*` template with number slots. These components only decide WHICH
 * template applies (one vote vs. several, some divergence vs. none, …) and fill the slots from
 * the generated JSON. They never compose free text. Poll and party names inside a sentence link
 * into the site.
 */
import { Fragment, useState, type CSSProperties, type ReactNode } from 'react';
import type { Lang, Translation } from '../data';
import { formatDateTime } from '../format';
import { formatEuro } from '../lobby';
import { FALLBACK_PARTY_COLOR, REAL_PARTY_COLORS } from '../bundestag';
import type { StoryIndexEntry, StoryIssue, StoryPartyTally, StoryPoll } from '../stories';

const MAX_TILES = 3;
const partyColor = (p: string) => REAL_PARTY_COLORS[p] ?? FALLBACK_PARTY_COLOR;
const HAIR = '1px solid oklch(92% 0.006 260)';
const MUTED = 'oklch(48% 0.01 260)';
const ACCENT_C = 'oklch(45% 0.16 265)';
const SEATS_TOTAL = 630;
const V_YES = 'oklch(52% 0.13 155)';
const V_NO = 'oklch(56% 0.16 40)';
const V_ABSTAIN = 'oklch(80% 0.02 260)';
const V_NOSHOW = 'oklch(90% 0.006 260)';

function makeFmt(lang: Lang) {
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  return {
    range: (start: string, end: string) => {
      const s = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${start}T00:00:00Z`));
      const e = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${end}T00:00:00Z`));
      return `${s} – ${e}`;
    },
    day: (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${iso}T00:00:00Z`)),
    pct: (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 }),
    int: (n: number) => n.toLocaleString(locale),
  };
}
type Fmt = ReturnType<typeof makeFmt>;

const fillStr = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k) => (k in values ? String(values[k]) : `{${k}}`));

/** Splits a template on `{slot}` and substitutes a string or a React node per slot. */
function fillNodes(template: string, values: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const m = part.match(/^\{(\w+)\}$/);
    return <Fragment key={i}>{m && m[1] in values ? values[m[1]] : part}</Fragment>;
  });
}

const joinNodes = (parts: ReactNode[]) =>
  parts.map((p, i) => (
    <Fragment key={i}>
      {p}
      {i < parts.length - 1 ? ' ' : ''}
    </Fragment>
  ));

// ── Landing-page section ───────────────────────────────────────────────────────────────────

interface SectionProps {
  issues: StoryIndexEntry[];
  t: Translation;
  lang: Lang;
  storyHref: (week: string) => string;
  onOpenStory: (week: string) => void;
  pollListHref: string;
  onOpenPollList: () => void;
  billHref: (pollId: number) => string;
  onOpenBill: (pollId: number) => void;
  stop: (fn: () => void) => (e: React.MouseEvent) => void;
}

/** A thin yes/no/abstain/no-show band, normalised to the full chamber — one per vote in the week. */
function MiniBand({ totals }: { totals: { yes: number; no: number; abstain: number; noShow: number } }) {
  const denom = Math.max(SEATS_TOTAL, totals.yes + totals.no + totals.abstain + totals.noShow) || 1;
  const seg = (n: number, c: string) => (n > 0 ? <span key={c} style={{ width: `${(n / denom) * 100}%`, background: c }} /> : null);
  return (
    <div style={{ display: 'flex', height: 7, borderRadius: 3, overflow: 'hidden', background: 'oklch(93% 0.006 260)' }}>
      {seg(totals.yes, V_YES)}
      {seg(totals.no, V_NO)}
      {seg(totals.abstain, V_ABSTAIN)}
      {seg(totals.noShow, V_NOSHOW)}
    </div>
  );
}

export function SitzungswochenBriefing({ issues, t, lang, storyHref, onOpenStory, pollListHref, onOpenPollList, billHref, onOpenBill, stop }: SectionProps) {
  const fmt = makeFmt(lang);
  const shown = issues.slice(0, MAX_TILES);
  if (shown.length === 0) return null;

  const caps: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: MUTED };
  const big: CSSProperties = { fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

  const legendItem = (color: string, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <i style={{ width: 8, height: 8, background: color, display: 'block' }} />
      {label}
    </span>
  );

  return (
    <section style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 32px 8px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>{t.swSectionTitle}</h2>
      <p style={{ fontSize: 13.5, color: MUTED, margin: '0 0 18px', maxWidth: 680 }}>{t.swSectionSub}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(288px, 1fr))', gap: 14 }}>
        {shown.map((issue, idx) => {
          const a = issue.acceptedCount;
          const r = issue.pollCount - a;
          const tally = a > 0 && r > 0 ? fillStr(t.swTileAcceptedRejected, { a, r }) : a > 0 ? fillStr(t.swTileAcceptedOnly, { a }) : fillStr(t.swTileRejectedOnly, { r });
          const statRow = (label: string, value: number, sub?: string) => (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: HAIR }}>
              <div>
                <div style={{ fontSize: 13, color: 'oklch(30% 0.01 260)' }}>{label}</div>
                {sub && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>{sub}</div>}
              </div>
              <span style={big}>{fmt.int(value)}</span>
            </div>
          );
          return (
            <div
              key={issue.week}
              style={{
                background: idx === 0 ? 'oklch(97% 0.008 262)' : 'oklch(97.5% 0.006 260)',
                border: `1px solid ${idx === 0 ? 'oklch(88% 0.03 262)' : 'oklch(91% 0.006 260)'}`,
                borderRadius: 14,
                padding: '18px 20px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <a
                  href={storyHref(issue.week)}
                  onClick={stop(() => onOpenStory(issue.week))}
                  style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', color: ACCENT_C }}
                >
                  {fmt.range(issue.dateRange.start, issue.dateRange.end)}
                </a>
                {idx === 0 && (
                  <span style={{ ...caps, fontSize: 9.5, padding: '3px 8px', borderRadius: 999, background: 'oklch(93% 0.04 262)', color: 'oklch(40% 0.1 262)' }}>{t.swTileCurrent}</span>
                )}
              </div>

              <div>
                {statRow(issue.pollCount === 1 ? t.swTileVotesOne : t.swTileVotes, issue.pollCount)}
                {statRow(t.swTileDivergence, issue.divergingTotal)}
                {statRow(t.swTileDonations, issue.donationCount, issue.donationCount > 0 ? formatEuro(issue.donationSumEuro) : undefined)}
              </div>

              <div>
                <div style={caps}>{t.swTileVoteRatio}</div>
                <div style={{ display: 'grid', gap: 3, margin: '9px 0 8px' }}>
                  {issue.pollTotals.map((tot, i) => (
                    <MiniBand key={i} totals={tot} />
                  ))}
                </div>
                <div style={{ fontSize: 12, color: MUTED }}>{tally}</div>
              </div>

              {issue.closest && (
                <div>
                  <div style={caps}>{t.swTileClosest}</div>
                  <a
                    href={billHref(issue.closest.id)}
                    onClick={stop(() => onOpenBill(issue.closest!.id))}
                    style={{ display: 'block', fontSize: 15.5, fontWeight: 700, margin: '5px 0 3px', color: 'inherit', lineHeight: 1.3, overflowWrap: 'anywhere' }}
                  >
                    {issue.closest.title}
                  </a>
                  <div style={{ fontSize: 12.5, color: MUTED }}>
                    {fillStr(t.swTileClosestMargin, { yes: issue.closest.yes, no: issue.closest.no, margin: issue.closest.margin })}
                  </div>
                </div>
              )}

              <a
                href={storyHref(issue.week)}
                onClick={stop(() => onOpenStory(issue.week))}
                style={{ fontSize: 13, fontWeight: 700, color: ACCENT_C, marginTop: 'auto' }}
              >
                {t.swGoToBriefing} →
              </a>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 14, fontSize: 11.5, color: MUTED }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {legendItem(V_YES, t.swColYes)}
          {legendItem(V_NO, t.swColNo)}
          {legendItem(V_ABSTAIN, t.swColAbstain)}
          {legendItem(V_NOSHOW, t.swColNoShow)}
          <span>{t.swTileLegendNote}</span>
        </div>
        <a href={pollListHref} onClick={stop(onOpenPollList)} style={{ fontWeight: 700, color: ACCENT_C, whiteSpace: 'nowrap' }}>
          {t.swAllWeeks} →
        </a>
      </div>
    </section>
  );
}

// ── Detail page — editorial layout ─────────────────────────────────────────────────────────
//
// Adapts a newspaper-style briefing (numbered sections, a hero date, a stat rail, a zoomed
// cohesion chart) to Politblick's tokens: IBM Plex Sans, the oklch palette, the site accent,
// tabular figures. The one soft-rounded surface — matching the rest of the site — is the panel
// a vote row expands into.

const INK = 'oklch(24% 0.01 260)';
const FAINT = 'oklch(56% 0.01 260)';
const ACCENT = 'oklch(45% 0.16 265)';
const RULE = '2px solid oklch(90% 0.006 260)';
/** Rounded, clipped bar track — matches every other bar on the site. */
const track = (h: number, r = Math.min(6, h / 2)): CSSProperties => ({
  height: h,
  borderRadius: r,
  overflow: 'hidden',
  background: 'oklch(93% 0.006 260)',
});
const SEATS = 630;
const VOTE_YES = 'oklch(52% 0.13 155)';
const VOTE_NO = 'oklch(56% 0.16 40)';
const VOTE_ABSTAIN = 'oklch(80% 0.02 260)';
const VOTE_NOSHOW = 'oklch(90% 0.006 260)';

const DISPLAY: CSSProperties = { fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' };
const RUBRIK: CSSProperties = { margin: 0, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase' };
const LEAD: CSSProperties = { fontSize: 14, lineHeight: 1.68, color: 'oklch(34% 0.01 260)' };

function Rubrik({ n, children, aside }: { n: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', borderBottom: RULE, paddingBottom: 8 }}>
      <h2 style={RUBRIK}>
        <span style={{ color: ACCENT }}>{n}</span>&nbsp;&nbsp;{children}
      </h2>
      {aside != null && <div style={{ fontSize: 11.5, color: MUTED }}>{aside}</div>}
    </div>
  );
}

interface DetailPageProps {
  issue: StoryIssue;
  t: Translation;
  lang: Lang;
  storyHref: (week: string) => string;
  onOpenStory: (week: string) => void;
  pollListHref: string;
  onOpenPollList: () => void;
  /** Returns to wherever the reader came from (in-app history), falling back to `backHref`. */
  onBack: () => void;
  backHref: string;
  billHref: (pollId: number) => string;
  onOpenBill: (pollId: number) => void;
  orgHref: (orgId: string) => string;
  onOpenOrg: (orgId: string) => void;
  partyDonationsHref: (party: string) => string;
  onOpenPartyDonations: (party: string) => void;
  isPartyRoutable: (party: string) => boolean;
  stop: (fn: () => void) => (e: React.MouseEvent) => void;
}

export function StoryDetailPage(props: DetailPageProps) {
  const { issue, t, lang, storyHref, onOpenStory, pollListHref, onOpenPollList, onBack, backHref, billHref, onOpenBill } = props;
  const fmt = makeFmt(lang);
  const year = issue.dateRange.start.slice(0, 4);
  const billLink = (poll: { id: number; title: string }) => (
    <a href={billHref(poll.id)} onClick={props.stop(() => onOpenBill(poll.id))} style={{ fontWeight: 600 }}>
      {poll.title}
    </a>
  );

  // Hero lead — the votes summary, then a one-line donation teaser.
  const heroLead: ReactNode[][] = [votesLeadNodes(issue, t, billLink), [moneyHeadlineNode(issue, t)]];

  const stats: [string, number][] = [
    [t.swStatPollsLong, issue.pollCount],
    [t.swStatDivergenceLong, issue.divergingTotal],
    [t.swStatAbsenceLong, issue.absence.total],
    [t.swStatDonationsLong, issue.donations.count],
  ];

  return (
    <main style={{ flex: 1, maxWidth: 1000, margin: '0 auto', width: '100%', padding: '32px 32px 80px', fontVariantNumeric: 'tabular-nums' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
        <a href={backHref} onClick={props.stop(onBack)} style={{ color: MUTED }}>
          ← {t.swBack}
        </a>
        <a href={pollListHref} onClick={props.stop(onOpenPollList)} style={{ fontWeight: 700 }}>
          {t.swSeeMore} →
        </a>
      </div>

      <div style={{ margin: '18px 0 8px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED }}>
        {t.swSectionTitle} · {fillStr(t.swMastheadTemplate, { number: issue.number, week: issue.isoWeek, year })}
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>
        {fmt.range(issue.dateRange.start, issue.dateRange.end)}
      </h1>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, fontWeight: 600, marginBottom: 26 }}>
        {issue.prevWeek && (
          <a href={storyHref(issue.prevWeek)} onClick={props.stop(() => onOpenStory(issue.prevWeek!))}>
            ← {t.swPrev}
          </a>
        )}
        {issue.nextWeek && (
          <a href={storyHref(issue.nextWeek)} onClick={props.stop(() => onOpenStory(issue.nextWeek!))}>
            {t.swNext} →
          </a>
        )}
      </div>

      {/* Lead summary + the week's key numbers */}
      <section className="sw-hero" style={{ paddingBottom: 30, borderBottom: HAIR }}>
        <div>
          {heroLead.map((parts, i) => (
            <p key={i} style={{ ...LEAD, fontSize: 14.5, lineHeight: 1.7, margin: i === 0 ? '0 0 14px' : 0, maxWidth: '37em' }}>
              {joinNodes(parts)}
            </p>
          ))}
        </div>

        <aside className="sw-rail">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, paddingBottom: 8, borderBottom: HAIR }}>
            {t.swWeekInNumbers}
          </div>
          {stats.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, padding: '11px 0', borderBottom: HAIR }}>
              <span style={{ fontSize: 12.5, lineHeight: 1.35, color: 'oklch(30% 0.01 260)', maxWidth: '15em' }}>{label}</span>
              <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>{fmt.int(value)}</span>
            </div>
          ))}
          {issue.generatedAt && (
            <div style={{ fontSize: 11, color: FAINT, paddingTop: 9, lineHeight: 1.45 }}>{fillStr(t.swAsOf, { date: formatDateTime(issue.generatedAt, lang) })}</div>
          )}
        </aside>
      </section>

      {/* I — VOTES */}
      <section style={{ paddingTop: 38 }}>
        <Rubrik n="I" aside={<VoteLegend t={t} />}>
          {t.swBlockVotes}
        </Rubrik>
        <div>
          {issue.polls.map((poll, i) => (
            <PollRow key={poll.id} poll={poll} index={i + 1} last={i === issue.polls.length - 1} fmt={fmt} {...props} />
          ))}
        </div>
      </section>

      {/* II + III */}
      <section className="sw-split" style={{ paddingTop: 38 }}>
        {issue.cohesionAll.length > 0 && (
          <div>
            <Rubrik n="II">{t.swBlockCohesion}</Rubrik>
            <p style={{ ...LEAD, margin: '14px 0 0', maxWidth: '31em' }}>{joinNodes(cohesionLeadNodes(issue, t, fmt))}</p>
            <Lollipop rows={issue.cohesionAll} t={t} fmt={fmt} />
          </div>
        )}
        {issue.absence.total > 0 && (
          <div>
            <Rubrik n="III">{t.swBlockAbsence}</Rubrik>
            <p style={{ ...LEAD, margin: '14px 0 0', maxWidth: '31em' }}>{joinNodes(absenceLeadNodes(issue, t))}</p>
            <AbsenceChart rows={issue.absence.byParty} t={t} fmt={fmt} />
          </div>
        )}
      </section>

      {/* IV — DONATIONS */}
      <section style={{ paddingTop: 42 }}>
        <Rubrik n="IV" aside={issue.donations.count > 0 ? fillStr(t.swDonationsSummary, { n: issue.donations.count, sum: formatEuro(issue.donations.sumEuro) }) : undefined}>
          {t.swBlockMoney}
        </Rubrik>
        <p style={{ ...LEAD, margin: '14px 0 22px', maxWidth: '52em' }}>{joinNodes(moneyLeadNodes(issue, t))}</p>
        <div className="sw-money">
          <Donations fmt={fmt} {...props} />
          {issue.donationYearToDate.length > 0 && <Jahresstand fmt={fmt} {...props} />}
        </div>
      </section>

      <footer style={{ marginTop: 44, borderTop: RULE, paddingTop: 12, fontSize: 11.5, color: FAINT, lineHeight: 1.5, maxWidth: '52em' }}>
        {t.swSectionSub}
      </footer>
    </main>
  );
}


// ── Lead-sentence builders (shared with the hero) ──────────────────────────────────────────

function votesLeadNodes(issue: StoryIssue, t: Translation, billLink: (p: { id: number; title: string }) => ReactNode): ReactNode[] {
  const solo = issue.pollCount === 1;
  const out: ReactNode[] = [];
  if (solo && issue.polls[0]) out.push(fillNodes(t.swVotesOne, { title: billLink(issue.polls[0]) }));
  else if (issue.topics.length > 0) out.push(fillNodes(t.swVotesTopics, { n: issue.pollCount, topics: issue.topics.slice(0, 3).map((x) => x.label).join(', ') }));
  else out.push(fillNodes(t.swVotes, { n: issue.pollCount }));

  if (issue.divergingTotal === 0) out.push(fillNodes(t.swDivergenceNone, {}));
  else if (issue.divergingTotal === 1)
    out.push(solo || !issue.mostDivergent ? fillNodes(t.swDivergenceSoloOne, {}) : fillNodes(t.swDivergenceOne, { title: billLink(issue.mostDivergent) }));
  else
    out.push(
      solo || !issue.mostDivergent
        ? fillNodes(t.swDivergenceSoloSome, { n: issue.divergingTotal })
        : fillNodes(t.swDivergenceSome, { n: issue.divergingTotal, count: issue.mostDivergent.divergingCount, title: billLink(issue.mostDivergent) }),
    );
  if (issue.closest) out.push(fillNodes(t.swClosest, { title: billLink(issue.closest), yes: issue.closest.yes, no: issue.closest.no, margin: issue.closest.margin }));
  return out;
}

function cohesionLeadNodes(issue: StoryIssue, t: Translation, fmt: Fmt): ReactNode[] {
  const out: ReactNode[] = [];
  if (issue.cohesion) {
    const { top, bottom } = issue.cohesion;
    out.push(
      top.pct === bottom.pct
        ? fillStr(t.swCohesionAll, { bottomPct: fmt.pct(bottom.pct) })
        : fillStr(t.swCohesion, { topParty: top.party, topPct: fmt.pct(top.pct), bottomParty: bottom.party, bottomPct: fmt.pct(bottom.pct) }),
    );
  } else out.push(t.swBlockCohesionSub);
  out.push(issue.pollCount === 1 ? t.swCohesionExplainOne : fillStr(t.swCohesionExplain, { polls: issue.pollCount }));
  return out;
}

function absenceLeadNodes(issue: StoryIssue, t: Translation): ReactNode[] {
  return [
    issue.absence.topParty
      ? fillStr(t.swAbsence, { total: issue.absence.total, party: issue.absence.topParty.party, noShow: issue.absence.topParty.noShow })
      : t.swBlockAbsenceSub,
    t.swAbsenceExplain,
  ];
}

function moneyHeadlineNode(issue: StoryIssue, t: Translation): ReactNode {
  if (issue.donations.count === 0) return t.swMoneyNone;
  const d = issue.donations.largest!;
  return fillStr(issue.donations.count === 1 ? t.swMoneyOne : t.swMoneySome, {
    count: issue.donations.count,
    sum: formatEuro(issue.donations.sumEuro),
    amount: formatEuro(d.amountEuro),
    donor: d.donor ?? '—',
    party: d.party,
  });
}

function moneyLeadNodes(issue: StoryIssue, t: Translation): ReactNode[] {
  const out: ReactNode[] = [];
  if (issue.donations.count === 0) {
    out.push(t.swMoneyNone);
  } else {
    const d = issue.donations.largest!;
    let marker = '';
    if (d.largestSince?.allTime) marker = t.swMoneyRecordMarker.replace('{party}', d.largestSince.party);
    else if (d.largestSince && d.largestSince.months != null)
      marker = t.swMoneySinceMarker.replace('{months}', String(d.largestSince.months)).replace('{party}', d.largestSince.party);
    else if (issue.donations.multiPartyDonor)
      marker = t.swMoneyMultiMarker.replace('{donor}', issue.donations.multiPartyDonor.donor).replace('{n}', String(issue.donations.multiPartyDonor.parties.length));
    out.push(moneyHeadlineNode(issue, t) + marker);
  }
  if (issue.ytdLeader) out.push(fillStr(t.swYtd, { year: issue.ytdLeader.year, fraction: issue.ytdLeader.fraction, sum: formatEuro(issue.ytdLeader.sumEuro) }));
  return out;
}

// ── Section I helpers ──────────────────────────────────────────────────────────────────────

function VoteLegend({ t }: { t: Translation }) {
  const item = (color: string, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <i style={{ width: 9, height: 9, background: color, display: 'block' }} />
      {label}
    </span>
  );
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: MUTED }}>
      {item(VOTE_YES, t.swColYes)}
      {item(VOTE_NO, t.swColNo)}
      {item(VOTE_ABSTAIN, t.swColAbstain)}
      {item(VOTE_NOSHOW, t.swColNoShow)}
    </div>
  );
}

/** A yes/no/abstain/no-show band normalised to the full chamber, so any two votes are comparable. */
function VoteBand({ totals, height = 12, seats = SEATS }: { totals: { yes: number; no: number; abstain: number; noShow: number }; height?: number; seats?: number }) {
  const denom = Math.max(seats, totals.yes + totals.no + totals.abstain + totals.noShow) || 1;
  const seg = (n: number, c: string) => (n > 0 ? <span style={{ width: `${(n / denom) * 100}%`, background: c }} /> : null);
  return (
    <div style={{ display: 'flex', width: '100%', ...track(height) }}>
      {seg(totals.yes, VOTE_YES)}
      {seg(totals.no, VOTE_NO)}
      {seg(totals.abstain, VOTE_ABSTAIN)}
      {seg(totals.noShow, VOTE_NOSHOW)}
    </div>
  );
}

interface PollRowProps extends DetailPageProps {
  poll: StoryPoll;
  index: number;
  last: boolean;
  fmt: Fmt;
}

function PollRow({ poll, index, last, t, fmt, billHref, onOpenBill, orgHref, onOpenOrg, stop }: PollRowProps) {
  const [open, setOpen] = useState(false);
  const ord = String(index).padStart(2, '0');
  const chip = (bg: string, color: string, text: string, weight = 400) => (
    <span style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 10, background: bg, color, fontWeight: weight }}>{text}</span>
  );

  return (
    <article style={{ borderBottom: last ? RULE : HAIR, padding: '20px 0 16px', display: 'grid', gridTemplateColumns: '42px minmax(0,1fr)', gap: '0 16px' }}>
      <div style={{ ...DISPLAY, fontSize: 15, fontWeight: 700, color: open ? INK : 'oklch(76% 0.02 260)', lineHeight: 1, paddingTop: 5 }}>{ord}</div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 18, flexWrap: 'wrap' }}>
          <a
            href={billHref(poll.id)}
            onClick={stop(() => onOpenBill(poll.id))}
            style={{ margin: 0, ...DISPLAY, fontWeight: 700, fontSize: 16, lineHeight: 1.3, color: 'inherit', overflowWrap: 'anywhere' }}
          >
            {poll.title}
          </a>
          <span style={{ fontSize: 12, color: MUTED, whiteSpace: 'nowrap' }}>{fmt.day(poll.date)}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '11px 0 7px' }}>
          <span style={{ ...DISPLAY, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: poll.accepted ? 'oklch(42% 0.13 155)' : 'oklch(48% 0.16 40)', whiteSpace: 'nowrap' }}>
            {poll.accepted ? t.swAccepted : t.swRejected}
          </span>
          <span style={{ flex: 1, height: 1, background: 'oklch(90% 0.006 260)' }} />
        </div>

        <VoteBand totals={poll.totals} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 20px', marginTop: 8, fontSize: 12.5 }}>
          <span><b style={{ fontWeight: 600 }}>{poll.totals.yes}</b> {t.swColYes}</span>
          <span><b style={{ fontWeight: 600 }}>{poll.totals.no}</b> {t.swColNo}</span>
          <span style={{ color: MUTED }}><b style={{ fontWeight: 600 }}>{poll.totals.abstain}</b> {t.swColAbstain}</span>
          <span style={{ color: MUTED }}><b style={{ fontWeight: 600 }}>{poll.totals.noShow}</b> {t.swColNoShow}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 10px', marginTop: 12, alignItems: 'center' }}>
          {poll.divergingCount > 0 && chip('oklch(95% 0.04 40)', 'oklch(45% 0.15 40)', fillStr(t.swPollDivergence, { n: poll.divergingCount }), 600)}
          {poll.lobbyingOrgCount > 0
            ? chip('oklch(95% 0.006 260)', 'oklch(42% 0.02 260)', fillStr(t.swPollLobbying, { n: poll.lobbyingOrgCount }))
            : <span style={{ fontSize: 11.5, color: FAINT }}>{t.swLobbyingNoneLong}</span>}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            style={{ font: 'inherit', fontSize: 11.5, fontWeight: 600, background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', padding: '3px 0', marginLeft: 'auto' }}
          >
            {open ? `${t.swCollapse} ↑` : `${t.swBreakDown} ↓`}
          </button>
        </div>

        {open && (
          <div style={{ marginTop: 16, background: 'oklch(97.5% 0.006 260)', border: HAIR, borderRadius: 12 }}>
            <div className="sw-poll-panel">
              <div style={{ padding: '16px 20px 14px' }}>
                <div style={{ ...RUBRIK, fontSize: 11, color: MUTED, marginBottom: 12 }}>{t.swByFraction}</div>
                {poll.partyBreakdown.map((pb) => (
                  <FractionRow key={pb.party} pb={pb} fmt={fmt} />
                ))}
                <div style={{ fontSize: 11, color: FAINT, marginTop: 10 }}>{t.swVoteOrder}</div>
              </div>
              <div style={{ padding: '16px 20px 14px', borderLeft: HAIR }}>
                <div style={{ ...RUBRIK, fontSize: 11, color: MUTED, marginBottom: 12 }}>
                  {poll.lobbyingOrgCount > 0 ? fillStr(t.swLobbyingOf, { shown: poll.lobbyingOrgs.length, total: poll.lobbyingOrgCount }) : t.swLobbyingLabel}
                </div>
                {poll.lobbyingOrgs.length > 0 ? (
                  poll.lobbyingOrgs.map((o) => (
                    <div key={o.id} style={{ padding: '8px 0', borderBottom: HAIR, fontSize: 13, lineHeight: 1.4 }}>
                      <a href={orgHref(o.id)} onClick={stop(() => onOpenOrg(o.id))} style={{ color: 'inherit' }}>
                        {o.name}
                      </a>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12.5, color: FAINT, lineHeight: 1.5 }}>{t.swLobbyingNoneLong}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16, alignItems: 'flex-start', fontSize: 12.5, fontWeight: 600 }}>
                  {poll.lobbyingOrgCount > poll.lobbyingOrgs.length && (
                    <a href={billHref(poll.id)} onClick={stop(() => onOpenBill(poll.id))}>
                      {fillStr(t.swAllOrgs, { n: poll.lobbyingOrgCount })} →
                    </a>
                  )}
                  <a href={billHref(poll.id)} onClick={stop(() => onOpenBill(poll.id))}>
                    {t.swToBillPage}: {poll.title} →
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function FractionRow({ pb, fmt }: { pb: StoryPartyTally; fmt: Fmt }) {
  const seats = pb.yes + pb.no + pb.abstain + pb.noShow || 1;
  const seg = (n: number, c: string) => (n > 0 ? <span style={{ width: `${(n / seats) * 100}%`, background: c }} /> : null);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: HAIR }}>
      <i style={{ width: 9, height: 9, borderRadius: '50%', background: partyColor(pb.party), display: 'block', flex: 'none' }} />
      <span style={{ fontSize: 12.5, fontWeight: 600, width: 84, flex: 'none' }}>{pb.party}</span>
      <span style={{ display: 'flex', flex: 1, minWidth: 40, ...track(9, 3) }}>
        {seg(pb.yes, VOTE_YES)}
        {seg(pb.no, VOTE_NO)}
        {seg(pb.abstain, VOTE_ABSTAIN)}
      </span>
      <span style={{ fontSize: 11.5, color: MUTED, width: 96, textAlign: 'right', flex: 'none' }}>
        {fmt.int(pb.yes)}&thinsp;/&thinsp;{fmt.int(pb.no)}&thinsp;/&thinsp;{fmt.int(pb.abstain)}&thinsp;/&thinsp;{fmt.int(pb.noShow)}
      </span>
    </div>
  );
}

// ── Section II — cohesion lollipop ─────────────────────────────────────────────────────────

function Lollipop({ rows, t, fmt }: { rows: StoryIssue['cohesionAll']; t: Translation; fmt: Fmt }) {
  const pcts = rows.map((r) => r.pct);
  const min = Math.min(...pcts);
  const max = Math.max(...pcts);
  let lo = Math.max(90, Math.floor(min));
  if (lo >= 100) lo = 99;
  const span = 100 - lo;
  const mid = lo + span / 2;
  const pos = (p: number) => `${((p - lo) / span) * 100}%`;
  const LGUT = 92;
  const RGUT = 56;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED, padding: `0 ${RGUT}px 4px ${LGUT}px` }}>
        <span>{fmt.pct(lo)}&thinsp;%</span>
        <span>{fmt.pct(mid)}&thinsp;%</span>
        <span>100&thinsp;%</span>
      </div>
      <div style={{ position: 'relative', padding: `0 ${RGUT}px 0 ${LGUT}px` }}>
        <div style={{ position: 'absolute', left: LGUT, right: RGUT, top: 0, bottom: 0 }}>
          <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, background: 'oklch(88% 0.006 260)' }} />
          <span style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'oklch(93% 0.006 260)' }} />
          <span style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, background: 'oklch(88% 0.006 260)' }} />
        </div>
        {rows.map((r) => {
          const c = partyColor(r.party);
          return (
            <div key={r.party} style={{ position: 'relative', height: 32 }}>
              <span style={{ position: 'absolute', left: -LGUT, top: 9, fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                <i style={{ width: 9, height: 9, borderRadius: '50%', background: c, display: 'block' }} />
                {r.party}
              </span>
              <span style={{ position: 'absolute', left: 0, width: pos(r.pct), top: 15, height: 2, borderRadius: 2, background: c }} />
              <span style={{ position: 'absolute', left: pos(r.pct), top: 9, width: 13, height: 13, borderRadius: '50%', background: c, marginLeft: -6.5 }} />
              <span style={{ position: 'absolute', right: -RGUT, top: 9, fontSize: 12.5, fontWeight: 600, width: 48, textAlign: 'right' }}>{fmt.pct(r.pct)}&thinsp;%</span>
            </div>
          );
        })}
      </div>
      <div style={{ padding: `0 ${RGUT}px 0 ${LGUT}px` }}>
        <div style={{ height: 1, background: 'oklch(88% 0.006 260)' }} />
        <div style={{ fontSize: 11, color: FAINT, marginTop: 8, lineHeight: 1.45 }}>
          {fillStr(t.swCohesionAxisNote, { lo: fmt.pct(lo), spread: fmt.pct(Math.round((max - min) * 10) / 10) })}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        {rows.map((r) => (
          <div key={r.party} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11.5, color: MUTED, padding: '6px 0', borderBottom: HAIR }}>
            <span>{r.party}</span>
            <span>
              {fmt.int(r.withMajority)}&thinsp;/&thinsp;{fmt.int(r.cast)} {t.swCohesionRatioLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section III — absence bars ─────────────────────────────────────────────────────────────

function AbsenceChart({ rows, t, fmt }: { rows: StoryIssue['absence']['byParty']; t: Translation; fmt: Fmt }) {
  const scaleMax = Math.max(70, ...rows.map((r) => r.noShow));
  return (
    <div style={{ marginTop: 24 }}>
      {rows.map((r) => (
        <div key={r.party} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 5, borderBottom: HAIR }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{r.party}</span>
            <span style={{ ...DISPLAY, fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{fmt.int(r.noShow)}</span>
          </div>
          <div style={{ ...track(14), marginTop: 6 }}>
            <div style={{ width: `${(r.noShow / scaleMax) * 100}%`, height: '100%', background: partyColor(r.party) }} />
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11, color: FAINT, lineHeight: 1.45 }}>{fillStr(t.swAbsenceScaleNote, { max: scaleMax })}</div>
    </div>
  );
}

// ── Section IV — donations ─────────────────────────────────────────────────────────────────

const DONATION_PREVIEW = 5;

function Donations({ issue, t, fmt, partyDonationsHref, onOpenPartyDonations, isPartyRoutable, stop }: DetailPageProps & { fmt: Fmt }) {
  const [showAll, setShowAll] = useState(false);
  const all = issue.donations.all;
  if (all.length === 0) return <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>{t.swMoneyNone}</p>;
  const shown = showAll ? all : all.slice(0, DONATION_PREVIEW);

  return (
    <div>
      {shown.map((d, i) => {
        const markers: { text: string; accent?: boolean }[] = [];
        if (d.largestSince?.allTime) markers.push({ text: t.swMarkerRecord.replace('{party}', d.largestSince.party), accent: true });
        else if (d.largestSince && d.largestSince.months != null)
          markers.push({ text: t.swMarkerSince.replace('{months}', String(d.largestSince.months)).replace('{party}', d.largestSince.party), accent: true });
        if (d.alsoGivesToParties.length) markers.push({ text: t.swAlsoGives.replace('{parties}', d.alsoGivesToParties.join(', ')) });

        const inner = (
          <>
            <span style={{ ...DISPLAY, fontWeight: 800, fontSize: 19, lineHeight: 1.2, width: 108, flex: 'none', whiteSpace: 'nowrap' }}>{formatEuro(d.amountEuro)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600 }}>
                <i style={{ width: 10, height: 10, borderRadius: '50%', background: partyColor(d.fraction), display: 'block', flex: 'none' }} />
                <span style={{ color: 'inherit' }}>{d.party}</span>
              </div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 1.4 }}>
                {d.donor ?? t.swDonorUnknown}
                {d.donorCity ? ` · ${d.donorCity}` : ''}
                {d.receivedOn && d.publishedOn ? ` · ${t.swDonationDates.replace('{received}', fmt.day(d.receivedOn)).replace('{published}', fmt.day(d.publishedOn))}` : ''}
              </div>
              {markers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                  {markers.map((m, mi) => (
                    <span
                      key={mi}
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 9,
                        background: m.accent ? 'oklch(95% 0.03 265)' : 'oklch(95% 0.006 260)',
                        color: m.accent ? 'oklch(38% 0.09 265)' : 'oklch(42% 0.02 260)',
                      }}
                    >
                      {m.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        );
        const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderTop: HAIR };
        return isPartyRoutable(d.fraction) ? (
          <a key={i} href={partyDonationsHref(d.fraction)} onClick={stop(() => onOpenPartyDonations(d.fraction))} style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}>
            {inner}
          </a>
        ) : (
          <div key={i} style={rowStyle}>
            {inner}
          </div>
        );
      })}
      {all.length > DONATION_PREVIEW && (
        <div style={{ paddingTop: 14 }}>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            style={{ font: 'inherit', fontSize: 12.5, fontWeight: 600, background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', padding: 0 }}
          >
            {showAll ? `${t.swShowFewerDonations} ↑` : `${fillStr(t.swShowAllDonations, { n: all.length })} ↓`}
          </button>
        </div>
      )}
    </div>
  );
}

function Jahresstand({ issue, t, fmt }: DetailPageProps & { fmt: Fmt }) {
  const rows = issue.donationYearToDate;
  const max = Math.max(...rows.map((r) => r.sumEuro), 1);
  const year = rows[0].year;
  return (
    <div>
      <div style={{ ...RUBRIK, fontSize: 11, color: MUTED, paddingBottom: 9, borderBottom: RULE }}>{fillStr(t.swYtdLabel, { year })}</div>
      <div style={{ paddingTop: 13 }}>
        {rows.map((r) => (
          <div key={r.fraction}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600 }}>
              <span>{r.fraction}</span>
              <span style={{ color: MUTED, fontWeight: 400 }}>{formatEuro(r.sumEuro)} · {fmt.int(r.count)}</span>
            </div>
            <div style={{ ...track(8), margin: '5px 0 14px' }}>
              <div style={{ width: `${(r.sumEuro / max) * 100}%`, height: '100%', background: partyColor(r.fraction) }} />
            </div>
          </div>
        ))}
        <div style={{ fontSize: 11, color: FAINT, lineHeight: 1.45 }}>{t.swYtdScaleNote}</div>
      </div>
    </div>
  );
}
