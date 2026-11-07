/**
 * Charts of the "Geld und Einfluss" stories (lobby spending vs. donations, overlap, donors per
 * party, Bitpanda). Plain HTML/SVG fed from public/data/datenstories/{lobby-geld,parteispenden}.json.
 * Everything starts collapsed: rows open their details only when clicked.
 */
import { Fragment, useState, type CSSProperties, type ReactNode } from 'react';
import type { LobbyGeldData, ParteispendenData, SpendRange } from './types';
import { euroRangeLabel, orgA, useNarrow } from './charts';

const MUTED = 'oklch(48% 0.01 260)';
const RULE = '1px solid oklch(92% 0.006 260)';
const LOBBY_C = 'oklch(72% 0.14 75)';
const DONATION_C = 'oklch(45% 0.16 265)';
const INK = 'oklch(25% 0.01 260)';

/** Party colours as in the rest of the site (src/data.ts REAL_PARTY_COLORS); donors' party names come from the donation list. */
const PARTY_C: Record<string, string> = {
  'CDU/CSU': 'oklch(25% 0.01 90)',
  SPD: 'oklch(52% 0.16 25)',
  Grüne: 'oklch(52% 0.1 150)',
  FDP: 'oklch(75% 0.15 100)',
  AfD: 'oklch(55% 0.11 240)',
  Linke: 'oklch(45% 0.15 340)',
  BSW: 'oklch(45% 0.08 290)',
};
export const partyColor = (p: string) => PARTY_C[p] ?? 'oklch(55% 0.01 260)';

const de1 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mioLabel = (euro: number) => (euro >= 1e6 ? `${de1(euro / 1e6)} Mio. €` : `${Math.round(euro / 1e3).toLocaleString('de-DE')} Tsd. €`);
export const euroFull = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;
const range = (r: SpendRange) => (r ? euroRangeLabel(r) : null);

export function PartyChip({ party }: { party: string }) {
  const light = party === 'FDP';
  return (
    <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 4, fontSize: 11.5, fontWeight: 700, background: partyColor(party), color: light ? 'oklch(25% 0.05 90)' : 'white', whiteSpace: 'nowrap' }}>
      {party}
    </span>
  );
}

export const caps: CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: MUTED };

/** A row that opens its details on click (button semantics, collapsed by default). */
export function OpenRow({ head, children }: { head: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: RULE }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ display: 'block', width: '100%', textAlign: 'left', background: open ? 'oklch(97.5% 0.018 265)' : 'transparent', border: 'none', padding: '10px 4px', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span aria-hidden style={{ color: MUTED, fontSize: 12, width: 12, marginTop: 4 }}>
            {open ? '▾' : '▸'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>{head}</div>
        </div>
      </button>
      {open && <div style={{ padding: '0 4px 12px 24px', fontSize: 14 }}>{children}</div>}
    </div>
  );
}

// ---- Lobby spending vs. donations ----------------------------------------------------------------

const LOBBY_PAGE = '/lobby-finanzen/organisationen';
const DONATIONS_PAGE = '/lobby-finanzen/spenden';
const linkStyle: CSSProperties = { color: 'inherit', textDecoration: 'underline', textDecorationColor: 'oklch(80% 0.01 260)', textUnderlineOffset: 2 };

