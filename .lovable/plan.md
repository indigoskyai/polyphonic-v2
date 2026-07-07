## Change

Make the sidebar section title (e.g. "Journal" shown above the sidebar's own list) use the same Instrument Serif treatment as the main page hero title, across every section (Chat, Groups, Memory, Research, Mind, Journal, Projects, Profile, Settings).

## Files

- `src/components/sidebar/SidebarHeader.tsx` — swap the title's `font-family` from `var(--font-grotesque)` to `var(--font-serif)` (Instrument Serif). Adjust weight/tracking to match the page hero (regular weight, `--track-display` or `normal`, size bumped modestly so it reads as a title, not a label). Keep the optional mono "LIVE" eyebrow unchanged.

## Out of scope

- Rail nav items ("Chat", "Groups", etc. in the icon list) stay in the sans UI font — those are navigation, not section titles.
- Sidebar sub-labels ("AGENT", "JOURNAL 383") stay mono uppercase.
- No color, spacing, layout, or backend changes.
- No changes to page hero components themselves.

## Verify

- Load `/journal`, `/chat`, `/memory`, `/research`, `/mind`, `/projects`, `/profile`, `/settings` and confirm the sidebar section title now visually rhymes with the page's serif hero.
- Build + typecheck clean, no console errors.
