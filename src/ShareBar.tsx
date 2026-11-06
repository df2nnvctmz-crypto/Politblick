/**
 * Share buttons for a Datenstory or a Sitzungswochen-Briefing: plain links to each platform's own
 * share page (no widgets, no third-party scripts, nothing loaded until a visitor clicks, so the
 * "no login, no cookies" promise stays true) and a copy-link button. On phones the row folds into
 * one "Teilen" button with a dropdown (the look of the filter menu), which also offers the system share sheet with the page's
 * preview picture attached.
 *
 * A share link can only carry the address: the picture a platform shows next to it comes from the
 * page's og:image / twitter:image tags (App.tsx; the images are made by scripts/build-og-images.mjs).
 * Only the system share sheet can attach the picture file itself, hence "Mit Bild teilen".
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Translation } from './data';
import { indexablePath, withBase } from './router';
import { useOutsideClick } from './ui/hooks';

/** Mirrors App.tsx / scripts/build-sitemap.mjs: the address a shared link should carry. */
const SITE_URL = 'https://politblick.de';

type Platform = 'x' | 'reddit' | 'bluesky' | 'facebook' | 'linkedin' | 'whatsapp';

/**
 * Logo files under public/. A platform without one shows its name as text instead, so a missing
 * file never leaves an empty button; drop the SVG in and list it here to switch the logo on.
 */
const LOGOS: Partial<Record<Platform, string>> = {
  x: 'images/share/x.svg',
  reddit: 'images/reddit.svg',
  bluesky: 'images/share/bluesky.svg',
  facebook: 'images/share/facebook.png',
  whatsapp: 'images/share/whatsapp.svg',
  linkedin: 'images/share/linkedin.png',
};

