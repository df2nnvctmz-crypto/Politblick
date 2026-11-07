/**
 * Charts of the story "Mieteinnahmen im Bundestag" (researched for r/mediasres in October 2026).
 * Plain HTML fed from public/data/datenstories/mieteinnahmen.json. Everything starts
 * collapsed or compact: rows open their details when clicked, and every name leads to its page.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { orgA, useNarrow } from './charts';
import { OpenRow, PartyChip, caps, euroFull } from './geld-charts';
import type { Landlord, MietenData } from './types';

const MUTED = 'oklch(48% 0.01 260)';
const RULE = '1px solid oklch(92% 0.006 260)';
const INK = 'oklch(25% 0.01 90)';
const AMBER = 'oklch(72% 0.14 75)';
const AMBER_INK = 'oklch(45% 0.1 70)';
const DONATION_C = 'oklch(45% 0.16 265)';
const FROZEN_BG = 'oklch(98% 0.01 80)';

const linkStyle: CSSProperties = { color: 'inherit', fontWeight: 700, textDecoration: 'underline', textDecorationColor: 'oklch(80% 0.01 260)', textUnderlineOffset: 2 };
const dateDe = (iso: string | null | undefined) => (iso ? `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.${iso.slice(0, 4)}` : '');
const financeTab = (mpPath: string) => `${mpPath}/finanzen`;

/** The legend line of a frozen element: what it is and the date it was true. */
function FrozenTag({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 12, color: MUTED }}>{children}</span>;
}

// ---- Mieteinnahmen: who reports rental income ---------------------------------------------------------

