import { describe, expect, it } from 'vitest';
import { ENGRAM_UI_SELECT, normalizeEngramRow } from '@/stores/memoryStore';

describe('memoryStore Mnemos row handling', () => {
  it('keeps the UI engram query off heavyweight substrate columns', () => {
    expect(ENGRAM_UI_SELECT).toContain('source_context');
    expect(ENGRAM_UI_SELECT).not.toContain('embedding');
  });

  it('normalizes nullable engram rows before they reach memory surfaces', () => {
    const row = normalizeEngramRow({
      id: 'e1',
      user_id: 'u1',
      content: 'amber loom',
      engram_type: 'semantic',
      strength: 0.82,
      stability: 0.64,
      accessibility: 0.91,
      emotional_valence: null,
      emotional_arousal: null,
      surprise_score: null,
      source_context: null,
      tags: null,
      state: null,
      access_count: null,
      created_at: '2026-05-05T04:16:18.927Z',
      updated_at: null,
      last_accessed_at: null,
    });

    expect(row.content).toBe('amber loom');
    expect(row.engram_type).toBe('semantic');
    expect(row.state).toBe('active');
    expect(row.tags).toEqual([]);
    expect(row.source_context).toEqual({});
    expect(row.emotional_valence).toBe(0);
    expect(row.access_count).toBe(0);
    expect(row.last_accessed_at).toBe('2026-05-05T04:16:18.927Z');
  });
});
