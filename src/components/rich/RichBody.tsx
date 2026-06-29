import React from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';
import { isPromotableFence } from '@/lib/streamingArtifacts';

interface RichBodyProps {
  source: string;
  className?: string;
  streaming?: boolean;
  /** Hide fenced blocks that were promoted to an artifact (rendered in the
   *  canvas / as a chip) so the message doesn't also show the raw code wall. */
  suppressArtifactFences?: boolean;
}

/**
 * If we're mid-stream and the source has an odd number of ``` fences,
 * append a virtual closer so react-markdown parses the trailing partial
 * block as a real code block (instead of plain prose). We mark the open
 * block via context so CodeBlock can show a streaming indicator.
 */
function autoCloseFence(src: string): { text: string; openBlockIndex: number | null } {
  const fences = src.match(/^```/gm);
  const count = fences ? fences.length : 0;
  if (count % 2 === 1) {
    // index of the *current* unfinished block among all fenced blocks
    const blockIdx = Math.floor(count / 2);
    return { text: src + '\n```', openBlockIndex: blockIdx };
  }
  return { text: src, openBlockIndex: null };
}

function stripPromotedArtifactFences(src: string): string {
  if (!src.includes('```')) return src;
  const lines = src.split('\n');
  const kept: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const opener = lines[index].match(/^```([a-zA-Z0-9_-]+)?(?:\s.*)?$/);
    if (!opener) {
      kept.push(lines[index]);
      continue;
    }

    const lang = (opener[1] || '').toLowerCase();
    const bodyLines: string[] = [];
    let cursor = index + 1;
    let closed = false;
    for (; cursor < lines.length; cursor += 1) {
      if (/^```(?:\s*)$/.test(lines[cursor])) {
        closed = true;
        break;
      }
      bodyLines.push(lines[cursor]);
    }

    const body = bodyLines.join('\n');
    if (isPromotableFence(lang, body)) {
      if (kept.length > 0 && kept[kept.length - 1] !== '') kept.push('');
      if (!closed) break;
      index = cursor;
      continue;
    }

    kept.push(lines[index], ...bodyLines);
    if (closed) {
      kept.push(lines[cursor]);
      index = cursor;
    } else {
      break;
    }
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function RichBody({ source, className, streaming = false, suppressArtifactFences = false }: RichBodyProps) {
  const navigate = useNavigate();
  const renderSource = suppressArtifactFences ? stripPromotedArtifactFences(source) : source;
  const { text, openBlockIndex } = streaming
    ? autoCloseFence(renderSource)
    : { text: renderSource, openBlockIndex: null as number | null };

  // Track which fenced block we're rendering so we can flag the open one.
  const blockCounterRef = React.useRef(0);
  blockCounterRef.current = 0;

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
            const myIndex = blockCounterRef.current++;
            if (suppressArtifactFences && isPromotableFence(lang || '', text)) return null;
            const isOpenStreamingBlock = streaming && openBlockIndex !== null && myIndex === openBlockIndex;
            return <CodeBlock lang={lang} source={text} streaming={isOpenStreamingBlock} />;
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
        {text}
      </ReactMarkdown>
    </div>
  );
}

// Memoized: markdown parsing (remark/micromark) is the costly part of the
// streaming render path. All props are primitives, so a shallow memo lets the
// parent's per-token re-render skip the reparse whenever the throttled source
// string is unchanged (see StreamingText's treeSourceLen throttle in ChatView).
const MemoRichBody = React.memo(RichBody);
export default MemoRichBody;
export { MemoRichBody as RichBody };