export function LandlordsChart({ data, onNavigate }: { data: MietenData; onNavigate: (path: string) => void }) {
  const max = Math.max(...data.landlords.map((l) => l.annualEuro), 1);
  return (
    <figure style={{ margin: 0 }} aria-label="Mieteinnahmen von Abgeordneten laut Nebentätigkeits-Angaben">
      <div style={{ ...caps, marginBottom: 6 }}>Gemeldete Mieteinnahmen im Jahr, brutto · Zeile öffnen für die Orte</div>
      {data.landlords.map((l) => (
        <OpenRow
          key={l.mandateId}
          head={
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span>
                  <strong style={{ fontSize: 16 }}>{l.name}</strong> <PartyChip party={l.party} />{' '}
                  <span style={{ color: MUTED, fontSize: 13, marginLeft: 4 }}>
                    {l.tenantCount} {l.tenantCount === 1 ? 'Mietverhältnis' : 'Mietverhältnisse'}
                  </span>
                </span>
                <span style={{ fontWeight: 800, fontSize: 18, color: AMBER_INK, fontVariantNumeric: 'tabular-nums' }}>{euroFull(l.annualEuro)}</span>
              </div>
              <div style={{ height: 14, background: 'oklch(95% 0.004 260)', marginTop: 6, borderRadius: 2 }}>
                <div style={{ width: `${(l.annualEuro / max) * 100}%`, height: '100%', background: AMBER, borderRadius: 2 }} />
              </div>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 4, maxWidth: 560 }}>
            {l.places.map((p) => (
              <div key={p.place} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span>
                  {p.place} <span style={{ color: MUTED, fontSize: 12.5 }}>{p.tenants} Mieter{p.note ? `, ${p.note}` : ''}</span>
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{euroFull(p.sumEuro)}</span>
              </div>
            ))}
          </div>
          {l.monthlyBased && <div style={{ marginTop: 6, fontSize: 12.5, color: MUTED }}>Monatliche Beträge sind mit zwölf multipliziert.</div>}
          <div style={{ marginTop: 8, fontSize: 13, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {orgA(l.mpPath, `Profil von ${l.name} →`, onNavigate, { color: 'inherit' })}
            {orgA(financeTab(l.mpPath), 'Alle Nebentätigkeiten auf Politblick →', onNavigate, { color: 'inherit' })}
          </div>
        </OpenRow>
      ))}
      <div style={{ borderTop: RULE, padding: '10px 4px', fontSize: 13, color: MUTED }}>Bei den übrigen {(data.memberCount - data.landlords.length).toLocaleString('de-DE')} Abgeordneten findet die Auswertung keinen bezahlten Eintrag mit „Vermietung“ und Betrag.</div>
    </figure>
  );
}

// ---- Mieteinnahmen: places and tenancies -------------------------------------------------------------------

/** Shades for the share bar, biggest place darkest; the place with a note (abroad) gets the highlight colour. */
const SHARE_SHADES = ['oklch(52% 0.13 70)', 'oklch(62% 0.13 72)', 'oklch(70% 0.12 75)', 'oklch(77% 0.1 78)', 'oklch(83% 0.08 80)', 'oklch(88% 0.06 82)'];

export function PlacesChart({ data, onNavigate }: { data: MietenData; onNavigate: (path: string) => void }) {
  const l: Landlord | undefined = data.landlords[0];
  const [open, setOpen] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const narrow = useNarrow(640);
  if (!l) return null;
  const avg = (p: Landlord['places'][number]) => p.sumEuro / p.tenants;
  const maxAvg = Math.max(...l.places.map(avg), 1);
  const shade = (i: number, p: Landlord['places'][number]) => (p.note ? DONATION_C : SHARE_SHADES[Math.min(i, SHARE_SHADES.length - 1)]);
  const pct = (n: number) => `${Math.round((n / l.annualEuro) * 100)} %`;
  const cols = narrow ? '1fr auto' : 'minmax(150px, 1.3fr) 70px minmax(160px, 1.6fr) 100px';
  return (
    <figure style={{ margin: 0 }} aria-label={`Mieteinnahmen von ${l.name} nach Ort`}>
      <div style={{ ...caps, marginBottom: 8 }}>
        {euroFull(l.annualEuro)} im Jahr, aufgeteilt nach Ort
      </div>
      <div style={{ display: 'flex', height: 40, borderRadius: 4, overflow: 'hidden' }}>
        {l.places.map((p, i) => {
          const share = p.sumEuro / l.annualEuro;
          return (
            <div
              key={p.place}
              onMouseEnter={() => setHover(p.place)}
              onMouseLeave={() => setHover(null)}
              title={`${p.place}: ${euroFull(p.sumEuro)} (${pct(p.sumEuro)})`}
              style={{ width: `${share * 100}%`, background: shade(i, p), borderRight: '2px solid white', color: i < 2 || p.note ? 'white' : INK, fontSize: 12, fontWeight: 700, padding: '0 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap', opacity: hover && hover !== p.place ? 0.5 : 1, transition: 'opacity 0.1s' }}
            >
              {share > 0.1 && !narrow && (
                <>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.place}</span>
                  <span style={{ fontWeight: 500, fontSize: 11 }}>{pct(p.sumEuro)}</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 16px', ...caps, fontSize: 11, margin: '20px 0 4px', padding: '0 4px' }}>
        <span>Ort</span>
        {!narrow && <span style={{ textAlign: 'right' }}>Mieter</span>}
        {!narrow && <span>Durchschnitt pro Mietverhältnis</span>}
        <span style={{ textAlign: 'right' }}>Im Jahr</span>
      </div>
      {l.places.map((p, i) => {
        const isOpen = open === p.place;
        const hl = Boolean(p.note);
        return (
          <div key={p.place} onMouseEnter={() => setHover(p.place)} onMouseLeave={() => setHover(null)} style={{ borderTop: RULE }}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : p.place)}
              aria-expanded={isOpen}
              style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 16px', alignItems: 'center', width: '100%', textAlign: 'left', background: hl ? 'oklch(97% 0.03 80)' : isOpen || hover === p.place ? 'oklch(98% 0.012 75)' : 'transparent', border: hl ? '1px solid oklch(85% 0.07 80)' : 'none', borderRadius: hl ? 6 : 0, padding: '10px 4px', cursor: 'pointer', font: 'inherit', color: 'inherit', margin: hl ? '4px 0' : 0 }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: shade(i, p), marginRight: 8 }} />
                <strong>{p.place}</strong>
                {p.note && <span style={{ display: 'block', fontSize: 12.5, color: AMBER_INK, fontWeight: 600, marginLeft: 18 }}>{p.note}{p.tenants === 1 ? ', ein einziges Mietverhältnis' : ''}</span>}
                {narrow && (
                  <span style={{ display: 'block', fontSize: 12.5, color: MUTED, marginLeft: 18 }}>
                    {p.tenants} Mieter · Ø {euroFull(avg(p))}
                  </span>
                )}
              </span>
              {!narrow && <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.tenants}</span>}
              {!narrow && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, height: 10, background: 'oklch(95% 0.004 260)', borderRadius: 2 }}>
                    <span style={{ display: 'block', width: `${(avg(p) / maxAvg) * 100}%`, height: '100%', background: hl ? DONATION_C : AMBER, borderRadius: 2 }} />
                  </span>
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', minWidth: 68, textAlign: 'right' }}>{euroFull(avg(p))}</span>
                </span>
              )}
              <span style={{ textAlign: 'right', fontWeight: 800, color: AMBER_INK, fontVariantNumeric: 'tabular-nums' }}>{euroFull(p.sumEuro)}</span>
            </button>
            {isOpen && (
              <div style={{ padding: '2px 4px 12px 22px', fontSize: 14 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontVariantNumeric: 'tabular-nums' }}>
                  {p.amounts.map((a, j) => (
                    <span key={j}>{euroFull(a)}</span>
                  ))}
                </div>
                <div style={{ marginTop: 6, fontSize: 12.5, color: MUTED }}>Alle {p.tenants} Einzelbeträge pro Jahr, brutto, nach Höhe sortiert.</div>
              </div>
            )}
          </div>
        );
      })}
      <div style={{ borderTop: RULE, padding: '10px 4px', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: MUTED }}>Zeile öffnen für alle Einzelbeträge</span>
        {orgA(financeTab(l.mpPath), `Alle Einträge von ${l.name} auf Politblick →`, onNavigate, { color: 'inherit' })}
      </div>
    </figure>
  );
}

