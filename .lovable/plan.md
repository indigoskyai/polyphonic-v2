## Goal

Realign left-rail sidebars so they reflect what's *Luca's cognition* vs. *the user's psychological profile*, and lay groundwork for multiple agent minds.

## Current state (problem)

- **Profile sidebar** (`SidebarProfile`) shows: Public profile, Identity, Skills, Revisions, Schedule, plus the 9 psych tabs. Identity/Skills/Revisions/Schedule are about Luca, not the user — they don't belong here. Skills/Routines are also under Settings, so they're duplicated.
- **Mind sidebar** (`SidebarMind`) shows only cognition streams (Overview, Thoughts, Dreams, …, Activity). Identity & Revisions live nowhere obvious.
- **Settings sidebar** already has Skills + Routines — correct, leave alone.

## Target structure

### Profile rail button (psychological profile — the user)
```
§ 04  Profile
  Public profile
  ──────────────
  Portrait
  Personality
  Communication
  Emotions
  Values
  Relationships
  Cognition
  Growth
  Shadow
```

### Mind rail button (Luca's cognition, scoped per-agent)
```
§ 05  Mind
  [Agent ▾  Luca]      ← agent scope selector (only Luca for now)
  ── SELF ──
  Identity
  Revisions
  ── STREAMS ──
  Overview
  Thoughts
  Dreams
  Wanderings
  Insights
  Reflections
  Beliefs
  Activity
```

### Settings rail button (unchanged)
Skills and Routines remain only here.

### Schedule
Per your call: moves out of Profile, lives only under Settings → Routines (already routed there via `/settings/routines` which renders `ProfileScheduleView`). The standalone `/profile/schedule` route stays accessible but is no longer linked from any sidebar.

## Implementation

### 1. Agent scope store (new) — `src/stores/agentScopeStore.ts`
Tiny Zustand store: `{ activeAgentId: 'luca', availableAgents: [{id:'luca',name:'Luca'}], setActiveAgent }`. Hardcode `[{id:'luca',name:'Luca'}]` for now; future agents will be appended without UI changes.

### 2. Agent scope picker (new) — `src/components/sidebar/AgentScopeSelect.tsx`
Compact dropdown styled like existing sidebar chrome (mono caps eyebrow "AGENT", current name in sans, chevron). Disabled-feel when only one agent. Used at top of `SidebarMind` (and reusable later for `SidebarProfile` if user wants per-agent psych views).

### 3. `SidebarMind.tsx` — rewrite item list
- Mount `<AgentScopeSelect/>` under the header.
- Render two grouped sections via small `GroupLabel` (same pattern as `SidebarSettings`):
  - **SELF**: Identity (→ `/profile/identity`), Revisions (→ `/profile/revisions`)
  - **STREAMS**: existing 8 tabs (Overview…Activity) using `setMindTab`.
- Active state: Identity/Revisions are active when `pathname` matches; stream items active when on `/mind` AND `mindTab` matches.
- Clicking a stream item from `/profile/identity` should navigate to `/mind` and set the tab.

### 4. `SidebarProfile.tsx` — remove non-psych items
Drop the rows for Identity, Skills, Revisions, Schedule. Keep: Public profile + the 9 `TABS`.

### 5. `Sidebar.tsx` — route → panel mapping
`/profile/identity` and `/profile/revisions` should now show **SidebarMind** (since they are Luca's cognition surfaces conceptually). Update mapping:
```
path.startsWith('/profile/identity')   → SidebarMind
path.startsWith('/profile/revisions')  → SidebarMind
path.startsWith('/profile/skills')     → SidebarSettings  (matches "lives in settings")
path.startsWith('/profile/schedule')   → SidebarSettings
path.startsWith('/profile')            → SidebarProfile
```
Keep `/settings/public-profile → SidebarProfile` (the fix you just approved).

### 6. `Rail.tsx` — active-icon highlighting
Update `activeView` so Identity/Revisions light the **mind** icon, and Skills/Schedule light the **settings** icon:
```
/profile/identity, /profile/revisions          → 'mind'
/profile/skills, /profile/schedule             → 'settings' (handled via existing settingsOpen check; extend it)
/profile (anything else)                       → 'profile'
```

### 7. No route changes
All existing routes (`/profile/identity`, `/profile/revisions`, `/profile/skills`, `/profile/schedule`, `/settings/skills`, `/settings/routines`) stay. We're only changing which sidebar lists them and which rail icon highlights.

## Verification

- Click rail **Profile** icon → sidebar shows only Public profile + 9 psych tabs. No Identity/Skills/Revisions/Schedule.
- Click rail **Mind** icon → sidebar shows agent scope (Luca), then SELF (Identity, Revisions), then STREAMS (Overview…Activity).
- Click **Identity** in Mind sidebar → navigates to `/profile/identity`, Mind sidebar persists, rail Mind icon stays lit.
- Click **Revisions** in Mind sidebar → same behavior.
- Click rail **Settings** icon → Skills + Routines visible there (unchanged).
- No console errors on `/mind`, `/profile`, `/profile/identity`, `/profile/revisions`, `/settings/skills`, `/settings/routines`.

## Out of scope

- Actually wiring multi-agent data (only Luca exists). Scope selector renders but doesn't filter data yet — `cognitiveStore` stays single-user.
- Renaming pages (`ProfileIdentityView` etc.). Will rename in a later pass once routes are updated.
- Visual redesign of Identity/Revisions pages.

## Open question (none — answered above)

Schedule → Settings (per your answer). Mind ordering → grouped SELF / STREAMS sections (per your answer). Multi-agent → store + picker stub (per your answer).
