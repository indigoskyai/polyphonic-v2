import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThreadStore } from '@/stores/threadStore';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  action: () => void;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const threads = useThreadStore((s) => s.threads);

  // Global Cmd+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Build command list
  const commands: CommandItem[] = [];

  // Navigation commands
  commands.push({ id: 'nav-chat', label: 'Chat', description: 'Go to chat', action: () => { navigate('/chat'); setOpen(false); } });
  commands.push({ id: 'nav-memory', label: 'Memory', description: 'View memory graph and engrams', action: () => { navigate('/memory'); setOpen(false); } });
  commands.push({ id: 'nav-mind', label: 'Mind', description: 'Inner life engine', action: () => { navigate('/mind'); setOpen(false); } });

  // Thread commands
  for (const thread of threads.slice(0, 20)) {
    commands.push({
      id: `thread-${thread.id}`,
      label: thread.title || 'Untitled conversation',
      description: 'Thread',
      action: () => { navigate(`/chat/${thread.id}`); setOpen(false); },
    });
  }

  // Filter by query
  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()) || c.description?.toLowerCase().includes(query.toLowerCase()))
    : commands;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      filtered[selectedIndex].action();
    }
  }, [filtered, selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center" style={{ paddingTop: '15vh' }}>
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setOpen(false)} />

      {/* Palette */}
      <div style={{
        position: 'relative',
        width: 520,
        maxHeight: '60vh',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
        animation: 'viewFadeIn 0.15s var(--ease-out) both',
      }}>
        {/* Input */}
        <div style={{ borderBottom: '1px solid var(--border-subtle)', padding: '0 16px' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search threads, navigate..."
            style={{
              width: '100%', height: 48, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)',
            }}
          />
        </div>

        {/* Results */}
        <div style={{ maxHeight: 'calc(60vh - 48px)', overflow: 'auto', padding: '4px 0' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '16px 20px', fontSize: 12, color: 'var(--text-ghost)', textAlign: 'center' }}>
              No results
            </div>
          )}
          {filtered.map((item, i) => (
            <div
              key={item.id}
              onClick={item.action}
              style={{
                padding: '8px 16px',
                cursor: 'pointer',
                background: i === selectedIndex ? 'var(--bg-surface)' : undefined,
                transition: 'background 100ms',
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{item.label}</div>
              {item.description && (
                <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 1 }}>{item.description}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
