# Phase 17 — Settings Depth (Per-Agent Editor)

## Goal

Build the deep settings surface for each agent: a list of agent rows in the settings index, each linking to a detail page that exposes env switcher (dev/staging/prod), system prompt textarea with char/line meta, tool grid with on/off + amber permission gates, MCP server list, sub-agent list, voice card grid, keychain (masked secrets), and a sticky save footer that tracks dirty state. This is the surface from the older `luca-terminal-settings-mockup.html` — Import/Export and Extensions are covered by other settings work and are NOT part of this phase.

## Dependencies

- Phase 01 (foundation tokens)
- Phase 02 (Pill, Select, Textarea, ToggleSwitch, FormField)
- Existing `/settings` route shell (settings nav + section frame)

## Files to create

```
src/pages/settings/AgentsList.tsx
src/pages/settings/AgentDetail.tsx
src/components/settings/EnvSwitcher.tsx
src/components/settings/PromptEditor.tsx
src/components/settings/ToolGrid.tsx
src/components/settings/McpList.tsx
src/components/settings/SubAgentList.tsx
src/components/settings/VoiceCardGrid.tsx
src/components/settings/Keychain.tsx
src/components/settings/StickySaveFooter.tsx
src/stores/agentSettingsStore.ts
```
- `src/index.css` — `.agent-row`, `.env-switch`, `.prompt-editor`, `.tool-*`, `.mcp-*`, `.subagent-*`, `.voice-*`, `.keychain-*`, `.footer-bar` classes
- `src/App.tsx` — register `/settings/agents` and `/settings/agents/:id` routes

## Tasks

### 17.1 — `agentSettingsStore`

- [ ] Create `src/stores/agentSettingsStore.ts`:
```ts
import { create } from 'zustand'

export type Env = 'dev' | 'staging' | 'prod'
export interface ToolDef { id: string; name: string; on: boolean; gated?: boolean }
export interface McpServer { id: string; name: string; url: string; status: 'on' | 'off'; meta?: string }
export interface SubAgent { id: string; name: string; description: string; model: string; on: boolean }
export interface Voice { id: string; provider: 'elevenlabs' | 'openai' | 'play'; voiceId: string; rate: number; pitch: number }
export interface Secret { id: string; name: string; lastFour: string; status: 'connected' | 'expired' }

export interface AgentConfig {
  id: string
  name: string
  role: string
  model: string
  status: 'on' | 'off' | 'errored'
  uptimeMs: number
  env: Env
  prompt: string
  tools: ToolDef[]
  mcp: McpServer[]
  subagents: SubAgent[]
  voices: Voice[]
  secrets: Secret[]
}

interface AgentSettingsState {
  agents: AgentConfig[]
  draftById: Record<string, Partial<AgentConfig>>
  setDraft: (id: string, patch: Partial<AgentConfig>) => void
  isDirty: (id: string) => boolean
  discard: (id: string) => void
  save: (id: string) => Promise<void>
}
export const useAgentSettingsStore = create<AgentSettingsState>(/* impl */)
```

### 17.2 — `/settings/agents` index (rows)

- [ ] CSS:
```css
.agent-row {
  display: grid;
  grid-template-columns: auto 140px 110px 80px 24px;
  gap: 20px;
  align-items: center;
  padding: 14px 18px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.agent-row:hover {
  background: var(--surface-2);
  border-color: var(--border);
}
.agent-identity {
  display: flex; align-items: center; gap: 10px;
}
.agent-identity-dot {
  width: 8px; height: 8px; border-radius: 50%;
}
.agent-identity-name {
  font-size: 14px; font-weight: 500; color: var(--text-primary);
}
.agent-identity-role {
  display: block;
  font-size: 11px; color: var(--text-soft);
  margin-top: 2px;
}
.agent-model {
  font-family: var(--font-mono);
  font-size: 11px; color: var(--text-body);
}
.agent-status {
  display: flex; align-items: center; gap: 6px;
}
.agent-status-dot {
  width: 6px; height: 6px; border-radius: 50%;
}
.agent-status-dot--on { background: var(--green-accent); box-shadow: var(--green-glow); }
.agent-status-dot--off { background: var(--text-tertiary); }
.agent-status-dot--errored { background: var(--red-accent); }
.agent-status-label {
  font-family: var(--font-mono);
  font-size: 11px; color: var(--text-soft);
  text-transform: uppercase; letter-spacing: var(--track-meta);
}
.agent-uptime {
  font-family: var(--font-mono);
  font-size: 10px; color: var(--text-ghost);
  text-align: right;
}
.agent-chev {
  width: 10px; height: 10px;
  color: var(--text-ghost);
}
```

- [ ] Row click → navigate to `/settings/agents/:id`.

### 17.3 — `AgentDetail` page header + env switcher

