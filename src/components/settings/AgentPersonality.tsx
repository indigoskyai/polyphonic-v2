import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { TextArea, Toggle } from '@/components/settings/FormControls';

interface Props {
  agentId: string;
}

/**
 * Personality controls — voice description, inner-life toggle, thought verbosity.
 * Now reads/writes to `agent_configs.personality` (unified) via the agent
 * settings store's draft system, so changes flow through the same Save/Discard
 * footer as everything else on the agent detail page.
 */
export default function AgentPersonality({ agentId }: Props) {
  const resolved = useAgentSettingsStore((s) => s.getResolved(agentId));
  const setDraft = useAgentSettingsStore((s) => s.setDraft);

  if (!resolved) {
    return (
      <div
        style={{
          fontSize: 'var(--settings-caption-size)',
          fontWeight: 'var(--weight-book)',
          color: 'var(--text-ghost)',
        }}
      >
        Loading personality…
      </div>
    );
  }

  const personality = resolved.personality;

  const patch = (next: typeof personality) => {
    setDraft(agentId, { personality: next });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <TextArea
          value={personality.voice_description}
          onChange={(v) => patch({ ...personality, voice_description: v })}
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
              fontWeight: 'var(--weight-medium)',
              marginBottom: 4,
            }}
          >
            Inner life
          </div>
          <div
            style={{
              fontSize: 'var(--settings-caption-size)',
              fontWeight: 'var(--weight-book)',
              color: 'var(--text-tertiary)',
              lineHeight: 1.55,
            }}
          >
            Allow this agent to track an emotional state and surface it.
          </div>
        </div>
        <Toggle
          on={personality.inner_life}
          onChange={() => patch({ ...personality, inner_life: !personality.inner_life })}
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
              fontWeight: 'var(--weight-medium)',
              marginBottom: 4,
            }}
          >
            Thought verbosity
          </div>
          <div
            style={{
              fontSize: 'var(--settings-caption-size)',
              fontWeight: 'var(--weight-book)',
              color: 'var(--text-tertiary)',
              lineHeight: 1.55,
            }}
          >
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
            onChange={(e) =>
              patch({ ...personality, thought_verbosity: parseInt(e.target.value, 10) })
            }
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
