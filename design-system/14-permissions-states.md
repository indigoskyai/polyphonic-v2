# Phase 14 — Permissions + States

## Goal

Edge-state surfaces for the conversation surface: an **inline permission card** (when an agent asks permission for a low-stakes action and we want the request to live in the message stream), a **modal permission** (for destructive actions where Riley needs to make an explicit decision before anything proceeds), a **connection-lost banner** (sticky top-of-canvas warning when Realtime drops), an **agent-offline prompt** (centered card when an agent is unreachable), and an **agent-errored inline card** (when an agent crashes mid-response — shown inline in the thread with retry + view-logs). After this phase: every "something is wrong / something needs you" state has a canonical, agent-aware visual treatment.

## Dependencies

- Phase 01 (foundation tokens — semantic accent variants for amber/red, surface elevation, motion)
- Phase 02 (Pill, Modal — inline action rows + the modal shell)
- Phase 04 (Drawer system — connection banner reads `useConnectionStore` if it exists)

## Files

- `src/components/permissions/PermissionInline.tsx` (new)
- `src/components/permissions/PermissionModal.tsx` (new)
- `src/components/states/ConnectionBanner.tsx` (new)
- `src/components/states/AgentOfflinePrompt.tsx` (new)
- `src/components/states/AgentErroredCard.tsx` (new)
- `src/index.css` — add `.perm-inline`, `.perm-modal-*`, `.conn-banner`, `.agent-offline`, `.aec-*` blocks
- `src/stores/connectionStore.ts` (new — exposes `connected: boolean`, listens to Supabase Realtime channel state)

## Tasks

### 14.1 — Inline permission card CSS

- [ ] Add to `src/index.css`:
```css
.perm-inline {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  margin: 20px 0;
  box-shadow: var(--shadow-inset-highlight);
  animation: perm-inline-in 300ms ease-out;
}
@keyframes perm-inline-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.perm-inline-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.perm-inline-icon {
  width: 14px; height: 14px;
  color: var(--amber-accent);
  stroke-width: 2;
}
.perm-inline-agent-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
}
.perm-inline-agent-dot.luca   { background: var(--luca-full); }
.perm-inline-agent-dot.vektor { background: var(--vektor-full); }
.perm-inline-agent-dot.anima  { background: var(--anima-full); }
.perm-inline-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  letter-spacing: var(--track-ui);
}
.perm-inline-body {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-body);
  padding-left: 24px;
  margin-bottom: 12px;
}
.perm-inline-body strong { font-weight: 500; color: var(--text-primary); }
.perm-inline-details {
  font-size: 11px;
  color: var(--text-soft);
  padding-left: 24px;
  margin-bottom: 14px;
}
.perm-inline-actions {
  display: flex;
  gap: 8px;
  padding-left: 24px;
  align-items: center;
}
.perm-inline-remember {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
  cursor: pointer;
  margin-right: auto;
}
.perm-inline-remember .checkbox {
  width: 12px; height: 12px;
  border: 1px solid var(--border-strong);
  border-radius: 3px;
  background: transparent;
  transition: all var(--dur-fast) var(--ease-out);
}
.perm-inline-remember.checked .checkbox {
  border-color: var(--text-primary);
  background: rgba(244, 243, 240, 0.05);
}
```

### 14.2 — Inline permission component

- [ ] Create `src/components/permissions/PermissionInline.tsx`. Props:
```ts
interface PermissionInlineProps {
  agent: 'luca' | 'vektor' | 'anima'
  title: string                         // e.g. "Vektor wants to read 3 files"
  body: React.ReactNode                 // body content with <strong> emphasis
  details?: string                      // e.g. "Will not modify, only read"
  onApprove: (remember: boolean) => void
  onDeny: () => void
}
```
- [ ] Use `lucide-react` `ShieldAlert` (or `AlertTriangle`) at 14×14 for the icon.
- [ ] Render Approve as `<Pill>` with green styling override (`style={{ background: 'var(--green-bg)', color: 'var(--green-accent)', borderColor: 'var(--green-border)' }}`) and Deny as `<Pill variant="ghost">`.
- [ ] Remember-checkbox state local; pass to `onApprove`.

### 14.3 — Modal permission CSS

