import { describe, it, expect } from 'vitest';
import { parseEdgeError, friendlyMessage } from '@/lib/edgeError';

function makeResp(body: any, status = 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('parseEdgeError', () => {
  it('parses standard envelope', async () => {
    const err = await parseEdgeError(makeResp({
      error: 'Bad input', code: 'validation_error', request_id: 'req_abc',
    }));
    expect(err.message).toBe('Bad input');
    expect(err.code).toBe('validation_error');
    expect(err.requestId).toBe('req_abc');
  });

  it('falls back to message field', async () => {
    const err = await parseEdgeError(makeResp({ message: 'oops' }));
    expect(err.message).toBe('oops');
    expect(err.code).toBeUndefined();
  });

  it('returns generic message on non-json body', async () => {
    const resp = new Response('not json', { status: 502 });
    const err = await parseEdgeError(resp);
    expect(err.message).toContain('502');
  });
});

describe('friendlyMessage', () => {
  it('rewrites quota_exceeded', () => {
    expect(friendlyMessage({ message: 'x', code: 'quota_exceeded' })).toMatch(/usage limit/i);
  });
  it('rewrites upstream_unavailable', () => {
    expect(friendlyMessage({ message: 'x', code: 'upstream_unavailable' })).toMatch(/provider/i);
  });
  it('rewrites unauthorized', () => {
    expect(friendlyMessage({ message: 'x', code: 'unauthorized' })).toMatch(/sign in/i);
  });
  it('passes through unknown codes', () => {
    expect(friendlyMessage({ message: 'raw', code: 'something_else' })).toBe('raw');
  });
});
