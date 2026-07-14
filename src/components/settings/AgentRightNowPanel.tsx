/**
 * AgentRightNowPanel — the "watch them grow" moment in agent form.
 *
 * Pulls the same live cognitive state Mind > Overview surfaces (modulators,
 * emotions, top beliefs) and renders it as a compact read-only panel inside
 * the AgentDetail page. Phase-4 IA goal: when the user opens Agents > Luca
 * they see how she is right now alongside her config, instead of having to
 * find /mind separately.
 */
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCognitiveStore } from '@/stores/cognitiveStore';

const MODULATOR_LABELS: Record<string, string> = {
  arousal: 'arousal',
  resolution: 'resolution',
  openness: 'openness',
  surprise_threshold: 'surprise threshold',
  social_drive: 'social drive',
};

const EMOTION_LABELS: Record<string, string> = {
  valence: 'valence',
  arousal: 'arousal',
  dominance: 'dominance',
  certainty: 'certainty',
  novelty: 'novelty',
  social: 'social',
};

function Bar({ value, signed = false }: { value: number; signed?: boolean }) {
  // Signed bars (valence) center at 50% and grow left/right; unsigned bars
  // grow from the left edge.
  const pct = Math.min(1, Math.max(-1, value));
  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        height: 3,
        borderRadius: 2,
        background: 'var(--surface-1)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: signed && pct < 0 ? `${(0.5 + pct / 2) * 100}%` : 0,
          width: signed ? `${(Math.abs(pct) / 2) * 100}%` : `${pct * 100}%`,
          background: 'var(--metric-fill)',
          borderRadius: 2,
          transition: 'width var(--dur-slow) var(--ease-premium)',
        }}
      />
    </div>
  );
}

function MetricRow({ label, value, signed = false }: { label: string; value: number; signed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
      <span
        style={{
          width: 130,
          fontSize: 'var(--settings-mono-size)',
          color: 'var(--text-soft)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: 'var(--track-meta)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <Bar value={value} signed={signed} />
      <span
        style={{
          width: 40,
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-ghost)',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value.toFixed(2)}
      </span>
    </div>
  );
}

interface Props {
  agentId: string;
}

export default function AgentRightNowPanel({ agentId }: Props) {
  const user = useAuthStore((s) => s.user);
  const modulators = useCognitiveStore((s) => s.modulators);
  const emotions = useCognitiveStore((s) => s.emotions);
  const beliefs = useCognitiveStore((s) => s.beliefs);
  const load = useCognitiveStore((s) => s.load);
  const loadMindData = useCognitiveStore((s) => s.loadMindData);
  const subscribe = useCognitiveStore((s) => s.subscribe);

  useEffect(() => {
    if (!user) return;
    load(user.id, agentId);
    loadMindData(user.id, agentId);
    const unsub = subscribe(user.id, agentId);
    return unsub;
  }, [user, agentId, load, loadMindData, subscribe]);

  const topBeliefs = beliefs.slice(0, 5);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
      <div>
        <div
          style={{
            fontSize: 'var(--settings-mono-size)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--text-soft)',
            letterSpacing: 'var(--track-meta)',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Modulators
        </div>
        <div>
          {(Object.entries(modulators) as Array<[string, number]>).map(([key, value]) => (
            <MetricRow key={key} label={MODULATOR_LABELS[key] ?? key} value={value} />
          ))}
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: 'var(--settings-mono-size)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--text-soft)',
            letterSpacing: 'var(--track-meta)',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Emotional state
        </div>
        <div>
          {(Object.entries(emotions) as Array<[string, number]>).map(([key, value]) => (
            <MetricRow key={key} label={EMOTION_LABELS[key] ?? key} value={value} signed={key === 'valence'} />
          ))}
        </div>
      </div>

      <div style={{ gridColumn: '1 / -1' }}>
        <div
          style={{
            fontSize: 'var(--settings-mono-size)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--text-soft)',
            letterSpacing: 'var(--track-meta)',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Beliefs ({beliefs.length})
        </div>
        {topBeliefs.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-ghost)', fontStyle: 'italic', padding: '8px 0' }}>
            No beliefs formed yet. Beliefs emerge from patterns across many memories.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topBeliefs.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    flex: 1,
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: 'var(--text-secondary)',
                    overflowWrap: 'anywhere',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {b.text}
                </div>
                <div style={{ width: 60 }}>
                  <Bar value={b.strength ?? 0} />
                </div>
                <span
                  style={{
                    width: 36,
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-ghost)',
                    textAlign: 'right',
                  }}
                >
                  {Math.round((b.strength ?? 0) * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
