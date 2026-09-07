/** Shared inline-style helpers for the nav, pills and vote chips. */

import type { CSSProperties } from 'react';

export const voteBg: Record<string, string> = {
  yes: 'oklch(50% 0.14 155)',
  no: 'oklch(55% 0.16 40)',
  abstain: 'oklch(80% 0.006 260)',
  no_show: 'oklch(70% 0.008 260)',
};

export function navStyle(active: boolean): CSSProperties {
  return {
    paddingBottom: 2,
    borderBottom: `2px solid ${active ? 'oklch(20% 0.01 260)' : 'transparent'}`,
    color: active ? 'oklch(20% 0.01 260)' : 'inherit',
  };
}

export function pillBtn(active: boolean): CSSProperties {
  return {
    padding: '6px 13px',
    border: 'none',
    cursor: 'pointer',
    background: active ? 'oklch(45% 0.16 265)' : 'white',
    color: active ? 'white' : 'oklch(30% 0.01 260)',
  };
}
