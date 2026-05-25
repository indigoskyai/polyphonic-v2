import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';

const QUICK_PATHS = [
  { label: 'Chat', path: '/chat' },
  { label: 'Memory', path: '/memory' },
  { label: 'Mind', path: '/mind' },
  { label: 'Journal', path: '/journal' },
  { label: 'Agents', path: '/settings/agents' },
  { label: 'Help', path: '/settings/help' },
];

function cleanPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '/chat';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      return `${url.pathname}${url.search}${url.hash}` || '/chat';
    } catch {
      return '/chat';
    }
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export default function MobileLivePreview() {
  const [draftPath, setDraftPath] = useState('/chat');
  const [targetPath, setTargetPath] = useState('/chat');

  const src = useMemo(() => {
    const path = cleanPath(targetPath);
    return path.startsWith('/_mobile-live') ? '/chat' : path;
  }, [targetPath]);

  if (import.meta.env.MODE !== 'development') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mobile-live-preview">
      <div className="mobile-live-toolbar" aria-label="Mobile preview controls">
        <div>
          <div className="mobile-live-kicker">live mobile preview</div>
          <div className="mobile-live-title">Actual app at 390px wide</div>
        </div>

        <form
          className="mobile-live-form"
          onSubmit={(event) => {
            event.preventDefault();
            setTargetPath(cleanPath(draftPath));
          }}
        >
          <input
            value={draftPath}
            onChange={(event) => setDraftPath(event.target.value)}
            aria-label="Preview path"
            spellCheck={false}
          />
          <button type="submit">Go</button>
        </form>

        <div className="mobile-live-quick">
          {QUICK_PATHS.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => {
                setDraftPath(item.path);
                setTargetPath(item.path);
              }}
              data-active={src.startsWith(item.path) ? 'true' : undefined}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mobile-live-phone" aria-label="Phone-sized app preview">
        <iframe
          key={src}
          title="Polyphonic live mobile preview"
          src={src}
          className="mobile-live-iframe"
        />
      </div>
    </div>
  );
}
