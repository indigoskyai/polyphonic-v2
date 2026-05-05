import { useEffect, useState } from 'react';
import { Download, FileText, Folder, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type WorkspaceFile = {
  name: string;
  path: string;
  size: number | null;
  updated_at: string | null;
  is_folder: boolean;
};

function formatBytes(value: number | null) {
  if (!value) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function WorkspaceView() {
  const { toast } = useToast();
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selected, setSelected] = useState<{ path: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('anima-workspace-file', {
      body: { operation: 'list', path: '' },
    });
    if (error) {
      if (!error.message.toLowerCase().includes('failed to send')) {
        toast({ title: 'Workspace unavailable', description: error.message, variant: 'destructive' });
      }
      setFiles([]);
    } else {
      setFiles((data?.files || []) as WorkspaceFile[]);
    }
    setLoading(false);
  }

  async function readFile(path: string) {
    const { data, error } = await supabase.functions.invoke('anima-workspace-file', {
      body: { operation: 'read', path },
    });
    if (error) {
      toast({ title: 'Could not read file', description: error.message, variant: 'destructive' });
      return;
    }
    setSelected({ path, content: data?.content || '' });
  }

  function downloadSelected() {
    if (!selected) return;
    const blob = new Blob([selected.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = selected.path.split('/').pop() || 'workspace-file.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div style={{ padding: '44px 48px 80px', maxWidth: 1080 }}>
        <div className="flex items-start justify-between gap-6" style={{ marginBottom: 36 }}>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 'var(--track-mono)',
                color: 'var(--text-ghost)',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              § L6 / workspace
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 42,
                lineHeight: 1,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Workspace
            </h1>
          </div>
          <button
            type="button"
            title="Refresh"
            aria-label="Refresh"
            onClick={load}
            style={{
              width: 36,
              height: 36,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: '1px solid var(--border-faint)',
              background: 'var(--surface-raised)',
              color: 'var(--text-tertiary)',
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="grid gap-8" style={{ gridTemplateColumns: 'minmax(260px, 360px) minmax(0, 1fr)' }}>
          <section style={{ borderTop: '1px solid var(--border-faint)', paddingTop: 18 }}>
            {loading ? (
              <p style={{ color: 'var(--text-ghost)', fontSize: 14 }}>Loading workspace...</p>
            ) : files.length === 0 ? (
              <p style={{ color: 'var(--text-ghost)', fontSize: 14, lineHeight: 1.7 }}>
                No files yet. Luca has not written anything to the workspace.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => !file.is_folder && readFile(file.path)}
                    style={{
                      width: '100%',
                      display: 'grid',
                      gridTemplateColumns: '18px minmax(0, 1fr)',
                      gap: 10,
                      alignItems: 'start',
                      textAlign: 'left',
                      borderRadius: 8,
                      border: selected?.path === file.path ? '1px solid var(--border-focus)' : '1px solid var(--border-faint)',
                      background: selected?.path === file.path ? 'var(--surface-raised)' : 'transparent',
                      color: 'var(--text-primary)',
                      padding: '10px 11px',
                    }}
                  >
                    {file.is_folder ? <Folder size={16} /> : <FileText size={16} />}
                    <span className="min-w-0">
                      <span style={{ display: 'block', fontSize: 13, overflowWrap: 'anywhere' }}>{file.name}</span>
                      <span style={{ display: 'block', color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 4 }}>
                        {[formatBytes(file.size), formatTime(file.updated_at)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section style={{ borderTop: '1px solid var(--border-faint)', paddingTop: 18, minWidth: 0 }}>
            {selected ? (
              <>
                <div className="flex items-center justify-between gap-4" style={{ marginBottom: 14 }}>
                  <h2 style={{ margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 13, overflowWrap: 'anywhere' }}>
                    {selected.path}
                  </h2>
                  <button
                    type="button"
                    title="Download"
                    aria-label="Download"
                    onClick={downloadSelected}
                    style={{
                      width: 34,
                      height: 34,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      border: '1px solid var(--border-faint)',
                      background: 'var(--surface-raised)',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    <Download size={16} />
                  </button>
                </div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    color: 'var(--text-body)',
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--border-faint)',
                    borderRadius: 8,
                    padding: 16,
                    fontSize: 12,
                    lineHeight: 1.6,
                    maxHeight: 560,
                    overflow: 'auto',
                  }}
                >
                  {selected.content}
                </pre>
              </>
            ) : (
              <p style={{ color: 'var(--text-ghost)', fontSize: 14 }}>
                Select a workspace file to read it.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
