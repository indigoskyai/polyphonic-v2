// Debug flags — internal observability surfaces hidden from end users.
//
// Each flag can be enabled two ways:
//   1. Persistent: localStorage.<flagKey> = 'true'  (DevTools console)
//   2. One-shot:   ?debug=<flagName>                (URL param)
//
// The URL param form sets localStorage too on first read, so navigating with
// the param and then removing it from the URL keeps the flag on. Pass
// ?debug=off to clear all flags.
//
// Used for: hiding council voice-critique observability from end users while
// keeping it accessible to Riley during the calibration round.

const FLAG_KEYS = {
  council: 'councilDebug',
} as const;

type FlagName = keyof typeof FLAG_KEYS;

function readUrlDebugParam(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug');
  } catch {
    return null;
  }
}

function syncFromUrl(): void {
  const param = readUrlDebugParam();
  if (!param) return;
  if (param === 'off' || param === 'false') {
    for (const k of Object.values(FLAG_KEYS)) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
    return;
  }
  // Comma-separated list — set each named flag.
  for (const name of param.split(',')) {
    const key = FLAG_KEYS[name.trim() as FlagName];
    if (key) {
      try { localStorage.setItem(key, 'true'); } catch { /* ignore */ }
    }
  }
}

let synced = false;
function ensureSynced(): void {
  if (synced) return;
  synced = true;
  syncFromUrl();
}

export function isDebugEnabled(name: FlagName): boolean {
  if (typeof window === 'undefined') return false;
  ensureSynced();
  try {
    return localStorage.getItem(FLAG_KEYS[name]) === 'true';
  } catch {
    return false;
  }
}

export function isCouncilDebugEnabled(): boolean {
  return isDebugEnabled('council');
}
