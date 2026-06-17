import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_VERSION,
  EXCLUDED_PORTABILITY_TABLES,
  PORTABLE_TABLE_BY_NAME,
  PORTABLE_TABLES,
  type AccountExportPayload,
  type ImportIdMaps,
  createArchiveCryptoContext,
  createArchiveDecryptContext,
  decryptArchive,
  decryptArchiveRowsChunk,
  encryptArchiveRowsChunk,
  encryptPayload,
  createIdMaps,
  parsePortableArchiveText,
  redactPortableRow,
  transformRowForImport,
  validateChunkedArchive,
  validateEncryptedArchive,
} from '../../supabase/functions/_shared/account-portability/archive';

type AttachmentRow = {
  type: string;
  url: string;
  meta: { bucket?: string; path?: string; storage_path?: string };
};

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function basePayload(): AccountExportPayload {
  return {
    format: ACCOUNT_EXPORT_FORMAT,
    version: ACCOUNT_EXPORT_VERSION,
    export_id: 'export-12345678',
    exported_at: '2026-06-16T00:00:00.000Z',
    source_user_id: 'source-user',
    manifest: {
      app: 'polyphonic',
      tables: { threads: 1, messages: 1 },
      assets: { total: 0, missing: 0 },
      excluded: [...EXCLUDED_PORTABILITY_TABLES],
    },
    tables: {
      threads: [{ id: 'thread-old', user_id: 'source-user', agent_id: 'luca', primary_agent_id: 'luca' }],
      messages: [{ id: 'message-old', user_id: 'source-user', thread_id: 'thread-old', role: 'user', content: 'hello' }],
    },
    assets: [],
    warnings: [],
  };
}

const maps: ImportIdMaps = {
  ids: {
    threads: { 'thread-old': 'thread-new' },
    messages: { 'message-old': 'message-new' },
    projects: { 'project-old': 'project-new' },
    engrams: { 'engram-a': 'engram-new-a', 'engram-b': 'engram-new-b' },
    scheduled_tasks: { 'task-old': 'task-new' },
  },
  agents: { 'custom-agent': 'restored-custom-agent' },
  assets: {
    'chat-attachments/source-user/thread-old/file.txt': {
      bucket: 'chat-attachments',
      path: 'target-user/thread-new/file.txt',
      signedUrl: 'https://signed.example/file.txt',
    },
    'generated-images/source-user/image.png': {
      bucket: 'generated-images',
      path: 'target-user/image.png',
      signedUrl: 'https://signed.example/image.png',
    },
  },
};

