import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { usePaletteStore, type PaletteResult, type Scope } from '@/stores/paletteStore';
import { buildResults, buildQuickActions, getScopeCounts } from '@/lib/paletteSearch';
import { useDrawerStore } from '@/stores/drawerStore';
import { useSettingsModalStore } from '@/stores/settingsModalStore';
import { useThreadStore } from '@/stores/threadStore';
import { useAuthStore } from '@/stores/authStore';
import PaletteResults from './PaletteResults';

const SCOPE_TABS: { value: Scope; label: string; kbd: string }[] = [
  { value: 'all', label: 'All', kbd: '⌘1' },
  { value: 'threads', label: 'Threads', kbd: '⌘2' },
  { value: 'memory', label: 'Memory', kbd: '⌘3' },
  { value: 'files', label: 'Files', kbd: '⌘4' },
  { value: 'settings', label: 'Settings', kbd: '⌘5' },
];

export default function CommandPaletteV2() {
  const open = usePaletteStore((s) => s.open);
  const query = usePaletteStore((s) => s.query);
  const scope = usePaletteStore((s) => s.scope);
  const highlightedIndex = usePaletteStore((s) => s.highlightedIndex);
  const recent = usePaletteStore((s) => s.recent);
  const setOpen = usePaletteStore((s) => s.setOpen);
  const setQuery = usePaletteStore((s) => s.setQuery);
  const setScope = usePaletteStore((s) => s.setScope);
  const setHighlightedIndex = usePaletteStore((s) => s.setHighlightedIndex);
  const moveHighlight = usePaletteStore((s) => s.moveHighlight);
  const pushRecent = usePaletteStore((s) => s.pushRecent);
  const clearRecent = usePaletteStore((s) => s.clearRecent);

  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const openDrawer = useDrawerStore((s) => s.open);
  const openSettingsModal = useSettingsModalStore((s) => s.openSettings);
  const createThread = useThreadStore((s) => s.createThread);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handlers = useMemo(() => ({
    navigate,
    openSettings: openSettingsModal,
    openDrawer,
    createThread: async () => {
      if (!user) return;
      const id = await createThread(user.id);
      navigate(`/chat/${id}`);
    },
  }), [navigate, openSettingsModal, openDrawer, createThread, user]);

  // Global ⌘K listener + scope hotkeys + ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!usePaletteStore.getState().open);
        return;
      }
      if (!usePaletteStore.getState().open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        pushRecent(usePaletteStore.getState().query);
        setOpen(false);
        return;
      }
      if (meta && ['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        setScope(SCOPE_TABS[parseInt(e.key, 10) - 1].value);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOpen, setScope, pushRecent]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Autofocus input
  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(t);
  }, [open]);

  const quickActions = useMemo(() => buildQuickActions(handlers), [handlers]);
  const results = useMemo(() => buildResults(query, scope, handlers), [query, scope, handlers]);
  const counts = useMemo(() => getScopeCounts(handlers), [handlers]);

  const emptyQuery = query.trim().length === 0;

  // Groups for body: if empty query show quick actions (+ recents above handled separately), else group results by scope
  const groups = useMemo(() => {
    if (emptyQuery) {
      return [{ label: 'QUICK ACTIONS', items: quickActions }];
    }
    if (scope !== 'all') {
      const label = scope.toUpperCase();
      return [{ label, items: results }];
    }
    const byScope: Record<string, PaletteResult[]> = {};
    results.forEach((r) => {
      if (!byScope[r.scope]) byScope[r.scope] = [];
      byScope[r.scope].push(r);
    });
    return Object.entries(byScope).map(([k, items]) => ({ label: k.toUpperCase(), items }));
  }, [emptyQuery, quickActions, results, scope]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const max = flatItems.length;
  const highlighted = max > 0 ? flatItems[Math.min(highlightedIndex, max - 1)] : null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveHighlight(1, max);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveHighlight(-1, max);
    } else if (e.key === 'Enter') {
      if (highlighted) {
        e.preventDefault();
        pushRecent(query);
        highlighted.onActivate();
        setOpen(false);
      }
    }
  };

  const handleActivate = (r: PaletteResult) => {
    pushRecent(query);
    r.onActivate();
    setOpen(false);
  };

  const handleBackdropClick = () => {
    pushRecent(query);
    setOpen(false);
  };

  if (!open) return createPortal(<div className="palette-backdrop" />, document.body);

  return createPortal(
    <>
      <div className="palette-backdrop" data-open="true" onClick={handleBackdropClick} />
      <div className="palette" data-open="true" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-search">
          <svg className="palette-search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3 3" />
          </svg>
          <input
            ref={inputRef}
            className="palette-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search threads, memory, settings…"
            aria-label="Search"
          />
          <span className="palette-esc-chip">ESC</span>
        </div>

        <div className="palette-scopes" role="tablist">
          {SCOPE_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              className="palette-scope"
              data-active={scope === t.value ? 'true' : undefined}
              onClick={() => setScope(t.value)}
            >
              {t.label}
              <span className="palette-scope-count">{counts[t.value]}</span>
              <span className="palette-scope-kbd">{t.kbd}</span>
            </button>
          ))}
        </div>

        {emptyQuery && recent.length > 0 && (
          <div className="palette-recent">
            <span className="palette-recent-label">Recent</span>
            {recent.map((q) => (
              <button
                key={q}
                type="button"
                className="palette-recent-chip"
                onClick={() => setQuery(q)}
              >
                {q}
              </button>
            ))}
            <button
              type="button"
              className="palette-recent-chip"
              onClick={clearRecent}
              style={{ marginLeft: 'auto' }}
            >
              clear
            </button>
          </div>
        )}

        <PaletteResults
          groups={groups}
          highlightedId={highlighted?.id ?? null}
          onHover={(id) => {
            const idx = flatItems.findIndex((r) => r.id === id);
            if (idx >= 0) setHighlightedIndex(idx);
          }}
          onActivate={handleActivate}
        />

        <footer className="palette-footer">
          <div className="palette-footer-group">
            <span><span className="palette-footer-kbd">↑↓</span> NAVIGATE</span>
            <span><span className="palette-footer-kbd">↵</span> SELECT</span>
            <span><span className="palette-footer-kbd">⌘1-5</span> SCOPE</span>
          </div>
          <div className="palette-footer-group">
            <span>{flatItems.length} RESULTS</span>
          </div>
        </footer>
      </div>
    </>,
    document.body,
  );
}
