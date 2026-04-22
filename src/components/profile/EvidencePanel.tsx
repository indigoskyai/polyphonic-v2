import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfileLayoutStore } from './profileLayoutStore';

type MemoryRow = {
  id: string;
  content: string;
  memory_type: string;
  created_at: string;
  estimated_date: string | null;
  tags: string[] | null;
  confidence: number;
  similarity?: number;
};

interface Props {
  onAskInChat?: (prompt: string) => void;
}

/**
 * Right-rail panel that shows the receipts for the currently selected star:
 *  - the evidence text from the deep-analysis pass
 *  - top supporting memories pulled live via match_memories()
 *  - a button to forward the question to the existing ProfileChatPanel
 */
export default function EvidencePanel({ onAskInChat }: Props) {
  const { selected, select } = useProfileLayoutStore();
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setMemories([]);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const query = [selected.label, ...(selected.tags ?? [])].filter(Boolean).join(' ');
        const { data } = await supabase.rpc('match_memories', {
          query_text: query,
          match_count: 8,
        } as any);
        if (!cancelled && Array.isArray(data)) {
          setMemories(data as MemoryRow[]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (!selected) return null;

  const askPrompt = `Tell me about "${selected.label}" — what evidence in my memories led to this?`;

  return (
    <aside
      className="shrink-0 flex flex-col min-h-0 animate-slide-in-right"
      style={{
        width: 360,
        background: 'var(--bg-deep)',
        borderLeft: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="min-w-0">
          <div
            className="text-[10px] uppercase mb-1"
            style={{ color: 'var(--text-ghost)', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)' }}
          >
            {selected.category.replace(/_/g, ' ')}
          </div>
          <div
            className="text-[13px] truncate"
            style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}
            title={selected.label}
          >
            {selected.label}
          </div>
        </div>
        <button
          onClick={() => select(null)}
          className="text-[11px] px-2 py-1 rounded"
          style={{
            color: 'var(--text-tertiary)',
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            cursor: 'pointer',
          }}
          aria-label="Close evidence panel"
        >
          close
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: '16px', scrollbarWidth: 'thin' }}
      >
        {/* Score */}
        {typeof selected.score === 'number' && (
          <div className="mb-5">
            <div
              className="text-[10px] uppercase mb-2"
              style={{ color: 'var(--text-ghost)', letterSpacing: '0.1em' }}
            >
              score
            </div>
            <div className="flex items-center gap-3">
              <div
                style={{
                  flex: 1,
                  height: 3,
                  background: 'var(--bg-surface)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${selected.score}%`,
                    height: '100%',
                    background: 'var(--luca)',
                    opacity: 0.55,
                    borderRadius: 2,
                  }}
                />
              </div>
              <span
                className="text-[11px]"
                style={{ color: 'var(--text-soft)', fontFamily: 'var(--font-mono)' }}
              >
                {selected.score}
              </span>
            </div>
          </div>
        )}

        {/* Evidence narrative */}
        {selected.evidence && (
          <div className="mb-6">
            <div
              className="text-[10px] uppercase mb-2"
              style={{ color: 'var(--text-ghost)', letterSpacing: '0.1em' }}
            >
              from your analysis
            </div>
            <p
              className="text-[12.5px]"
              style={{ color: 'var(--text-body)', lineHeight: 1.7 }}
            >
              {selected.evidence}
            </p>
          </div>
        )}

        {/* Supporting memories */}
        <div className="mb-5">
          <div
            className="text-[10px] uppercase mb-2 flex items-center justify-between"
            style={{ color: 'var(--text-ghost)', letterSpacing: '0.1em' }}
          >
            <span>supporting memories</span>
            {loading && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>loading…</span>
            )}
          </div>
          {!loading && memories.length === 0 && (
            <div
              className="text-[11px]"
              style={{ color: 'var(--text-ghost)', fontStyle: 'italic' }}
            >
              No directly matching memories found.
            </div>
          )}
          <div className="space-y-2">
            {memories.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: '10px 12px',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div
                  className="text-[12px]"
                  style={{ color: 'var(--text-body)', lineHeight: 1.55 }}
                >
                  {m.content}
                </div>
                <div
                  className="mt-2 flex items-center gap-2 text-[10px]"
                  style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}
                >
                  <span>{m.memory_type}</span>
                  <span>·</span>
                  <span>{(m.confidence * 100).toFixed(0)}%</span>
                  {m.estimated_date && (
                    <>
                      <span>·</span>
                      <span>{m.estimated_date}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer action — escalate to chat */}
      <div
        className="shrink-0"
        style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)' }}
      >
        <button
          onClick={() => onAskInChat?.(askPrompt)}
          className="w-full text-[11px] py-2 rounded"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          ask the AI about this
        </button>
      </div>
    </aside>
  );
}
