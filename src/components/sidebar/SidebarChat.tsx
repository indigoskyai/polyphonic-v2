import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useThreadStore, type Thread } from '@/stores/threadStore';
import SidebarHeader from './SidebarHeader';
import ThreadRow from './ThreadRow';
import { groupThreadsByDate } from '@/lib/threadGrouping';

export default function SidebarChat() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<Thread[]>([]);
  const { threads, currentThreadId, loadThreads } = useThreadStore();

  useEffect(() => { loadThreads(); }, [loadThreads]);

  useEffect(() => {
    if (!showArchived) { setArchived([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('threads')
        .select('*')
        .eq('archived', true)
        .order('updated_at', { ascending: false });
      if (!cancelled && data) setArchived(data as Thread[]);
    })();
    return () => { cancelled = true; };
  }, [showArchived, threads]);

  const q = search.trim().toLowerCase();
  const matches = (t: Thread) => !q || (t.title?.toLowerCase().includes(q) ?? false);

  const visible = threads.filter(matches);
  const pinned = visible.filter((t) => t.pinned);
  const starred = visible.filter((t) => !t.pinned && t.starred);
  const rest = visible.filter((t) => !t.pinned && !t.starred);
  const dateGroups = useMemo(() => groupThreadsByDate(rest), [rest]);

  const renderThread = (t: Thread) => (
    <ThreadRow
      key={t.id}
      thread={t}
      active={t.id === currentThreadId}
      onClick={() => navigate(`/chat/${t.id}`)}
    />
  );

  return (
    <>
      <SidebarHeader folio="§ 01" title="Threads" />

      <div style={{ padding: '0 8px 8px' }}>
        <input
          aria-label="Search threads"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search threads..."
          className="w-full outline-none"
          style={{
            height: 34,
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--text-secondary)',
            background: 'transparent',
            border: '1px solid var(--border-faint)',
            borderRadius: 'var(--radius-sm)',
            padding: '0 10px',
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px', scrollbarWidth: 'none' }}>
        {pinned.length > 0 && (
          <>
            <SectionLabel>Pinned</SectionLabel>
            {pinned.map(renderThread)}
          </>
        )}
        {starred.length > 0 && (
          <>
            <SectionLabel>Starred</SectionLabel>
            {starred.map(renderThread)}
          </>
        )}
        {dateGroups.map((group) => (
          <div key={group.key}>
            <SectionLabel>{group.label}</SectionLabel>
            {group.threads.map(renderThread)}
          </div>
        ))}

        {visible.length === 0 && (
          <div
            style={{
              padding: '14px 10px',
              fontSize: 13,
              color: 'var(--text-ghost)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {q ? 'No threads match your search.' : 'No conversations yet.'}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-1.5 w-full"
            style={{
              padding: '6px 10px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: 'var(--track-meta)',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
            }}
          >
            {showArchived ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Archived
            {showArchived && archived.length > 0 && (
              <span style={{ marginLeft: 4, color: 'var(--text-tertiary)' }}>{archived.length}</span>
            )}
          </button>
          {showArchived && (
            <div>
              {archived.length === 0 && (
                <div style={{ padding: '6px 10px', fontSize: 13, color: 'var(--text-ghost)' }}>
                  Nothing archived.
                </div>
              )}
              {archived.filter(matches).map(renderThread)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="uppercase"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: 'var(--track-meta)',
        color: 'var(--text-ghost)',
        padding: '14px 8px 6px',
      }}
    >
      {children}
    </div>
  );
}
