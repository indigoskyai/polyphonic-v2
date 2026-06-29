import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('research evidence persistence schema', () => {
  const migration = readRepoFile('supabase/migrations/20260628160000_research_evidence_cards.sql');

  it('creates scoped evidence cards with RLS and owner policies', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.research_evidence_cards');
    expect(migration).toContain('ALTER TABLE public.research_evidence_cards ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('auth.uid() = user_id');
    expect(migration).toContain('CREATE POLICY "Users can view own research evidence cards"');
    expect(migration).toContain('CREATE POLICY "Users can create own research evidence cards"');
    expect(migration).toContain('CREATE POLICY "Users can update own research evidence cards"');
    expect(migration).toContain('CREATE POLICY "Users can delete own research evidence cards"');
  });

  it('validates linked thread, project, and source message ownership before writes', () => {
    expect(migration).toContain('validate_research_evidence_card_scope');
    expect(migration).toContain('FROM public.threads t');
    expect(migration).toContain('FROM public.projects p');
    expect(migration).toContain('FROM public.messages m');
    expect(migration).toContain('RAISE EXCEPTION');
  });

  it('stores reproducibility metadata but not raw tensor blobs', () => {
    expect(migration).toContain("raw_access jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).toContain("access_plan jsonb NOT NULL DEFAULT '[]'::jsonb");
    expect(migration).toContain("measurements jsonb NOT NULL DEFAULT '[]'::jsonb");
    expect(migration).toContain("caveats jsonb NOT NULL DEFAULT '[]'::jsonb");
    expect(migration).toContain("jsonb_typeof(access_plan) = 'array'");
    expect(migration).toContain("jsonb_typeof(raw_access) = 'object'");
    expect(migration).not.toMatch(/\braw_tensors\b/i);
    expect(migration).not.toMatch(/\bhdf5_payload\b/i);
  });
});
