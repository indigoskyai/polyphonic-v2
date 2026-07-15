import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('production attachment pipeline', () => {
  it('uses attachment IDs and the shared resolver across direct, agent, and group runtimes', () => {
    for (const file of [
      'supabase/functions/chat/index.ts',
      'supabase/functions/chat-multi/index.ts',
      'supabase/functions/group-agent-request/index.ts',
    ]) {
      const source = read(file);
      expect(source, `${file} resolves canonical attachment IDs`).toContain('buildModelAttachmentContent');
      expect(source, `${file} persists reusable PDF annotations`).toContain('persistPdfAnnotations');
    }
    const agentRuntime = read('supabase/functions/_shared/agent-runtime/openrouter-agent.ts');
    expect(agentRuntime).toContain('content: message.content');
    expect(agentRuntime).toContain('persistPdfAnnotations');
    for (const delegated of [
      'supabase/functions/subagent-run/index.ts',
      'supabase/functions/agent-consult/index.ts',
    ]) {
      expect(read(delegated), `${delegated} resolves delegated attachments`).toContain('buildModelAttachmentContent');
      expect(read(delegated), `${delegated} reuses PDF annotations`).toContain('persistPdfAnnotations');
    }
  });

  it('defines private storage, realtime state, and deletion cleanup without external infrastructure', () => {
    const migration = read('supabase/migrations/20260714100000_production_chat_attachments.sql');
    const nativeMigration = read('supabase/migrations/20260715013000_supabase_native_attachments.sql');
    expect(migration).toContain('create table if not exists public.chat_attachments');
    expect(migration).toContain("'uploading', 'quarantined', 'scanning', 'extracting', 'ready'");
    expect(migration).toContain('public.chat_attachment_quotas');
    expect(migration).toContain('enforce_chat_attachment_quota');
    expect(migration).toContain("values ('chat-attachments', 'chat-attachments', false, 104857600)");
    expect(migration).toContain('delete_chat_attachment_objects');
    expect(migration).toContain('alter publication supabase_realtime add table public.chat_attachments');
    expect(migration.indexOf('create trigger enforce_chat_attachment_quota_before_insert'))
      .toBeGreaterThan(migration.indexOf('update public.group_messages message set attachment_ids'));
    expect(migration).toContain('if existing_count = 0 then return new; end if;');
    expect(nativeMigration).toContain('drop table if exists public.attachment_processing_jobs');
    expect(nativeMigration).toContain('drop function if exists public.lease_attachment_processing_job');
    expect(existsSync(join(process.cwd(), 'render.yaml'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'services/attachment-worker/worker.py'))).toBe(false);
  });

  it('keeps generated database types aligned with the attachment and integrity migrations', () => {
    const types = read('src/integrations/supabase/types.ts');
    expect(types).toContain('chat_attachments: {');
    expect(types).not.toContain('attachment_processing_jobs: {');
    expect(types).not.toContain('lease_attachment_processing_job: {');
    expect(types).toContain('chat_attachment_status:');
    expect(types).toContain('attachment_ids: string[]');
  });

  it('keeps the normal composer compact and attachment-native', () => {
    const chat = read('src/pages/ChatView.tsx');
    const control = read('src/components/attachments/AttachmentSourceControl.tsx');
    const groups = read('src/pages/GroupsView.tsx');
    expect(chat).not.toContain('CompanionImportPanel');
    expect(chat).toContain('<AttachmentSourceControl');
    expect(control).toContain('attachment-source-menu');
    expect(control).toContain('createPortal');
    expect(control).toContain('document.body');
    expect(control).toContain('new ResizeObserver(schedulePosition)');
    expect(chat).toContain('onPaste={handleComposerPaste}');
    expect(chat).toContain('onDrop={handleDrop}');
    expect(chat).toContain('attachment_ids');
    expect(groups).toContain('<AttachmentSourceControl');
    expect(groups).toContain('startGroupAttachmentUpload');
    const api = read('src/lib/attachmentApi.ts');
    expect(api).toContain('const stableDescriptor');
    expect(api).toContain("url: ''");
    expect(api).toContain('prepareAttachmentExtraction');
    expect(read('supabase/functions/attachment-finalize/index.ts')).toContain('finalizeAttachmentRecord');
    expect(read('supabase/functions/attachment-finalize/index.ts')).not.toContain('attachment_processing_jobs');
  });

  it('invokes every attachment endpoint through the shared error wrapper', () => {
    for (const endpoint of ['init', 'finalize', 'bind', 'url', 'cancel', 'retry']) {
      const source = read(`supabase/functions/attachment-${endpoint}/index.ts`);
      expect(source).toContain('})(req);');
    }
  });
});

describe('autonomous content integrity', () => {
  it('routes every user-visible autonomous writer through the shared generation gate', () => {
    const writers = [
      'supabase/functions/anima-think/index.ts',
      'supabase/functions/anima-question/index.ts',
      'supabase/functions/anima-wander/index.ts',
      'supabase/functions/anima-consolidate/index.ts',
      'supabase/functions/anima-dream/index.ts',
      'supabase/functions/anima-connect/index.ts',
      'supabase/functions/anima-reflect/index.ts',
      'supabase/functions/anima-observe/index.ts',
      'supabase/functions/anima-believe/index.ts',
      'supabase/functions/anima-initiate/index.ts',
      'supabase/functions/journal-write/index.ts',
      'supabase/functions/_shared/mnemos/dreaming.ts',
      'supabase/functions/_shared/mnemos/softening.ts',
      'supabase/functions/_shared/mnemos/consolidation.ts',
      'supabase/functions/_shared/hypomnema/graduate.ts',
    ];
    for (const file of writers) {
      expect(read(file), `${file} uses the integrity gate`).toContain('generateAutonomous');
    }
  });

  it('preserves suspect history while hiding exact template leaks', () => {
    const migration = read('supabase/migrations/20260714103000_autonomous_content_integrity.sql');
    expect(migration).toContain("content_integrity_status = 'rejected'");
    expect(migration).toContain("content_integrity_status = 'suspect'");
    expect(migration).toContain("content_integrity_reason = 'legacy_prompt_template_leak'");
    expect(migration).toContain("content_integrity_reason = 'legacy_possible_truncation'");
  });
});
