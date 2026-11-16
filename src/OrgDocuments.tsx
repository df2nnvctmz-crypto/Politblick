import { useEffect, useState } from 'react';
import type { Lang } from './data';
import { fetchLocalJson } from './snapshot';

// FragDenStaat documents that name an organisation (hand-checked matches, see recherche/fragdenstaat-test).
type Mention = {
  docId: number;
  title: string;
  authority: string;
  year: number | null;
  page: number;
  url: string;
  snippetBefore?: string;
  match?: string;
  snippetAfter?: string;
  indirect: boolean;
  group?: boolean;
  checkedAt: string;
};
type MentionsFile = { generatedAt: string; orgs: Record<string, Mention[]> };

let filePromise: Promise<MentionsFile | null> | null = null;
const loadMentions = () => (filePromise ??= fetchLocalJson<MentionsFile>('/data/fds-mentions.json').catch(() => null));

const INITIAL = 3;
const TEXT = {
  de: {
    title: 'In Behördendokumenten erwähnt',
    note: 'Dokumente, die über Informationsfreiheitsanfragen öffentlich wurden und diese Organisation namentlich nennen.',
    page: 'Seite',
    indirect: 'indirekt erwähnt',
    group: 'Unternehmensgruppe',
    open: 'Dokument auf FragDenStaat ansehen',
    more: (n: number) => `${n} weitere Dokumente anzeigen`,
    less: 'Weniger anzeigen',
    footer: (d: string) => `Quelle: FragDenStaat. Eine Erwähnung bedeutet nicht, dass die Organisation beteiligt war oder Fehlverhalten vorliegt. Treffer geprüft am ${d}.`,
  },
  en: {
    title: 'Mentioned in government documents',
    note: 'Documents released through freedom-of-information requests that name this organisation.',
    page: 'page',
    indirect: 'mentioned indirectly',
    group: 'company group',
    open: 'View document on FragDenStaat',
    more: (n: number) => `Show ${n} more documents`,
    less: 'Show less',
    footer: (d: string) => `Source: FragDenStaat. A mention does not mean the organisation was involved or did anything wrong. Matches checked on ${d}.`,
  },
};

const badge = { fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'oklch(96% 0.04 60)', color: 'oklch(42% 0.09 60)' } as const;

export function OrgDocuments({ orgId, lang }: { orgId: string; lang: Lang }) {
  const [file, setFile] = useState<MentionsFile | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let alive = true;
    loadMentions().then((f) => alive && setFile(f));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => setExpanded(false), [orgId]);

  const mentions = file?.orgs[orgId];
  if (!mentions || mentions.length === 0) return null;
  const tx = TEXT[lang];
  // Direct mentions first, then newest first.
  const sorted = [...mentions].sort((a, b) => Number(a.indirect || a.group) - Number(b.indirect || b.group) || (b.year ?? 0) - (a.year ?? 0));
  const shown = expanded ? sorted : sorted.slice(0, INITIAL);
  const checked = new Date(mentions[0].checkedAt).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB');

  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>
        {tx.title} <span style={{ fontWeight: 400, color: 'oklch(48% 0.01 260)' }}>({mentions.length})</span>
      </h2>
      <p style={{ fontSize: 12.5, color: 'oklch(48% 0.01 260)', margin: '0 0 10px', maxWidth: 720 }}>{tx.note}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
        {shown.map((m) => (
          <div key={m.docId} style={{ background: 'white', border: '1px solid oklch(90% 0.006 260)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{m.title}</span>
              {m.indirect && <span style={badge}>{tx.indirect}</span>}
              {m.group && <span style={badge}>{tx.group}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'oklch(48% 0.01 260)', margin: '3px 0 8px' }}>
              {[m.authority, m.year, `${tx.page} ${m.page}`].filter(Boolean).join(' · ')}
            </div>
            {m.match && (
              <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'oklch(40% 0.01 260)', borderLeft: '2px solid oklch(88% 0.006 260)', paddingLeft: 10, marginBottom: 8 }}>
                „{m.snippetBefore}
                <mark style={{ background: 'oklch(93% 0.09 95)', color: 'inherit', padding: '0 2px', borderRadius: 3 }}>{m.match}</mark>
                {m.snippetAfter}“
              </div>
            )}
            <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: 'oklch(48% 0.12 250)' }}>
              {tx.open} ↗
            </a>
          </div>
        ))}
      </div>
      {sorted.length > INITIAL && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ padding: 0, border: 'none', background: 'none', fontSize: 12.5, fontWeight: 700, color: 'oklch(45% 0.16 265)', cursor: 'pointer', marginBottom: 10 }}
        >
          {expanded ? tx.less : tx.more(sorted.length - INITIAL)}
        </button>
      )}
      <p style={{ fontSize: 11.5, color: 'oklch(55% 0.01 260)', margin: 0, maxWidth: 720 }}>{tx.footer(checked)}</p>
    </section>
  );
}