describe('account portability archive', () => {
  it('encrypts with wrapper metadata and decrypts the export payload', async () => {
    const encrypted = await encryptPayload(basePayload(), 'correct horse battery');
    const parsed = validateEncryptedArchive(encrypted);

    expect(parsed.format).toBe(ACCOUNT_EXPORT_FORMAT);
    expect(parsed.version).toBe(ACCOUNT_EXPORT_VERSION);
    expect(parsed.encryption.alg).toBe('AES-GCM');
    expect(parsed.encryption.kdf).toBe('PBKDF2-SHA256');
    expect(parsed.encryption.iterations).toBeGreaterThanOrEqual(250_000);
    expect(parsed.payload).not.toContain('thread-old');

    await expect(decryptArchive(parsed, 'wrong horse battery')).rejects.toThrow();
    await expect(decryptArchive(parsed, 'correct horse battery')).resolves.toMatchObject({
      export_id: 'export-12345678',
      source_user_id: 'source-user',
    });
  });

  it('encrypts row chunks with reusable archive metadata', async () => {
    const context = await createArchiveCryptoContext('correct horse battery');
    const chunk = await encryptArchiveRowsChunk('messages', 3, [
      { id: 'message-old', user_id: 'source-user', content: 'hello chunk' },
    ], context);
    const decryptContext = await createArchiveDecryptContext('correct horse battery', context.encryption);

    expect(chunk.mode).toBe('chunk');
    expect(chunk.index).toBe(3);
    expect(chunk.row_count).toBe(1);
    expect(chunk.payload).not.toContain('hello chunk');
    await expect(decryptArchiveRowsChunk(chunk, decryptContext)).resolves.toEqual([
      { id: 'message-old', user_id: 'source-user', content: 'hello chunk' },
    ]);
  });

  it('recognizes chunked archive manifests separately from legacy single-file exports', () => {
    const manifest = {
      format: ACCOUNT_EXPORT_FORMAT,
      version: ACCOUNT_EXPORT_VERSION,
      mode: 'chunked',
      encryption: {
        alg: 'AES-GCM',
        kdf: 'PBKDF2-SHA256',
        iterations: 250_000,
        salt: 'c2FsdA==',
      },
      export_id: 'export-12345678',
      exported_at: '2026-06-16T00:00:00.000Z',
      source_user_id: 'source-user',
      manifest: basePayload().manifest,
      chunks: [],
      assets: [],
      warnings: [],
    };

    expect(validateChunkedArchive(manifest).mode).toBe('chunked');
    expect(parsePortableArchiveText(JSON.stringify(manifest))).toMatchObject({
      mode: 'chunked',
      export_id: 'export-12345678',
    });
  });

  it('redacts operational secrets without removing real message references', () => {
    const config = PORTABLE_TABLE_BY_NAME.get('crisis_events');
    expect(config).toBeTruthy();
    const redacted = redactPortableRow(config!, {
      id: 'crisis-1',
      user_id: 'source-user',
      thread_id: 'thread-old',
      message_id: 'message-old',
      encrypted_key: 'secret',
      push_subscription: { endpoint: 'secret' },
    });

    expect(redacted.message_id).toBe('message-old');
    expect(redacted.encrypted_key).toBeUndefined();
    expect(redacted.push_subscription).toBeUndefined();
  });

  it('keeps a broad allowlist and excludes operational secret tables', () => {
    const tableNames = new Set(PORTABLE_TABLES.map((table) => table.name));
    expect([...tableNames]).toEqual(expect.arrayContaining([
      'threads',
      'messages',
      'agent_configs',
      'memories',
      'engrams',
      'connections',
      'beliefs',
      'hypomnema_entry',
      'journal_entries',
      'agent_identity',
      'agent_skills',
      'scheduled_tasks',
      'artifacts',
      'projects',
      'psychological_profile',
    ]));
    expect(tableNames.has('user_api_keys')).toBe(false);
    expect(tableNames.has('agent_secrets')).toBe(false);
    expect(EXCLUDED_PORTABILITY_TABLES).toEqual(expect.arrayContaining([
      'user_api_keys',
      'agent_secrets',
      'openclaw_devices',
      'token_gate_verifications',
      'email_send_log',
    ]));
    expect(PORTABLE_TABLE_BY_NAME.get('engrams')?.importBatchSize).toBeLessThanOrEqual(25);
    expect(PORTABLE_TABLE_BY_NAME.get('hypomnema_entry')?.importBatchSize).toBeLessThanOrEqual(25);
  });

  it('remaps dependent rows and refreshes imported attachment references', () => {
    const messageConfig = PORTABLE_TABLE_BY_NAME.get('messages')!;
    const transformed = transformRowForImport(messageConfig, {
      id: 'message-old',
      user_id: 'source-user',
      thread_id: 'thread-old',
      role: 'user',
      content: 'with attachment',
      attachments: [{
        type: 'file',
        url: 'https://old.example/file.txt',
        meta: {
          bucket: 'chat-attachments',
          path: 'source-user/thread-old/file.txt',
        },
      }],
    }, 'target-user', maps, 'job-1', 'export-12345678');

    expect(transformed.id).toBe('message-new');
    expect(transformed.user_id).toBe('target-user');
    expect(transformed.thread_id).toBe('thread-new');
    const [attachment] = transformed.attachments as AttachmentRow[];
    expect(attachment.url).toBe('https://signed.example/file.txt');
    expect(attachment.meta.path).toBe('target-user/thread-new/file.txt');
  });

  it('imports proactive tasks disabled and remaps memory graph edges', () => {
    const scheduled = transformRowForImport(PORTABLE_TABLE_BY_NAME.get('scheduled_tasks')!, {
      id: 'task-old',
      user_id: 'source-user',
      agent_id: 'custom-agent',
      name: 'Morning note',
      prompt: 'check in',
      schedule_expr: '0 9 * * *',
      target_thread_id: 'thread-old',
      enabled: true,
      next_run_at: '2026-06-17T14:00:00.000Z',
      last_run_at: '2026-06-15T14:00:00.000Z',
      last_run_status: 'success',
    }, 'target-user', maps, 'job-1', 'export-12345678');

    expect(scheduled.enabled).toBe(false);
    expect(scheduled.agent_id).toBe('restored-custom-agent');
    expect(scheduled.target_thread_id).toBe('thread-new');
    expect(scheduled.next_run_at).toBeNull();
    expect(scheduled.last_run_at).toBeNull();

    const belief = transformRowForImport(PORTABLE_TABLE_BY_NAME.get('beliefs')!, {
      id: 'belief-old',
      user_id: 'source-user',
      agent_id: 'luca',
      content: 'Riley values continuity.',
      supporting_engram_ids: ['engram-a'],
      contradicting_engram_ids: ['engram-b'],
    }, 'target-user', maps, 'job-1', 'export-12345678');

    expect(belief.supporting_engram_ids).toEqual(['engram-new-a']);
    expect(belief.contradicting_engram_ids).toEqual(['engram-new-b']);
  });

  it('uses fresh target IDs for singleton rows while preserving available custom agent IDs', () => {
    const payload = basePayload();
    payload.tables.profiles = [{ id: 'profile-source', user_id: 'source-user', display_name: 'Old Riley' }];
    payload.tables.agent_configs = [
      { id: 'luca', user_id: 'source-user', name: 'Luca' },
      { id: 'research-agent', user_id: 'source-user', name: 'Research agent' },
      { id: 'busy-agent', user_id: 'source-user', name: 'Busy agent' },
    ];

    const idMaps = createIdMaps(payload, new Set(['busy-agent']));

    expect(idMaps.ids.profiles['profile-source']).toBeTruthy();
    expect(idMaps.ids.profiles['profile-source']).not.toBe('profile-source');
    expect(idMaps.ids.agent_configs.luca).toBe('luca');
    expect(idMaps.ids.agent_configs['research-agent']).toBe('research-agent');
    expect(idMaps.ids.agent_configs['busy-agent']).toBe('restored-busy-agent-export-1');
  });
});

