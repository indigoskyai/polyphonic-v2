import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { supabase } from '@/integrations/supabase/client';
import GraphTab from '@/components/memory/GraphTab';
import EngramsTab from '@/components/memory/EngramsTab';
import BeliefsTab from '@/components/memory/BeliefsTab';
import ImportDetailPanel from '@/components/ImportDetailPanel';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

const TABS = ['Memories', 'Engrams', 'Beliefs', 'Graph', 'Imports'] as const;
type Tab = typeof TABS[number];

type Memory = {
  id: string;
  content: string;
  memory_type: string;
  confidence: number;
  confidence_source: string | null;
  emotional_valence: number | null;
  emotional_intensity: number | null;
  detail_level: string | null;
  narrative_thread: string | null;
  tags: string[] | null;
  summary: string | null;
  staleness_risk: string | null;
  estimated_date: string | null;
  needs_confirmation: boolean | null;
  is_deleted: boolean | null;
  created_at: string;
  updated_at: string;
};

type ImportRecord = {
  id: string;
  status: string;
  pipeline_stage: string | null;
  source_platform: string | null;
  total_conversations: number | null;
  processed_conversations: number | null;
  memories_created: number | null;
  questions_generated: number | null;
  conflicts_detected: number | null;
  file_size_bytes: number | null;
  created_at: string;
  completed_at: string | null;
};

