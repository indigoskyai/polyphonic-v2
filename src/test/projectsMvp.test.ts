import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Projects MVP wiring', () => {
  it('registers the projects route without touching chat route ownership', () => {
    const app = readRepoFile('src/App.tsx');

    expect(app).toContain('const ProjectsView = lazy(() => import("./pages/ProjectsView"))');
    expect(app).toContain('path="/projects"');
    expect(app).toContain('path="/projects/:projectId"');
    expect(app).toContain('path="/chat/:threadId"');
  });

  it('injects project context through runtime prompt assembly, not client chat UI', () => {
    const chat = readRepoFile('supabase/functions/chat/index.ts');
    const multi = readRepoFile('supabase/functions/chat-multi/index.ts');
    const luca = readRepoFile('supabase/functions/_shared/agents/luca-soul.ts');
    const vektor = readRepoFile('supabase/functions/_shared/agents/vektor-soul.ts');

    expect(chat).toContain('loadProjectContextForThread(supabase, userId, thread_id)');
    expect(chat).toContain('projectContextBlock');
    expect(multi).toContain('loadProjectContextForThread(supabase, userId, thread_id)');
    expect(multi).toContain('projectContextBlock');
    expect(luca).toContain('projectContextBlock?: string');
    expect(vektor).toContain('projectContextBlock?: string');
  });

  it('keeps project/thread ownership enforced below the UI', () => {
    const migration = readRepoFile('supabase/migrations/20260506124500_projects_mvp.sql');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.projects');
    expect(migration).toContain('ALTER TABLE public.threads');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS project_id');
    expect(migration).toContain('validate_thread_project_owner');
    expect(migration).toContain('p.user_id = NEW.user_id');
  });
});
