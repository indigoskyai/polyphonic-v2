

# Plan: Monochromatic Agent Pills + Guardian Shimmer

## Changes

### 1. `src/index.css` — Agent pill colors → off-white

Replace the colored `.targeted.luca` and `.targeted.guardian` styles with a monochromatic off-white (`var(--text-secondary)` or similar like `rgba(220,219,216,0.7)`), and change the `::after` underline indicators to match. This removes the gold and green accent colors from the input footer pills entirely.

### 2. `src/index.css` — Guardian label shimmer

Apply the same shimmer gradient animation used in the thinking block label to `.guardian-label` in the alcove header. This means:
- `background: linear-gradient(90deg, rgba(220,219,216,0.20) 0%, rgba(220,219,216,0.20) 35%, rgba(220,219,216,0.55) 50%, rgba(220,219,216,0.20) 65%, rgba(220,219,216,0.20) 100%)`
- `background-size: 200% 100%`
- `-webkit-background-clip: text`
- `-webkit-text-fill-color: transparent`
- `animation: shimmer 2.4s ease-in-out infinite`

This replaces the static `color: var(--guardian)` on the guardian label.

### Files touched
- `src/index.css` (4 lines changed)