- [ ] Add to `src/index.css`:
```css
.perm-modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: perm-backdrop-in 240ms ease-out;
}
@keyframes perm-backdrop-in { from { opacity: 0 } to { opacity: 1 } }

.perm-modal {
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  max-width: 480px;
  width: calc(100vw - 48px);
  box-shadow: var(--shadow-modal), var(--shadow-inset-highlight);
  animation: perm-modal-in 320ms var(--ease-premium);
}
@keyframes perm-modal-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.perm-modal-header {
  padding: 18px 22px 14px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.perm-modal-icon-circle {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--red-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.perm-modal-icon-circle svg {
  width: 14px; height: 14px;
  color: var(--red-accent);
}
.perm-modal-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
  letter-spacing: var(--track-ui);
}
.perm-modal-subtitle {
  font-size: 12px;
  color: var(--text-soft);
  line-height: 1.5;
}
.perm-modal-affected {
  margin: 0 22px 14px;
  background: var(--canvas);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.8;
  color: var(--text-secondary);
  max-height: 120px;
  overflow-y: auto;
}
.perm-modal-affected .destructive { color: var(--red-accent); }
.perm-modal-footer {
  padding: 14px 22px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

### 14.4 — Modal permission component

- [ ] Create `src/components/permissions/PermissionModal.tsx`. Props:
```ts
interface PermissionModalProps {
  open: boolean
  title: string                         // "Confirm destructive action"
  subtitle: string                      // "Vektor will permanently delete 12 files."
  affected: Array<{ label: string; destructive?: boolean }>
  confirmLabel?: string                 // default "Delete"
  onConfirm: () => void
  onCancel: () => void
}
```
- [ ] Render via React portal (`createPortal` to `document.body`).
- [ ] Trap focus inside modal (use Phase 04's drawer focus-trap helper if exported, otherwise a small local hook).
- [ ] ESC and backdrop click → `onCancel`.
- [ ] Confirm pill styling: `<Pill variant="destructive">` (already defined in Phase 02 — red text + red border).

### 14.5 — Connection banner CSS + component

- [ ] Add to `src/index.css`:
```css
.conn-banner {
  padding: 10px 32px;
  background: rgba(248, 113, 113, 0.04);
  border-bottom: 1px solid rgba(248, 113, 113, 0.12);
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: rgba(248, 113, 113, 0.8);
}
.conn-banner-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--red-accent);
  animation: conn-pulse 1.5s ease-in-out infinite;
}
@keyframes conn-pulse {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1; }
}
.conn-banner-action {
  margin-left: auto;
  font-size: 11px;
  color: rgba(248, 113, 113, 0.6);
  text-decoration: underline;
  text-decoration-color: rgba(248, 113, 113, 0.2);
  text-underline-offset: 3px;
  background: none;
  border: none;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out);
}
.conn-banner-action:hover {
  color: var(--red-accent);
  text-decoration-color: rgba(248, 113, 113, 0.5);
}

.conn-disabled-region {
  opacity: 0.5;
  pointer-events: none;
}
```

- [ ] Create `src/stores/connectionStore.ts` with `{ connected: boolean }`. Subscribe to Supabase Realtime channel `'system'` (or any persistent channel) and update on `SUBSCRIBED`/`CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`.

- [ ] Create `src/components/states/ConnectionBanner.tsx`. Reads `useConnectionStore`. When `!connected`, render `.conn-banner` with text "Connection lost. Reconnecting…" + a "Retry now" action (calls `supabase.realtime.connect()`). Mount once at the top of `src/App.tsx` above the main shell.

- [ ] When the banner is showing, the composer should be disabled. Wrap the composer container in `<div className={!connected ? 'conn-disabled-region' : ''}>`.

### 14.6 — Agent offline prompt CSS + component

- [ ] Add to `src/index.css`:
```css
.agent-offline {
  padding: 24px 28px;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  max-width: 420px;
  margin: 48px auto;
  text-align: center;
  box-shadow: var(--shadow-inset-highlight);
}
.agent-offline-dot {
  width: 12px; height: 12px;
  background: var(--text-tertiary);
  border-radius: 50%;
  margin: 0 auto 12px;
}
.agent-offline-title {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
  margin-bottom: 6px;
}
.agent-offline-sub {
  font-size: 12px;
  color: var(--text-soft);
  margin-bottom: 16px;
}
.agent-offline-actions {
  display: inline-flex;
  gap: 8px;
}
```

- [ ] Create `src/components/states/AgentOfflinePrompt.tsx`. Props: `{ agent: string, onWake: () => void, onSwap: () => void }`. Title: `"{agent} is offline"`. Sub: `"Wake them up or hand off to another agent."`. Actions: `<Pill variant="primary">Wake</Pill> <Pill variant="ghost">Use another agent</Pill>`.

### 14.7 — Agent errored inline card CSS

- [ ] Add to `src/index.css`:
```css
.error-event {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0;
  font-size: 11px;
  font-family: var(--font-mono);
  color: rgba(248, 113, 113, 0.6);
  letter-spacing: var(--track-mono);
  text-transform: uppercase;
}
.error-event::before,
.error-event::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(248, 113, 113, 0.12);
}

