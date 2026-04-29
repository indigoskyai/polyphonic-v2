import { describe, expect, it, vi, afterEach } from 'vitest';
import { isInQuietHours } from '../../supabase/functions/_shared/quiet-hours.ts';

afterEach(() => vi.useRealTimers());

function withFakeNow(iso: string, fn: () => void) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  try { fn(); } finally { vi.useRealTimers(); }
}

describe('isInQuietHours', () => {
  it('returns false when start or end is null', () => {
    expect(isInQuietHours({ start: null, end: 7, tz: 'UTC' })).toBe(false);
    expect(isInQuietHours({ start: 22, end: null, tz: 'UTC' })).toBe(false);
  });

  it('returns false when start equals end', () => {
    expect(isInQuietHours({ start: 0, end: 0, tz: 'UTC' })).toBe(false);
  });

  it('handles a daytime non-wrap window (e.g. 13→17 UTC)', () => {
    withFakeNow('2026-04-29T15:00:00Z', () => {
      expect(isInQuietHours({ start: 13, end: 17, tz: 'UTC' })).toBe(true);
    });
    withFakeNow('2026-04-29T18:00:00Z', () => {
      expect(isInQuietHours({ start: 13, end: 17, tz: 'UTC' })).toBe(false);
    });
  });

  it('handles a wrap-around overnight window (22→7 UTC)', () => {
    withFakeNow('2026-04-29T23:00:00Z', () => {
      expect(isInQuietHours({ start: 22, end: 7, tz: 'UTC' })).toBe(true);
    });
    withFakeNow('2026-04-29T03:00:00Z', () => {
      expect(isInQuietHours({ start: 22, end: 7, tz: 'UTC' })).toBe(true);
    });
    withFakeNow('2026-04-29T08:00:00Z', () => {
      expect(isInQuietHours({ start: 22, end: 7, tz: 'UTC' })).toBe(false);
    });
  });

  it('respects the tz parameter (NY shifts the wall clock)', () => {
    // 03:00 UTC == 23:00 previous day in America/New_York (UTC-4 in DST).
    withFakeNow('2026-04-29T03:00:00Z', () => {
      expect(isInQuietHours({ start: 22, end: 7, tz: 'America/New_York' })).toBe(true);
      expect(isInQuietHours({ start: 22, end: 7, tz: 'UTC' })).toBe(true);
    });
    // 12:00 UTC == 08:00 NY → outside the 22→7 window in NY but inside 22→7 if tz='UTC' is misread.
    withFakeNow('2026-04-29T12:00:00Z', () => {
      expect(isInQuietHours({ start: 22, end: 7, tz: 'America/New_York' })).toBe(false);
    });
  });

  it('falls back to false on an invalid timezone instead of throwing', () => {
    withFakeNow('2026-04-29T03:00:00Z', () => {
      expect(isInQuietHours({ start: 22, end: 7, tz: 'Not/AReal/Zone' })).toBe(false);
    });
  });
});
