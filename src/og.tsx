/**
 * The share-preview card (1200 x 630) for a Datenstory, a Sitzungswochen-Briefing, or the site in
 * general. Not a page of the site: og/index.html loads this, and scripts/build-og-images.mjs opens
 * it once per target in a headless browser and screenshots #og-card into dist/og/<name>.png, which
 * the pages name in their og:image / twitter:image tags (App.tsx).
 *
 *   /og/?kind=datenstory&slug=lobby-geld   /og/?kind=briefing&week=2026-10-12   /og/?kind=default
 */
import { createRoot } from 'react-dom/client';
import { useEffect, useState, type ReactNode } from 'react';
import './index.css';
import { MiniBand } from './stories/Briefing';
import { DATENSTORIES } from './datenstories/DatenstoryPage';
import { StoryPreview } from './datenstories/previews';
import type { DatenstoryData } from './datenstories/types';

const MUTED = 'oklch(45% 0.01 260)';
const ACCENT = 'oklch(45% 0.16 265)';
const WARM = 'oklch(58% 0.14 70)';

const params = new URLSearchParams(window.location.search);
const kind = params.get('kind') ?? 'default';

const de = (iso: string) => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));
/** "12.–16. Oktober 2026", or "28. September – 2. Oktober 2026" across a month boundary. */
const rangeDe = (a: string, b: string) => (a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8, 10))}.–${de(b)}` : `${de(a).replace(/ \d{4}$/, '')} – ${de(b)}`);

function Frame({ kicker, title, aside, foot }: { kicker: string; title: ReactNode; aside?: ReactNode; foot: string }) {
  return (
    <div id="og-card" data-og-ready="" style={{ width: 1200, height: 630, boxSizing: 'border-box', background: 'oklch(99% 0.003 260)', padding: '52px 64px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 14, background: ACCENT }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <img src="/favicon.svg" alt="" width={44} height={44} />
        <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.01em' }}>Politblick</span>
      </div>
      <div style={{ display: 'flex', gap: 48, flex: 1, alignItems: 'center', marginTop: 8 }}>
        <div style={{ flex: aside ? '0 0 560px' : 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: ACCENT }}>{kicker}</div>
          <div style={{ fontSize: aside ? 50 : 64, fontWeight: 800, lineHeight: 1.12, margin: '14px 0 0', letterSpacing: '-0.02em', textWrap: 'balance' }}>{title}</div>
        </div>
        {aside && <div style={{ flex: 1 }}>{aside}</div>}
      </div>
      <div style={{ fontSize: 22, color: MUTED }}>{foot}</div>
    </div>
  );
}

function DatenstoryCard({ slug }: { slug: string }) {
  const listing = DATENSTORIES.find((s) => s.slug === slug);
  const [data, setData] = useState<DatenstoryData | null>(null);
  useEffect(() => {
    fetch(`/data/datenstories/${slug}.json`)
      .then((r) => r.json())
      .then(setData);
  }, [slug]);
  if (!listing || !data) return null;
  const kicker = [listing.series?.name ?? listing.kicker, listing.series ? `Teil ${listing.series.part}` : null].filter(Boolean).join(' · ');
  // Slide-style previews carry their own headline: they fill the card like the Reddit slides, the title goes out as og:title.
  if (listing.previewStyle === 'slide') {
    return (
      <div id="og-card" data-og-ready="" style={{ width: 1200, height: 630, boxSizing: 'border-box', background: 'oklch(99% 0.003 260)', padding: '30px 52px 22px 64px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 14, background: ACCENT }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/favicon.svg" alt="" width={34} height={34} />
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em' }}>Politblick</span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: ACCENT }}>{kicker}</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '8px 0' }}>
          <div style={{ height: '100%', aspectRatio: '480 / 230' }}>
            <StoryPreview slug={slug} data={data} />
          </div>
        </div>
        <div style={{ fontSize: 17, color: MUTED, textAlign: 'center' }}>{`Datenstory · politblick.de · ${de(listing.publishedOn)} · Zahlen live aus öffentlichen Daten`}</div>
      </div>
    );
  }
  return (
    <Frame
      kicker={[listing.series?.name ?? listing.kicker, listing.series ? `Teil ${listing.series.part}` : null].filter(Boolean).join(' · ')}
      title={listing.title}
      aside={
        <div style={{ width: '100%', aspectRatio: '480 / 230', border: '1px solid oklch(90% 0.006 260)', borderRadius: 14, overflow: 'hidden', background: 'oklch(97.5% 0.006 260)' }}>
          <StoryPreview slug={slug} data={data} />
        </div>
      }
      foot={`Datenstory · politblick.de · ${de(listing.publishedOn)}`}
    />
  );
}

interface Issue {
  week: string;
  dateRange: { start: string; end: string };
  pollCount: number;
  divergingTotal: number;
  donationCount: number;
  pollTotals: { yes: number; no: number; abstain: number; noShow: number }[];
}

function BriefingCard({ week }: { week: string }) {
  const [issue, setIssue] = useState<Issue | null>(null);
  useEffect(() => {
    fetch('/data/stories.json')
      .then((r) => r.json())
      .then((d: { issues: Issue[] }) => setIssue(d.issues.find((i) => i.week === week) ?? null));
  }, [week]);
  if (!issue) return null;
  const stat = (value: number, label: string) => (
    <div>
      <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 20, color: MUTED, marginTop: 4 }}>{label}</div>
    </div>
  );
  return (
    <Frame
      kicker="Sitzungswochen-Briefing"
      title={rangeDe(issue.dateRange.start, issue.dateRange.end)}
      aside={
        <div>
          <div style={{ display: 'flex', gap: 36, marginBottom: 26 }}>
            {stat(issue.pollCount, issue.pollCount === 1 ? 'Abstimmung' : 'Abstimmungen')}
            {stat(issue.divergingTotal, 'Abweichungen')}
            {stat(issue.donationCount, issue.donationCount === 1 ? 'Großspende' : 'Großspenden')}
          </div>
          <div style={{ display: 'grid', gap: 5, zoom: 1.5, width: 300 }}>
            {issue.pollTotals.slice(0, 8).map((tot, i) => (
              <MiniBand key={i} totals={tot} />
            ))}
          </div>
        </div>
      }
      foot="Jede Woche, was der Bundestag entschieden hat · politblick.de"
    />
  );
}

function DefaultCard() {
  return (
    <Frame
      kicker="Politblick"
      title={
        <>
          Wie haben sie abgestimmt? <span style={{ color: WARM }}>Wer zahlt nebenbei?</span>
        </>
      }
      foot="Abstimmungen, Nebeneinkünfte und Lobbykontakte im Bundestag · politblick.de"
    />
  );
}

function App() {
  if (kind === 'datenstory') return <DatenstoryCard slug={params.get('slug') ?? ''} />;
  if (kind === 'briefing') return <BriefingCard week={params.get('week') ?? ''} />;
  return <DefaultCard />;
}

createRoot(document.getElementById('root')!).render(<App />);
// Text is measured after the fonts are in; the build script waits for this as well as for [data-og-ready].
void document.fonts.ready.then(() => document.documentElement.setAttribute('data-fonts-ready', ''));
