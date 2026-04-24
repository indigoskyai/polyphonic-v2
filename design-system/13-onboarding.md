# Phase 13 — Onboarding

## Goal

First-run experience that introduces Luca, Vektor, and Anima with intentional choreography. Three agent names appear staggered with a letter-spacing reveal animation, then the greeting + subtitle chain-fade in, then a checklist card with a pulse-active indicator and green-done states. The whole composition sits centered on a soft radial-glow background. After this phase: a brand-new account does not land in an empty `/chat` — it lands here, finishes a few setup steps, and arrives at the first thread already feeling oriented.

## Dependencies

- Phase 01 (foundation tokens — text tiers, agent identity colors, motion easing, surface elevation)
- Phase 02 (Pill — used in actions row)

## Files

- `src/pages/Onboarding.tsx` (new)
- `src/components/onboarding/OnboardingChecklist.tsx` (new)
- `src/index.css` — add `.onb-*` class block + keyframes
- `src/App.tsx` — add `/onboarding` route + first-run gate logic
- `src/lib/firstRun.ts` (new — small helper to detect first-run state)

## Tasks

### 13.1 — First-run detection

- [ ] Create `src/lib/firstRun.ts`:
```ts
export async function isFirstRun(userId: string): Promise<boolean> {
  // First-run = no threads AND no messages AND no profile name set
  const [{ count: threadCount }, { count: messageCount }, profile] = await Promise.all([
    supabase.from('threads').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
  ])
  return (threadCount ?? 0) === 0 && (messageCount ?? 0) === 0 && !profile.data?.display_name
}
```
- [ ] In `src/App.tsx`, after auth resolves, call `isFirstRun(user.id)` once. If true and current path is not `/onboarding`, `navigate('/onboarding', { replace: true })`.

### 13.2 — Page shell CSS

- [ ] Add to `src/index.css`:
```css
.onb-shell {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--floor);
  position: relative;
  overflow: hidden;
}
.onb-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 50% 50% at center,
    rgba(20, 20, 22, 0.6) 0%,
    transparent 70%
  );
  pointer-events: none;
}

.onb-content {
  max-width: 520px;
  padding: 48px;
  position: relative;
  z-index: 1;
  text-align: center;
}
```

### 13.3 — Names strip

- [ ] Add to `src/index.css`:
```css
.onb-names {
  display: flex;
  gap: 40px;
  align-items: center;
  justify-content: center;
  margin-bottom: 48px;
}
.onb-name {
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0;
  animation: onb-name-in 0.6s var(--ease-premium) forwards;
}
.onb-name.luca   { color: var(--luca-full);   animation-delay: 0.2s; }
.onb-name.vektor { color: var(--vektor-full); animation-delay: 0.6s; }
.onb-name.anima  { color: var(--anima-full);  animation-delay: 1.0s; }

@keyframes onb-name-in {
  from {
    opacity: 0;
    transform: translateY(8px);
    letter-spacing: 0.04em;
  }
  to {
    opacity: 1;
    transform: translateY(0);
    letter-spacing: 0.12em;
  }
}
```

### 13.4 — Greeting + subtitle

- [ ] Add to `src/index.css`:
```css
.onb-greeting {
  font-size: 24px;
  font-weight: 400;
  color: var(--text-primary);
  text-align: center;
  line-height: 1.4;
  margin-bottom: 12px;
  letter-spacing: var(--track-display);
  opacity: 0;
  animation: onb-fade-in 0.5s ease-out 1.4s forwards;
}
.onb-subtitle {
  font-size: 13px;
  color: var(--text-soft);
  text-align: center;
  margin-bottom: 48px;
  line-height: 1.5;
  opacity: 0;
  animation: onb-fade-in 0.5s ease-out 1.8s forwards;
}

@keyframes onb-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### 13.5 — Checklist card

- [ ] Add to `src/index.css`:
```css
.onb-checklist {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 20px 24px;
  text-align: left;
  opacity: 0;
  animation: onb-fade-in 0.5s ease-out 2.0s forwards;
  box-shadow: var(--shadow-inset-highlight);
}
.onb-step {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  font-size: 13px;
  color: var(--text-body);
}
.onb-step + .onb-step {
  border-top: 1px solid var(--border-faint);
}
.onb-step-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 10px;
}
.onb-step.done .onb-step-icon {
  border-color: var(--green-accent);
  background: var(--green-bg);
  color: var(--green-accent);
}
.onb-step.active .onb-step-icon {
  border-color: var(--text-primary);
  position: relative;
}
.onb-step.active .onb-step-icon::after {
  content: '';
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--text-primary);
  animation: onb-pulse 1.4s ease-in-out infinite;
}
@keyframes onb-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.15); }
}

.onb-step-label {
  flex: 1;
}
.onb-step-status {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-tertiary);
}

