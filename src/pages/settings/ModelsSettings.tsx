import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import { Toggle, SelectInput } from '@/components/settings/FormControls';
import { Section, InlinePill, Kbd } from '@/components/settings/Section';
import { MaskedInput, KeyStored } from '@/components/settings/MaskedInput';
import {
  ModelCard,
  ModelListControls,
} from '@/components/settings/ModelCard';
import {
  SettingsPage,
  AgentDot,
} from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';
import ConnectOpenRouter from '@/components/ConnectOpenRouter';

interface ModelDef {
  id: string;
  name: string; // display name
  flags: { label: string; variant?: 'reasoning' | 'multimodal' | 'default' }[];
}

const ENSEMBLE_MODELS: ModelDef[] = [
  { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', flags: [{ label: 'Default', variant: 'default' }] },
  { id: 'anthropic/claude-opus-4-7', name: 'Claude Opus 4.7', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', flags: [] },
  { id: 'openai/gpt-5.5', name: 'GPT-5.5', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'openai/gpt-5.4-pro', name: 'GPT-5.4 Pro', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'openai/gpt-5.3-chat', name: 'GPT-5.3 Chat', flags: [] },
  { id: 'openai/gpt-5.2', name: 'GPT-5.2', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', flags: [] },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', flags: [] },
  { id: 'x-ai/grok-4.20', name: 'Grok 4.20', flags: [] },
  { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast', flags: [] },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', flags: [{ label: 'Reasoning', variant: 'reasoning' }] },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', flags: [] },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', flags: [] },
  { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', flags: [{ label: 'Multimodal', variant: 'multimodal' }] },
  { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', flags: [] },
  { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', flags: [] },
  { id: 'qwen/qwen3-max', name: 'Qwen3 Max', flags: [] },
];

export default function ModelsSettings() {
  const [apiKey, setApiKey] = useState('');
  const [keyPreview, setKeyPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [keyInfo, setKeyInfo] = useState('');

  const time = useClock();

  useEffect(() => {
    supabase
      .from('user_api_keys')
      .select('key_preview')
      .maybeSingle()
      .then(({ data }) => {
        if (data) setKeyPreview(data.key_preview);
      });
  }, []);

  const saveKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setKeyError('');
    setKeyInfo('');
    const { error: saveError } = await supabase.rpc('save_user_api_key', {
      p_key: apiKey.trim(),
    });
    if (saveError) {
      setKeyError(saveError.message || 'Could not save API key.');
      setSaving(false);
      return;
    }
    const { data, error: previewError } = await supabase
      .from('user_api_keys')
      .select('key_preview')
      .maybeSingle();
    if (previewError) {
      setKeyError(
        previewError.message ||
          'API key saved, but preview could not be loaded.',
      );
    } else {
      setKeyPreview(data?.key_preview ?? null);
      setApiKey('');
      setKeyInfo('API key saved.');
    }
    setSaving(false);
  };

  const deleteKey = async () => {
    setRemoving(true);
    setKeyError('');
    setKeyInfo('');
    const { error } = await supabase.rpc('delete_user_api_key');
    if (error) {
      setKeyError(error.message || 'Could not remove API key.');
      setRemoving(false);
      return;
    }
    setKeyPreview(null);
    setApiKey('');
    setKeyInfo('API key removed.');
    setRemoving(false);
  };

  return (
    <SettingsPage
      folio={{
        left: (
          <>
            <span>
              <AgentDot /> luca
            </span>
            <span>
              settings · <span className="v">models</span>
            </span>
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
          <span className="num">§ 09 / 02</span>
          <span>·</span>
          <span className="v">Reasoning &amp; ensemble</span>
        </div>
        <h1 className="set-head-title">Models</h1>
        <p className="set-head-sub">
          Available reasoning models, the OpenRouter key that authorizes them,
          and the multi-model ensemble used to synthesize responses.
        </p>
      </div>

      <div className="set-body">
        <Section
          number="01"
          name="Authorization"
          title="API key"
          desc="Your OpenRouter API key. Encrypted and stored securely. Single key authorizes all reasoning models."
        >
          {keyPreview ? (
            <KeyStored
              preview={keyPreview}
              status="connected"
              onRemove={deleteKey}
              removing={removing}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ConnectOpenRouter
                variant="primary"
                label="Connect with OpenRouter"
                onConnected={(preview) => {
                  if (preview) {
                    setKeyPreview(preview);
                    setKeyInfo('Connected to OpenRouter.');
                  }
                }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: 'var(--track-meta)',
                  textTransform: 'uppercase',
                  color: 'var(--text-whisper)',
                }}
              >
                <span
                  style={{
                    flex: 1,
                    height: 1,
                    background:
                      'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.07) 100%)',
                  }}
                />
                <span>or paste a key</span>
                <span
                  style={{
                    flex: 1,
                    height: 1,
                    background:
                      'linear-gradient(90deg, rgba(255,255,255,0.07) 0%, transparent 100%)',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                <div style={{ flex: 1 }}>
                  <MaskedInput
                    value={apiKey}
                    onChange={setApiKey}
                    placeholder="sk-or-v1-…"
                  />
                </div>
                <button
                  type="button"
                  className="set-btn primary"
                  onClick={saveKey}
                  disabled={!apiKey || saving}
                  style={{ height: 40 }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
          {keyError && (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: 'var(--rose-accent, #c97c8a)',
                fontFamily: 'var(--font-sans)',
                letterSpacing: 'var(--track-body-tight)',
              }}
            >
              {keyError}
            </div>
          )}
          {keyInfo && (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-sans)',
                letterSpacing: 'var(--track-body-tight)',
              }}
            >
              {keyInfo}
            </div>
          )}
        </Section>

        <EnsembleSection />
      </div>
    </SettingsPage>
  );
}

function EnsembleSection() {
  const {
    multi_model_enabled,
    ensemble_models,
    synthesis_model,
    reasoning_effort,
    updateSetting,
  } = useSettingsStore();

  const [query, setQuery] = useState('');

  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ENSEMBLE_MODELS;
    return ENSEMBLE_MODELS.filter(
      (m) =>
        m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
  }, [query]);

  const selectedSet = useMemo(
    () => new Set(ensemble_models),
    [ensemble_models],
  );

  // Selection is currently frozen — the codebase uses `ensemble_models` as a
  // fixed list of 3 slots. Until the new rotation system ships, we render
  // selection as read-only (clicking does not mutate state).
  const isSelected = (id: string) => selectedSet.has(id);
  const toggleSelected = (_id: string) => {
    // No-op until rotation system ships.
  };

  return (
    <>
      <Section
        number="02"
        name="Default behavior"
        title="When ensemble is armed"
        desc={
          <>
            The ensemble pill on the composer can be pre-armed by default or
            left for you to toggle per-message.
          </>
        }
      >
        <div className="set-row">
          <div className="set-row-copy">
            <div className="set-row-label">Default ensemble to on</div>
            <div className="set-row-desc">
              When on, every new message runs through the ensemble. Override
              per-message with <Kbd>⌘E</Kbd>.
            </div>
          </div>
          <div className="set-row-control">
            <Toggle
              on={multi_model_enabled}
              onChange={() =>
                updateSetting('multi_model_enabled', !multi_model_enabled)
              }
            />
          </div>
        </div>
      </Section>

      <Section
        number="03"
        name="Ensemble"
        title="Models in rotation"
        desc="The signature ensemble (Luca · Anima · Vektor) runs in the meantime. A richer model-rotation system with custom slots and persona presets is on the way."
        pill={<InlinePill variant="amber">Under construction</InlinePill>}
      >
        <ModelListControls
          query={query}
          onQueryChange={setQuery}
          selectedCount={selectedSet.size}
          totalCount={ENSEMBLE_MODELS.length}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            opacity: 0.85,
            pointerEvents: 'none',
          }}
        >
          {filteredModels.map((m) => (
            <ModelCard
              key={m.id}
              name={m.name}
              id={m.id}
              flags={m.flags}
              active={isSelected(m.id)}
              onToggle={() => toggleSelected(m.id)}
            />
          ))}
        </div>

        <div style={{ marginTop: 24 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-soft)',
              letterSpacing: 'var(--track-folio)',
              textTransform: 'uppercase',
              marginBottom: 10,
              fontFamily: 'var(--font-mono)',
            }}
          >
            Synthesis model
          </div>
          <SelectInput
            value={synthesis_model}
            onChange={(v) => updateSetting('synthesis_model', v)}
            options={ENSEMBLE_MODELS.map((m) => ({
              value: m.id,
              label: m.name,
            }))}
            width="100%"
          />
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              marginTop: 8,
              lineHeight: 1.45,
              letterSpacing: 'var(--track-body-tight)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            The model that synthesizes the final response from all ensemble
            outputs.
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-soft)',
              letterSpacing: 'var(--track-folio)',
              textTransform: 'uppercase',
              marginBottom: 10,
              fontFamily: 'var(--font-mono)',
            }}
          >
            Default thinking effort
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                type="button"
                key={level}
                onClick={() => updateSetting('reasoning_effort', level)}
                className={`set-btn compact${
                  reasoning_effort === level ? ' primary' : ''
                }`}
              >
                {level === 'low' ? 'Light' : level === 'medium' ? 'Medium' : 'Deep'}
              </button>
            ))}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              marginTop: 8,
              lineHeight: 1.45,
              letterSpacing: 'var(--track-body-tight)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Controls how deeply reasoning models think before responding. Can
            be overridden per-message in the chat input.
          </div>
        </div>
      </Section>
    </>
  );
}
