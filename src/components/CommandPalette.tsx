import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThreadStore } from '@/stores/threadStore';
import { useSettingsModalStore } from '@/stores/settingsModalStore';

interface CommandItem {
  id: string;
  label: string;
  kind: 'nav' | 'thread' | 'action';
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
  const createThread = useThreadStore((s) => s.createThread);
  const openSettings = useSettingsModalStore((s) => s.openSettings);

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

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Build command list
  const navCommands: CommandItem[] = [
    { id: 'nav-chat', label: 'Chat', kind: 'nav', description: 'Go to chat', action: () => { navigate('/chat'); setOpen(false); } },
    { id: 'nav-memory', label: 'Memory', kind: 'nav', description: 'Memory graph and engrams', action: () => { navigate('/memory'); setOpen(false); } },
    { id: 'nav-mind', label: 'Mind', kind: 'nav', description: 'Inner life engine', action: () => { navigate('/mind'); setOpen(false); } },
    { id: 'nav-import', label: 'Import', kind: 'nav', description: 'Import conversations', action: () => { navigate('/import'); setOpen(false); } },
    { id: 'nav-profile', label: 'Profile', kind: 'nav', description: 'Psychological profile', action: () => { navigate('/profile'); setOpen(false); } },
    { id: 'action-settings', label: 'Settings', kind: 'action', description: 'Open settings', action: () => { openSettings(); setOpen(false); } },
    { id: 'action-new-thread', label: 'New thread', kind: 'action', description: 'Start a new conversation', action: async () => {
      const { useAuthStore } = await import('@/stores/authStore');
      const user = useAuthStore.getState().user;
      if (!user) return;
      const id = await createThread(user.id);
      navigate(`/chat/${id}`);
      setOpen(false);
    } },
  ];
  const threadCommands: CommandItem[] = threads.slice(0, 20).map((t) => ({
    id: `thread-${t.id}`,
    label: t.title || 'Untitled conversation',
    kind: 'thread' as const,
    action: () => { navigate(`/chat/${t.id}`); setOpen(false); },
  }));
  const allCommands = [...navCommands, ...threadCommands];

  const filtered = query
    ? allCommands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()) || c.description?.toLowerCase().includes(query.toLowerCase()))
    : allCommands;

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

  // Group filtered items for section labels
  const grouped: { label: string; items: CommandItem[] }[] = [];
  const navFiltered = filtered.filter((c) => c.kind === 'nav');
  const actionFiltered = filtered.filter((c) => c.kind === 'action');
  const threadFiltered = filtered.filter((c) => c.kind === 'thread');
  if (navFiltered.length) grouped.push({ label: 'Navigate', items: navFiltered });
  if (actionFiltered.length) grouped.push({ label: 'Actions', items: actionFiltered });
  if (threadFiltered.length) grouped.push({ label: 'Threads', items: threadFiltered });

  // Compute flat index map for selection highlight
  const flatOrder: CommandItem[] = grouped.flatMap((g) => g.items);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center" style={{ paddingTop: '14vh' }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div
        style={{
          position: 'relative',
          width: 640,
          maxHeight: '62vh',
          background: 'var(--surface-3)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-palette)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'viewFadeIn 0.15s var(--ease-out) both',
        }}
      >
        {/* Input */}
        <div style={{ borderBottom: '1px solid var(--border-subtle)', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: 'var(--text-ghost)' }}>
            <circle cx={6} cy={6} r={4} />
            <path d="M9 9l3 3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search threads, jump to view…"
            style={{
              width: '100%',
              height: 52,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 13.5,
              fontWeight: 400,
              letterSpacing: 'var(--track-body)',
              color: 'var(--text-body)',
              fontFamily: 'var(--font-sans)',
            }}
          />
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '20px', fontSize: 12, color: 'var(--text-ghost)', textAlign: 'center', letterSpacing: 'var(--track-body)' }}>
              No results
            </div>
          )}
          {grouped.map((group) => (
            <div key={group.label}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--track-meta)',
                  color: 'var(--text-ghost)',
                  padding: '10px 20px 4px',
                }}
              >
                {group.label}
              </div>
              {group.items.map((item) => {
                const flatIdx = flatOrder.indexOf(item);
                const isSelected = flatIdx === selectedIndex;
                return (
                  <div
                    key={item.id}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(flatIdx)}
                    style={{
                      padding: '8px 20px',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--overlay-active)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'background var(--dur-fast) var(--ease-out)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 13,
                          fontWeight: 450,
                          letterSpacing: 'var(--track-body)',
                          color: isSelected ? 'var(--text-primary)' : 'var(--text-body)',
                        }}
                      >
                        {item.label}
                      </div>
                      {item.description && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--text-ghost)',
                            marginTop: 1,
                            letterSpacing: 'var(--track-body)',
                          }}
                        >
                          {item.description}
                        </div>
                      )}
                    </div>
                    <TypeChip kind={item.kind} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer keyboard legend */}
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            letterSpacing: 'var(--track-mono)',
            color: 'var(--text-ghost)',
          }}
        >
          <KeyHint k="↵" label="open" />
          <KeyHint k="↑↓" label="navigate" />
          <KeyHint k="esc" label="close" />
          <div style={{ flex: 1 }} />
          <span style={{ opacity: 0.6 }}>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}

function TypeChip({ kind }: { kind: 'nav' | 'thread' | 'action' }) {
  const map = {
    nav: { label: 'view', color: 'var(--text-ghost)' },
    thread: { label: 'thread', color: 'var(--text-soft)' },
    action: { label: 'action', color: 'var(--amber-soft)' },
  };
  const { label, color } = map[kind];
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        letterSpacing: 'var(--track-mono)',
        textTransform: 'uppercase',
        color,
        padding: '2px 6px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid var(--border-faint)',
        background: 'var(--overlay-hover)',
      }}
    >
      {label}
    </span>
  );
}

function KeyHint({ k, label }: { k: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span
        style={{
          display: 'inline-block',
          minWidth: 16,
          padding: '1px 5px',
          textAlign: 'center',
          background: 'var(--overlay-hover)',
          border: '1px solid var(--border-faint)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-soft)',
        }}
      >
        {k}
      </span>
      <span>{label}</span>
    </span>
  );
}