.aec-card {
  background: var(--surface-1);
  border: 1px solid rgba(248, 113, 113, 0.15);
  border-radius: var(--radius-md);
  padding: 18px 22px;
  margin: 12px 0;
  animation: perm-inline-in 300ms ease-out;
  box-shadow: var(--shadow-inset-highlight);
}
.aec-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.aec-header svg {
  width: 14px; height: 14px;
  color: var(--red-accent);
}
.aec-title {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
}
.aec-time {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-tertiary);
}
.aec-message {
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--text-body);
  line-height: 1.55;
  padding-left: 24px;
  margin-bottom: 10px;
}
.aec-details {
  display: none;
  margin: 10px 0 14px 24px;
  background: var(--canvas);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-soft);
  white-space: pre-wrap;
}
.aec-details.open { display: block; }
.aec-actions {
  padding-left: 24px;
  display: flex;
  gap: 8px;
}
```

### 14.8 — Agent errored inline component

- [ ] Create `src/components/states/AgentErroredCard.tsx`. Props:
```ts
interface AgentErroredCardProps {
  agent: 'luca' | 'vektor' | 'anima'
  message: string                       // user-facing summary
  detail?: string                       // raw error trace (collapsed)
  occurredAt: string
  onRetry: () => void
  onViewLogs: () => void
}
```
- [ ] Render an `.error-event` divider line ABOVE the card with text `"{agent} encountered an error mid-response"`.
- [ ] Card body: header (icon + agent-titled title + timestamp right), message, collapsible details, actions row.
- [ ] Local state `detailsOpen: boolean`. Toggle via "Details" Pill. When open, add `.open` class to `.aec-details`.
- [ ] Actions: `<Pill size="sm">Details</Pill> <Pill size="sm" variant="ghost" onClick={onViewLogs}>View logs</Pill> <Pill size="sm" variant="primary" onClick={onRetry}>Retry</Pill>`.

### 14.9 — Wire into message renderer

- [ ] In the message renderer (likely `src/components/chat/MessageList.tsx` or similar), branch on message kind:
  - `kind === 'permission_request'` → render `<PermissionInline />`.
  - `kind === 'agent_error'` → render `<AgentErroredCard />`.
  - Other kinds → existing rendering path.
- [ ] If a separate `kind` column doesn't exist yet, key off `metadata.type`. Document the convention in the component's JSDoc.

### 14.10 — Modal mounting

- [ ] `<PermissionModal />` instances are owned by whatever invokes them — typically the agent runtime layer when it gets back a `permission_required: 'destructive'` response. For this phase, expose a small store helper:
```ts
// src/stores/permissionModalStore.ts
useModal.requestDestructive({ title, subtitle, affected, onConfirm })
```
   And mount one global `<PermissionModal {...modal} />` listener at the top of `src/App.tsx`.

## Verification

1. **Inline permission:** Insert a fake message with kind `permission_request` for Vektor reading 3 files. Card renders inline, amber icon, vektor dot, body with `<strong>3 files</strong>`. Approve calls `onApprove(remember=false)` by default; toggling checkbox flips to `true`. Card removes after action.
2. **Modal permission:** Trigger `useModal.requestDestructive({ ... affected: [{label:'src/old.ts', destructive:true}, {label:'src/new.ts'}] })`. Modal animates in (translateY + scale). Affected list scrollable past 120px height. Cancel + ESC + backdrop click all close. Confirm fires once and closes.
3. **Connection banner:** Disconnect network (or call `supabase.realtime.disconnect()`). Banner appears at top of canvas, red dot pulses. Composer dimmed and pointer-events disabled. Reconnect — banner dismounts cleanly.
4. **Agent offline:** Render `<AgentOfflinePrompt agent="vektor" />` standalone. Centered, ghost dot, two pills. Wake fires `onWake`.
5. **Agent errored:** Insert fake error message. `error-event` divider line appears above the card with red-tinted hairlines on both sides. Card has red-tinted border. Clicking Details toggles `.aec-details.open`. Retry fires once.
6. **Playwright:** screenshot each state at 1440px and compare to `permissions-states-rich-mockup.html` corresponding sections.
7. **Console:** 0 new errors. **Accessibility:** all modals trap focus; ESC always closes; banner has `role="alert"`.

## Backend asks

None for v1. The "destructive" classification on permission requests is set by the agent runtime (Lovable side) — no schema change needed if `messages.metadata.type` already supports arbitrary tags. If the runtime currently has no way to surface a permission request, file a Lovable ask: "Add `permission_request` and `agent_error` message kinds (either as `kind` enum extension or `metadata.type` convention) so the React shell can render the canonical inline cards."

## Commit

```
phase 14: permissions + edge states — inline + modal + banner + offline + errored

- src/components/permissions/PermissionInline.tsx (new)
- src/components/permissions/PermissionModal.tsx (new)
- src/components/states/ConnectionBanner.tsx (new)
- src/components/states/AgentOfflinePrompt.tsx (new)
- src/components/states/AgentErroredCard.tsx (new)
- src/stores/connectionStore.ts (new — Realtime channel state)
- src/stores/permissionModalStore.ts (new — global modal trigger)
- src/index.css — .perm-inline, .perm-modal-*, .conn-banner,
  .agent-offline, .aec-* + .error-event blocks per phase-14 spec
- MessageList branches on permission_request / agent_error message kinds

Verified: inline card renders with agent dot + amber icon, modal traps
focus and animates in, connection banner pulses + disables composer,
agent-errored card has collapsible details and red-tinted hairlines.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