describe('account portability edge safety', () => {
  it('keeps preview authenticated and read-only', () => {
    const preview = read('supabase/functions/account-import-preview/index.ts');
    expect(preview).toContain('requireAuth(req)');
    expect(preview).toContain('buildImportPreview');
    expect(preview).not.toContain('applyImportPayload');
    expect(preview).not.toContain('.insert(');
    expect(preview).not.toContain('.upsert(');
    expect(preview).not.toContain('.delete(');
  });

  it('keeps apply and rollback behind user auth and row maps', () => {
    const apply = read('supabase/functions/account-import-apply/index.ts');
    const rollback = read('supabase/functions/account-import-rollback/index.ts');
    expect(apply).toContain('requireAuth(req)');
    expect(apply).toContain('startAccountImportJob');
    expect(apply).toContain('rollbackFailedImportAttempts');
    expect(apply).toContain('account_portability_jobs');
    expect(rollback).toContain('requireAuth(req)');
    expect(rollback).toContain('rollbackImportJob');
    expect(rollback).not.toContain('.gte("created_at"');
    expect(rollback).not.toContain('.lte("created_at"');
  });

  it('creates a private account-portability bucket with user-owned reads', () => {
    const migration = read('supabase/migrations/20260616000000_account_portability.sql');
    expect(migration).toContain("VALUES ('account-portability', 'account-portability', false");
    expect(migration).toContain('account_portability_jobs');
    expect(migration).toContain('account_portability_row_map');
    expect(migration).toContain("auth.uid()::text = (storage.foldername(name))[1]");
    expect(migration).toContain('service role full access account portability archives');
  });

  it('wires the settings import surface to account transfer controls', () => {
    const page = read('src/pages/ImportView.tsx');
    const component = read('src/components/AccountPortabilityPanel.tsx');
    expect(page).toContain('AccountPortabilityPanel');
    expect(page).toContain('Import & export');
    expect(component).toContain('polyphonic account transfer');
    expect(component).toContain('Create encrypted export');
    expect(component).toContain('Apply merge');
    expect(component).toContain('Rollback imported rows');
  });

  it('keeps export failures diagnosable and storage assets best-effort', () => {
    const store = read('src/stores/accountPortabilityStore.ts');
    const server = read('supabase/functions/_shared/account-portability/server.ts');

    expect(store).toContain('const responseText = await response.text()');
    expect(store).toContain('parseResponsePayload(responseText)');
    expect(store).toContain('pollImportJob(data.job_id)');
    expect(server).toContain('ACCOUNT_PORTABILITY_BUNDLE_ASSETS');
    expect(server).toContain('deferredAssets(uniqueRefs(refs), warnings)');
    expect(server).toContain('asset binary deferred');
    expect(server).toContain('MAX_TOTAL_BUNDLED_ASSET_BYTES');
    expect(server).toContain('Storage asset size unknown; not bundled');
    expect(server).toContain('archive asset budget reached');
    expect(server).toContain('importBatchSizeFor(config)');
  });
});
