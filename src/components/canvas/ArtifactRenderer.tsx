import { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Eye, RefreshCw, Copy, Check, Download, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import RichBody from '@/components/rich/RichBody';
import CodeBlock from '@/components/rich/CodeBlock';
import type { Artifact } from '@/stores/artifactStore';

function htmlDoc(content: string) {
  if (/<html[\s>]/i.test(content) || /<!doctype/i.test(content)) return content;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://esm.sh; font-src https: data:;"></head><body style="margin:0;font-family:system-ui,-apple-system,sans-serif;">${content}</body></html>`;
}

const EXT_FOR_KIND: Record<string, string> = {
  html: 'html', svg: 'svg', mermaid: 'mmd', markdown: 'md', react: 'tsx',
};

const LANG_FOR_KIND: Record<string, string> = {
  html: 'html', svg: 'xml', mermaid: 'mermaid', markdown: 'markdown', react: 'tsx',
};

function MermaidView({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const m = (await import('mermaid')).default;
        m.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict', fontFamily: 'JetBrains Mono, monospace' });
        const id = `mmd-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await m.render(id, source);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to render diagram');
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ color: 'var(--text-soft)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 8 }}>mermaid error</div>
        <pre style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'pre-wrap' }}>{error}</pre>
      </div>
    );
  }
  return <div ref={ref} className="mermaid-host" style={{ display: 'flex', justifyContent: 'center', padding: 24, background: 'var(--surface-1)' }} />;
}

export default function ArtifactRenderer({ artifact, compact = false }: { artifact: Artifact; compact?: boolean }) {
  const navigate = useNavigate();
  const [view, setView] = useState<'preview' | 'code'>('preview');
  const [iframeKey, setIframeKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const height = compact ? 320 : 620;

  const ext = EXT_FOR_KIND[artifact.kind] || 'txt';
  const lang = LANG_FOR_KIND[artifact.kind] || 'text';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* no-op */ }
  };
  const download = () => {
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(artifact.title || 'artifact').replace(/\s+/g, '-').toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewBody = useMemo(() => {
    if (view === 'code') {
      return (
        <div style={{ background: 'var(--floor)', maxHeight: height, overflow: 'auto' }}>
          <CodeBlock lang={lang} source={artifact.content} />
        </div>
      );
    }
    if (artifact.kind === 'markdown') {
      return <div style={{ padding: 18, background: 'var(--surface-1)' }}><RichBody source={artifact.content} /></div>;
    }
    if (artifact.kind === 'mermaid') {
      return <MermaidView source={artifact.content} />;
    }
    if (artifact.kind === 'html' || artifact.kind === 'svg' || artifact.kind === 'react') {
      return (
        <iframe
          key={iframeKey}
          title={artifact.title || 'Artifact preview'}
          sandbox="allow-scripts"
          srcDoc={htmlDoc(artifact.content)}
          style={{ width: '100%', height, border: 'none', background: '#fff', display: 'block' }}
        />
      );
    }
    return (
      <pre style={{ margin: 0, padding: 16, color: 'var(--text-body)', background: 'var(--surface-1)', fontSize: 12, lineHeight: 1.6, maxHeight: height, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
        {artifact.content}
      </pre>
    );
  }, [view, artifact, height, iframeKey, lang]);

  const canRefresh = view === 'preview' && (artifact.kind === 'html' || artifact.kind === 'svg' || artifact.kind === 'react');

  return (
    <div className="artifact-renderer" style={{
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      background: 'var(--floor)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.02) inset, 0 12px 30px -22px rgba(0,0,0,0.6)',
    }}>
      <div className="artifact-toolbar" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px 6px 14px',
        background: 'var(--surface-1)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--luca-full, var(--text-ghost))', boxShadow: '0 0 6px rgba(201,168,124,0.35)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 'var(--track-mono)', color: 'var(--text-soft)' }}>
            {artifact.kind}{artifact.version > 1 ? ` · v${artifact.version}` : ''}
          </span>
          {artifact.title && (
            <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>
              {artifact.title}
            </span>
          )}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <div role="tablist" style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 999, padding: 2, marginRight: 6 }}>
            <button type="button" onClick={() => setView('preview')} className={`code-icon-btn${view === 'preview' ? ' is-on' : ''}`} style={{ height: 20, padding: '0 8px' }} aria-pressed={view === 'preview'}>
              <Eye size={11} /><span className="code-copy-label">preview</span>
            </button>
            <button type="button" onClick={() => setView('code')} className={`code-icon-btn${view === 'code' ? ' is-on' : ''}`} style={{ height: 20, padding: '0 8px' }} aria-pressed={view === 'code'}>
              <Code2 size={11} /><span className="code-copy-label">code</span>
            </button>
          </div>
          {canRefresh && (
            <button type="button" className="code-icon-btn" onClick={() => setIframeKey((n) => n + 1)} title="Refresh preview" aria-label="Refresh preview">
              <RefreshCw size={12} />
            </button>
          )}
          <button type="button" className="code-icon-btn" onClick={download} title="Download" aria-label="Download">
            <Download size={12} />
          </button>
          <button type="button" className="code-icon-btn" onClick={copy} title={copied ? 'Copied' : 'Copy'} aria-label="Copy">
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          {!compact && (
            <button type="button" className="code-icon-btn" onClick={() => navigate(`/canvas/${artifact.id}`)} title="Open in canvas" aria-label="Open in canvas">
              <ExternalLink size={12} />
            </button>
          )}
        </div>
      </div>
      {previewBody}
    </div>
  );
}