- [ ] Detail header:
```html
<div class="agent-detail-header">
  <span class="agent-detail-dot" data-agent={agent.id} />
  <h1 class="agent-detail-name">{agent.name}</h1>
  <span class="agent-role-pill">{agent.role}</span>
  <span class="agent-spacer" />
  <EnvSwitcher value={env} onChange={(v) => setDraft(id, { env: v })} />
</div>
```
- [ ] CSS:
```css
.agent-detail-header {
  display: flex; align-items: center; gap: 12px;
  padding: 28px 32px 20px;
}
.agent-detail-dot {
  width: 12px; height: 12px; border-radius: 50%;
}
.agent-detail-name {
  font-size: 20px; font-weight: 500;
  color: var(--text-primary);
  letter-spacing: var(--track-display);
}
.agent-role-pill {
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-soft);
}
.agent-spacer { flex: 1; }

.env-switch {
  display: inline-flex;
  padding: 2px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}
.env-opt {
  padding: 4px 12px;
  font-family: var(--font-mono);
  font-size: 10px; font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  background: transparent; border: none; cursor: pointer;
  border-radius: 4px;
  transition: all var(--dur-fast) var(--ease-out);
}
.env-opt.active {
  background: var(--surface-1);
  color: var(--text-primary);
}
```

### 17.4 — Field grid (label / control)

- [ ] CSS:
```css
.field-grid {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 24px 32px;
  padding: 0 32px 24px;
}
.field-label {
  font-size: 11px; font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding-top: 4px;
}
.field-hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-ghost);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}
.field-control { min-width: 0; }
```

- [ ] Use Phase 02 `<Select>` for model picker (with custom CSS arrow).

### 17.5 — Prompt editor

- [ ] CSS:
```css
.prompt-editor {
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 16px 18px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text-primary);
  min-height: 220px;
  resize: vertical;
  outline: none;
  transition: border-color var(--dur-normal) var(--ease-premium);
}
.prompt-editor:focus { border-color: var(--border-focus); }
.prompt-meta {
  display: flex; gap: 16px;
  margin-top: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-ghost);
  letter-spacing: var(--track-meta);
}
```

- [ ] PromptEditor component composes textarea + meta:
```tsx
<>
  <textarea className="prompt-editor" value={prompt} onChange={onChange} />
  <div className="prompt-meta">
    <span>{prompt.length} chars</span>
    <span>{prompt.split('\n').length} lines</span>
  </div>
</>
```

### 17.6 — Tool grid

- [ ] CSS:
```css
.tool-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  max-width: 560px;
}
.tool-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.tool-item.on {
  background: var(--bg-surface);
  border-color: var(--border);
}
.tool-check {
  width: 12px; height: 12px;
  border-radius: 3px;
  border: 1px solid var(--border-strong);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.tool-check svg { opacity: 0; width: 8px; height: 8px; color: var(--canvas); }
.tool-item.on .tool-check {
  border-color: var(--text-primary);
  background: var(--text-primary);
}
.tool-item.on .tool-check svg { opacity: 1; }
.tool-name {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-body);
}
.tool-gate {
  margin-left: auto;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--amber-accent);
}
```

- [ ] Click row → toggle `.on` class; persist via `setDraft`. Gated tools render `<span class="tool-gate">PERMISSION</span>` to indicate confirmation required.

### 17.7 — MCP list

- [ ] CSS:
```css
.mcp-list { display: flex; flex-direction: column; gap: 8px; }
.mcp-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}
.mcp-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--green-accent);
  box-shadow: var(--green-glow);
  flex-shrink: 0;
}
.mcp-dot.off { background: var(--text-ghost); box-shadow: none; }
.mcp-name {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
}
.mcp-url {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-soft);
}
.mcp-meta {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-ghost);
}
```

### 17.8 — Sub-agent list

- [ ] CSS (uses parent border-subtle bg + 1px gap to fake row separators):
```css
.subagent-list {
  display: flex; flex-direction: column;
  gap: 1px;
  background: var(--border-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.subagent-row {
  display: grid;
  grid-template-columns: 120px 1fr 90px 70px;
  gap: 16px;
  align-items: center;
  padding: 10px 14px;
  background: var(--bg-elevated);
}
.sa-name {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
}
.sa-name-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--text-soft); }
.sa-desc { font-size: 12px; color: var(--text-soft); }
.sa-model {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-ghost);
}
```

- [ ] Right column: Phase 02 `<ToggleSwitch>`.

### 17.9 — Voice card grid

- [ ] CSS:
```css
.voice-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.voice-card {
  padding: 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}
.vc-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
}
.vc-dot { width: 8px; height: 8px; border-radius: 50%; }
.vc-name { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.vc-field { margin-bottom: 10px; }
.vc-label {
  font-size: 10px; font-weight: 500;
  color: var(--text-ghost);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.vc-value {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-body);
  margin-top: 2px;
}
.vc-test { margin-top: 8px; }
```

- [ ] `.vc-test` slot uses Phase 02 `<Pill size="xs" variant="ghost">Test voice</Pill>`.

### 17.10 — Keychain (masked secrets)

- [ ] CSS:
```css
.keychain-list {
  display: flex; flex-direction: column;
  gap: 1px;
  background: var(--border-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.keychain-row {
  display: grid;
  grid-template-columns: 1fr 200px 90px 24px;
  gap: 16px;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-elevated);
}
.kc-name {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
}
.kc-value {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-soft);
}
.kc-status {
  display: flex; align-items: center; gap: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-ghost);
}
.kc-status-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--green-accent);
}
.kc-status.expired .kc-status-dot { background: var(--amber-accent); }
.kc-row-action {
  background: transparent; border: none;
  color: var(--text-ghost); cursor: pointer;
}
```

