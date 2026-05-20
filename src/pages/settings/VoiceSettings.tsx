import { useState } from 'react';
import { Toggle } from '@/components/settings/FormControls';
import { Section } from '@/components/settings/Section';
import { SettingsPage, AgentDot } from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';
import { useSettingsStore } from '@/stores/settingsStore';
import { VoicePicker, ELEVENLABS_VOICES } from '@/components/voice/VoicePicker';

export default function VoiceSettings() {
  const time = useClock();
  const {
    default_voice_id,
    elevenlabs_agent_id,
    voice_autospeak,
    updateSetting,
  } = useSettingsStore();

  const [agentIdDraft, setAgentIdDraft] = useState(elevenlabs_agent_id ?? '');
  const [savingAgent, setSavingAgent] = useState(false);

  const currentVoiceName = ELEVENLABS_VOICES.find((v) => v.id === default_voice_id)?.name ?? 'Custom';

  const saveAgentId = async () => {
    setSavingAgent(true);
    try {
      await updateSetting('elevenlabs_agent_id', agentIdDraft.trim() || null);
    } finally {
      setSavingAgent(false);
    }
  };

  return (
    <SettingsPage
      folio={{
        left: (
          <>
            <span><AgentDot /> luca</span>
            <span>settings · <span className="v">voice & security</span></span>
          </>
        ),
        right: (
          <>
            <span>opus 4.7</span>
            <span>{time}</span>
          </>
        ),
      }}
    >
      <div className="set-head">
        <div className="set-head-eye">
          <span className="num">§ 09 / 06</span>
          <span>·</span>
          <span className="v">Voice & security</span>
        </div>
        <h1 className="set-head-title">Voice</h1>
        <p className="set-head-sub">
          Choose a voice for Luca's replies, and connect an ElevenLabs Agent for true
          speech-to-speech conversations. Powered by ElevenLabs.
        </p>
      </div>

      <div className="set-body">
        <Section
          number="01"
          name="Voice-over"
          title="Default voice"
          desc="Used when Luca speaks her replies aloud. Each agent in Settings → Agents can override this with their own voice."
        >
          <div className="set-row">
            <div className="set-row-copy">
              <div className="set-row-label">Auto-speak replies</div>
              <div className="set-row-desc">
                When on, finished assistant messages are read aloud automatically using the
                voice below. Tools, memory, and your full agent config remain in effect.
              </div>
            </div>
            <div className="set-row-control">
              <Toggle
                on={voice_autospeak}
                onChange={() => updateSetting('voice_autospeak', !voice_autospeak)}
              />
            </div>
          </div>

          <div className="set-row" style={{ display: 'block' }}>
            <div className="set-row-copy" style={{ marginBottom: 16 }}>
              <div className="set-row-label">Voice — currently {currentVoiceName}</div>
              <div className="set-row-desc">Click a row to select, or Test to hear a sample.</div>
            </div>
            <VoicePicker
              value={default_voice_id}
              onChange={(id) => updateSetting('default_voice_id', id)}
            />
          </div>
        </Section>

        <Section
          number="02"
          name="Live voice"
          title="ElevenLabs Conversational Agent"
          desc="For true real-time speech-to-speech with interruption and natural turn-taking. Create an Agent in your ElevenLabs dashboard, then paste its ID below. Note: live-mode calls run inside ElevenLabs and don't use your model config, Mnemos memory, Guardian, or tool calls — but transcripts are saved back to the conversation."
        >
          <div className="set-row" style={{ display: 'block' }}>
            <div className="set-row-copy" style={{ marginBottom: 12 }}>
              <div className="set-row-label">Default Agent ID</div>
              <div className="set-row-desc">
                Optional. Used when starting Live voice from any chat. Find this in your
                ElevenLabs dashboard under Conversational AI → Agents.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={agentIdDraft}
                onChange={(e) => setAgentIdDraft(e.target.value)}
                placeholder="agent_xxxxxxxxxxxxxxxxxxxxxxxx"
                spellCheck={false}
                style={{
                  flex: 1,
                  background: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 999,
                  padding: '8px 14px',
                  fontFamily: 'var(--font-mono, ui-monospace)',
                  fontSize: 12,
                  color: 'hsl(var(--foreground))',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                className="voice-picker-test"
                onClick={saveAgentId}
                disabled={savingAgent || agentIdDraft.trim() === (elevenlabs_agent_id ?? '')}
              >
                {savingAgent ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Section>

        <Section
          number="03"
          name="Connection"
          title="ElevenLabs"
          desc="Connected via Lovable connector. Your key never leaves the server."
        >
          <div className="set-row">
            <div className="set-row-copy">
              <div className="set-row-label">Status</div>
              <div className="set-row-desc">All voice features are using your workspace's connected ElevenLabs account.</div>
            </div>
            <div className="set-row-control">
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999,
                background: 'hsl(var(--muted) / 0.4)',
                fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase',
                color: 'hsl(var(--foreground))',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
                Linked
              </span>
            </div>
          </div>
        </Section>
      </div>
    </SettingsPage>
  );
}
