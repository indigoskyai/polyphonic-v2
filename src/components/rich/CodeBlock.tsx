import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, WrapText, Download, Maximize2, X } from 'lucide-react';
import { highlightSync, normalizeLang, onHighlighterReady } from './highlighter';

const ART_GLYPHS = /[╭╮╰╯─│┌┐└┘├┤┬┴┼━┃┏┓┗┛┣┫┳┻╋█▀▄▌▐░▒▓◆◇○●◐◑▲▼◀▶★☆✦✧⬢⬡]/;
function looksLikeArt(text: string): boolean {
  if (!text) return false;
  const lines = text.split('\n');
  if (lines.length < 2) return false;
  if (ART_GLYPHS.test(text)) return true;
  const nonAlnum = text.replace(/[A-Za-z0-9\s]/g, '').length;
  return nonAlnum > text.length * 0.25 && lines.length >= 3;
}

interface Props {
  lang: string | null;
  source: string;
  streaming?: boolean;
}

const COLLAPSE_THRESHOLD = 28; // lines

export default function CodeBlock({ lang, source, streaming = false }: Props) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hlVersion, setHlVersion] = useState(0);

  // Lock body scroll + ESC to close while fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [fullscreen]);

  // Re-render when shiki finishes loading (or a new lang gets loaded)
  useEffect(() => onHighlighterReady(() => setHlVersion((n) => n + 1)), []);

  const isArt = !lang && looksLikeArt(source);
  const normalized = lang ? normalizeLang(lang) : '';
  const lineCount = source.split('\n').length;
  const collapsible = !streaming && lineCount > COLLAPSE_THRESHOLD;

  const html = useMemo(() => {
    if (isArt || !lang) return null;
    return highlightSync(source, normalized);
  }, [source, lang, normalized, isArt, hlVersion]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* no-op */ }
  };

  const download = () => {
    const ext =
      normalized === 'tsx' ? 'tsx' :
      normalized === 'ts' ? 'ts' :
      normalized === 'jsx' ? 'jsx' :
      normalized === 'js' ? 'js' :
      normalized === 'python' ? 'py' :
      normalized === 'rust' ? 'rs' :
      normalized === 'bash' ? 'sh' :
      normalized === 'html' ? 'html' :
      normalized === 'css' ? 'css' :
      normalized === 'json' ? 'json' :
      normalized === 'markdown' ? 'md' :
      'txt';
    const blob = new Blob([source], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snippet.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const headerLabel = isArt ? 'art' : (normalized || 'text');

  return (
    <div className={`code-block${isArt ? ' is-art' : ''}${wrap ? ' is-wrap' : ''}${expanded ? ' is-expanded' : ''}${streaming ? ' is-streaming' : ''}`}>
      <div className="code-block-header">
        <div className="code-block-title">
          <span className="code-block-dot" aria-hidden />
          <span className="code-block-lang">{headerLabel}</span>
        </div>
        <div className="code-block-actions">
          {streaming ? (
            <span className="code-block-stream" aria-label="streaming">
              <span className="csd" /><span className="csd" /><span className="csd" />
            </span>
          ) : (
            <>
              {!isArt && (
                <button
                  type="button"
                  className={`code-icon-btn${wrap ? ' is-on' : ''}`}
                  onClick={() => setWrap((v) => !v)}
                  title={wrap ? 'Disable word wrap' : 'Word wrap'}
                  aria-label="Toggle word wrap"
                >
                  <WrapText size={13} />
                </button>
              )}
              <button
                type="button"
                className="code-icon-btn"
                onClick={download}
                title="Download"
                aria-label="Download"
              >
                <Download size={13} />
              </button>
              <button
                type="button"
                className="code-icon-btn code-copy"
                onClick={copy}
                title={copied ? 'Copied' : 'Copy'}
                aria-label="Copy"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span className="code-copy-label">{copied ? 'copied' : 'copy'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="code-block-body">
        {isArt ? (
          <pre className="code-art-pre"><code>{source}</code></pre>
        ) : html ? (
          <pre className="code-pre">
            <code dangerouslySetInnerHTML={{ __html: html }} />
          </pre>
        ) : (
          <pre className="code-pre"><code>{source}</code></pre>
        )}
        {collapsible && !expanded && <div className="code-fade" aria-hidden />}
      </div>

      {collapsible && (
        <div className="code-block-footer">
          <button type="button" className="code-expand-btn" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Collapse' : `Show all ${lineCount} lines`}
          </button>
        </div>
      )}
    </div>
  );
}
