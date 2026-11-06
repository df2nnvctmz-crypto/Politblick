/** Link helpers shared by the Datenstory page and its charts. */
import type { ReactNode } from 'react';
import { indexablePath, withBase } from '../router';

export const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** A link to a prerendered site path that opens SPA-style; the href stays real for new tabs and crawlers. */
export function InternalLink({ path, onNavigate, children }: { path: string; onNavigate: (p: string) => void; children: ReactNode }) {
  const href = withBase(indexablePath(path), import.meta.env.BASE_URL);
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onNavigate(path);
      }}
    >
      {children}
    </a>
  );
}

export function shortEvidence(type: string | null) {
  if (!type) return '–';
  if (/SEC/.test(type)) return 'SEC-Tochterliste';
  if (/Lobbyregister/.test(type)) return 'Registeradresse';
  return 'Jahresabschluss / Konzernangabe';
}
