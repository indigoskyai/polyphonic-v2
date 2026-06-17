import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

type Status = 'idle' | 'working' | 'ready' | 'error';

export interface PortabilityPreview {
  archive_hash: string;
  export_id: string;
  exported_at: string;
  counts: Record<string, number>;
  assets: { total: number; missing: number };
  warnings: string[];
  duplicate_job_id: string | null;
  agent_mappings: Array<{
    source_id: string;
    target_id: string;
    mode: 'resident-merge' | 'keep' | 'restored-id';
  }>;
  conflicts: Array<{ table: string; source_id: string; reason: string }>;
}

interface AccountPortabilityState {
  exportStatus: Status;
  exportError: string | null;
  exportJobId: string | null;
  exportFileName: string | null;
  exportUrl: string | null;
  exportExpiresAt: string | null;
  exportCounts: Record<string, number>;
  exportWarnings: string[];

  importStatus: Status;
  previewStatus: Status;
  importError: string | null;
  selectedFileName: string | null;
  archiveText: string | null;
  preview: PortabilityPreview | null;
  importJobId: string | null;
  importCounts: Record<string, number>;
  importWarnings: string[];
  rollbackStatus: Status;

  createExport: (passphrase: string) => Promise<void>;
  previewImport: (file: File, passphrase: string) => Promise<void>;
  applyImport: (passphrase: string) => Promise<void>;
  rollbackImport: (jobId: string) => Promise<void>;
  resetImport: () => void;
}

export const useAccountPortabilityStore = create<AccountPortabilityState>((set, get) => ({
  exportStatus: 'idle',
  exportError: null,
  exportJobId: null,
  exportFileName: null,
  exportUrl: null,
  exportExpiresAt: null,
  exportCounts: {},
  exportWarnings: [],

  importStatus: 'idle',
  previewStatus: 'idle',
  importError: null,
  selectedFileName: null,
  archiveText: null,
  preview: null,
  importJobId: null,
  importCounts: {},
  importWarnings: [],
  rollbackStatus: 'idle',

  createExport: async (passphrase) => {
    set({
      exportStatus: 'working',
      exportError: null,
      exportUrl: null,
      exportJobId: null,
      exportFileName: null,
      exportExpiresAt: null,
      exportCounts: {},
      exportWarnings: [],
    });
    try {
      const data = await callPortabilityFunction<{
        job_id: string;
        file_name: string;
        signed_url: string;
        expires_at: string;
        counts: Record<string, number>;
        warnings: string[];
      }>('account-export-create', { passphrase });
      set({
        exportStatus: 'ready',
        exportJobId: data.job_id,
        exportFileName: data.file_name,
        exportUrl: data.signed_url,
        exportExpiresAt: data.expires_at,
        exportCounts: data.counts || {},
        exportWarnings: data.warnings || [],
      });
    } catch (error) {
      set({ exportStatus: 'error', exportError: messageFromError(error, 'Export failed') });
    }
  },

  previewImport: async (file, passphrase) => {
    set({
      previewStatus: 'working',
      importStatus: 'idle',
      importError: null,
      selectedFileName: file.name,
      preview: null,
      importJobId: null,
      importCounts: {},
      importWarnings: [],
    });
    try {
      const archiveText = await file.text();
      const data = await callPortabilityFunction<{ preview: PortabilityPreview }>('account-import-preview', {
        archive_text: archiveText,
        passphrase,
      });
      set({
        archiveText,
        preview: data.preview,
        previewStatus: 'ready',
      });
    } catch (error) {
      set({ previewStatus: 'error', importError: messageFromError(error, 'Preview failed') });
    }
  },

  applyImport: async (passphrase) => {
    const archiveText = get().archiveText;
    if (!archiveText) {
      set({ importStatus: 'error', importError: 'Choose and preview an archive first.' });
      return;
    }
    set({ importStatus: 'working', importError: null });
    try {
      const data = await callPortabilityFunction<{
        job_id: string;
        already_imported?: boolean;
        counts?: Record<string, number>;
        warnings?: string[];
      }>('account-import-apply', {
        archive_text: archiveText,
        passphrase,
      });
      set({
        importStatus: 'ready',
        importJobId: data.job_id,
        importCounts: data.counts || {},
        importWarnings: data.warnings || [],
        importError: data.already_imported ? 'This archive has already been imported for this account.' : null,
      });
    } catch (error) {
      set({ importStatus: 'error', importError: messageFromError(error, 'Import failed') });
    }
  },

  rollbackImport: async (jobId) => {
    set({ rollbackStatus: 'working', importError: null });
    try {
      await callPortabilityFunction('account-import-rollback', { job_id: jobId });
      set({ rollbackStatus: 'ready' });
    } catch (error) {
      set({ rollbackStatus: 'error', importError: messageFromError(error, 'Rollback failed') });
    }
  },

  resetImport: () => set({
    importStatus: 'idle',
    previewStatus: 'idle',
    importError: null,
    selectedFileName: null,
    archiveText: null,
    preview: null,
    importJobId: null,
    importCounts: {},
    importWarnings: [],
    rollbackStatus: 'idle',
  }),
}));

async function callPortabilityFunction<T = Record<string, unknown>>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error('Supabase URL is not configured');

  const response = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  const payload = parseResponsePayload(responseText);
  if (!response.ok) {
    const detail =
      typeof payload?.error === 'string' ? payload.error
      : typeof payload?.message === 'string' ? payload.message
      : responseText.trim();
    throw new Error(detail ? `${functionName}: ${detail}` : `${functionName} failed with ${response.status}`);
  }
  return payload as T;
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function parseResponsePayload(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
