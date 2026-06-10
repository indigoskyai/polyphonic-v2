import React from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';

interface RichBodyProps {
  source: string;
  className?: string;
  streaming?: boolean;
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

function RichBody({ source, className, streaming = false }: RichBodyProps) {
  const navigate = useNavigate();
  const { text, openBlockIndex } = streaming
    ? autoCloseFence(source)
    : { text: source, openBlockIndex: null as number | null };

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