// ---- Mieteinnahmen: programme quote next to the disclosure -------------------------------------------------

export function ProgrammeChart({ data, onNavigate }: { data: MietenData; onNavigate: (path: string) => void }) {
  const narrow = useNarrow(760);
  const l = data.landlords[0];
  const p = data.programme;
  return (
    <figure style={{ margin: 0, display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'stretch' }} aria-label="Wahlprogramm und Meldung beim Bundestag nebeneinander">
      <blockquote style={{ margin: 0, padding: '16px 18px', borderLeft: `3px solid ${AMBER}`, background: FROZEN_BG, borderRadius: 4 }}>
        <div style={caps}>{p.programme} der {p.party}, {p.page}</div>
        <p style={{ fontSize: 17, lineHeight: 1.5, fontStyle: 'italic', margin: '10px 0' }}>„{p.quote}“</p>
        <FrozenTag>
          <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
            {p.sourceLabel}
          </a>
          , Stand {dateDe(p.checkedOn)}
        </FrozenTag>
      </blockquote>
      {l && (
        <div style={{ padding: '16px 18px', border: RULE, borderRadius: 4 }}>
          <div style={caps}>Meldung beim Bundestag (live)</div>
          <div style={{ fontSize: 15, margin: '10px 0 2px' }}>
            {orgA(l.mpPath, l.name, onNavigate, linkStyle)} <PartyChip party={l.party} />
          </div>
          <div style={{ fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 800, color: AMBER_INK, fontVariantNumeric: 'tabular-nums' }}>{euroFull(l.annualEuro)}</div>
          <div style={{ fontSize: 14, color: MUTED }}>
            Mieteinnahmen im Jahr, brutto, aus {l.tenantCount} Mietverhältnissen
          </div>
          <div style={{ marginTop: 10, fontSize: 13 }}>{orgA(financeTab(l.mpPath), 'Alle Nebentätigkeiten auf Politblick →', onNavigate, { color: 'inherit' })}</div>
        </div>
      )}
    </figure>
  );
}