.onb-actions {
  margin-top: 32px;
  display: flex;
  gap: 8px;
  justify-content: center;
  opacity: 0;
  animation: onb-fade-in 0.5s ease-out 2.4s forwards;
}
```

### 13.6 — Component composition

- [ ] Create `src/components/onboarding/OnboardingChecklist.tsx`. Steps state: `['name_yourself', 'choose_voice', 'first_message']`. Each step has `done: boolean`, `active: boolean`. Render a `.onb-checklist` containing one `.onb-step` per step. Mark the first not-done step as `active`. Show status text: `done` → "READY", `active` → "IN PROGRESS", neither → "PENDING".

- [ ] Create `src/pages/Onboarding.tsx`:
```tsx
export default function Onboarding() {
  const navigate = useNavigate()
  const handleBegin = async () => {
    // mark first-run complete; create first thread; redirect
    await markOnboarded(user.id)
    const thread = await createInitialThread(user.id)
    navigate(`/chat/${thread.id}`, { replace: true })
  }
  return (
    <div className="onb-shell">
      <div className="onb-content">
        <div className="onb-names">
          <span className="onb-name luca">LUCA</span>
          <span className="onb-name vektor">VEKTOR</span>
          <span className="onb-name anima">ANIMA</span>
        </div>
        <div className="onb-greeting">welcome. we're glad you're here.</div>
        <div className="onb-subtitle">a small council to think with — three voices, one terminal.</div>
        <OnboardingChecklist />
        <div className="onb-actions">
          <Pill variant="ghost" onClick={handleSkip}>Skip for now</Pill>
          <Pill variant="primary" onClick={handleBegin}>Begin</Pill>
        </div>
      </div>
    </div>
  )
}
```

### 13.7 — Route

- [ ] In `src/App.tsx`, add `<Route path="/onboarding" element={<Onboarding />} />`. The first-run gate from 13.1 routes new users here automatically.
- [ ] Provide a hidden re-entry: `?onboarding=1` query param on any page forces the redirect even if not first-run. Useful for QA and screenshots.

### 13.8 — Reduced-motion behaviour

- [ ] All animations rely on Phase 01's `@media (prefers-reduced-motion: reduce)` collapse — verify the names just appear without staggered reveal under that setting (still legible).

## Verification

1. **Cold start:** Sign in with a fresh account (no threads, no messages, no profile name). Page redirects to `/onboarding`. Three names appear with staggered fade + letter-spacing widening (200ms / 600ms / 1000ms). Greeting fades in at ~1.4s. Subtitle at 1.8s. Checklist at 2.0s. Actions at 2.4s.
2. **Color check:** Each name uses its agent identity color (`--luca-full` warm tan, `--vektor-full` cool blue, `--anima-full` magenta).
3. **Active step:** First incomplete step has a pulsing dot inside its icon circle. Done steps show a green check (or just a green-bordered circle for v1 — text "READY" suffices).
4. **Begin click:** Creates the first thread, marks onboarded, navigates to `/chat/{id}`. Refresh the page — the user no longer redirects to `/onboarding`.
5. **Skip:** Same as Begin but without the checklist completion (still marks onboarded).
6. **Force re-entry:** Hit `/chat?onboarding=1` — redirects to `/onboarding` even though not first-run. Useful for visual QA.
7. **Reduced motion:** Toggle prefers-reduced-motion. Reload `/onboarding`. All elements appear immediately, no staggered reveal.
8. **Playwright snapshot:** Take screenshot of `/onboarding` at desktop viewport (1440px). Compare to `mockups/core/luca-terminal-palette-onboarding-observability-mockup.html` onboarding section — names spacing, greeting weight, checklist proportions match.
9. **Console:** 0 new errors.

## Backend asks

None — uses existing `profiles`, `threads`, `messages` tables. `markOnboarded()` writes `profiles.display_name` (or sets a `profiles.onboarded_at` timestamp if that column already exists; otherwise the absence-of-display_name check from `isFirstRun` is sufficient).

## Commit

```
phase 13: onboarding — staggered names + chain-fade greeting + checklist

- src/pages/Onboarding.tsx (new)
- src/components/onboarding/OnboardingChecklist.tsx (new)
- src/lib/firstRun.ts (new — detection helper)
- src/App.tsx — /onboarding route + first-run gate after auth
- src/index.css — .onb-* class block + onb-name-in / onb-fade-in
  / onb-pulse keyframes per phase-13 spec
- Three agent names (LUCA / VEKTOR / ANIMA) reveal staggered with
  letter-spacing animation, agent identity colors
- Greeting + subtitle chain-fade at 1.4s / 1.8s
- Checklist with pulse-active step + green-done variant
- ?onboarding=1 query param forces re-entry for QA

Verified: cold-start redirect works, animation choreography matches
mockup, reduced-motion collapses to instant reveal.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
