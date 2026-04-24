import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { TextArea, Toggle } from '@/components/settings/FormControls';

interface Props {
  agentId: string;
}

interface Personality {
  inner_life: boolean;
  thought_verbosity: number;
}

/**
 * Personality fields for an agent — voice description, inner-life toggle,
 * thought verbosity. Persisted to the legacy `agent_config` table keyed by
 * (user_id, agent_name) since `agent_configs` (the Phase-17 table) does not
 * carry these JSONB-style personality fields.
 *
 * Saves immediately on change; intentionally NOT wired into the AgentDetail
 * dirty-state footer so the simple text-and-toggle controls feel persistent.
 */
export default function AgentPersonality({ agentId }: Props) {
  const user = useAuthStore((s) => s.user);
  const [voice, setVoice] = useState('');
  const [personality, setPersonality] = useState<Personality>({
    inner_life: true,
    thought_verbosity: 1,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('agent_config')
      .select('voice, personality')
      .eq('user_id', user.id)
      .eq('agent_name', agentId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setVoice(data.voice ?? '');
          const p = (data.personality as Partial<Personality> | null) ?? {};
          setPersonality({
            inner_life: p.inner_life !== false,
            thought_verbosity: typeof p.thought_verbosity === 'number' ? p.thought_verbosity : 1,
          });
        }
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, agentId]);

  const persist = async (patch: { voice?: string; personality?: Personality }) => {
    if (!user) return;
    await supabase.from('agent_config').upsert(
      {
        user_id: user.id,
        agent_name: agentId,
        ...(patch.voice !== undefined ? { voice: patch.voice } : {}),
        ...(patch.personality !== undefined ? { personality: patch.personality } : {}),
      },
      { onConflict: 'user_id,agent_name' }
    );
  };

  if (!loaded) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-ghost)' }}>Loading personality…</div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <TextArea
          value={voice}
          onChange={(v) => {
            setVoice(v);
            persist({ voice: v });
          }}
          placeholder="Describe how this agent should communicate — tone, cadence, vocabulary…"
          rows={4}
        />
      </div>

      <div
        className="flex justify-between items-center"
        style={{ padding: '6px 0', gap: 16 }}
      >
        <div className="flex-1 min-w-0">
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-primary)',
              fontWeight: 450,
              marginBottom: 4,
            }}
          >
            Inner life
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
            Allow this agent to track an emotional state and surface it.
          </div>
        </div>
        <Toggle
          on={personality.inner_life}
          onChange={() => {
            const next = { ...personality, inner_life: !personality.inner_life };
            setPersonality(next);
            persist({ personality: next });
          }}
        />
      </div>

      <div
        className="flex justify-between items-center"
        style={{ padding: '6px 0', gap: 16 }}
      >
        <div className="flex-1 min-w-0">
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-primary)',
              fontWeight: 450,
              marginBottom: 4,
            }}
          >
            Thought verbosity
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
            How much internal reasoning to surface in responses.
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span style={{ fontSize: 11, color: 'var(--text-ghost)', minWidth: 36 }}>Quiet</span>
          <input
            type="range"
            min={0}
            max={2}
            step={1}
            value={personality.thought_verbosity}
            onChange={(e) => {
              const next = {
                ...personality,
                thought_verbosity: parseInt(e.target.value, 10),
              };
              setPersonality(next);
              persist({ personality: next });
            }}
            style={{
              width: 120,
              height: 3,
              borderRadius: 2,
              background: 'var(--bg-surface)',
              outline: 'none',
              appearance: 'none',
              cursor: 'pointer',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-ghost)', minWidth: 50 }}>Verbose</span>
        </div>
      </div>
    </div>
  );
}
