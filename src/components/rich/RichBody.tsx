import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { highlight } from './syntaxHighlight';

interface RichBodyProps {
  source: string;
  className?: string;
}

export default function RichBody({ source, className }: RichBodyProps) {
  return (
    <div className={`rich-body${className ? ` ${className}` : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className: codeClass, children, ...props }: {
            inline?: boolean;
            className?: string;
            children?: React.ReactNode;
          }) {
            const lang = /language-(\w+)/.exec(codeClass ?? '')?.[1];
            if (inline || !lang) {
              return <code {...props}>{children}</code>;
            }
            const html = highlight(String(children).replace(/\n$/, ''), lang);
            return (
              <div className="code-with-header">
                <div className="code-lang-tag">{lang}</div>
                <pre>
                  <code dangerouslySetInnerHTML={{ __html: html }} />
                </pre>
              </div>
            );
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
