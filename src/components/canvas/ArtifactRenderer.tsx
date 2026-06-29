import { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Eye, RefreshCw, Copy, Check, Download, ExternalLink, X, Maximize2, Minimize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import RichBody from '@/components/rich/RichBody';
import CodeBlock from '@/components/rich/CodeBlock';
import type { Artifact } from '@/stores/artifactStore';
import { buildHtmlDoc, buildReactRuntimeDoc } from './artifactRuntime';
import SimulationCard from '@/components/simulations/SimulationCard';

const EXT_FOR_KIND: Record<string, string> = {
  html: 'html', svg: 'svg', mermaid: 'mmd', markdown: 'md', react: 'tsx', simulation: 'json',
};

const LANG_FOR_KIND: Record<string, string> = {
  html: 'html', svg: 'xml', mermaid: 'mermaid', markdown: 'markdown', react: 'tsx', simulation: 'json',
};

/** Diagnostics posted by the artifact iframe runtime (artifactRuntime.ts). */
export interface RuntimeMessage {
  __artifact: true;
  type: 'ready' | 'error' | 'console';
  kind?: string;
  level?: string;
  message?: string;
  stack?: string;
  args?: string[];
}

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

interface ArtifactRendererProps {
  artifact: Artifact;
  /** Inline compact card (320px). */
  compact?: boolean;
  /** Fill the parent (canvas pane / fullscreen) instead of a fixed height. */
  fill?: boolean;
  /** Controlled preview/code toggle. */
  view?: 'preview' | 'code';
  onViewChange?: (view: 'preview' | 'code') => void;
  /** When set, shows a close (X) button (canvas pane). */
  onClose?: () => void;
  /** When set, shows a fullscreen toggle. */
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  /** In the canvas, the external-link opens /canvas/:id in a NEW tab rather than navigating. */
  inCanvas?: boolean;
  /** Receives runtime diagnostics from the iframe (Phase 2 console). */
  onRuntimeMessage?: (msg: RuntimeMessage) => void;
}

export default function ArtifactRenderer({
  artifact,
  compact = false,
  fill = false,
  view: viewProp,
  onViewChange,
  onClose,
  onToggleFullscreen,
  isFullscreen = false,
  inCanvas = false,
  onRuntimeMessage,
}: ArtifactRendererProps) {
  const navigate = useNavigate();
  const [internalView, setInternalView] = useState<'preview' | 'code'>('preview');
  const view = viewProp ?? internalView;
  const setView = (v: 'preview' | 'code') => {
    if (onViewChange) onViewChange(v);
    else setInternalView(v);
  };
  const [iframeKey, setIframeKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const ext = EXT_FOR_KIND[artifact.kind] || 'txt';
  const lang = LANG_FOR_KIND[artifact.kind] || 'text';
  const isFrameKind = artifact.kind === 'html' || artifact.kind === 'svg' || artifact.kind === 'react';

  // Forward iframe runtime diagnostics (only from THIS artifact's frame).
  useEffect(() => {
    if (!onRuntimeMessage) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.__artifact && e.source === iframeRef.current?.contentWindow) {
        onRuntimeMessage(e.data as RuntimeMessage);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onRuntimeMessage]);

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

  const frameHeight = fill ? '100%' : (compact ? 320 : 620);
  const codeMaxHeight = fill ? undefined : (compact ? 320 : 620);

  const previewBody = useMemo(() => {
    if (view === 'code') {
      return (
        <div style={{ background: 'var(--floor)', height: fill ? '100%' : undefined, maxHeight: codeMaxHeight, overflow: 'auto' }}>
          <CodeBlock lang={lang} source={artifact.content} />
        </div>
      );
    }
    if (artifact.kind === 'markdown') {
      return <div style={{ padding: 18, background: 'var(--surface-1)', height: fill ? '100%' : undefined, overflow: 'auto' }}><RichBody source={artifact.content} /></div>;
    }
    if (artifact.kind === 'mermaid') {
      return <MermaidView source={artifact.content} />;
    }
    if (artifact.kind === 'simulation') {
      return <SimulationCard artifact={artifact} compact={compact} fill={fill} inCanvas={inCanvas} />;
    }
    if (isFrameKind) {
      const srcDoc = artifact.kind === 'react' ? buildReactRuntimeDoc(artifact.content) : buildHtmlDoc(artifact.content);
      return (
        <iframe
          ref={iframeRef}
          key={`${artifact.id}:${artifact.version}:${iframeKey}`}
          title={artifact.title || 'Artifact preview'}
          sandbox="allow-scripts allow-popups allow-forms allow-modals"
          srcDoc={srcDoc}
          style={{ width: '100%', height: frameHeight, border: 'none', background: '#fff', display: 'block' }}
        />
      );
    }
    return (
      <pre style={{ margin: 0, padding: 16, color: 'var(--text-body)', background: 'var(--surface-1)', fontSize: 12, lineHeight: 1.6, height: fill ? '100%' : undefined, maxHeight: codeMaxHeight, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
        {artifact.content}
      </pre>
    );
  }, [view, artifact, fill, compact, iframeKey, lang, frameHeight, codeMaxHeight, isFrameKind]);

  const canRefresh = view === 'preview' && isFrameKind;

  return (
    <div className="artifact-renderer" style={{
      border: fill ? 'none' : '1px solid var(--border-subtle)',
      borderRadius: fill ? 0 : 'var(--radius-md)',
      overflow: 'hidden',
      background: 'var(--floor)',
      boxShadow: fill ? 'none' : '0 1px 0 rgba(255,255,255,0.02) inset, 0 12px 30px -22px rgba(0,0,0,0.6)',
      ...(fill ? { height: '100%', display: 'flex', flexDirection: 'column' as const } : {}),
    }}>
      <div className="artifact-toolbar" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px 6px 14px',
        background: 'var(--surface-1)',
        borderBottom: '1px solid var(--border-subtle)',
        flex: fill ? '0 0 auto' : undefined,
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--luca-full, var(--text-ghost))', boxShadow: '0 0 6px rgba(96, 165, 250, 0.35)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 'var(--track-mono)', color: 'var(--text-soft)' }}>
            {artifact.kind}{artifact.version > 1 ? ` · v${artifact.version}` : ''}
          </span>
          {artifact.title && (
            <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: fill ? 420 : 320 }}>
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
          {inCanvas ? (
            <button type="button" className="code-icon-btn" onClick={() => window.open(`/canvas/${artifact.id}`, '_blank', 'noopener')} title="Open in new tab" aria-label="Open in new tab">
              <ExternalLink size={12} />
            </button>
          ) : !compact ? (
            <button type="button" className="code-icon-btn" onClick={() => navigate(`/canvas/${artifact.id}`)} title="Open in canvas" aria-label="Open in canvas">
              <ExternalLink size={12} />
            </button>
          ) : null}
          {onToggleFullscreen && (
            <button type="button" className="code-icon-btn" onClick={onToggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label="Toggle fullscreen">
              {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
          {onClose && (
            <button type="button" className="code-icon-btn" onClick={onClose} title="Close" aria-label="Close canvas">
              <X size={13} />
            </button>
          )}
        </div>
      </div>
      {fill ? <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{previewBody}</div> : previewBody}
    </div>
  );
}
