import React, { useEffect, useRef } from 'react';
import { useObservabilityStore } from '@/stores/observabilityStore';
import { useAuthStore } from '@/stores/authStore';
import Sparkline from './Sparkline';

function formatTokensCompact(n: number): string {
  if (n <= 0) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function relativeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

function elapsed(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

export default function ObservabilityWidget() {
  const user = useAuthStore((s) => s.user);
  const agents = useObservabilityStore((s) => s.agents);
  const sparkline = useObservabilityStore((s) => s.sparkline);
  const activeSubagents = useObservabilityStore((s) => s.activeSubagents);
  const updatedAt = useObservabilityStore((s) => s.updatedAt);
  const expanded = useObservabilityStore((s) => s.expanded);
  const setExpanded = useObservabilityStore((s) => s.setExpanded);
  const refresh = useObservabilityStore((s) => s.refresh);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) return;
    refresh(user.id);
    const interval = window.setInterval(() => refresh(user.id), 5000);
    return () => window.clearInterval(interval);
  }, [user, refresh]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [expanded, setExpanded]);

  const totalTokens = agents.reduce((s, a) => s + a.tokensSinceMidnight, 0);
  const burnRate = sparkline.slice(-4).reduce((s, v) => s + v, 0) / 4;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="obs-widget-collapsed"
        onClick={() => setExpanded(!expanded)}
        aria-label="Autonomous loop status"
        aria-expanded={expanded}
      >
        <div className="obs-dots" aria-hidden="true">
          {agents.map((a) => (
            <span key={a.agent} className={`dot ${a.agent} ${a.status}`} />
          ))}
        </div>
        <span className="obs-metric">{formatTokensCompact(totalTokens)}</span>
      </button>

      {expanded && (
        <aside className="obs-panel" role="dialog" aria-label="Autonomous loop detail">
          <header className="obs-panel-header">
            <span className="obs-panel-title">Autonomous loop</span>
            <span className="obs-panel-updated">{relativeAgo(updatedAt)}</span>
          </header>

          {agents.map((a) => (
            <div key={a.agent} className="obs-agent-row">
              <span className="obs-agent-name">
                <span className={`dot ${a.agent} ${a.status}`} aria-hidden="true" />
                <span>{a.agent}</span>
              </span>
              <span className="obs-agent-status">{a.status}</span>
              <span className="obs-agent-tokens">{formatTokensCompact(a.tokensSinceMidnight)}</span>
            </div>
          ))}

          <div className="obs-divider" />

          <div className="obs-stat-row">
            <span className="obs-agent-status">TOKEN BURN · 2 MIN</span>
            <span className="obs-agent-tokens">{burnRate.toFixed(1)}/s</span>
          </div>
          <Sparkline values={sparkline} />

          {activeSubagents.length > 0 && (
            <div className="obs-subagents">
              <div className="obs-subagents-title">ACTIVE SUB-AGENTS · {activeSubagents.length}</div>
              {activeSubagents.map((s) => (
                <div key={s.id} className="obs-subagent-item">
                  <span className={`dot ${s.family}`} aria-hidden="true" />
                  <span className="obs-subagent-name">{s.name}</span>
                  <span className="obs-subagent-elapsed">{elapsed(s.startedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
