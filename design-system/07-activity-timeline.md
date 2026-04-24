# Phase 07 — Activity Timeline Component

## Goal

Reusable vertical timeline component for rendering autonomous activity / event streams. Used in Thread Detail drawer (Phase 06), per-thread Timeline view (Phase 11 extension), and Agent Inspector (future). Follows the canonical phase-2 thread-detail mockup spec exactly.

## Dependencies

- Phase 01 (canvas color, border-faint, text tiers, amber halos for checkpoint dots)

## Files

- `src/components/timeline/ActivityTimeline.tsx` (new)
- `src/index.css` — `.timeline`, `.timeline-row`, `.timeline-dot`, etc

## Tasks

### 7.1 — Component API

- [ ] Create `src/components/timeline/ActivityTimeline.tsx`:
```tsx
export type TimelineRowType = 'default' | 'checkpoint' | 'handoff' | 'tool' | 'file' | 'error';

export interface TimelineRow {
  id: string;
  timestamp: string;          // ISO or formatted
  agent?: string;             // luca, vektor, anima, etc
  verb: string;               // "read", "spawned", "drafting", "Bug confirmed"
  target?: string;            // file ref, thread ref — rendered as inline code if present
  type?: TimelineRowType;     // dot styling; default if absent
  description?: string;       // multi-line elaboration (for checkpoints)
  duration?: string;          // "4ms", "34s"
}

interface ActivityTimelineProps {
  rows: TimelineRow[];
  showDateDividers?: boolean;
  emptyText?: string;
}
```

### 7.2 — CSS spec

- [ ] Add to `src/index.css`:
```css
.timeline {
  display: flex; flex-direction: column;
  position: relative;
}
/* Vertical line with gradient fade at top + bottom */
.timeline::before {
  content: '';
  position: absolute;
  left: 5px; top: 8px; bottom: 8px;
  width: 1px;
  background: linear-gradient(180deg,
    transparent 0%,
    var(--border-faint) 4%,
    var(--border-faint) 96%,
    transparent 100%
  );
}

.timeline-row {
  display: grid;
  grid-template-columns: 12px 52px 1fr auto;
  gap: 12px;
  padding: 7px 0;
  align-items: start;
  position: relative;
}

.timeline-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  border: 2px solid var(--canvas);  /* punches a hole in the line */
  margin-top: 6px; margin-left: 3px;
  transform: translateX(-2px);
  z-index: 1;
  background: var(--text-ghost); /* default */
}
.timeline-dot.checkpoint {
  background: var(--amber-accent);
  box-shadow: var(--amber-halo-1), var(--amber-halo-2);
}
.timeline-dot.handoff { background: var(--text-body); }
.timeline-dot.tool, .timeline-dot.file { background: var(--text-tertiary); }
.timeline-dot.error { background: var(--red-accent); }

.timeline-time {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  color: var(--text-whisper);
  letter-spacing: var(--track-folio);
  padding-top: 3px;
}

.timeline-text {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-body);
  line-height: 1.55;
}
.timeline-text .agent { color: var(--text-body); }
.timeline-text .emphasis {
  color: var(--text-primary);
  font-weight: 500;
}
.timeline-text .file-ref {
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  padding: 1px 5px;
  font-size: 10.5px;
  border-radius: 3px;
}
.timeline-text .checkpoint-label {
  font-family: var(--font-sans);
  font-size: 12.5px;
  color: var(--text-primary);
  font-weight: 500;
  display: block;
}
.timeline-text .checkpoint-desc {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-soft);
  display: block;
  margin-top: 3px;
}

.timeline-meta {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-whisper);
  letter-spacing: var(--track-mono);
  padding-top: 3px;
}

/* Date dividers (showDateDividers prop) */
.timeline-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 0 10px;
}
.timeline-divider-time {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-soft);
  border: 1px solid var(--border-faint);
  background: var(--surface-1);
  padding: 1px 8px;
  border-radius: 999px;
  letter-spacing: var(--track-mono);
}
.timeline-divider-line {
  flex: 1; height: 1px;
  background: linear-gradient(90deg, var(--border-faint), transparent);
}
```

### 7.3 — Render logic

- [ ] Map each row to a `<div class="timeline-row">`:
  - Col 1: `<span class="timeline-dot {type}" />`
  - Col 2: time formatted (use existing `timeAgo` helper for compact: "4m" / "1h" / etc — or `HH:MM` via locale)
  - Col 3: `<span class="timeline-text">[agent .agent] [verb .emphasis-if-checkpoint] [target .file-ref-if-present]</span>`. For checkpoints, render `<div class="checkpoint-label">{verb}</div><div class="checkpoint-desc">{description}</div>`.
  - Col 4: `<span class="timeline-meta">{duration || ""}</span>`
- [ ] If `showDateDividers`, group rows by day and emit dividers between groups.
- [ ] If `rows.length === 0`, render `<EmptyState text={emptyText || "No activity yet"} />`.

### 7.4 — Data-source helpers

- [ ] Helper to map `entity_activity_log` rows to `TimelineRow`:
```ts
export function activityLogToTimeline(rows: ActivityEntry[]): TimelineRow[] {
  return rows.map((r) => ({
    id: r.id,
    timestamp: r.created_at,
    agent: extractAgent(r),
    verb: r.title || r.activity_type,
    target: extractTarget(r),
    type: typeForActivity(r.activity_type),
    description: r.summary,
    duration: extractDuration(r),
  }));
}
```
- `typeForActivity`: maps `'reflected' | 'memory_consolidation'` → 'checkpoint', `'handoff_received'` → 'handoff', `'tool_executed' | 'file_read'` → 'tool', `'error'` → 'error', else 'default'.

## Verification

1. Render in ThreadDetailDrawer with mock data — visual matches `mockups/phase-2/luca-terminal-thread-detail.html` Activity section.
2. Vertical line continuous behind dots; checkpoint dot has visible dual halo.
3. Date dividers appear when `showDateDividers` true.
4. File-ref code spans render with proper inline code styling.
5. Empty state shows when no rows.
6. Console: 0 errors.

## Commit

```
phase 07: ActivityTimeline component

- src/components/timeline/ActivityTimeline.tsx
- src/index.css — .timeline-* classes per phase-2 spec
- Helper: activityLogToTimeline() for entity_activity_log mapping
- Used in ThreadDetailDrawer Activity section

Verified: vertical line gradient fade, dot variants render correctly,
checkpoint dual halos visible, date dividers gated by prop, empty
state graceful.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
