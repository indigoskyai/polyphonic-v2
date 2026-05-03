## Goal

1. Confirm chat messages render at 16px (already in place — verify only).
2. Fix the typography mismatch in the Agent Dialogue drawer where Luca's "asked" text (plain `<p>` at 13.5px / 1.6) is smaller and tighter than Anima's response (rendered via `<RichBody>` which inherits the default 16px from `.mc-body`/global). Make both render at the same scale — using Luca's current drawer styling as the target for both.

## Findings

- `src/index.css` `.mc-body` is already `font-size: 16px; line-height: 1.7` (chat thread rows). No change needed for chat scale.
- `src/components/drawers/AgentDialogueDrawer.tsx`:
  - Luca's question: inline `<p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-body)' }}>`.
  - Anima's response: `<RichBody source={consult.response} />` — inherits no explicit size, so `.rich-body p` falls back to whatever ambient cascade applies, rendering visibly larger than Luca's question.
- `RichBody` accepts a `className` prop and renders `<div class="rich-body ${className}">`, so a compact variant class is the cleanest hook.

## Changes

### 1. `src/components/rich/RichBody.tsx`
No code change. (Already supports `className` passthrough.)

### 2. `src/index.css`
Add a compact rich-body variant scoped to drawers:

```css
.rich-body--compact {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-body);
}
.rich-body--compact p,
.rich-body--compact li {
  font-size: 13.5px;
  line-height: 1.6;
}
.rich-body--compact p { margin: 0 0 10px; }
.rich-body--compact p:last-child { margin-bottom: 0; }
.rich-body--compact h1,
.rich-body--compact h2,
.rich-body--compact h3,
.rich-body--compact h4 { font-size: 13.5px; margin-top: 12px; }
```

### 3. `src/components/drawers/AgentDialogueDrawer.tsx`
- Pass `className="rich-body--compact"` to the `<RichBody>` rendering Anima's response.
- Keep Luca's `<p>` styling as-is (13.5 / 1.6) so both columns visually match.
- Apply the same `fontSize: 13.5, lineHeight: 1.6` to the "failed" / "waiting" fallback paragraphs (already 13px → bump to 13.5 for consistency).

## Verification

- Open a thread with an existing Anima consultation; open the Agent Dialogue drawer.
- Confirm Luca's question and Anima's response render at the same font size / line-height / color.
- Confirm chat thread message body remains at 16px (unchanged).
- No console errors.
