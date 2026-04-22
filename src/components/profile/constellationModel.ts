/**
 * Build the constellation model from a psychological_profile row.
 * Each "star" knows its category, mass (evidence weight), glow (recency proxy),
 * and a polar position (radius + angle). Categories occupy concentric orbital bands.
 */

import type { SelectedStar } from './profileLayoutStore';

export type Star = SelectedStar & {
  // polar position
  radius: number; // 0..1 (fraction of canvas radius)
  angle: number;  // radians
  mass: number;   // 0..1 (visual size)
  glow: number;   // 0..1 (visual brightness)
};

type Profile = {
  identity_narrative?: string | null;
  personality_dimensions?: any;
  communication_patterns?: any;
  emotional_landscape?: any;
  values_hierarchy?: any;
  relational_dynamics?: any;
  cognitive_tendencies?: any;
  growth_edges?: any;
  shadow_patterns?: any;
};

// Orbital bands per category — small inner = identity/big-five, outer = shadow/growth.
const BANDS: Record<string, [number, number]> = {
  big_five:      [0.18, 0.30],
  attachment:    [0.32, 0.36],
  cognition:     [0.40, 0.48],
  communication: [0.50, 0.56],
  values:        [0.58, 0.66],
  relational:    [0.68, 0.74],
  growth:        [0.78, 0.84],
  shadow:        [0.86, 0.94],
};

/** Deterministic pseudo-random from a string id (so positions are stable across renders). */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function placeInBand(category: string, id: string): { radius: number; angle: number } {
  const [rMin, rMax] = BANDS[category] ?? [0.5, 0.6];
  const r = rMin + hash(id) * (rMax - rMin);
  const a = hash(id + ':angle') * Math.PI * 2;
  return { radius: r, angle: a };
}

function pushStar(
  out: Star[],
  partial: SelectedStar,
  mass: number,
  glow = 0.7,
) {
  const pos = placeInBand(partial.category, partial.id);
  out.push({ ...partial, ...pos, mass: Math.max(0.1, Math.min(1, mass)), glow });
}

export function buildConstellation(profile: Profile | null): Star[] {
  const stars: Star[] = [];
  if (!profile) return stars;

  // Big Five — five bright, low-orbit stars
  const bf = profile.personality_dimensions?.big_five;
  if (bf && typeof bf === 'object') {
    for (const [trait, info] of Object.entries(bf)) {
      const score = (info as any)?.score ?? 50;
      const evidence = (info as any)?.evidence ?? '';
      pushStar(
        stars,
        {
          id: `big_five:${trait}`,
          category: 'big_five',
          label: trait,
          detail: `Score ${score}/100`,
          score,
          evidence,
          tags: [trait.toLowerCase()],
        },
        0.55 + (score / 100) * 0.45,
        0.85,
      );
    }
  }

  // Attachment style — single anchor star
  const att = profile.personality_dimensions?.attachment_style;
  if (att?.primary) {
    pushStar(
      stars,
      {
        id: `attachment:${att.primary}`,
        category: 'attachment',
        label: `attachment · ${att.primary}`,
        detail: att.evidence ?? '',
        evidence: att.evidence ?? '',
        tags: ['attachment', att.primary?.toLowerCase()].filter(Boolean) as string[],
      },
      0.85,
      0.9,
    );
  }

  // Cognition
  const cog = profile.cognitive_tendencies;
  if (cog && typeof cog === 'object') {
    for (const [k, v] of Object.entries(cog)) {
      if (typeof v === 'string' && v.trim()) {
        pushStar(
          stars,
          {
            id: `cognition:${k}`,
            category: 'cognition',
            label: k.replace(/_/g, ' '),
            detail: v,
            evidence: v,
            tags: [k],
          },
          0.5,
          0.6,
        );
      }
    }
  }

  // Communication patterns
  const com = profile.communication_patterns;
  if (com && typeof com === 'object') {
    for (const [k, v] of Object.entries(com)) {
      if (typeof v === 'string' && v.trim()) {
        pushStar(
          stars,
          {
            id: `communication:${k}`,
            category: 'communication',
            label: k.replace(/_/g, ' '),
            detail: v,
            evidence: v,
            tags: [k],
          },
          0.45,
          0.55,
        );
      }
    }
  }

  // Values — ranked
  const ranked = profile.values_hierarchy?.ranked_values;
  if (Array.isArray(ranked)) {
    ranked.slice(0, 12).forEach((v: any, i: number) => {
      const value = typeof v === 'string' ? v : v?.value;
      const evidence = typeof v === 'object' ? v?.evidence ?? '' : '';
      if (!value) return;
      pushStar(
        stars,
        {
          id: `values:${value}`,
          category: 'values',
          label: value,
          detail: evidence,
          evidence,
          tags: [value.toLowerCase?.() ?? value],
        },
        0.85 - i * 0.05, // earlier = larger
        0.7,
      );
    });
  }

  // Relational dynamics
  const rel = profile.relational_dynamics;
  if (rel && typeof rel === 'object') {
    for (const [k, v] of Object.entries(rel)) {
      if (typeof v === 'string' && v.trim()) {
        pushStar(
          stars,
          {
            id: `relational:${k}`,
            category: 'relational',
            label: k.replace(/_/g, ' '),
            detail: v,
            evidence: v,
            tags: [k, 'relationship'],
          },
          0.5,
          0.55,
        );
      }
    }
  }

  // Growth edges
  const growth = profile.growth_edges;
  if (growth && typeof growth === 'object') {
    const list: any[] = Array.isArray(growth) ? growth : Array.isArray(growth.edges) ? growth.edges : Object.values(growth);
    list.slice(0, 8).forEach((g: any) => {
      const label = typeof g === 'string' ? g : g?.title ?? g?.name ?? g?.label;
      const detail = typeof g === 'string' ? '' : g?.description ?? g?.detail ?? '';
      if (!label) return;
      pushStar(
        stars,
        {
          id: `growth:${label}`,
          category: 'growth',
          label,
          detail,
          evidence: detail,
          tags: ['growth'],
        },
        0.5,
        0.45,
      );
    });
  }

  // Shadow patterns — outer dim ring
  const shadow = profile.shadow_patterns;
  if (shadow && typeof shadow === 'object') {
    const blind = shadow.blind_spots;
    if (Array.isArray(blind)) {
      blind.slice(0, 8).forEach((b: any) => {
        const label = typeof b === 'string' ? b : b?.title ?? b?.name;
        const detail = typeof b === 'string' ? '' : b?.description ?? '';
        if (!label) return;
        pushStar(
          stars,
          {
            id: `shadow:${label}`,
            category: 'shadow',
            label,
            detail,
            evidence: detail,
            tags: ['shadow'],
          },
          0.4,
          0.35,
        );
      });
    }
    if (Array.isArray(shadow.unasked_questions)) {
      shadow.unasked_questions.slice(0, 6).forEach((q: string, i: number) => {
        pushStar(
          stars,
          {
            id: `shadow:q${i}`,
            category: 'shadow',
            label: 'unasked question',
            detail: q,
            evidence: q,
            tags: ['shadow', 'question'],
          },
          0.3,
          0.3,
        );
      });
    }
  }

  return stars;
}