export function SpendDonationsChart({ data, onNavigate }: { data: LobbyGeldData; onNavigate: (path: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const donShare = data.donations.totalEuro / data.spend.totalEuro;
  const maxType = Math.max(...data.spend.byType.map((t) => t.midEuro), 1);
  // Both headline bars are links: the register overview and the donations overview of the site.
  const bigBar = (label: string, sub: string, value: number, width: number, color: string, path: string) =>
    orgA(
      path,
      <>
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px' }}>
          <span style={{ fontSize: 'clamp(24px, 4.2vw, 36px)', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{euroFull(value)}</span>
          <span style={{ fontWeight: 700, fontSize: 15, textDecoration: 'underline', textDecorationColor: 'oklch(80% 0.01 260)', textUnderlineOffset: 3 }}>{label} →</span>
          <span style={{ fontSize: 13, color: MUTED }}>{sub}</span>
        </span>
        <span style={{ display: 'block', height: 14, background: 'oklch(95% 0.004 260)', marginTop: 6, borderRadius: 2 }}>
          <span style={{ display: 'block', width: `${Math.max(width * 100, 0.6)}%`, height: '100%', background: color, borderRadius: 2 }} />
        </span>
      </>,
      onNavigate,
      { display: 'block', marginBottom: 14, color: 'inherit', textDecoration: 'none' },
    );
  return (
    <figure style={{ margin: 0 }} aria-label="Lobbyausgaben und Großspenden im Vergleich">
      {bigBar('gemeldete Lobbyausgaben', 'je Geschäftsjahr', data.spend.totalEuro, 1, LOBBY_C, LOBBY_PAGE)}
      {bigBar(`Großspenden an Parteien seit ${data.donations.firstYear}`, `${data.donations.count} Spenden`, data.donations.totalEuro, donShare, DONATION_C, DONATIONS_PAGE)}
      <div style={{ ...caps, margin: '22px 0 2px' }}>Lobbyausgaben nach Art der Organisation, Zeile öffnen für die größten Melder</div>
      {data.spend.byType.map((t) => (
        <div key={t.label} onMouseEnter={() => setHover(t.label)} onMouseLeave={() => setHover(null)} style={{ opacity: hover && hover !== t.label ? 0.55 : 1, transition: 'opacity 0.1s' }}>
          <OpenRow
            head={
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 14 }}>
                  <span>
                    <strong>{t.label}</strong> <span style={{ color: MUTED, fontSize: 12.5 }}>{t.orgCount.toLocaleString('de-DE')} Melder</span>
                  </span>
                  <span style={{ fontWeight: 700, color: 'oklch(45% 0.1 70)', fontVariantNumeric: 'tabular-nums' }}>{euroFull(t.midEuro)}</span>
                </div>
                <div style={{ height: 8, background: 'oklch(95% 0.004 260)', marginTop: 5, borderRadius: 2 }}>
                  <div style={{ width: `${(t.midEuro / maxType) * 100}%`, height: '100%', background: LOBBY_C, borderRadius: 2 }} />
                </div>
              </>
            }
          >
            <div style={{ display: 'grid', gap: 4, maxWidth: 560 }}>
              {t.top.map((o) => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span>{orgA(o.orgPath, o.name, onNavigate, o.orgPath ? linkStyle : undefined)}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap' }}>{euroFull(o.midEuro)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 13 }}>{orgA(LOBBY_PAGE, 'Alle Organisationen im Lobbyregister →', onNavigate, { color: 'inherit' })}</div>
          </OpenRow>
        </div>
      ))}
    </figure>
  );
}

// ---- Where the two meet --------------------------------------------------------------------------

/** A party chip that leads to the party's donation page where the site has one (sitting fractions). */
function PartyLink({ party, paths, onNavigate }: { party: string; paths: Record<string, string>; onNavigate: (path: string) => void }) {
  return orgA(paths[party] ?? null, <PartyChip party={party} />, onNavigate, { textDecoration: 'none' });
}

export function OverlapChart({ data, onNavigate }: { data: LobbyGeldData; onNavigate: (path: string) => void }) {
  const narrow = useNarrow(760);
  const { topOrgs, donors } = data.overlap;
  const maxMdb = Math.max(...topOrgs.map((o) => o.mdbCount), 1);
  const link = (path: string | null, text: string) => orgA(path, text, onNavigate, path ? { color: 'inherit', fontWeight: 700, textDecoration: 'underline', textDecorationColor: 'oklch(80% 0.01 260)', textUnderlineOffset: 2 } : { fontWeight: 700 });
  return (
    <figure style={{ margin: 0, display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: narrow ? 28 : 36, alignItems: 'start' }}>
      <div>
        <div style={{ ...caps, marginBottom: 6 }}>Organisationen mit den meisten Abgeordneten</div>
        {topOrgs.map((o) => (
          <div key={o.id} style={{ padding: '9px 0', borderTop: RULE }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
              <span style={{ minWidth: 0 }}>{link(o.orgPath, o.name)}</span>
              <span style={{ fontWeight: 800, color: 'oklch(45% 0.1 70)', whiteSpace: 'nowrap' }}>{o.mdbCount} MdB</span>
            </div>
            <div style={{ height: 7, background: 'oklch(95% 0.004 260)', marginTop: 5, borderRadius: 2 }}>
              <div style={{ width: `${(o.mdbCount / maxMdb) * 100}%`, height: '100%', background: LOBBY_C, borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>
      <div>
        <div style={{ ...caps, marginBottom: 6 }}>Spender, die auch im Lobbyregister stehen</div>
        {donors.map((d) => (
          <OpenRow
            key={d.id}
            head={
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                  <span style={{ fontWeight: 700, minWidth: 0 }}>{d.name}</span>
                  <span style={{ fontWeight: 800, color: DONATION_C, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{euroFull(d.donatedEuro)}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                  {d.parties.map((p) => (
                    <PartyChip key={p.party} party={p.party} />
                  ))}
                </div>
              </>
            }
          >
            <div style={{ display: 'grid', gap: 3 }}>
              {d.parties.map((p) => (
                <div key={p.party} style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 320 }}>
                  <PartyLink party={p.party} paths={data.partyPaths} onNavigate={onNavigate} />
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{euroFull(p.euro)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, color: MUTED, fontSize: 13 }}>
              {d.donationCount} {d.donationCount === 1 ? 'Spende' : 'Spenden'} · Lobbybudget im Jahr: {range(d.budget) ?? 'keine Angabe'} · {orgA(d.orgPath, 'politblick-Seite', onNavigate, { color: 'inherit' })}
            </div>
          </OpenRow>
        ))}
      </div>
    </figure>
  );
}

// ---- Donors per party ----------------------------------------------------------------------------

export function PartyBars({ data, onNavigate }: { data: ParteispendenData; onNavigate: (path: string) => void }) {
  const max = Math.max(...data.parties.map((p) => p.sumEuro), 1);
  return (
    <figure style={{ margin: 0 }} aria-label="Großspenden pro Partei">
      <div style={{ ...caps, marginBottom: 6 }}>Großspenden seit {data.firstYear}, Anteil der drei größten Spender</div>
      {data.parties.map((p) => (
        <OpenRow
          key={p.party}
          head={
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span>
                  <PartyChip party={p.party} /> <span style={{ color: MUTED, fontSize: 13, marginLeft: 6 }}>{p.donorCount} Spender</span>
                </span>
                <span style={{ fontWeight: 800, fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{euroFull(p.sumEuro)}</span>
              </div>
              <div style={{ position: 'relative', height: 14, background: 'oklch(95% 0.004 260)', marginTop: 6, borderRadius: 2 }}>
                <div style={{ width: `${(p.sumEuro / max) * 100}%`, height: '100%', background: 'oklch(80% 0.1 75)', borderRadius: 2, position: 'relative' }}>
                  <div style={{ width: `${p.top3Share * 100}%`, height: '100%', background: 'oklch(62% 0.15 60)', borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>
                <strong style={{ color: 'oklch(45% 0.12 60)' }}>{Math.floor(p.top3Share * 100 + 1e-9)} %</strong> von den drei größten Spendern
              </div>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 4 }}>
            {p.topDonors.map((d) => (
              <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, maxWidth: 520 }}>
                <span>{d.orgPath ? orgA(d.orgPath, d.name, onNavigate, { color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }) : d.name}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{euroFull(d.euro)}</span>
              </div>
            ))}
          </div>
          {data.partyPaths[p.party] && <div style={{ marginTop: 8, fontSize: 13 }}>{orgA(data.partyPaths[p.party], `Alle Spenden an ${p.party} auf politblick →`, onNavigate, { color: 'inherit' })}</div>}
        </OpenRow>
      ))}
      {data.others.partyCount > 0 && (
        <div style={{ borderTop: RULE, padding: '10px 4px', fontSize: 13, color: MUTED }}>
          Weitere {data.others.partyCount} Parteien zusammen: {euroFull(data.others.sumEuro)}
        </div>
      )}
    </figure>
  );
}

// ---- Bitpanda ------------------------------------------------------------------------------------

export function BitpandaChart({ data, onNavigate }: { data: ParteispendenData; onNavigate: (path: string) => void }) {
  const bp = data.bitpanda;
  if (!bp) return null;
  const budgetMid = bp.budget ? (bp.budget.from + bp.budget.to) / 2 : 0;
  const budgetShare = bp.totalEuro > 0 ? budgetMid / bp.totalEuro : 0;
  return (
    <figure style={{ margin: 0 }} aria-label="Spenden von Bitpanda an Parteien im Vergleich zum Lobbybudget">
      <div style={{ ...caps, marginBottom: 8 }}>
        Spenden von {orgA(bp.orgPath, bp.name, onNavigate, { color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 })} am {bp.dates.map((d) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}.${d.slice(0, 4)}`).join(', ')}
      </div>
      <div style={{ display: 'flex', height: 46, borderRadius: 3, overflow: 'hidden' }}>
        {bp.parts.map((p) => (
          <Fragment key={p.party}>
            {orgA(
              data.partyPaths[p.party] ?? null,
              <>
                <span>{p.party}</span>
                <span style={{ fontWeight: 500, fontSize: 12 }}>{mioLabel(p.euro)}</span>
              </>,
              onNavigate,
              { width: `${(p.euro / bp.totalEuro) * 100}%`, background: p.color, color: p.party === 'FDP' ? 'oklch(25% 0.05 90)' : 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 10px', fontSize: 13, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', borderRight: '2px solid white', textDecoration: 'none' },
            )}
          </Fragment>
        ))}
      </div>
      <div style={{ fontSize: 13, color: MUTED, margin: '6px 0 20px' }}>
        Zusammen <strong style={{ color: INK }}>{euroFull(bp.totalEuro)}</strong>
      </div>
      <div style={{ ...caps, marginBottom: 8 }}>Zum Vergleich: gemeldetes Lobbybudget im Jahr</div>
      <div style={{ height: 34, position: 'relative', background: 'oklch(97% 0.004 260)', borderRadius: 3 }}>
        <div style={{ width: `${Math.max(budgetShare * 100, 0.8)}%`, height: '100%', background: LOBBY_C, borderRadius: 3 }} />
        <span style={{ position: 'absolute', left: `calc(${Math.max(budgetShare * 100, 0.8)}% + 10px)`, top: 0, height: '100%', display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700 }}>{range(bp.budget) ?? 'keine Angabe'}</span>
      </div>
    </figure>
  );
}
