import { useState, type MouseEvent } from 'react';
import type { Lang, Translation } from './data';
import { fuzzyMatch } from './format';
import { hearingsForDrucksachen, statementsByOrg, type Hearing, type HearingsFile, type StatementRef } from './hearings';
import { drucksacheUrl } from './lobby';
import { ShowMoreButton } from './ShowMoreButton';

/** Same threshold as the lobbying list on the bill page: a search box over a short list is clutter. */
const SEARCH_FROM = 10;

/** Hearing lists open five rows at a time; the shared control offers ten more or all. */
const FIRST_ROWS = 5;

const tagStyle = { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' as const };

function formatHearingDate(iso: string, lang: Lang): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const linkColor = 'oklch(48% 0.12 250)';
const keepClickLocal = (e: MouseEvent) => e.stopPropagation();

/**
 * One statement, as a line on an organisation's card: which hearing, when, on which Drucksache,
 * and the PDF. The Drucksache is always named, because a vote's Drucksachen can carry measures
 * the hearing never discussed (see the scope note on the hearing card).
 */
export function StatementLine({ refs, t, lang }: { refs: StatementRef[]; t: Translation; lang: Lang }) {
  return (
    <div onClick={keepClickLocal} style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {refs.map(({ hearing, statement, shared }) => (
        <div key={statement.url} style={{ fontSize: 12.5, color: 'oklch(38% 0.08 60)', background: 'oklch(97% 0.025 70)', borderRadius: 8, padding: '6px 10px', lineHeight: 1.45 }}>
          <span aria-hidden="true">✎ </span>
          {hearing.date ? t.statementLineTemplate.replace('{date}', formatHearingDate(hearing.date, lang)) : t.statementLineNoDate}{' '}
          <span style={{ color: 'oklch(50% 0.02 60)' }}>
            ({[hearing.committee, t.drucksacheShortTemplate.replace('{numbers}', shared.join(', '))].filter(Boolean).join(' · ')})
          </span>
          {' · '}
          <a href={statement.url} target="_blank" rel="noreferrer" style={{ color: linkColor, fontWeight: 600 }}>PDF</a>
        </div>
      ))}
    </div>
  );
}

/**
 * The hearings behind one vote, as context. Organisations already listed as registered lobbyists
 * on this vote carry their statement on their own card above; this section names everyone else
 * compactly, in the Bundestag's own spelling.
 *
 * Renders nothing when no hearing shares a Drucksache with the vote — some committees publish
 * hearings without naming the Drucksache, so an absent match is not an absent hearing.
 */
export function PollHearings({
  file,
  drucksachen,
  shownOrgIds,
  orgHref,
  onOpenOrg,
  t,
  lang,
}: {
  file: HearingsFile;
  drucksachen: string[];
  /** Register ids whose statements already appear on a lobbying card above. */
  shownOrgIds: Set<string>;
  orgHref: (id: string) => string;
  onOpenOrg: (id: string) => void;
  t: Translation;
  lang: Lang;
}) {
  const matches = hearingsForDrucksachen(file, drucksachen);
  if (matches.length === 0) return null;
  return (
    <section style={{ margin: '28px 0 24px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{t.pollHearingsTitle}</div>
      <p style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)', margin: '0 0 12px', maxWidth: 680 }}>{t.pollHearingsSub}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {matches.map(({ hearing, shared }) => (
          <HearingCard key={hearing.id} hearing={hearing} shared={shared} shownOrgIds={shownOrgIds} orgHref={orgHref} onOpenOrg={onOpenOrg} t={t} lang={lang} />
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', margin: '10px 0 0', maxWidth: 680, lineHeight: 1.5 }}>{t.hearingMethodNote}</p>
    </section>
  );
}

function HearingCard({
  hearing,
  shared,
  shownOrgIds,
  orgHref,
  onOpenOrg,
  t,
  lang,
}: {
  hearing: Hearing;
  shared: string[];
  shownOrgIds: Set<string>;
  orgHref: (id: string) => string;
  onOpenOrg: (id: string) => void;
  t: Translation;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(FIRST_ROWS);
  const shownAbove = hearing.statements.filter((s) => s.orgId && shownOrgIds.has(s.orgId));
  // The complete record, in the Bundestag's order, one row per author: some submit twice (a
  // statement and a supplement), and each document keeps its own link.
  const rows: { author: string; orgId?: string; urls: string[] }[] = [];
  for (const s of hearing.statements) {
    const same = rows.find((r) => r.author === s.author);
    if (same) same.urls.push(s.url);
    else rows.push({ author: s.author, orgId: s.orgId, urls: [s.url] });
  }
  const openOrgLink = (id: string) => (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpenOrg(id);
  };
  const searchable = rows.length > SEARCH_FROM;
  const matching = searchable ? rows.filter((r) => fuzzyMatch(query, r.author)) : rows;
  const visible = matching.slice(0, shown);
  const meta = [
    hearing.committee ? t.hearingCommitteeTemplate.replace('{committee}', hearing.committee) : null,
    hearing.date ? formatHearingDate(hearing.date, lang) : null,
    t.hearingSharedTemplate.replace('{numbers}', shared.join(', ')),
  ].filter(Boolean);

  const total = hearing.statements.length;
  const summary =
    total === 0
      ? t.hearingNoStatements
      : shownAbove.length > 0
        ? t.hearingCountShownAboveTemplate.replace('{n}', String(total)).replace('{k}', String(shownAbove.length))
        : t.hearingCountTemplate.replace('{n}', String(total));

  return (
    <div style={{ background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 12, padding: '14px 16px' }}>
      <a href={hearing.url} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 700, color: 'inherit', textDecoration: 'none' }}>
        {hearing.title}
      </a>
      <div style={{ fontSize: 12, color: 'oklch(50% 0.01 260)', marginTop: 3 }}>{meta.join(' · ')}</div>
      {/* Always shown, not detected: committees routinely amend a bill after hearing it, and
          sometimes graft an unrelated measure onto it (the 2026 Tankrabatt was added to an
          insurance-supervision bill whose hearing never discussed fuel). The shared Drucksache
          cannot tell those cases apart, so every card says what the hearing did cover. */}
      <p style={{ fontSize: 12, color: 'oklch(45% 0.05 60)', background: 'oklch(97% 0.02 70)', borderRadius: 8, padding: '6px 10px', margin: '8px 0 0', lineHeight: 1.45 }}>
        {hearing.date ? t.hearingScopeTemplate.replace('{date}', formatHearingDate(hearing.date, lang)) : t.hearingScopeNoDate}
      </p>

      <p style={{ fontSize: 12.5, color: 'oklch(42% 0.01 260)', margin: '10px 0 0' }}>{summary}</p>
      {rows.length > 0 && (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{ marginTop: 8, padding: '6px 14px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 20, background: 'white', fontSize: 12.5, fontWeight: 700, color: 'oklch(45% 0.16 265)', cursor: 'pointer' }}
        >
          {open ? t.hearingHideStatements : t.hearingShowStatementsTemplate.replace('{n}', String(total))} {open ? '▴' : '▾'}
        </button>
      )}
      {open && (
        <div style={{ marginTop: 10 }}>
          {searchable && (
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(FIRST_ROWS);
              }}
              placeholder={t.hearingSearchPlaceholder}
              style={{ display: 'block', width: '100%', maxWidth: 340, padding: '7px 10px', border: '1px solid oklch(85% 0.006 260)', borderRadius: 9, fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }}
            />
          )}
          {visible.length === 0 ? (
            <p style={{ fontSize: 13, color: 'oklch(48% 0.01 260)', margin: '4px 0' }}>{t.searchNoResults}</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {visible.map((r) => (
                <li key={r.urls[0]} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 8px', fontSize: 13, padding: '7px 0', borderTop: '1px solid oklch(95% 0.004 260)' }}>
                  {/* The name is the Bundestag's spelling. A register match links to the
                      organisation's page; everyone else is plain text — no claim either way. */}
                  {r.orgId ? (
                    <a href={orgHref(r.orgId)} onClick={openOrgLink(r.orgId)} title={t.hearingRegisterTag} style={{ fontWeight: 600, color: 'inherit' }}>
                      {r.author}
                    </a>
                  ) : (
                    <span>{r.author}</span>
                  )}
                  {r.orgId && shownOrgIds.has(r.orgId) ? (
                    <span style={{ ...tagStyle, background: 'oklch(93% 0.06 60)', color: 'oklch(40% 0.12 60)' }}>{t.hearingAlsoLobbiedTag}</span>
                  ) : r.orgId ? (
                    <span style={{ ...tagStyle, background: 'oklch(94% 0.03 250)', color: 'oklch(42% 0.1 250)' }}>{t.hearingRegisterShort}</span>
                  ) : null}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {r.urls.map((url, n) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: linkColor }}>
                        {r.urls.length > 1 ? `PDF ${n + 1}` : 'PDF'}
                      </a>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ShowMoreButton shown={shown} total={matching.length} initial={FIRST_ROWS} onChange={setShown} t={t} lang={lang} />
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12, fontSize: 12.5, fontWeight: 600 }}>
        <a href={hearing.url} target="_blank" rel="noreferrer" style={{ color: linkColor }}>{t.hearingSourceLink} →</a>
        {hearing.expertListUrl && (
          <a href={hearing.expertListUrl} target="_blank" rel="noreferrer" style={{ color: linkColor }}>{t.hearingExpertList}</a>
        )}
      </div>
    </div>
  );
}

/**
 * An organisation's hearing statements that did not already appear on one of its lobbied-vote
 * cards. Most of an organisation's statements land here: in the 2026-10 data only about a fifth
 * of register-linked statements concern a Drucksache the organisation's own register entry
 * names. Nothing is rendered when there are none — an unmatched spelling is the likelier reason
 * than an organisation that never commented.
 */
export function OrgHearings({
  file,
  orgId,
  attachedUrls,
  polls,
  billHref,
  onOpenBill,
  t,
  lang,
}: {
  file: HearingsFile;
  orgId: string;
  attachedUrls: Set<string>;
  /** The site's own votes. A hearing whose Drucksache one of them carries links to that vote's page. */
  polls: { id: number; title: string; drucksachen: string[] }[];
  billHref: (pollId: number) => string;
  onOpenBill: (pollId: number) => void;
  t: Translation;
  lang: Lang;
}) {
  const [shown, setShown] = useState(FIRST_ROWS);
  const rows = statementsByOrg(file, orgId).filter((r) => !attachedUrls.has(r.statement.url));
  if (rows.length === 0) return null;
  const openBill = (id: number) => (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpenBill(id);
  };
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{attachedUrls.size > 0 ? t.orgMoreHearingsTitle : t.orgHearingsTitle}</h2>
      <p style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)', margin: '0 0 10px', maxWidth: 680 }}>{t.orgHearingsSub}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.slice(0, shown).map(({ hearing, statement }) => {
          // Only roll-call votes have a page here; most bills pass by show of hands, so most
          // hearings have no vote to link to and say so by linking out instead.
          const votes = polls.filter((p) => p.drucksachen.some((d) => hearing.drucksachen.includes(d)));
          return (
            <li key={statement.url} style={{ fontSize: 13, padding: '8px 0', borderTop: '1px solid oklch(93% 0.004 260)' }}>
              <a href={hearing.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'inherit' }}>
                {hearing.title} <span aria-hidden="true" style={{ color: linkColor }}>↗</span>
              </a>
              <div style={{ fontSize: 12, color: 'oklch(50% 0.01 260)', marginTop: 2 }}>
                {[hearing.date ? formatHearingDate(hearing.date, lang) : null, hearing.committee ? t.hearingCommitteeTemplate.replace('{committee}', hearing.committee) : null]
                  .filter(Boolean)
                  .join(' · ')}
                {hearing.drucksachen.map((d) => {
                  const url = drucksacheUrl(d);
                  return (
                    <span key={d}>
                      {' · '}
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" style={{ color: linkColor }}>
                          {t.drucksacheShortTemplate.replace('{numbers}', d)}
                        </a>
                      ) : (
                        t.drucksacheShortTemplate.replace('{numbers}', d)
                      )}
                    </span>
                  );
                })}
                {' · '}
                <a href={statement.url} target="_blank" rel="noreferrer" style={{ color: linkColor, fontWeight: 600 }}>{t.hearingStatementPdf}</a>
              </div>
              {votes.map((v) => (
                <a key={v.id} href={billHref(v.id)} onClick={openBill(v.id)} style={{ display: 'inline-block', marginTop: 4, fontSize: 12.5, fontWeight: 700, color: linkColor }}>
                  {t.hearingVoteLinkTemplate.replace('{title}', v.title)} →
                </a>
              ))}
            </li>
          );
        })}
      </ul>
      <ShowMoreButton shown={shown} total={rows.length} initial={FIRST_ROWS} onChange={setShown} t={t} lang={lang} />
    </section>
  );
}
