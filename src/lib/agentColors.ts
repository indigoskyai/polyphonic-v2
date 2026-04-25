import type { AvatarColor } from '@/stores/agentSettingsStore';

/**
 * Resolve an agent's avatar color slug to a CSS color value.
 * Reuses the existing per-agent CSS tokens where possible (luca/vektor/anima)
 * and falls back to inline hexes for the new user-facing palette swatches.
 */
export function resolveAgentColor(c: AvatarColor | string | null | undefined): string {
  switch (c) {
    case 'cream':
      return 'var(--luca-full)';
    case 'blue':
      return 'var(--vektor-full)';
    case 'magenta':
      return 'var(--anima-full)';
    case 'ochre':
      return '#c9a45c';
    case 'sage':
      return '#8aa882';
    case 'violet':
      return '#9d82c9';
    default:
      return 'var(--text-tertiary)';
  }
}

export const AVATAR_COLOR_OPTIONS: { value: AvatarColor; label: string }[] = [
  { value: 'cream', label: 'Cream' },
  { value: 'ochre', label: 'Ochre' },
  { value: 'blue', label: 'Blue' },
  { value: 'magenta', label: 'Magenta' },
  { value: 'sage', label: 'Sage' },
  { value: 'violet', label: 'Violet' },
];
