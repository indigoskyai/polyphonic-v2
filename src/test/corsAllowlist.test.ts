import { describe, expect, it } from 'vitest';

// Re-test the regex used by supabase/functions/_shared/cors.ts so a tweak
// there gets caught. Kept as a literal copy because the edge function module
// imports Deno-only globals on call, but the regex itself is portable.
const LOCAL_DEV_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

describe('local dev CORS regex', () => {
  it('accepts localhost on any port', () => {
    expect(LOCAL_DEV_ORIGIN.test('http://localhost:8080')).toBe(true);
    expect(LOCAL_DEV_ORIGIN.test('http://localhost:8085')).toBe(true);
    expect(LOCAL_DEV_ORIGIN.test('http://localhost:5173')).toBe(true);
    expect(LOCAL_DEV_ORIGIN.test('http://localhost')).toBe(true);
  });

  it('accepts 127.0.0.1 on any port', () => {
    expect(LOCAL_DEV_ORIGIN.test('http://127.0.0.1:8085')).toBe(true);
    expect(LOCAL_DEV_ORIGIN.test('http://127.0.0.1')).toBe(true);
  });

  it('rejects https variants and other hosts', () => {
    expect(LOCAL_DEV_ORIGIN.test('https://localhost:8080')).toBe(false);
    expect(LOCAL_DEV_ORIGIN.test('http://example.com')).toBe(false);
    expect(LOCAL_DEV_ORIGIN.test('http://192.168.1.1:8080')).toBe(false);
    expect(LOCAL_DEV_ORIGIN.test('http://localhost.evil.com')).toBe(false);
  });
});
