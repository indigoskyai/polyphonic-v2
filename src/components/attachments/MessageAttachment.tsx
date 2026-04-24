import React from 'react';

interface Props {
  name: string;
  size?: number;
  mime?: string;
  url?: string;
}

function formatSize(bytes?: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function MessageAttachment({ name, size, mime, url }: Props) {
  const body = (
    <>
      <span className="msg-att-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 2h6l3 3v9H4V2z" />
          <path d="M10 2v3h3" />
        </svg>
      </span>
      <span className="msg-att-info">
        <span className="msg-att-name">{name}</span>
        {(size || mime) && (
          <span className="msg-att-meta">
            {mime} {size ? `· ${formatSize(size)}` : ''}
          </span>
        )}
      </span>
    </>
  );

  if (url) {
    return <a className="msg-att" href={url} target="_blank" rel="noopener noreferrer">{body}</a>;
  }
  return <span className="msg-att">{body}</span>;
}