const PLATFORMS: { key: Platform; name: string; href: (url: string, text: string) => string }[] = [
  { key: 'x', name: 'X', href: (u, t) => `https://x.com/intent/post?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { key: 'reddit', name: 'Reddit', href: (u, t) => `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}` },
  { key: 'bluesky', name: 'Bluesky', href: (u, t) => `https://bsky.app/intent/compose?text=${encodeURIComponent(`${t} ${u}`)}` },
  { key: 'facebook', name: 'Facebook', href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { key: 'linkedin', name: 'LinkedIn', href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
  { key: 'whatsapp', name: 'WhatsApp', href: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
];

/** Google Material Icons "share", "link" and "check" (Apache 2.0, credited in the footer). */
const SHARE_PATH =
  'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z';
const LINK_PATH =
  'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z';
const EXPAND_PATH = 'M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z';
const CHECK_PATH = 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';
const IMAGE_PATH = 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z';

const SIZE = 28;

const buttonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minWidth: SIZE,
  height: SIZE,
  padding: '0 7px',
  boxSizing: 'border-box',
  border: '1px solid oklch(88% 0.006 260)',
  borderRadius: SIZE / 2,
  background: 'white',
  color: 'oklch(28% 0.01 260)',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'inherit',
  textDecoration: 'none',
  cursor: 'pointer',
  lineHeight: 1,
};

const icon = (path: string, size = 15) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d={path} />
  </svg>
);

/** Phones: the share row would take two lines of tiny buttons, so it becomes one button with a menu. */
function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

export function ShareBar({ title, url, image, t, where }: { title: string; url?: string; /** Site path of the page's preview picture, e.g. /og/lobby-geld.png */ image?: string; t: Translation; where: 'top' | 'end' }) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShareImage, setCanShareImage] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useOutsideClick(menuRef, open, () => setOpen(false));
  // Like the filter menu: the side it opens to is fixed from the button's position, so it never runs off the screen.
  const [placement, setPlacement] = useState<{ side: 'left' | 'right'; maxWidth: number } | null>(null);
  const toggle = () => {
    if (open || !menuRef.current) {
      setOpen(false);
      return;
    }
    const EDGE = 12;
    const r = menuRef.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const roomLeft = vw - EDGE - r.left;
    const roomRight = r.right - EDGE;
    const side = roomLeft >= 240 ? 'left' : roomLeft >= roomRight ? 'left' : 'right';
    setPlacement({ side, maxWidth: side === 'left' ? roomLeft : roomRight });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => {
    // Only some phone browsers can hand a picture file to the system share sheet.
    try {
      setCanShareImage(Boolean(image) && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] }));
    } catch {
      setCanShareImage(false);
    }
  }, [image]);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const shareUrl = url ?? `${SITE_URL}${indexablePath(typeof window === 'undefined' ? '/' : window.location.pathname)}`;
  const text = `${title} – Politblick`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // Clipboard access can be refused (insecure context, permissions); fall back to a prompt the reader can copy from.
      window.prompt(t.shareCopy, shareUrl);
    }
  };

  const shareWithImage = async () => {
    setOpen(false);
    try {
      const blob = await (await fetch(withBase(image!, import.meta.env.BASE_URL))).blob();
      const file = new File([blob], 'politblick.png', { type: 'image/png' });
      await navigator.share({ files: [file], title: text, text: `${text} ${shareUrl}` });
    } catch {
      // Cancelled by the reader, or the picture could not be fetched: nothing to do.
    }
  };

  const label = (name: string): string => t.shareViaTemplate.replace('{name}', name);
  const logoImg = (key: Platform, size: number): ReactNode => {
    const logo = LOGOS[key];
    return logo ? <img src={withBase(`/${logo}`, import.meta.env.BASE_URL)} alt="" width={size} height={size} style={{ display: 'block', objectFit: 'contain', flexShrink: 0 }} /> : null;
  };

  const caption = <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'oklch(48% 0.01 260)', marginRight: 2 }}>{t.shareLabel}</span>;

  if (phone) {
    // Same look as the filter menu (src/ui/FilterMenu.tsx): a pill button, and a white panel that hangs under it.
    const item: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box', padding: '9px 14px', border: 'none', background: 'white', fontSize: 13.5, fontWeight: 400, color: 'oklch(25% 0.01 260)', textAlign: 'left', textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit' };
    const iconBox: CSSProperties = { width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
    const heading: CSSProperties = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'oklch(55% 0.01 260)', padding: '8px 14px 4px' };
    const divided: CSSProperties = { borderTop: '1px solid oklch(93% 0.006 260)', marginTop: 4, paddingTop: 4 };
    return (
      <div ref={menuRef} data-share={where} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 16, border: '1px solid oklch(85% 0.006 260)', background: 'white', color: 'oklch(30% 0.01 260)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
        >
          {icon(SHARE_PATH, 18)}
          {t.shareLabel}
          <span style={{ display: 'inline-flex', marginLeft: -3, opacity: 0.75, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>{icon(EXPAND_PATH, 18)}</span>
        </button>
        {open && (
          <div
            role="menu"
            style={{ position: 'absolute', top: '100%', [placement?.side ?? 'left']: 0, marginTop: 6, minWidth: Math.min(240, placement?.maxWidth ?? 240), maxWidth: placement?.maxWidth, maxHeight: '70vh', overflowY: 'auto', background: 'white', border: '1px solid oklch(88% 0.006 260)', borderRadius: 12, boxShadow: '0 8px 24px oklch(0% 0 0 / 0.12)', zIndex: 30, padding: '6px 0' }}
          >
            <div style={heading}>{t.shareLabel}</div>
            {PLATFORMS.map((p) => (
              <a key={p.key} role="menuitem" href={p.href(shareUrl, text)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} style={item}>
                <span style={iconBox}>{logoImg(p.key, 18) ?? null}</span>
                {p.name}
              </a>
            ))}
            <div style={divided}>
              {canShareImage && (
                <button type="button" role="menuitem" onClick={shareWithImage} style={item}>
                  <span style={iconBox}>{icon(IMAGE_PATH, 18)}</span>
                  {t.shareWithImage}
                </button>
              )}
              <button type="button" role="menuitem" onClick={copy} style={{ ...item, color: copied ? 'oklch(42% 0.11 155)' : item.color, fontWeight: copied ? 700 : 400 }}>
                <span style={iconBox}>{icon(copied ? CHECK_PATH : LINK_PATH, 18)}</span>
                {copied ? t.shareCopied : t.shareCopy}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div role="group" aria-label={t.shareLabel} data-share={where} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      {caption}
      {PLATFORMS.map((p) => (
        <a key={p.key} href={p.href(shareUrl, text)} target="_blank" rel="noopener noreferrer" style={buttonStyle} aria-label={label(p.name)} title={label(p.name)}>
          {logoImg(p.key, 16) ?? p.name}
        </a>
      ))}
      <button type="button" style={{ ...buttonStyle, color: copied ? 'oklch(42% 0.11 155)' : buttonStyle.color }} onClick={copy} aria-label={copied ? t.shareCopied : t.shareCopy} title={copied ? t.shareCopied : t.shareCopy}>
        {icon(copied ? CHECK_PATH : LINK_PATH)}
      </button>
    </div>
  );
}
