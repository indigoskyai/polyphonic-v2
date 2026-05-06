import React, { useMemo, useState } from 'react';

export type ThinkingState = 'waiting' | 'streaming' | 'settling' | 'complete';

type ThinkingSegment =
  | { kind: 'text'; text: string }
  | { kind: 'section'; title: string; text: string }
  | { kind: 'activity'; title: string; lines: string[] };

const SECTION_RE = /^\s*[\u2014-]\s*(.+?)\s*[\u2014-]\s*$/;

function pushSegment(
  segments: ThinkingSegment[],
  current: { kind: 'text' | 'section' | 'activity'; title?: string; lines: string[] },
) {
  const text = current.lines.join('\n').trim();
  if (!text) return;
  if (current.kind === 'activity') {
    segments.push({
      kind: 'activity',
      title: current.title || 'Agent activity',
      lines: current.lines.map((line) => line.trim()).filter(Boolean),
    });
    return;
  }
  if (current.kind === 'section') {
    segments.push({ kind: 'section', title: current.title || 'Thought', text });
    return;
  }
  segments.push({ kind: 'text', text });
}

export function parseThinkingContent(content: string): ThinkingSegment[] {
  const segments: ThinkingSegment[] = [];
  let current: { kind: 'text' | 'section' | 'activity'; title?: string; lines: string[] } = {
    kind: 'text',
    lines: [],
  };

  content.split(/\r?\n/).forEach((line) => {
    const match = line.match(SECTION_RE);
    if (match) {
      pushSegment(segments, current);
      const title = match[1].trim();
      current = {
        kind: /agent activity/i.test(title) ? 'activity' : 'section',
        title,
        lines: [],
      };
      return;
    }
    current.lines.push(line);
  });

  pushSegment(segments, current);
  return segments;
}

export function peekContent(text: string): string {
  const segments = parseThinkingContent(text);
  const last = segments[segments.length - 1];
  if (!last) return '';
  if (last.kind === 'activity') return last.lines.slice(-2).join('\n');
  return last.text.split('\n').filter(Boolean).slice(-2).join('\n');
}

export function thinkingLabel(state: ThinkingState): string {
  switch (state) {
    case 'waiting': return 'thinking...';
    case 'streaming': return 'reasoning...';
    case 'settling': return 'settling...';
    case 'complete': return 'thought';
  }
}

function activityKind(line: string): string {
  if (/error|failed|lost|unauthorized/i.test(line)) return 'error';
  if (/finished|complete|done|ready/i.test(line)) return 'complete';
  if (/search|read|checking|memory|context/i.test(line)) return 'context';
  if (/preparing|starting|running|using/i.test(line)) return 'running';
  return 'default';
}

function displayLine(line: string, max = 260): string {
  const compact = line.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function renderThinkingSegments(segments: ThinkingSegment[]) {
  return segments.map((segment, index) => {
    if (segment.kind === 'activity') {
      return (
        <section className="agent-activity-trace" key={`${segment.kind}-${index}`}>
          <div className="thinking-section-title">{segment.title}</div>
          <div className="agent-activity-list">
            {segment.lines.map((line, lineIndex) => (
              <div className="agent-activity-row" data-kind={activityKind(line)} key={`${lineIndex}-${line.slice(0, 24)}`}>
                <span className="agent-activity-dot" aria-hidden="true" />
                <span className="agent-activity-text">{displayLine(line)}</span>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (segment.kind === 'section') {
      return (
        <section className="thinking-section" key={`${segment.kind}-${index}`}>
          <div className="thinking-section-title">{segment.title}</div>
          <div className="thinking-text-run">{segment.text}</div>
        </section>
      );
    }

    return (
      <div className="thinking-text-run" key={`${segment.kind}-${index}`}>
        {segment.text}
      </div>
    );
  });
}

interface ThinkingBlockProps {
  content: string;
  state: ThinkingState;
  duration?: number;
  customLabel?: string | null;
}

export default function ThinkingBlock({
  content,
  state,
  duration,
  customLabel,
}: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const isActive = state === 'waiting' || state === 'streaming' || state === 'settling';
  const segments = useMemo(() => parseThinkingContent(content), [content]);
  const peek = useMemo(() => peekContent(content), [content]);

  if (!content && state === 'complete') return null;

  const toggle = () => setExpanded((value) => !value);

  return (
    <div className={`thinking-block${expanded ? ' expanded' : ''}`} data-state={state}>
      <button
        type="button"
        className="thinking-header"
        onClick={toggle}
        aria-expanded={expanded}
      >
        <div className="thinking-dots" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => <span key={i} className="td" />)}
        </div>

        <span className="thinking-label">{customLabel || thinkingLabel(state)}</span>

        {duration != null && duration > 0 && (
          <span className="thinking-timer">{Math.round(duration)}s</span>
        )}

        {state === 'complete' && content && (
          <span className="thinking-timer">{Math.ceil(content.length / 4)} tokens</span>
        )}

        <span className="thinking-chevron" aria-hidden="true">›</span>
      </button>

      {content && (
        <div className="thinking-peek" aria-hidden={expanded || state === 'complete'}>
          <div className="thinking-peek-inner">{peek}</div>
        </div>
      )}

      <div className="thinking-body" aria-hidden={!expanded}>
        <div className="thinking-body-content">
          <div className="thinking-body-text">
            {segments.length > 0 ? renderThinkingSegments(segments) : content}
            {isActive && <span className="streaming-cursor-inline" />}
          </div>
        </div>
      </div>
    </div>
  );
}
