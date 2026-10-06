/**
 * The headline of the Nebentätigkeiten tab — what a member disclosed in total, and how many of
 * their outside activities are paid at all. Shown for every member, including those with no
 * paid activity: "0 €" is a disclosure too, and hiding the card made those profiles look as if
 * the figure were simply missing.
 */

import type { Lang, Translation } from '../data';
import { summarizeSidejobIncome, type SidejobRecord } from '../sidejobs';

export function SidejobTotalCard({ records, t, lang }: { records: SidejobRecord[]; t: Translation; lang: Lang }) {
  const sum = summarizeSidejobIncome(records);
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  const fmt = (n: number) => `${Math.round(n).toLocaleString(locale)} €`;
  // Only spell out the split when both parts exist — "davon 100 %" adds nothing.
  const showSplit = sum.rateAnnualized > 0 && sum.oneOffOrUndated > 0;

  return (
    <div style={{ background: 'oklch(97% 0.012 250)', border: '1px solid oklch(85% 0.04 250)', borderRadius: 12, padding: '18px 20px', marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <div style={labelStyle}>{t.sidejobsTotalLabel}</div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.5, marginTop: 4 }}>{fmt(sum.total)}</div>
          <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>{t.sidejobsTotalGross}</div>
        </div>
        <div>
          <div style={labelStyle}>{t.sidejobsCountLabel}</div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.5, marginTop: 4 }}>{sum.paidCount.toLocaleString(locale)}</div>
          {/* Nothing disclosed at all: the tab's own empty-state text already says so below. */}
          {records.length > 0 && (
            <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)' }}>
              {records.length === 1 ? t.sidejobsCountOfOne : t.sidejobsCountOfTemplate.replace('{n}', records.length.toLocaleString(locale))}
            </div>
          )}
        </div>
      </div>
      {(showSplit || sum.bracketOnlyCount > 0 || (sum.paidCount === 0 && records.length > 0)) && (
        <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', marginTop: 10, lineHeight: 1.55 }}>
          {sum.paidCount === 0 && records.length > 0 && t.sidejobsTotalNone}
          {showSplit && (
            <>
              {t.sidejobsTotalRecurringTemplate.replace('{amount}', fmt(sum.rateAnnualized))}
              {' · '}
              {t.sidejobsTotalOneOffTemplate.replace('{amount}', fmt(sum.oneOffOrUndated))}
              {'. '}
            </>
          )}
          {sum.bracketOnlyCount > 0 && t.sidejobsTotalBracketsTemplate.replace('{n}', String(sum.bracketOnlyCount))}
        </div>
      )}
    </div>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'oklch(45% 0.08 250)' } as const;
