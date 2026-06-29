import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('simulation artifact persistence migration', () => {
  const migration = readRepoFile('supabase/migrations/20260628173000_simulation_artifacts.sql');

  it('allows simulation artifacts without weakening ownership rules', () => {
    expect(migration).toContain("CHECK (kind IN ('html', 'react', 'svg', 'mermaid', 'markdown', 'simulation'))");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS artifact_id uuid REFERENCES public.artifacts(id)');
    expect(migration).toContain('research_evidence_cards_artifact_idx');
  });

  it('validates that linked artifacts belong to the evidence-card owner and thread', () => {
    expect(migration).toContain('FROM public.artifacts a');
    expect(migration).toContain('a.user_id = NEW.user_id');
    expect(migration).toContain('(NEW.thread_id IS NULL OR a.thread_id = NEW.thread_id)');
    expect(migration).toContain('Research evidence card artifact must belong to card owner and thread');
  });
});

