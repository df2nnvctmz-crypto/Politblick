/**
 * The profile's "Langzeit-Bilanz" — a member's divergence record across the archived,
 * completed terms (2005-2025), always shown next to their own fraction's average on the
 * same votes, because neither number means anything alone.
 */

import type { ReactNode } from 'react';
import type { Translation } from '../data';
import { InfoTooltip } from '../ui/primitives';
import type { DivergenceKind, HistoricAlignment, HistoricDivergence } from '../voteHistory';

/**
 * The long-run voting record, as one card. Rendered on both the overview and the votes tab, so
 * it lives here rather than being written twice — two copies of a card that makes a factual
 * claim about a named person is exactly the sort of thing that drifts apart unnoticed.
 *
 * `footer` is what differs between the two placements: a link across to the votes tab on the
 * overview, an expand toggle plus the vote-by-vote list on the votes tab itself.
 */
export function LongTermRecordCard({
  history,
  t,
  formatPct,
  activeKind,
  activeTopic,
  onSelectKind,
  onSelectTopic,
  footer,
}: {
  history: HistoricAlignment;
  t: Translation;
  formatPct: (value: number) => string;
  /** The kind/topic currently narrowing the detail list, so the chip can show as pressed. */
  activeKind?: DivergenceKind | null;
  activeTopic?: string | null;
  onSelectKind?: (kind: DivergenceKind) => void;
  onSelectTopic?: (topic: string) => void;
  footer?: ReactNode;
}) {
  if (history.error) return null;
  return (
    <div style={{ background: 'oklch(97% 0.006 260)', border: '1px solid oklch(90% 0.008 260)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(30% 0.01 260)', marginBottom: 4 }}>
        {t.historyHeading}
        <InfoTooltip text={t.historyInfo} />
      </div>
      {history.loading ? (
        <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>{t.historyLoading}</div>
      ) : history.ratedCount === 0 ? (
        // Said out loud rather than left blank: 37% of members are in their first term, and an
        // empty space here reads as "nothing to report about their loyalty" instead of "no
        // earlier term exists to measure".
        <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>{t.historyNone}</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'oklch(32% 0.01 260)', marginBottom: 4 }}>
            {t.historyBaseRate
              .replace('{count}', String(history.divergenceCount))
              .replace('{total}', String(history.ratedCount))
              .replace('{pct}', history.alignmentPct == null ? '—' : formatPct(history.alignmentPct))}
          </div>
          {history.fractionAlignmentPct != null && (
            <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginBottom: 8 }}>
              {t.historyFractionAverage.replace('{pct}', formatPct(history.fractionAlignmentPct))}
            </div>
          )}
          {/* An abstention is not a vote against. Splitting the total keeps the headline number
              from reading as more dissent than actually occurred — across the archive nearly four
              in ten divergences are not opposition. */}
          {history.divergenceCount > 0 && (
            <div style={{ fontSize: 12, color: 'oklch(38% 0.01 260)', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {([
                ['opposed', history.opposedCount, t.historyKindOpposed, t.historyKindOpposedOne],
                ['abstained', history.abstainedCount, t.historyKindAbstained, t.historyKindAbstainedOne],
                ['brokeAbstention', history.brokeAbstentionCount, t.historyKindBrokeAbstention, t.historyKindBrokeAbstentionOne],
              ] as [DivergenceKind, number, string, string][])
                .filter(([, n]) => n > 0)
                .map(([kind, n, plural, singular]) => {
                  const active = activeKind === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={onSelectKind ? () => onSelectKind(kind) : undefined}
                      aria-pressed={active}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 12,
                        fontFamily: 'inherit',
                        cursor: onSelectKind ? 'pointer' : 'default',
                        background: active ? 'oklch(30% 0.01 260)' : 'white',
                        color: active ? 'white' : 'oklch(38% 0.01 260)',
                        border: `1px solid ${active ? 'oklch(30% 0.01 260)' : 'oklch(90% 0.006 260)'}`,
                      }}
                    >
                      {n} {n === 1 ? singular : plural}
                    </button>
                  );
                })}
              <InfoTooltip text={t.historyKindSplitInfo} />
            </div>
          )}
          <div style={{ fontSize: 11.5, color: 'oklch(48% 0.01 260)', marginBottom: history.topTopics.length > 0 ? 10 : 0 }}>
            {history.terms
              .map((term) =>
                t.historyTermTemplate
                  .replace('{label}', term.label)
                  .replace('{count}', String(term.divergenceCount))
                  .replace('{total}', String(term.ratedCount)),
              )
              .join(' · ')}
          </div>
          {history.topTopics.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(38% 0.01 260)', marginBottom: 6 }}>{t.historyTopicsLabel}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {history.topTopics.slice(0, 6).map((topic) => {
                  const active = activeTopic === topic.topic;
                  return (
                    <button
                      key={topic.topic}
                      type="button"
                      onClick={onSelectTopic ? () => onSelectTopic(topic.topic) : undefined}
                      aria-pressed={active}
                      style={{
                        fontSize: 11.5,
                        padding: '3px 9px',
                        borderRadius: 10,
                        fontFamily: 'inherit',
                        cursor: onSelectTopic ? 'pointer' : 'default',
                        background: active ? 'oklch(30% 0.01 260)' : 'white',
                        color: active ? 'white' : 'oklch(38% 0.01 260)',
                        border: `1px solid ${active ? 'oklch(30% 0.01 260)' : 'oklch(90% 0.006 260)'}`,
                      }}
                    >
                      {t.historyTopicTemplate
                        .replace('{topic}', topic.topic)
                        .replace('{count}', String(topic.divergences))
                        .replace('{total}', String(topic.rated))}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {footer}
        </>
      )}
    </div>
  );
}

/** The vote-by-vote detail behind the card: every archived divergence, newest first. */
export function LongTermDivergenceList({ divergences, t }: { divergences: HistoricDivergence[]; t: Translation }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      {divergences.map((d) => {
        const voteLabel = d.vote === 'yes' ? t.voteYes : d.vote === 'no' ? t.voteNo : t.voteAbstain;
        const majorityLabel = d.majority === 'yes' ? t.voteYes : d.majority === 'no' ? t.voteNo : t.voteAbstain;
        // Singular: each row is one vote, not a count.
        const kindLabel =
          d.kind === 'opposed' ? t.historyKindOpposedOne : d.kind === 'abstained' ? t.historyKindAbstainedOne : t.historyKindBrokeAbstentionOne;
        // Only an opposite vote is coloured as dissent; an abstention is a reservation and is
        // deliberately not dressed up as opposition.
        const kindColor = d.kind === 'opposed' ? 'oklch(48% 0.16 40)' : 'oklch(50% 0.01 260)';
        return (
          <a
            key={`${d.pollId}-${d.date}`}
            href={d.url}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: 'none', color: 'inherit', background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</span>
              <span style={{ fontSize: 11.5, color: kindColor, fontWeight: 700, whiteSpace: 'nowrap' }}>{kindLabel}</span>
            </div>
            <div style={{ fontSize: 12, color: 'oklch(45% 0.01 260)', marginTop: 4 }}>
              {t.historyDetailVoteTemplate.replace('{vote}', voteLabel).replace('{party}', d.party).replace('{majority}', majorityLabel)}
            </div>
            <div style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', marginTop: 3 }}>
              {d.date} · {d.termLabel}
              {d.topics.length > 0 ? ` · ${d.topics.join(', ')}` : ''}
            </div>
          </a>
        );
      })}
    </div>
  );
}