export default function MemoryView() {
  const [activeTab, setActiveTab] = useState<Tab>('Memories');
  const user = useAuthStore((s) => s.user);
  const { loading: engramLoading, loadAll, selectedEngram, setSelectedEngram } = useMemoryStore();

  useEffect(() => {
    if (user) loadAll(user.id);
  }, [user]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      {/* Header */}
      <div className="flex items-center flex-shrink-0" style={{
        height: 44,
        padding: '0 24px',
        borderBottom: '1px solid var(--border-subtle)',
        gap: 20,
      }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
          Memory
        </span>
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                height: 28,
                padding: '0 12px',
                fontSize: 11,
                fontWeight: activeTab === tab ? 500 : 400,
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-ghost)',
                background: activeTab === tab ? 'var(--bg-surface)' : 'transparent',
                border: activeTab === tab ? '1px solid var(--border-subtle)' : '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all var(--dur-fast) var(--ease-out)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto" style={{
          padding: activeTab === 'Graph' ? 0 : undefined,
        }}>
          {activeTab === 'Memories' && <MemoriesTab />}
          {activeTab === 'Engrams' && <EngramsTab />}
          {activeTab === 'Beliefs' && <BeliefsTab />}
          {activeTab === 'Graph' && <GraphTab />}
          {activeTab === 'Imports' && <ImportsTab />}
        </div>

        {/* Detail panel (when engram selected) */}
        {selectedEngram && activeTab === 'Engrams' && (
          <div style={{
            width: 320,
            borderLeft: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            overflow: 'auto',
            padding: '20px 16px',
            animation: 'viewFadeIn 0.2s var(--ease-out) both',
          }}>
            <div className="flex items-center justify-between mb-4">
              <span style={{
                fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: selectedEngram.engram_type === 'episodic' ? '#5b8aad' :
                       selectedEngram.engram_type === 'semantic' ? '#c9a87c' :
                       selectedEngram.engram_type === 'procedural' ? '#8ca89c' : '#a88cc9',
              }}>
                {selectedEngram.engram_type}
              </span>
              <button
                onClick={() => setSelectedEngram(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-ghost)', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-sans)' }}
              >
                ×
              </button>
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {selectedEngram.content}
            </div>

            <div className="flex flex-col gap-2 mb-4">
              {[
                { label: 'Strength', value: selectedEngram.strength },
                { label: 'Stability', value: selectedEngram.stability },
                { label: 'Accessibility', value: selectedEngram.accessibility },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-2">
                  <span style={{ fontSize: 10, color: 'var(--text-ghost)', width: 70 }}>{label}</span>
                  <div style={{ flex: 1, height: 3, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${value * 100}%`, height: '100%', background: 'var(--text-ghost)', borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-whisper)', width: 32 }}>
                    {value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 mb-4">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>State</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{selectedEngram.state}</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>Accessed</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {selectedEngram.access_count}×
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>Valence</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {selectedEngram.emotional_valence.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: 'var(--text-ghost)' }}>Created</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {new Date(selectedEngram.created_at).toLocaleString()}
                </span>
              </div>
            </div>

            {selectedEngram.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedEngram.tags.map((tag) => (
                  <span key={tag} style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 3,
                    background: 'var(--bg-deep)', color: 'var(--text-ghost)',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MEMORIES TAB — Browse, search, edit, delete imported memories
   ═══════════════════════════════════════════════════════════════ */

const TYPE_COLORS: Record<string, string> = {
  fact: '#5b8aad',
  preference: '#c9a87c',
  relationship: '#8ca89c',
  principle: '#a88cc9',
  commitment: '#ad7b5b',
  moment: '#7ba8ad',
  skill: '#8cad5b',
  goal: '#ad5b8a',
  context: '#7a7a7a',
};

function MemoriesTab() {
  const user = useAuthStore((s) => s.user);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'confidence' | 'type'>('recent');
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const loadMemories = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (!error && data) setMemories(data as Memory[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadMemories(); }, [loadMemories]);

  const memoryTypes = useMemo(() => {
    const types = new Set(memories.map(m => m.memory_type));
    return Array.from(types).sort();
  }, [memories]);

  const filtered = useMemo(() => {
    let result = memories;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        m.content.toLowerCase().includes(q) ||
        m.summary?.toLowerCase().includes(q) ||
        m.tags?.some(t => t.toLowerCase().includes(q)) ||
        m.narrative_thread?.toLowerCase().includes(q)
      );
    }
    if (typeFilter) result = result.filter(m => m.memory_type === typeFilter);
    if (sortBy === 'confidence') result = [...result].sort((a, b) => b.confidence - a.confidence);
    if (sortBy === 'type') result = [...result].sort((a, b) => a.memory_type.localeCompare(b.memory_type));
    return result;
  }, [memories, search, typeFilter, sortBy]);

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    let totalConf = 0;
    for (const m of memories) {
      byType[m.memory_type] = (byType[m.memory_type] || 0) + 1;
      totalConf += m.confidence;
    }
    return { total: memories.length, byType, avgConf: memories.length ? totalConf / memories.length : 0 };
  }, [memories]);

  const handleEdit = async (id: string, newContent: string) => {
    await supabase.from('memories').update({ content: newContent, updated_at: new Date().toISOString() }).eq('id', id);
    setMemories(prev => prev.map(m => m.id === id ? { ...m, content: newContent } : m));
    setSelectedMemory(prev => prev?.id === id ? { ...prev, content: newContent } : prev);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('memories').update({ is_deleted: true }).eq('id', id);
    setMemories(prev => prev.filter(m => m.id !== id));
    if (selectedMemory?.id === id) setSelectedMemory(null);
    setShowDeleteConfirm(null);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(bulkSelected);
    for (const id of ids) {
      await supabase.from('memories').update({ is_deleted: true }).eq('id', id);
    }
    setMemories(prev => prev.filter(m => !bulkSelected.has(m.id)));
    setBulkSelected(new Set());
    setShowBulkDeleteConfirm(false);
    if (selectedMemory && bulkSelected.has(selectedMemory.id)) setSelectedMemory(null);
  };

  const toggleBulk = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-ghost)', fontSize: 11 }}>Loading memories...</div>;
  }

  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-ghost)' }}>
        <div className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>No memories yet</div>
        <div className="text-[11px] mb-4">Import conversation data to extract memories, or chat with Luca to build them organically.</div>
        <button onClick={() => window.location.href = '/import'} className="text-[11px] px-4 py-2 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          Import Conversations
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 h-full">
      {/* Left: List */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ borderRight: selectedMemory ? '1px solid var(--border-subtle)' : undefined }}>
        {/* Stats bar */}
        <div className="shrink-0 flex items-center gap-4 flex-wrap" style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <StatPill label="Total" value={stats.total} />
          <StatPill label="Avg Confidence" value={`${(stats.avgConf * 100).toFixed(0)}%`} />
          {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([type, count]) => (
            <StatPill key={type} label={type} value={count} color={TYPE_COLORS[type]} />
          ))}
        </div>

        {/* Toolbar */}
        <div className="shrink-0 flex items-center gap-2 flex-wrap" style={{ padding: '8px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="outline-none"
            style={{ height: 30, flex: 1, minWidth: 160, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}
          />
          <select
            value={typeFilter || ''}
            onChange={(e) => setTypeFilter(e.target.value || null)}
            style={{ height: 30, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <option value="">All types</option>
            {memoryTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ height: 30, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <option value="recent">Most Recent</option>
            <option value="confidence">Highest Confidence</option>
            <option value="type">By Type</option>
          </select>
          {bulkSelected.size > 0 && (
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="text-[10px] px-3 py-1.5 rounded"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', cursor: 'pointer' }}
            >
              Delete {bulkSelected.size} selected
            </button>
          )}
          <span className="text-[10px]" style={{ color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Memory list */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '8px 16px', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
          {filtered.map((m) => (
            <MemoryRow
              key={m.id}
              memory={m}
              selected={selectedMemory?.id === m.id}
              bulkChecked={bulkSelected.has(m.id)}
              onClick={() => { setSelectedMemory(m); setEditingContent(m.content); }}
              onToggleBulk={() => toggleBulk(m.id)}
            />
          ))}
        </div>
      </div>

      {/* Right: Detail panel */}
      {selectedMemory && (
        <MemoryDetailPanel
          memory={selectedMemory}
          editingContent={editingContent}
          setEditingContent={setEditingContent}
          onSave={(content) => handleEdit(selectedMemory.id, content)}
          onDelete={() => setShowDeleteConfirm(selectedMemory.id)}
          onClose={() => setSelectedMemory(null)}
        />
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <ConfirmOverlay
          title="Delete memory"
          message="This memory will be soft-deleted and no longer visible. It can be recovered from the database if needed."
          onConfirm={() => handleDelete(showDeleteConfirm)}
          onCancel={() => setShowDeleteConfirm(null)}
        />
      )}
      {showBulkDeleteConfirm && (
        <ConfirmOverlay
          title={`Delete ${bulkSelected.size} memories`}
          message="These memories will be soft-deleted. This cannot be easily undone."
          onConfirm={handleBulkDelete}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

function MemoryRow({ memory, selected, bulkChecked, onClick, onToggleBulk }: {
  memory: Memory; selected: boolean; bulkChecked: boolean;
  onClick: () => void; onToggleBulk: () => void;
}) {
  return (
    <div
      className="flex items-start gap-2 mb-1 rounded cursor-pointer group"
      style={{
        padding: '10px 12px',
        background: selected ? 'var(--bg-surface)' : undefined,
        border: `1px solid ${selected ? 'var(--border)' : 'transparent'}`,
        transition: 'all 100ms ease',
      }}
      onClick={onClick}
    >
      {/* Bulk checkbox */}
      <div
        className="shrink-0 mt-0.5"
        onClick={(e) => { e.stopPropagation(); onToggleBulk(); }}
        style={{
          width: 14, height: 14, borderRadius: 3,
          border: `1px solid ${bulkChecked ? 'var(--border-focus)' : 'var(--border-dim)'}`,
          background: bulkChecked ? 'var(--bg-surface)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {bulkChecked && <span style={{ fontSize: 9, color: 'var(--text-primary)' }}>✓</span>}
      </div>

      {/* Type badge */}
      <span
        className="shrink-0 text-[9px] font-medium uppercase mt-0.5"
        style={{
          padding: '1px 5px', borderRadius: 3,
          background: `${TYPE_COLORS[memory.memory_type] || '#777'}15`,
          color: TYPE_COLORS[memory.memory_type] || 'var(--text-ghost)',
          letterSpacing: '0.04em',
        }}
      >
        {memory.memory_type}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] leading-relaxed" style={{ color: 'var(--text-soft)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {memory.content}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {memory.narrative_thread && (
            <span className="text-[9px]" style={{ color: 'var(--text-whisper)' }}>◊ {memory.narrative_thread}</span>
          )}
          {memory.needs_confirmation && (
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(248,180,80,0.1)', color: '#f8b450' }}>needs review</span>
          )}
        </div>
      </div>

      {/* Confidence */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-whisper)' }}>
          {((memory.confidence ?? 0) * 100).toFixed(0)}%
        </span>
        <div style={{ width: 32, height: 2, background: 'var(--bg-deep)', borderRadius: 1, overflow: 'hidden' }}>
          <div style={{ width: `${(memory.confidence ?? 0) * 100}%`, height: '100%', background: 'var(--luca)', opacity: 0.5, borderRadius: 1 }} />
        </div>
      </div>
    </div>
  );
}

function MemoryDetailPanel({ memory, editingContent, setEditingContent, onSave, onDelete, onClose }: {
  memory: Memory; editingContent: string; setEditingContent: (s: string) => void;
  onSave: (content: string) => void; onDelete: () => void; onClose: () => void;
}) {
  const isEdited = editingContent !== memory.content;

  return (
    <div className="shrink-0 flex flex-col overflow-y-auto" style={{ width: 360, background: 'var(--bg-elevated)', padding: '20px 16px', animation: 'viewFadeIn 0.15s var(--ease-out) both' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[9px] font-semibold uppercase" style={{
          letterSpacing: '0.08em',
          color: TYPE_COLORS[memory.memory_type] || 'var(--text-ghost)',
        }}>
          {memory.memory_type}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-ghost)', cursor: 'pointer', fontSize: 14 }}>×</button>
      </div>

      {/* Editable content */}
      <textarea
        value={editingContent}
        onChange={(e) => setEditingContent(e.target.value)}
        rows={6}
        style={{
          width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
          padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', outline: 'none',
          resize: 'vertical', lineHeight: 1.6,
        }}
      />

      {isEdited && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => onSave(editingContent)}
            className="text-[11px] px-3 py-1.5 rounded"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-focus)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            Save Changes
          </button>
          <button
            onClick={() => setEditingContent(memory.content)}
            className="text-[11px] px-3 py-1.5 rounded"
            style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-ghost)', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Metadata */}
      <div className="flex flex-col gap-2 mt-4" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
        <MetaRow label="Confidence" value={`${((memory.confidence ?? 0) * 100).toFixed(0)}%`} />
        <MetaRow label="Source" value={memory.confidence_source || 'unknown'} />
        <MetaRow label="Detail" value={memory.detail_level || 'standard'} />
        <MetaRow label="Staleness" value={memory.staleness_risk || 'low'} />
        {memory.emotional_valence != null && <MetaRow label="Valence" value={memory.emotional_valence.toFixed(2)} />}
        {memory.emotional_intensity != null && <MetaRow label="Intensity" value={memory.emotional_intensity.toFixed(2)} />}
        {memory.estimated_date && <MetaRow label="Est. Date" value={memory.estimated_date} />}
        <MetaRow label="Created" value={new Date(memory.created_at).toLocaleString()} />
        <MetaRow label="Updated" value={new Date(memory.updated_at).toLocaleString()} />
      </div>

      {/* Narrative thread */}
      {memory.narrative_thread && (
        <div className="mt-3" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
          <div className="text-[9px] uppercase font-medium mb-1" style={{ color: 'var(--text-ghost)', letterSpacing: '0.06em' }}>Narrative Thread</div>
          <div className="text-[11px]" style={{ color: 'var(--text-soft)' }}>{memory.narrative_thread}</div>
        </div>
      )}

      {/* Summary */}
      {memory.summary && (
        <div className="mt-3" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
          <div className="text-[9px] uppercase font-medium mb-1" style={{ color: 'var(--text-ghost)', letterSpacing: '0.06em' }}>Summary</div>
          <div className="text-[11px]" style={{ color: 'var(--text-soft)' }}>{memory.summary}</div>
        </div>
      )}

      {/* Tags */}
      {memory.tags && memory.tags.length > 0 && (
        <div className="mt-3" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
          <div className="text-[9px] uppercase font-medium mb-2" style={{ color: 'var(--text-ghost)', letterSpacing: '0.06em' }}>Tags</div>
          <div className="flex flex-wrap gap-1">
            {memory.tags.map((tag) => (
              <span key={tag} className="text-[9px] px-2 py-0.5 rounded" style={{ background: 'var(--bg-deep)', color: 'var(--text-ghost)' }}>{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Delete */}
      <div className="mt-auto pt-4">
        <button
          onClick={onDelete}
          className="text-[11px] px-3 py-1.5 rounded w-full"
          style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', cursor: 'pointer' }}
        >
          Delete Memory
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   IMPORTS TAB — View import history and status
   ═══════════════════════════════════════════════════════════════ */

function ImportsTab() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImport, setSelectedImport] = useState<ImportRecord | null>(null);
  const [reprofiling, setReprofiling] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('chat_imports')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setImports(data as ImportRecord[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleGlobalReprofile() {
    setReprofiling(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/profile-deep-analysis`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      toast({
        title: 'Re-analysis started',
        description: 'Running on your full memory corpus. Check Profile in 3–6 minutes.',
      });
    } catch (e: any) {
      toast({ title: 'Could not start analysis', description: e.message, variant: 'destructive' });
    } finally {
      setReprofiling(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-ghost)', fontSize: 11 }}>Loading...</div>;

  if (imports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-ghost)' }}>
        <div className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>No imports yet</div>
        <div className="text-[11px] mb-4">Upload conversation exports from ChatGPT or Claude.</div>
        <button onClick={() => navigate('/import')} className="text-[11px] px-4 py-2 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          Go to Import
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 overflow-y-auto" style={{ padding: '16px 24px' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] uppercase font-medium" style={{ color: 'var(--text-ghost)', letterSpacing: '0.08em' }}>Import History</div>
          <div className="flex gap-2">
            <button
              onClick={handleGlobalReprofile}
              disabled={reprofiling}
              className="text-[11px] px-3 py-1.5 rounded"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: reprofiling ? 'var(--text-ghost)' : 'var(--text-tertiary)',
                cursor: reprofiling ? 'wait' : 'pointer',
              }}
              title="Re-run the 5-pass deep psychological analysis on your latest memories"
            >
              {reprofiling ? 'Starting…' : 'Re-run profiling'}
            </button>
            <button onClick={() => navigate('/import')} className="text-[11px] px-3 py-1.5 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
              New Import
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {imports.map((imp) => (
            <div
              key={imp.id}
              onClick={() => setSelectedImport(imp)}
              className="cursor-pointer"
              style={{
                padding: '14px 16px',
                background: selectedImport?.id === imp.id ? 'var(--bg-surface)' : 'var(--card-bg)',
                border: `1px solid ${selectedImport?.id === imp.id ? 'var(--border)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-md)',
                transition: 'all 120ms ease',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium uppercase" style={{ color: 'var(--text-soft)', letterSpacing: '0.04em' }}>
                    {imp.source_platform || 'unknown'}
                  </span>
                  <StatusBadge status={imp.status} />
                </div>
                <span className="text-[10px]" style={{ color: 'var(--text-whisper)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(imp.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                {imp.total_conversations && <MiniStat label="Conversations" value={imp.total_conversations} />}
                {imp.processed_conversations !== null && <MiniStat label="Processed" value={imp.processed_conversations} />}
                {imp.memories_created !== null && <MiniStat label="Memories" value={imp.memories_created} />}
                {imp.questions_generated !== null && imp.questions_generated > 0 && <MiniStat label="Questions" value={imp.questions_generated} />}
                {imp.conflicts_detected !== null && imp.conflicts_detected > 0 && <MiniStat label="Conflicts" value={imp.conflicts_detected} />}
              </div>

              {imp.pipeline_stage && imp.status === 'processing' && (
                <div className="text-[10px] mt-2" style={{ color: 'var(--text-ghost)' }}>
                  Stage: <span style={{ color: 'var(--text-soft)' }}>{imp.pipeline_stage}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedImport && (
        <ImportDetailPanel
          imp={selectedImport}
          onClose={() => setSelectedImport(null)}
          onDeleted={() => {
            setSelectedImport(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Shared components
   ═══════════════════════════════════════════════════════════════ */

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {color && <div style={{ width: 6, height: 6, borderRadius: 2, background: color, opacity: 0.5 }} />}
      <span className="text-[10px]" style={{ color: 'var(--text-ghost)' }}>{label}</span>
      <span className="text-[10px] font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-soft)' }}>{value}</span>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ fontSize: 10, color: 'var(--text-ghost)', width: 70 }}>{label}</span>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px]" style={{ color: 'var(--text-ghost)' }}>{label}:</span>
      <span className="text-[10px] font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-soft)' }}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    completed: { bg: 'rgba(140,168,156,0.12)', text: '#8ca89c' },
    processing: { bg: 'rgba(201,168,124,0.12)', text: '#c9a87c' },
    pending: { bg: 'rgba(140,140,140,0.1)', text: '#888' },
    failed: { bg: 'rgba(248,113,113,0.1)', text: '#f87171' },
    cleared: { bg: 'rgba(140,140,140,0.06)', text: '#666' },
  };
  const c = colors[status] || colors.pending;
  return (
    <span className="text-[9px] font-medium uppercase px-1.5 py-0.5 rounded" style={{ background: c.bg, color: c.text, letterSpacing: '0.04em' }}>
      {status}
    </span>
  );
}

function ConfirmOverlay({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 24, maxWidth: 400, width: '90%' }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>{message}</div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="cursor-pointer" style={{ height: 36, padding: '0 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>Cancel</button>
          <button onClick={onConfirm} className="cursor-pointer" style={{ height: 36, padding: '0 16px', background: 'rgba(248,113,113,0.88)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
