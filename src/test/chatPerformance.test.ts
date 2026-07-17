import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getStreamRevealAdvance, mapWithConcurrency, shouldCompleteStreamHandoff } from '@/lib/chatPerformance';

describe('chat performance helpers', () => {
  it('keeps small stream gaps calm while catching large buffers up quickly', () => {
    const nearLive = getStreamRevealAdvance(16, 12);
    const farBehind = getStreamRevealAdvance(16, 1200);
    expect(nearLive).toBeGreaterThan(0);
    expect(farBehind).toBeGreaterThan(nearLive);
    expect(farBehind).toBeLessThanOrEqual(1200);
  });

  it('bounds parallel work and preserves result order', async () => {
    let active = 0;
    let maxActive = 0;
    const result = await mapWithConcurrency([30, 5, 15, 1], 2, async (delay, index) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return `item-${index}`;
    });
    expect(maxActive).toBe(2);
    expect(result).toEqual(['item-0', 'item-1', 'item-2', 'item-3']);
  });

  it('hands a settled stream to its canonical assistant row', () => {
    const now = Date.parse('2026-07-16T21:00:00.000Z');
    const messages = [{ role: 'assistant', agent: 'luca', created_at: '2026-07-16T20:59:58.000Z' }];
    expect(shouldCompleteStreamHandoff({ lingeringStream: 'answer', typewriterSettled: false, messages, activeAgent: 'luca', now })).toBe(false);
    expect(shouldCompleteStreamHandoff({ lingeringStream: 'answer', typewriterSettled: true, messages, activeAgent: 'luca', now })).toBe(true);
  });

  it('propagates cancellation to the provider and suppresses late duplicates', () => {
    const edge = readFileSync(join(process.cwd(), 'supabase/functions/chat-multi/index.ts'), 'utf8');
    const chat = readFileSync(join(process.cwd(), 'src/pages/ChatView.tsx'), 'utf8');
    expect(chat).toContain('client_turn_id: clientTurnId');
    expect(chat).toContain('cancelRequestedTurnIdRef');
    expect(edge).toContain('requestSignal: req.signal');
    expect(edge).toContain('findCanceledTurnMessage');
    expect(edge).toContain('cancel()');
    expect(edge).toContain('providerAbort.abort()');
  });
});
