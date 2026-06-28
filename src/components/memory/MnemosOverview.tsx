/**
 * MnemosOverview — entry surface for /memory.
 *
 * Hero stat strip · type distribution · pending candidates panel · recent engrams.
 * Wraps in MnemosStreamShell with hero "# 01 · MNEMOS · DIGEST".
 *
 * MOCK: 24h candidate delta, last consolidation timestamp, weekly drift.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useMemoryStore, type Engram } from '@/stores/memoryStore';
import { useMemoryCandidatesStore } from '@/stores/memoryCandidatesStore';
import { useViewTabStore } from '@/stores/viewTabStore';
import { useDrawerStore } from '@/stores/drawerStore';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import { useToast } from '@/hooks/use-toast';
import MnemosStreamShell from './MnemosStreamShell';

const ENGRAM_TYPES: Array<Engram['engram_type']> = ['episodic', 'semantic', 'procedural', 'belief'];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function MnemosOverview() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const setMemoryTab = useViewTabStore((s) => s.setMemoryTab);
  const memories = useMemoryStore((s) => s.memories);
  const engrams = useMemoryStore((s) => s.engrams);
  const beliefs = useMemoryStore((s) => s.beliefs);
  const connections = useMemoryStore((s) => s.connections);
  const loadAll = useMemoryStore((s) => s.loadAll);
  const setSelectedEngram = useMemoryStore((s) => s.setSelectedEngram);
  const openDrawer = useDrawerStore((s) => s.open);
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const [consolidating, setConsolidating] = useState(false);

  const candidates = useMemoryCandidatesStore((s) => s.items);
  const loadCandidates = useMemoryCandidatesStore((s) => s.load);
  const subscribeCandidates = useMemoryCandidatesStore((s) => s.subscribe);
  const commitCandidate = useMemoryCandidatesStore((s) => s.commit);
  const rejectCandidate = useMemoryCandidatesStore((s) => s.reject);

  useEffect(() => {
    if (!user) return;
    loadCandidates(user.id, activeAgentId);
    const unsub = subscribeCandidates(user.id, activeAgentId);
    return unsub;
  }, [user, activeAgentId, loadCandidates, subscribeCandidates]);

  const stats = useMemo(() => {
    const active = engrams.filter((e) => e.state === 'active').length;
    const consolidating = engrams.filter((e) => e.state === 'consolidating').length;
    return {
      memories: memories.length,
      engrams: engrams.length,
      active,
      consolidating,
      beliefs: beliefs.length,
      connections: connections.length,
      candidates: candidates.length,
    };
  }, [memories, engrams, beliefs, connections, candidates]);

  const distribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of ENGRAM_TYPES) counts[t] = 0;
    for (const e of engrams) {
      if (counts[e.engram_type] !== undefined) counts[e.engram_type]++;
    }
    const max = Math.max(1, ...Object.values(counts));
    return ENGRAM_TYPES.map((t) => ({ type: t, count: counts[t], pct: counts[t] / max }));
  }, [engrams]);

  const recentEngrams = useMemo(() => {
    return [...engrams]
      .filter((e) => e.state === 'active' || e.state === 'consolidating')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [engrams]);

  const topCandidates = useMemo(() => candidates.slice(0, 4), [candidates]);

  const runConsolidation = async () => {
    if (!user || consolidating) return;
    setConsolidating(true);
    try {
      const { data, error } = await supabase.functions.invoke('mnemos-consolidate', {
        body: { user_id: user.id, agent_id: activeAgentId, force: true, lookback_hours: 168 },
      });
      if (error) throw error;
      await Promise.all([loadAll(user.id, activeAgentId), loadCandidates(user.id, activeAgentId)]);
      const result = (data ?? {}) as Record<string, unknown>;
      const candidatesFound = Number(result.candidates_found ?? 0);
      const promoted = Number(result.promotions ?? 0);
      const linked = Number(result.new_connections ?? 0);
      const beliefsUpdated = Number(result.beliefs_updated ?? 0);
      const candidatesCreated = Number(result.memory_candidates_created ?? 0);
      toast({
        title: 'Consolidation finished',
        description: `${candidatesFound} engrams reviewed · ${promoted} promoted · ${linked} linked · ${beliefsUpdated} beliefs updated · ${candidatesCreated} new memory candidate${candidatesCreated === 1 ? '' : 's'}`,
      });

    } catch (err) {
      toast({
        title: 'Could not consolidate',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setConsolidating(false);
    }
  };

  return (
    <MnemosStreamShell
      num="01"
      streamLabel="DIGEST"
      title="Substrate"
      subtitle={`${stats.engrams} engrams in the Mnemos substrate across ${stats.connections} connections. ${stats.candidates} candidate${stats.candidates === 1 ? '' : 's'} awaiting your commit into durable memory.`}
      hideToolbar
    >
      {/* Hero stat strip */}
      <div className="s-stat-strip">
        <div className="s-stat">
          <span className="s-stat-label">Committed memories</span>
          <span className="s-stat-value">{stats.memories}</span>
          <span className="s-stat-delta">{stats.candidates} pending commit</span>
        </div>
        <div className="s-stat">
          <span className="s-stat-label">Mnemos engrams</span>
          <span className="s-stat-value">{stats.engrams}</span>
          <span className="s-stat-delta">{stats.active} active · {stats.consolidating} consol.</span>
        </div>
        <div className="s-stat">
          <span className="s-stat-label">Beliefs</span>
          <span className="s-stat-value">{stats.beliefs}</span>
          <span className="s-stat-delta">+{/* MOCK */}0 this week</span>
        </div>
        <div className="s-stat">
          <span className="s-stat-label">Substrate connections</span>
          <span className="s-stat-value">{stats.connections}</span>
          <span className="s-stat-delta">{/* MOCK */}graph density 0.04</span>
        </div>
      </div>


      {/* Two-column: distribution + pending candidates */}
      <div className="s-panel-grid">
        {/* Type distribution */}
        <div className="s-panel">
          <div className="s-panel-eye">
            <span>· Distribution</span>
            <span className="right">{stats.engrams} total</span>
          </div>
          <div className="s-panel-title">Engram composition</div>
          <p className="s-hero-sub" style={{ fontSize: 12, marginBottom: 14 }}>
            How the substrate breaks down by engram type.
          </p>
          {distribution.map((d) => (
            <div key={d.type} className="s-dist-row">
              <span className="s-dist-label">{d.type}</span>
              <div className="s-dist-bar">
                <div className="s-dist-bar-fill" style={{ width: `${d.pct * 100}%` }} />
              </div>
              <span className="s-dist-count">{d.count}</span>
            </div>
          ))}
        </div>

        {/* Pending candidates */}
        <div className="s-panel">
          <div className="s-panel-eye">
            <span>· Pending</span>
            <span className="right" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={runConsolidation}
                disabled={consolidating}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: consolidating ? 'default' : 'pointer',
                  font: 'inherit',
                  color: consolidating ? 'var(--text-whisper)' : 'var(--text-soft)',
                }}
              >
                {consolidating ? 'running…' : 'consolidate →'}
              </button>
              <button
                type="button"
                onClick={() => setMemoryTab('Memories')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'var(--text-soft)' }}
              >
                {stats.candidates > 4 ? `+${stats.candidates - 4} more →` : 'review →'}
              </button>
            </span>
          </div>
          <div className="s-panel-title">Candidates</div>
          <p className="s-hero-sub" style={{ fontSize: 12, marginBottom: 14 }}>
            New memory candidates awaiting commit. Auto-commits at low confidence after 48h.
          </p>
          {topCandidates.length === 0 && (
            <div style={{ padding: '20px 0', fontSize: 12, color: 'var(--text-whisper)' }}>
              Inbox zero. Mnemos will surface new candidates as they form.
            </div>
          )}
          {topCandidates.map((c) => (
            <div key={c.id} className="s-cand-row">
              <div className="s-cand-meta">
                <span className="dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-whisper)' }} />
                <span>{c.memory_type}</span>
                <span>{c.candidate_type}</span>
                <span className="conf">{c.confidence.toFixed(2)}</span>
              </div>
              <div className="s-cand-content">{c.content}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => commitCandidate(c.id)}
                  className="s-segment-btn active"
                  style={{ height: 26, padding: '0 12px', fontSize: 9 }}
                >
                  commit
                </button>
                <button
                  type="button"
                  onClick={() => rejectCandidate(c.id)}
                  className="s-segment-btn"
                  style={{ height: 26, padding: '0 12px', fontSize: 9 }}
                >
                  reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent engrams panel */}
      <div className="s-panel" style={{ marginBottom: 32 }}>
        <div className="s-panel-eye">
          <span>· Recent</span>
          <button
            type="button"
            className="right"
            onClick={() => setMemoryTab('Engrams')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'var(--text-soft)' }}
          >
            all engrams →
          </button>
        </div>
        <div className="s-panel-title">Latest formations</div>
        {recentEngrams.length === 0 && (
          <div style={{ padding: '20px 0', fontSize: 12, color: 'var(--text-whisper)' }}>
            No engrams yet. They form as conversations consolidate.
          </div>
        )}
        {recentEngrams.map((e) => (
          <div
            key={e.id}
            className="s-row s-engram"
            onClick={() => { setSelectedEngram(e); openDrawer('memory-detail', { engramId: e.id }); }}
          >
            <div className="s-row-meta">
              <span className="dot" />
              <span className="s-type-chip" data-state={e.state}>{e.engram_type}</span>
              <span className="kind">{e.state}</span>
              <span className="salience">s {e.strength.toFixed(2)}</span>
              <span className="time">{timeAgo(e.created_at)}</span>
            </div>
            <div className="s-row-content" style={{
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {e.content}
            </div>
          </div>
        ))}
      </div>
    </MnemosStreamShell>
  );
}