- [ ] Mask format: `sk-...XYZ` — show prefix + `...` + last 3 chars from `secret.lastFour` (use `lastFour.slice(-3)` for visual; never expose full key).

### 17.11 — Sticky save footer

- [ ] CSS:
```css
.footer-bar {
  position: sticky;
  bottom: 0;
  background: var(--floor);
  border-top: 1px solid var(--border-subtle);
  padding: 12px 32px;
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px;
  margin: 32px -32px -80px;
  z-index: 10;
}
.fb-status {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-ghost);
}
.fb-status.fb-dirty { color: var(--amber-accent); }
.fb-actions { display: flex; gap: 8px; }
```

- [ ] `<StickySaveFooter agentId={id}>`:
```tsx
const dirty = useAgentSettingsStore((s) => s.isDirty(id))
const discard = useAgentSettingsStore((s) => s.discard)
const save = useAgentSettingsStore((s) => s.save)
return (
  <div className="footer-bar">
    <span className={`fb-status ${dirty ? 'fb-dirty' : ''}`}>
      {dirty ? 'unsaved changes' : 'all changes saved'}
    </span>
    <div className="fb-actions">
      <Pill variant="ghost" disabled={!dirty} onClick={() => discard(id)}>Discard</Pill>
      <Pill variant="primary" disabled={!dirty} onClick={() => save(id)}>Save</Pill>
    </div>
  </div>
)
```

- [ ] Block navigation when dirty: use a `useBeforeUnload` hook + react-router `useBlocker` to show confirm.

## Verification

1. **Index renders:** Navigate to `/settings/agents`. All agent rows render with identity dot, model, status dot+label, uptime, chev. Hover lifts background to `--surface-2`.
2. **Detail loads:** Click a row → navigate to `/settings/agents/:id`. Header shows agent name, role pill, env switcher.
3. **Env switcher:** Click each option — `.active` class moves; draft updates.
4. **Prompt editor:** Type — char/line meta updates live. Focus → border becomes `--border-focus` over 300ms.
5. **Tool grid:** Click a tool row — `.on` class toggles; check icon fades in. Gated tools show amber `PERMISSION` label.
6. **MCP list:** Off MCP shows ghost dot; on shows green with glow.
7. **Voice cards:** 3-up grid; "Test voice" Pill renders.
8. **Keychain:** Secrets render masked (`sk-...XYZ`); never show full key in DOM (verify via `document.body.innerText.includes('sk-')` returning only the masked form).
9. **Dirty state:** Edit any field → `.fb-dirty` color amber, Save Pill enabled.
10. **Save:** Click Save → store calls Supabase → status reverts to `all changes saved`.
11. **Computed-style audit:**
    ```js
    () => {
      const ed = document.querySelector('.prompt-editor')
      const cs = getComputedStyle(ed)
      return { font: cs.fontFamily, size: cs.fontSize, lh: cs.lineHeight, minH: cs.minHeight }
    }
    ```
    Assert mono font, 12.5px, line-height ~20.6px, min-height 220px.
12. **Console:** 0 new errors.

## Backend asks

If `agent_configs`, `agent_secrets`, `mcp_servers` tables are missing, hand Lovable this prompt:

> Create `agent_configs` table: `id text pk`, `env text default 'prod'`, `prompt text`, `model text`, `tools jsonb default '[]'::jsonb`, `subagents jsonb default '[]'::jsonb`, `voices jsonb default '[]'::jsonb`, `updated_at timestamptz`. Create `mcp_servers` table: `id uuid pk`, `agent_id text fk`, `name text`, `url text`, `status text default 'off'`, `meta text null`. Create `agent_secrets` table: `id uuid pk`, `agent_id text fk`, `name text`, `last_four text`, `status text default 'connected'`, `created_at timestamptz`. RLS: per-workspace. Add edge function `agent-config-save` that accepts a partial config and validates env transitions.

## Commit

```
phase 17: settings depth — per-agent editor

- src/pages/settings/{AgentsList,AgentDetail}.tsx (new)
- src/components/settings/{EnvSwitcher,PromptEditor,ToolGrid,
  McpList,SubAgentList,VoiceCardGrid,Keychain,
  StickySaveFooter}.tsx (new)
- src/stores/agentSettingsStore.ts (new) — drafts + isDirty
- src/index.css — .agent-row, .env-switch, .prompt-editor
  (mono 12.5px / 1.65, focus → border-focus 300ms premium),
  .tool-grid (3-col, amber PERMISSION gate), .mcp-* (green
  glow on/off ghost), .subagent-* (1px gap separators),
  .voice-* (3-card grid), .keychain-* (masked secrets),
  .footer-bar (sticky, fb-dirty amber)
- src/App.tsx — register /settings/agents + /:id

Verified: dirty state tracks per-field edits; save round-trips
to Supabase; navigation blocked when dirty; secrets render
masked only; tool gates render amber.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
