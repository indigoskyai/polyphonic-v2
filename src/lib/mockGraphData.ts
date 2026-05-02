/**
 * mockGraphData — Generates a realistic synthetic engram + connection graph
 * for previewing the Mnemos visualization at scale. Pure client-side; never
 * persisted. Seeded via a simple LCG so the layout is reproducible.
 */
import type { Engram, Connection } from '@/stores/memoryStore';

const TYPES: Engram['engram_type'][] = ['episodic', 'semantic', 'procedural', 'belief'];
const STATES: Engram['state'][] = ['active', 'active', 'active', 'consolidating'];

const CONN_TYPES = [
  'supports', 'contradicts', 'causes', 'extends', 'parallels', 'synthesizes', 'grounds',
];

const SAMPLE_PHRASES = [
  'Mornings feel sharpest when the kitchen is quiet',
  'I prefer drafting before reading anyone else\'s notes',
  'Long walks unlock the edges of an idea',
  'Constraint is more generative than freedom',
  'Trust is built by remembering small details',
  'A second draft is rarely the last',
  'Coffee tastes different at altitude',
  'The hardest part is naming the thing',
  'Silence is a feature of good rooms',
  'Repetition reveals what intention conceals',
  'Most decisions reverse cleanly within a week',
  'Beauty is usually the result of restraint',
  'I think clearer after physical work',
  'Attention is the rarest form of generosity',
  'Patterns matter more than instances',
  'Listening is a skill, not a posture',
  'Curiosity needs solitude to mature',
  'A good interface disappears when used',
  'Memory is reconstructive, not archival',
  'Most arguments are about definitions',
];

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function generateMockGraph(
  userId: string,
  count = 140,
  seed = 7
): { engrams: Engram[]; connections: Connection[] } {
  const rng = makeRng(seed);
  const now = Date.now();

  const engrams: Engram[] = [];
  for (let i = 0; i < count; i++) {
    const type = TYPES[Math.floor(rng() * TYPES.length)];
    const state = STATES[Math.floor(rng() * STATES.length)];
    const phrase = SAMPLE_PHRASES[Math.floor(rng() * SAMPLE_PHRASES.length)];
    const ageHours = rng() * 24 * 30; // up to 30 days
    const createdAt = new Date(now - ageHours * 3600_000).toISOString();
    engrams.push({
      id: `mock-${i.toString(36).padStart(4, '0')}`,
      user_id: userId,
      content: `${phrase}${rng() > 0.6 ? ' — and the corollary surprises me each time.' : '.'}`,
      engram_type: type,
      strength: 0.35 + rng() * 0.6,
      stability: 0.2 + rng() * 0.7,
      accessibility: 0.3 + rng() * 0.65,
      emotional_valence: rng() * 2 - 1,
      emotional_arousal: rng(),
      surprise_score: rng() * 0.6,
      source_context: { mock: true, thread: `mock-thread-${Math.floor(rng() * 12)}` },
      tags: rng() > 0.5 ? ['demo', type] : ['demo'],
      state,
      last_accessed_at: createdAt,
      access_count: Math.floor(rng() * 14),
      created_at: createdAt,
      updated_at: createdAt,
    });
  }

  // Connections: build small clusters + sparse cross-links so the graph
  // forms readable constellations rather than a uniform mesh.
  const connections: Connection[] = [];
  const clusterSize = 6;
  let cidx = 0;
  for (let c = 0; c < count; c += clusterSize) {
    const members = engrams.slice(c, c + clusterSize);
    // dense within cluster
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        if (rng() > 0.45) continue;
        connections.push({
          id: `mock-c-${cidx++}`,
          user_id: userId,
          source_id: members[i].id,
          target_id: members[j].id,
          connection_type: CONN_TYPES[Math.floor(rng() * CONN_TYPES.length)],
          weight: 0.4 + rng() * 0.55,
          created_at: new Date(now - rng() * 1e9).toISOString(),
        });
      }
    }
  }
  // sparse cross-cluster bridges
  const bridgeCount = Math.floor(count * 0.6);
  for (let b = 0; b < bridgeCount; b++) {
    const a = engrams[Math.floor(rng() * engrams.length)];
    const z = engrams[Math.floor(rng() * engrams.length)];
    if (a.id === z.id) continue;
    connections.push({
      id: `mock-b-${cidx++}`,
      user_id: userId,
      source_id: a.id,
      target_id: z.id,
      connection_type: CONN_TYPES[Math.floor(rng() * CONN_TYPES.length)],
      weight: 0.2 + rng() * 0.4,
      created_at: new Date(now - rng() * 1e9).toISOString(),
    });
  }

  return { engrams, connections };
}
