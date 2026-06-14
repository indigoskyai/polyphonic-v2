import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function readIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  // Initialize synchronously so the first render matches the actual viewport.
  // Returning `false` on first paint and flipping to `true` after an effect
  // causes mobile-only/desktop-only subtrees (e.g. the desktop `<select>` for
  // thinking effort) to mount-then-unmount in the same commit, which trips
  // a NotFoundError on `removeChild` for native `<select>` on mobile webkit.
  const [isMobile, setIsMobile] = React.useState<boolean>(readIsMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    // Re-sync once in case the viewport changed between module eval and mount.
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
