import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Lang, Translation } from './data';
import type { LobbyTab, View } from './router';
import { stop } from './ui/events';
import { useOutsideClick } from './ui/hooks';
import { pillBtn } from './ui/styles';

/**
 * The phone navigation: a 3-line button right of the logo that opens a dropdown under the header
 * with every top-level link, its sub-items and the language switch. The inline nav and the DE/EN
 * pill are hidden on phones by index.css (.pb-nav-desktop / .pb-lang-desktop), and both the
 * button and the panel are hidden again above 720px (.pb-burger / .pb-mobile-menu), so desktop is
 * untouched. The search box stays in the header; it is not part of the menu.
 *
 * It renders into the header as two siblings of the logo: the button (a flex item) and the panel
 * (absolutely positioned under the sticky header).
 */
export interface MobileMenuProps {
  t: Translation;
  lang: Lang;
  view: View;
  lobbyTab: LobbyTab;
  hrefs: { home: string; mps: string; parties: string; committees: string; polls: string; datenstories: string; lobby: (tab?: LobbyTab) => string };
  go: { home: () => void; mps: () => void; parties: () => void; committees: () => void; polls: () => void; datenstories: () => void; lobby: (tab?: LobbyTab) => void };
  onLang: (l: Lang) => void;
}

const ACCENT = 'oklch(45% 0.16 265)';
/** The header's own colour (App.tsx), but solid: the header is 92% opaque over a blur, which a panel hanging below it cannot reproduce, so page text would show through. */
const HEADER_BG = 'oklch(99% 0.003 260)';

type GroupKey = 'parliament' | 'lobby';

export function MobileMenu({ t, lang, view, lobbyTab, hrefs, go, onLang }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const parliament = view === 'search' || view === 'party' || view === 'partyList' || view === 'committee' || view === 'committeeList' || view === 'pollList';
  const lobby = view === 'crossref';
  // Parlament and Lobby & Finanzen are collapsed rows; the one holding the current page starts open.
  const [groups, setGroups] = useState<Set<GroupKey>>(new Set());
  useEffect(() => {
    if (open) setGroups(new Set<GroupKey>([parliament ? 'parliament' : null, lobby ? 'lobby' : null].filter((g): g is GroupKey => g !== null)));
    // Only when the menu opens: toggling a row must not be undone by this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const toggleGroup = (key: GroupKey) =>
    setGroups((cur) => {
      const next = new Set(cur);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, open, () => setOpen(false));
  // A page change by any other route (back button, a link inside the page) closes the menu too.
  useEffect(() => setOpen(false), [view, lobbyTab]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const item = (href: string, label: string, run: () => void, active: boolean, indent = false): ReactNode => (
    <a
      href={href}
      onClick={stop(() => {
        run();
        setOpen(false);
      })}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'block',
        padding: indent ? '10px 12px 10px 28px' : '11px 12px',
        borderRadius: 8,
        fontSize: indent ? 14.5 : 15.5,
        fontWeight: active ? 700 : indent ? 500 : 700,
        color: active ? ACCENT : 'oklch(28% 0.01 260)',
        background: active ? 'oklch(45% 0.16 265 / 0.08)' : 'transparent',
        textDecoration: 'none',
      }}
    >
      {label}
    </a>
  );
  /** A top-level row that folds its sub-items open and shut; the chevron turns with it. */
  const group = (key: GroupKey, label: string, holdsPage: boolean, children: ReactNode) => {
    const isOpen = groups.has(key);
    return (
      <div>
        <button
          type="button"
          onClick={() => toggleGroup(key)}
          aria-expanded={isOpen}
          aria-controls={`pb-mobile-${key}`}
          style={{
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '11px 12px',
            border: 'none',
            borderRadius: 8,
            background: 'transparent',
            font: 'inherit',
            fontSize: 15.5,
            fontWeight: 700,
            textAlign: 'left',
            cursor: 'pointer',
            color: holdsPage ? ACCENT : 'oklch(28% 0.01 260)',
          }}
        >
          {label}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {isOpen && (
          <div id={`pb-mobile-${key}`} style={{ paddingBottom: 4 }}>
            {children}
          </div>
        )}
      </div>
    );
  };
  const burger: CSSProperties = { border: 'none', background: 'none', padding: 8, cursor: 'pointer', color: 'oklch(30% 0.01 260)', lineHeight: 0 };

  return (
    <div ref={ref} style={{ display: 'contents' }}>
      <button type="button" className="pb-burger" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="pb-mobile-menu" aria-label={open ? t.menuClose : t.menuOpen} style={burger}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <nav
          id="pb-mobile-menu"
          className="pb-mobile-menu"
          aria-label={t.menuOpen}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 30,
            background: HEADER_BG,
            borderBottom: '1px solid oklch(88% 0.006 260)',
            boxShadow: '0 10px 24px oklch(0% 0 0 / 0.12)',
            padding: '6px 12px 14px',
            maxHeight: 'calc(100vh - var(--pb-header-offset, 60px))',
            overflowY: 'auto',
          }}
        >
          {item(hrefs.home, t.navHome, go.home, view === 'home')}
          {group(
            'parliament',
            t.navParliament,
            parliament,
            <>
              {item(hrefs.mps, t.navMpsSearch, go.mps, view === 'search', true)}
              {item(hrefs.parties, t.navParties, go.parties, view === 'party' || view === 'partyList', true)}
              {item(hrefs.committees, t.navCommittees, go.committees, view === 'committee' || view === 'committeeList', true)}
              {item(hrefs.polls, t.navPolls, go.polls, view === 'pollList', true)}
            </>,
          )}
          {group(
            'lobby',
            t.navLobbyFinance,
            lobby,
            <>
              {item(hrefs.lobby(), t.menuOverview, () => go.lobby(), lobby && lobbyTab === 'overview', true)}
              {item(hrefs.lobby('ties'), t.lobbyTabTies, () => go.lobby('ties'), lobby && lobbyTab === 'ties', true)}
              {item(hrefs.lobby('orgs'), t.lobbyTabOrgs, () => go.lobby('orgs'), lobby && lobbyTab === 'orgs', true)}
              {item(hrefs.lobby('donations'), t.lobbyTabDonations, () => go.lobby('donations'), lobby && lobbyTab === 'donations', true)}
            </>,
          )}
          {item(hrefs.datenstories, t.navDatenstories, go.datenstories, view === 'datenstoryList' || view === 'datenstory')}
          <div style={{ borderTop: '1px solid oklch(94% 0.005 260)', marginTop: 8, paddingTop: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 0' }}>
            <span style={{ fontSize: 13, color: 'oklch(50% 0.01 260)' }}>{t.menuLanguage}</span>
            <div style={{ display: 'flex', border: '1px solid oklch(90% 0.006 260)', borderRadius: 16, overflow: 'hidden', fontSize: 13, fontWeight: 600 }}>
              <button type="button" onClick={() => onLang('de')} style={pillBtn(lang === 'de')}>
                DE
              </button>
              <button type="button" onClick={() => onLang('en')} style={pillBtn(lang === 'en')}>
                EN
              </button>
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}
