/** Shared event helpers. */

import type { MouseEvent } from 'react';

/** Wraps a client-side nav action for use as an <a href="..."> onClick. Only intercepts plain,
 * unmodified left-clicks — ctrl/cmd/shift/alt-click and middle-click fall through to the browser's
 * native "open in new tab/window" behavior against the real href instead of being swallowed. */
export function stop(fn: () => void) {
  return (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    fn();
  };
}
