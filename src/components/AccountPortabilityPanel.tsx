import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Download, FileCheck2, Loader2, RotateCcw, ShieldCheck, Upload } from 'lucide-react';
import { useAccountPortabilityStore, type PortabilityPreview } from '@/stores/accountPortabilityStore';

const TOP_COUNT_KEYS = [
  'threads',
  'messages',
  'memories',
  'engrams',
  'connections',
  'beliefs',
  'hypomnema_entry',
  'journal_entries',
  'thought_stream',
  'agent_identity',
  'agent_skills',
  'artifacts',
  'projects',
];

export default function AccountPortabilityPanel() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const {
    exportStatus,
    exportError,
    exportFileName,
    exportUrl,
    exportCounts,
    exportWarnings,
    previewStatus,
    importStatus,
    importError,
    selectedFileName,
    preview,
    importJobId,
    importCounts,
    importWarnings,
    rollbackStatus,
    createExport,
    previewImport,
    applyImport,
    rollbackImport,
    resetImport,
  } = useAccountPortabilityStore();

  const canExport = exportPassphrase.trim().length >= 8 && exportStatus !== 'working';
  const canPreview = Boolean(importFile) && importPassphrase.trim().length >= 8 && previewStatus !== 'working';
  const canApply = Boolean(preview) && importStatus !== 'working' && previewStatus === 'ready';
  const exportTotal = sumCounts(exportCounts);
  const importTotal = sumCounts(importCounts);

  return (
    <section className="account-transfer-shell" aria-label="Polyphonic account transfer">
      <div className="account-transfer-head">
        <div>
          <div className="account-transfer-kicker">polyphonic account transfer</div>
          <h2>Move Luca's substrate to a new account.</h2>
        </div>
        <ShieldCheck size={18} aria-hidden="true" />
      </div>

      <div className="account-transfer-grid">
        <div className="account-transfer-panel">
          <PanelTitle icon={<Download size={15} aria-hidden="true" />} title="Export" />
          <PasswordInput
            value={exportPassphrase}
            onChange={setExportPassphrase}
            placeholder="Export passphrase"
          />
          <button
            type="button"
            className="account-transfer-button primary"
            disabled={!canExport}
            onClick={() => void createExport(exportPassphrase)}
          >
            {exportStatus === 'working' ? <Loader2 size={14} className="account-transfer-spin" /> : <Download size={14} />}
            <span>{exportStatus === 'working' ? 'Creating archive' : 'Create encrypted export'}</span>
          </button>

          {exportStatus === 'ready' && exportUrl && (
            <>
              <div className="account-transfer-result">
                <FileCheck2 size={14} aria-hidden="true" />
                <div>
                  <strong>{exportFileName || 'polyphonic-export.polyphonic-export'}</strong>
                  <div>{exportTotal.toLocaleString()} rows captured - encrypted archive ready</div>
                </div>
              </div>
              <button
                type="button"
                className="account-transfer-button primary"
                onClick={() => void downloadExportArchive(exportUrl, exportFileName)}
              >
                <Download size={14} />
                <span>Download .polyphonic-export</span>
              </button>
              <div className="account-transfer-note">
                Save this file and your passphrase. Sign in to the new account, open Settings - Account transfer, and use Preview import then Apply merge to restore.
              </div>
            </>
          )}
          {exportStatus === 'error' && exportError && <InlineError message={exportError} />}
          <CountStrip counts={exportCounts} />
          <WarningList warnings={exportWarnings} />
        </div>

        <div className="account-transfer-panel">
          <PanelTitle icon={<Upload size={15} aria-hidden="true" />} title="Import" />
          <div className="account-transfer-file-row">
            <button
              type="button"
              className="account-transfer-button"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload size={14} />
              <span>{selectedFileName || importFile?.name || 'Choose archive'}</span>
            </button>
            {(selectedFileName || importFile) && (
              <button
                type="button"
                className="account-transfer-icon-button"
                aria-label="Clear selected archive"
                onClick={() => {
                  setImportFile(null);
                  resetImport();
                  if (importInputRef.current) importInputRef.current.value = '';
                }}
              >
                x
              </button>
            )}
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".polyphonic-export,.json,application/json"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] || null;
              setImportFile(file);
              resetImport();
            }}
          />
          <PasswordInput
            value={importPassphrase}
            onChange={setImportPassphrase}
            placeholder="Archive passphrase"
          />
          <div className="account-transfer-actions">
            <button
              type="button"
              className="account-transfer-button"
              disabled={!canPreview}
              onClick={() => importFile && void previewImport(importFile, importPassphrase)}
            >
              {previewStatus === 'working' ? <Loader2 size={14} className="account-transfer-spin" /> : <FileCheck2 size={14} />}
              <span>{previewStatus === 'working' ? 'Validating' : 'Preview import'}</span>
            </button>
            <button
              type="button"
              className="account-transfer-button primary"
              disabled={!canApply}
              onClick={() => void applyImport(importPassphrase)}
            >
              {importStatus === 'working' ? <Loader2 size={14} className="account-transfer-spin" /> : <ShieldCheck size={14} />}
              <span>{importStatus === 'working' ? 'Importing' : 'Apply merge'}</span>
            </button>
          </div>

          {preview && <PreviewSummary preview={preview} />}
          {importStatus === 'ready' && (
            <div className="account-transfer-result">
              <FileCheck2 size={14} aria-hidden="true" />
              <div>
                <strong>{importTotal.toLocaleString()} rows restored</strong>
                <div>{importJobId ? `Job ${importJobId.slice(0, 8)}` : 'Import complete'}</div>
              </div>
            </div>
          )}
          {importStatus === 'ready' && importJobId && (
            <button
              type="button"
              className="account-transfer-button danger"
              disabled={rollbackStatus === 'working' || rollbackStatus === 'ready'}
              onClick={() => {
                if (window.confirm('Rollback rows created by this import?')) void rollbackImport(importJobId);
              }}
            >
              {rollbackStatus === 'working' ? <Loader2 size={14} className="account-transfer-spin" /> : <RotateCcw size={14} />}
              <span>{rollbackStatus === 'ready' ? 'Rollback complete' : 'Rollback imported rows'}</span>
            </button>
          )}
          {importError && <InlineError message={importError} muted={importStatus === 'ready'} />}
          <CountStrip counts={importCounts} />
          <WarningList warnings={importWarnings} />
        </div>
      </div>
    </section>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="account-transfer-panel-title">
      {icon}
      <span>{title}</span>
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      className="account-transfer-input"
      type="password"
      autoComplete="new-password"
      minLength={8}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function PreviewSummary({ preview }: { preview: PortabilityPreview }) {
  const total = sumCounts(preview.counts);
  const restoredAgents = preview.agent_mappings.filter((agent) => agent.mode === 'restored-id').length;
  const residentAgents = preview.agent_mappings.filter((agent) => agent.mode === 'resident-merge').length;
  return (
    <div className="account-transfer-preview">
      <div className="account-transfer-preview-row">
        <span>Archive</span>
        <strong>{total.toLocaleString()} rows</strong>
      </div>
      <div className="account-transfer-preview-row">
        <span>Assets</span>
        <strong>{preview.assets.total - preview.assets.missing}/{preview.assets.total}</strong>
      </div>
      <div className="account-transfer-preview-row">
        <span>Agents</span>
        <strong>{residentAgents} resident - {restoredAgents} restored</strong>
      </div>
      {preview.duplicate_job_id && (
        <div className="account-transfer-note">Archive already imported for this account.</div>
      )}
      {preview.conflicts.length > 0 && (
        <div className="account-transfer-conflicts">
          <AlertTriangle size={13} aria-hidden="true" />
          <span>{preview.conflicts.length} existing target rows will be preserved.</span>
        </div>
      )}
      <CountStrip counts={preview.counts} />
      <WarningList warnings={preview.warnings} />
    </div>
  );
}

