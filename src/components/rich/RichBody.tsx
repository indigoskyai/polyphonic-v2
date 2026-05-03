import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { highlight } from './syntaxHighlight';

interface RichBodyProps {
  source: string;
  className?: string;
}

// Detect ASCII / box-drawing / letter-art so we render it as art, not code.
const ART_GLYPHS = /[╭╮╰╯─│┌┐└┘├┤┬┴┼━┃┏┓┗┛┣┫┳┻╋█▀▄▌▐░▒▓◆◇○●◐◑▲▼◀▶★☆✦✧⬢⬡]/;
function looksLikeArt(text: string): boolean {
  if (!text) return false;
  const lines = text.split('\n');
  if (lines.length < 2) return false;
  if (ART_GLYPHS.test(text)) return true;
  // Heuristic: many lines with same length & lots of non-alphanumeric runs
  const nonAlnum = text.replace(/[A-Za-z0-9\s]/g, '').length;
  return nonAlnum > text.length * 0.25 && lines.length >= 3;
}

function CodeBlock({ lang, source }: { lang: string | null; source: string }) {
  const [copied, setCopied] = useState(false);
  const isArt = !lang && looksLikeArt(source);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* no-op */
    }
  };
  if (isArt) {
    return (
      <div className="code-with-header text-art-block">
        <div className="code-header-row">
          <div className="code-lang-tag">art</div>
          <button type="button" className="code-copy-btn" onClick={copy} aria-label="Copy">
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
        <pre className="text-art-pre">
          <code>{source}</code>
        </pre>
      </div>
    );
  }
  if (!lang) {
    return (
      <div className="code-with-header">
        <div className="code-header-row">
          <div className="code-lang-tag">text</div>
          <button type="button" className="code-copy-btn" onClick={copy} aria-label="Copy">
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
        <pre><code>{source}</code></pre>
      </div>
    );
  }
  const html = highlight(source, lang);
  return (
    <div className="code-with-header">
      <div className="code-header-row">
        <div className="code-lang-tag">{lang}</div>
        <button type="button" className="code-copy-btn" onClick={copy} aria-label="Copy">
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

export default function RichBody({ source, className }: RichBodyProps) {
  const navigate = useNavigate();
  return (
    <div className={`rich-body${className ? ` ${className}` : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...props }) {
            const isExternal = href && /^https?:\/\//i.test(href);
            const isInternal = href && href.startsWith('/');
            return (
              <a
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                onClick={isInternal ? (e) => { e.preventDefault(); navigate(href!); } : undefined}
                {...props}
              >
                {children}
              </a>
            );
          },
          code({ inline, className: codeClass, children, ...props }: {
            inline?: boolean;
            className?: string;
            children?: React.ReactNode;
          }) {
            const lang = /language-(\w+)/.exec(codeClass ?? '')?.[1] ?? null;
            const text = String(children).replace(/\n$/, '');
            if (inline) {
              return <code {...props}>{children}</code>;
            }
            return <CodeBlock lang={lang} source={text} />;
          },
          img({ src, alt }) {
            if (!src) {
              return <div className="chat-image">{alt || 'image'}</div>;
            }
            return (
              <img
                src={src}
                alt={alt ?? ''}
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  const parent = el.parentElement;
                  if (parent) {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'chat-image';
                    placeholder.textContent = alt || 'image';
                    parent.replaceChild(placeholder, el);
                  }
                }}
              />
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

export { RichBody };
