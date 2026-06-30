import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('self-model candidate review safety', () => {
  it('keeps distillation reviewable and checks review status writes', () => {
    const distill = read('supabase/functions/skills-distill/index.ts');
    const manage = read('supabase/functions/skills-manage/index.ts');
    const migration = read('supabase/migrations/20260630090000_one_luca_runtime_last_chat_target.sql');

    expect(distill).toContain('.from("agent_skill_candidates")');
    expect(distill).not.toContain('.from("agent_skills")\n      .upsert({');
    expect(manage).toContain('approve_candidate');
    expect(manage).toContain('candidateUpdateError');
    expect(manage).toContain('denialError');
    expect(migration).toContain("WHERE status IN ('running', 'completed')");
  });
});
