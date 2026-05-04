import { useRef } from 'react';

/**
 * Returns `true` on the first render of a component instance, `false` after.
 * Used to gate entry animations so already-mounted rows don't re-animate
 * when the surrounding list re-renders.
 */
export function useFirstMount(): boolean {
  const isFirst = useRef(true);
  if (isFirst.current) {
    isFirst.current = false;
    return true;
  }
  return false;
}