function CountStrip({ counts }: { counts: Record<string, number> }) {
  const entries = TOP_COUNT_KEYS
    .map((key) => [key, counts[key] || 0] as const)
    .filter(([, value]) => value > 0)
    .slice(0, 6);
  if (entries.length === 0) return null;
  return (
    <div className="account-transfer-counts">
      {entries.map(([key, value]) => (
        <span key={key}>{labelForCount(key)} - {value.toLocaleString()}</span>
      ))}
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="account-transfer-warnings">
      {warnings.slice(0, 3).map((warning) => (
        <div key={warning}>{warning}</div>
      ))}
      {warnings.length > 3 && <div>{warnings.length - 3} more warnings</div>}
    </div>
  );
}

function InlineError({ message, muted }: { message: string; muted?: boolean }) {
  return <div className={muted ? 'account-transfer-note' : 'account-transfer-error'}>{message}</div>;
}

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts || {}).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

function labelForCount(key: string): string {
  return key.replace(/_/g, ' ');
}

async function downloadExportArchive(url: string, fileName: string | null): Promise<void> {
  const name = ensureExportExtension(fileName);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, name);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    // Fallback: direct link (browser may open inline instead of download)
    triggerDownload(url, name);
  }
}

function triggerDownload(href: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function ensureExportExtension(fileName: string | null): string {
  const base = (fileName || 'polyphonic-export').trim() || 'polyphonic-export';
  return base.endsWith('.polyphonic-export') ? base : `${base}.polyphonic-export`;
}
