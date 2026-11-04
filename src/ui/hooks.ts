/** Shared UI hooks. */

import { useEffect, useRef, useState, type RefObject } from 'react';

/** Calls `onOutside` on any mousedown outside `ref`'s element while `active` is true. */
export function useOutsideClick(ref: RefObject<HTMLElement | null>, active: boolean, onOutside: () => void) {
  // Kept in a ref so callers can pass an inline arrow without re-subscribing on every render.
  const handler = useRef(onOutside);
  handler.current = onOutside;
  useEffect(() => {
    if (!active) return;
    const listener = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler.current();
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, active]);
}

/** A dropdown that opens on hover and closes a moment after the pointer leaves, so crossing the
 * gap between trigger and menu doesn't close it. */
export function useHoverMenu(closeDelayMs = 250) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancelClose, []);
  return {
    open,
    setOpen,
    ref,
    openNow: () => {
      cancelClose();
      setOpen(true);
    },
    scheduleClose: () => {
      // Clear any pending timer first — otherwise a second mouseleave orphans the first timer,
      // which openNow can no longer cancel and which then closes a menu the pointer is back on.
      cancelClose();
      timer.current = setTimeout(() => setOpen(false), closeDelayMs);
    },
  };
}
