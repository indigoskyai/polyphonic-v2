import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  PageHeader,
  SectionTitle,
  DangerButton,
} from '@/components/settings/FormControls';

const MODEL_CARDS = [
  { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7', desc: 'Anthropic frontier reasoning', badge: 'deep' },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', desc: 'Balanced intelligence and speed', badge: 'fast' },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', desc: 'Fastest Claude generation', badge: 'fast' },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4', desc: 'OpenAI flagship reasoning model', badge: 'deep' },
  { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini', desc: 'Lightweight GPT-5.4 variant', badge: 'fast' },
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', desc: 'Google next-gen multimodal', badge: 'deep' },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', desc: 'Fast Gemini for everyday use', badge: 'fast' },
  { id: 'x-ai/grok-4.20', name: 'Grok 4.20', desc: 'xAI flagship multi-agent', badge: 'deep' },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', desc: 'Open-source frontier reasoning', badge: 'deep' },
  { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', desc: 'Meta open-weights flagship', badge: 'fast' },
];

const ENSEMBLE_MODELS = [
  { id: 'anthropic/claude-opus-4.7', label: 'Claude Opus 4.7 (reasoning)' },
  { id: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6 (reasoning)' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6 (reasoning)' },
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  { id: 'openai/gpt-5.4', label: 'GPT-5.4 (reasoning)' },
  { id: 'openai/gpt-5.4-mini', label: 'GPT-5.4 Mini (reasoning)' },
  { id: 'openai/gpt-5.4-pro', label: 'GPT-5.4 Pro (reasoning)' },
  { id: 'openai/gpt-5.3-chat', label: 'GPT-5.3 Chat' },
  { id: 'openai/gpt-5.2', label: 'GPT-5.2 (reasoning)' },
  { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (reasoning)' },
  { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (reasoning)' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'x-ai/grok-4.20', label: 'Grok 4.20' },
  { id: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast' },
  { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2' },
  { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick' },
  { id: 'qwen/qwen3-max', label: 'Qwen3 Max' },
];

export default function ModelsSettings() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyPreview, setKeyPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    await supabase.rpc('save_user_api_key', { p_key: apiKey });
    const { data } = await supabase.from('user_api_keys').select('key_preview').maybeSingle();
    setKeyPreview(data?.key_preview ?? null);
    setApiKey('');
    setSaving(false);
  };

  const deleteKey = async () => {
    await supabase.rpc('delete_user_api_key');
    setKeyPreview(null);
    setApiKey('');
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <PageHeader
        folio="§ 09 / MODELS"
        title="Models"
        description="Available reasoning models, the OpenRouter key that authorizes them, and the multi-model ensemble used to synthesize responses."
      />

      <div style={{ padding: '0 32px 80px', maxWidth: 880 }}>
        <SectionTitle>Available models</SectionTitle>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
        >
          {MODEL_CARDS.map((m) => (
            <div
              key={m.id}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {m.name}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    padding: '2px 8px',
                    borderRadius: 100,
                    background: 'var(--bg-surface)',
                    color: m.badge === 'deep' ? 'var(--luca)' : 'var(--text-tertiary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {m.badge}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                {m.desc}
              </div>
            </div>
          ))}
        </div>

        <SectionTitle>API key</SectionTitle>
        {keyPreview ? (
          <div className="flex items-center gap-3 mb-3">
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: 'var(--text-secondary)',
              }}
            >
              {keyPreview}
            </span>
            <DangerButton label="Remove" onClick={deleteKey} />
          </div>
        ) : (
          <div className="flex items-center gap-3 mb-3">
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                placeholder="sk-or-..."
                onChange={(e) => setApiKey(e.target.value)}
                style={{
                  height: 40,
                  width: '100%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0 40px 0 12px',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="cursor-pointer"
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-ghost)',
                  fontSize: 12,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {showKey ? 'hide' : 'show'}
              </button>
            </div>
            <button
              type="button"
              onClick={saveKey}
              disabled={!apiKey || saving}
              className="cursor-pointer"
              style={{
                height: 40,
                padding: '0 16px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                opacity: !apiKey || saving ? 0.4 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-ghost)', lineHeight: 1.4 }}>
          Your OpenRouter API key. Encrypted and stored securely.
        </div>

        <EnsembleSettings />
      </div>
    </div>
  );
}

function EnsembleSettings() {
  const {
    multi_model_enabled,
    ensemble_models,
    synthesis_model,
    reasoning_effort,
    updateSetting,
  } = useSettingsStore();

  const updateEnsembleModel = (index: number, modelId: string) => {
    const updated = [...ensemble_models];
    updated[index] = modelId;
    updateSetting('ensemble_models', updated);
  };

  return (
    <>
      <SectionTitle>Ensemble</SectionTitle>
      <div
        className="flex justify-between items-center mb-3"
        style={{ padding: '12px 0', gap: 16 }}
      >
        <div className="flex-1 min-w-0">
          <div
            style={{
              fontSize: 14,
              color: 'var(--text-primary)',
              fontWeight: 450,
              marginBottom: 4,
            }}
          >
            Default ensemble to on
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
            When on, the ensemble pill is pre-armed for every new message. You can still toggle it
            per-message with ⌘E.
          </div>
        </div>
        <div
          role="switch"
          aria-checked={multi_model_enabled}
          tabIndex={0}
          onClick={() => updateSetting('multi_model_enabled', !multi_model_enabled)}
          className="relative cursor-pointer shrink-0"
          style={{
            width: 36,
            height: 18,
            background: 'var(--bg-surface)',
            border: `1px solid ${
              multi_model_enabled ? 'var(--border-focus)' : 'var(--border)'
            }`,
            borderRadius: 'var(--radius-xl)',
            transition: 'all 300ms var(--ease-out)',
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              width: 14,
              height: 14,
              top: 1,
              left: multi_model_enabled ? 19 : 1,
              background: multi_model_enabled ? 'var(--text-body)' : 'var(--text-tertiary)',
              transition: 'all 300ms var(--ease-out)',
            }}
          />
        </div>
      </div>

      <>
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Ensemble models
            </div>
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-ghost)',
                      width: 16,
                      textAlign: 'center',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {i + 1}
                  </span>
                  <select
                    value={ensemble_models[i] || ''}
                    onChange={(e) => updateEnsembleModel(i, e.target.value)}
                    style={{
                      flex: 1,
                      height: 36,
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0 12px',
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-sans)',
                      outline: 'none',
                    }}
                  >
                    {ENSEMBLE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Synthesis model
            </div>
            <select
              value={synthesis_model}
              onChange={(e) => updateSetting('synthesis_model', e.target.value)}
              style={{
                width: '100%',
                maxWidth: 360,
                height: 36,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0 12px',
                fontSize: 12,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                outline: 'none',
              }}
            >
              {ENSEMBLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 6, lineHeight: 1.4 }}>
              The model that synthesizes the final response from all ensemble outputs.
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Default thinking effort
            </div>
            <div className="flex items-center gap-2">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <button
                  type="button"
                  key={level}
                  onClick={() => updateSetting('reasoning_effort', level)}
                  style={{
                    height: 32,
                    padding: '0 14px',
                    fontSize: 12,
                    background: reasoning_effort === level ? 'var(--bg-surface)' : 'transparent',
                    border: `1px solid ${
                      reasoning_effort === level ? 'var(--border)' : 'var(--border-subtle)'
                    }`,
                    borderRadius: 'var(--radius-sm)',
                    color:
                      reasoning_effort === level ? 'var(--text-primary)' : 'var(--text-ghost)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    transition: 'all 150ms ease',
                  }}
                >
                  {level === 'low' ? 'Light' : level === 'medium' ? 'Medium' : 'Deep'}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 6, lineHeight: 1.4 }}>
              Controls how deeply reasoning models think before responding. Can be overridden
              per-message in the chat input.
            </div>
          </div>
        </>
      )}
    </>
  );
}
