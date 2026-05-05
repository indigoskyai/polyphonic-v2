import React, { useEffect, useMemo } from 'react';
import { useSubAgentStore } from '@/stores/subAgentStore';

function formatTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 1000) return 'now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function formatDuration(start: number | null, end: number | null): string {
  if (!start) return '—';
  const endT = end ?? Date.now();
  const ms = Math.max(0, endT - start);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 6000) / 10}m`;
}

export default function SubAgentOverlay() {
  const parentAgent = useSubAgentStore((s) => s.overlayOpenForParent);
  const overlayThreadId = useSubAgentStore((s) => s.overlayThreadId);
  const agents = useSubAgentStore((s) => s.agents);
  const events = useSubAgentStore((s) => s.events);
  const selectedId = useSubAgentStore((s) => s.selectedAgentId);
  const select = useSubAgentStore((s) => s.select);
  const close = useSubAgentStore((s) => s.closeOverlay);
  const cancel = useSubAgentStore((s) => s.cancel);

  useEffect(() => {
    if (!parentAgent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [parentAgent, close]);

  const children = useMemo(
    () => Object.values(agents)
      .filter((a) => a.parentAgent === parentAgent && (!overlayThreadId || a.threadId === overlayThreadId))
      .sort((a, b) => a.family.localeCompare(b.family)),
    [agents, parentAgent, overlayThreadId],
  );

  if (!parentAgent) return null;

  const selected = selectedId ? agents[selectedId] : null;

  return (
    <aside className="overlay-panel" data-open="true" role="dialog" aria-label={`Sub-agents of ${parentAgent}`}>
      <header className="overlay-header">
        <span className="overlay-crumb">SUB-AGENTS / {parentAgent.toUpperCase()}</span>
        <button type="button" className="overlay-close-btn" onClick={close} aria-label="Close overlay">
          ×
        </button>
      </header>

      <section className="overlay-section">
        <h3 className="overlay-section-title">Lanes</h3>
        <div className="overlay-gantt">
          {children.length === 0 && <div style={{ fontSize: 10, color: 'var(--text-ghost)' }}>No sub-agents active.</div>}
          {children.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`gantt-lane${selectedId === a.id ? ' gantt-lane--selected' : ''}`}
              data-family={a.family}
              data-state={a.state}
              onClick={() => select(a.id)}
            >
              <span className="gantt-dot" aria-hidden="true" />
              <span className="gantt-name">{a.family}</span>
              <span className="gantt-track">
                <span
                  className="gantt-fill"
                  data-active={a.state === 'active' ? 'true' : undefined}
                  style={{ width: `${Math.round(a.progress * 100)}%` }}
                />
              </span>
              <span className="gantt-duration">{formatDuration(a.startedAt, a.endedAt)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="overlay-section">
        <h3 className="overlay-section-title">Event log</h3>
        <ol className="overlay-events">
          {events
            .filter((e) => {
              if (!e.agentId) return true;
              const agent = agents[e.agentId];
              return agent?.parentAgent === parentAgent && (!overlayThreadId || agent.threadId === overlayThreadId);
            })
            .slice(0, 40)
            .map((e, idx) => {
              const age = idx < 5 ? 'fresh' : idx < 15 ? 'aged' : 'ancient';
              return (
                <li key={e.id} className="overlay-event" data-age={age}>
                  <span className="overlay-event-time">{formatTime(e.ts)}</span>
                  <span className="overlay-event-dot" aria-hidden="true" />
                  <span className="overlay-event-agent">{e.agentName}</span>
                  <span className="overlay-event-text" title={e.text}>{e.text}</span>
                </li>
              );
            })}
        </ol>
      </section>

      <section className="overlay-section">
        <h3 className="overlay-section-title">Selected</h3>
        {!selected ? (
          <div style={{ fontSize: 10, color: 'var(--text-ghost)' }}>Pick a lane to see detail.</div>
        ) : (
          <div className="overlay-detail">
            <div className="overlay-detail__row"><span className="overlay-detail__k">family</span><span className="overlay-detail__v">{selected.family}</span></div>
            <div className="overlay-detail__row"><span className="overlay-detail__k">state</span><span className="overlay-detail__v">{selected.state}</span></div>
            <div className="overlay-detail__row"><span className="overlay-detail__k">task</span><span className="overlay-detail__v">{selected.task}</span></div>
            <div className="overlay-detail__row"><span className="overlay-detail__k">duration</span><span className="overlay-detail__v">{formatDuration(selected.startedAt, selected.endedAt)}</span></div>
            <div className="overlay-detail__row"><span className="overlay-detail__k">progress</span><span className="overlay-detail__v">{Math.round(selected.progress * 100)}%</span></div>
            {(selected.state === 'active' || selected.state === 'queued') && (
              <button type="button" className="overlay-detail__cancel" onClick={() => cancel(selected.id)}>
                Cancel {selected.family}
              </button>
            )}
          </div>
        )}
      </section>
    </aside>
  );
}
