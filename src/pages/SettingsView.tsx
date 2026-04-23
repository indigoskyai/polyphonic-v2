import { useState, useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';

const TABS = ['General', 'Models', 'Personality', 'Memory', 'Appearance', 'Account'] as const;
type Tab = typeof TABS[number];

const TAB_ICONS: Record<Tab, JSX.Element> = {
  General: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" width="14" height="14"><circle cx="7" cy="7" r="2.5"/><path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2M3.1 3.1l1.4 1.4M9.5 9.5l1.4 1.4M3.1 10.9l1.4-1.4M9.5 4.5l1.4-1.4"/></svg>,
  Models: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" width="14" height="14"><rect x="2" y="2" width="10" height="10" rx="2"/><path d="M5 6h4M5 8h2"/></svg>,
  Personality: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" width="14" height="14"><circle cx="7" cy="5" r="3"/><path d="M3 12c0-2.2 1.8-4 4-4s4 1.8 4 4"/></svg>,
  Memory: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" width="14" height="14"><circle cx="7" cy="7" r="5.5"/><circle cx="7" cy="7" r="3"/></svg>,
  Appearance: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" width="14" height="14"><path d="M2 7a5 5 0 0110 0"/><circle cx="7" cy="7" r="1.5"/></svg>,
  Account: <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" width="14" height="14"><circle cx="7" cy="5" r="2.5"/><path d="M3.5 12c0-1.9 1.6-3.5 3.5-3.5s3.5 1.6 3.5 3.5"/></svg>,
};

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<Tab>('General');
  const settings = useSettingsStore();
  const { user, signOut } = useAuthStore();

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      <div className="flex items-center flex-shrink-0" style={{ height: 44, padding: '0 24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>Settings</span>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Nav */}
        <div className="shrink-0 overflow-y-auto" style={{ width: 200, borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', padding: '24px 0' }}>
          {TABS.map((tab) => (
            <div
              key={tab}
              className="flex items-center gap-3 cursor-pointer relative"
              style={{
                height: 36, padding: '10px 16px', fontSize: 12, fontWeight: 420,
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-tertiary)',
                background: activeTab === tab ? 'var(--bg-surface)' : undefined,
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
              onClick={() => setActiveTab(tab)}
            >
              {activeTab === tab && <div className="absolute left-0 top-0 bottom-0" style={{ width: 2, background: 'var(--text-ghost)', borderRadius: '0 2px 2px 0' }} />}
              <span style={{ color: 'inherit', display: 'flex' }}>{TAB_ICONS[tab]}</span>
              {tab}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 32, background: 'var(--bg-primary)' }}>
          <div style={{ maxWidth: 640 }}>
            {activeTab === 'General' && <GeneralTab />}
            {activeTab === 'Models' && <ModelsTab />}
            {activeTab === 'Personality' && <PersonalityTab />}
            {activeTab === 'Memory' && <MemoryTab />}
            {activeTab === 'Appearance' && <AppearanceTab />}
            {activeTab === 'Account' && <AccountTab email={user?.email} onSignOut={signOut} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ====== Shared Form Controls ====== */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: 16 }}>{children}</div>;
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center mb-3" style={{ borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
      <div className="flex-1">
        <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 450, marginBottom: description ? 4 : 0 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{description}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div
      className="relative cursor-pointer shrink-0"
      style={{ width: 36, height: 18, background: 'var(--bg-surface)', border: `1px solid ${on ? 'var(--border-focus)' : 'var(--border)'}`, borderRadius: 'var(--radius-xl)', transition: 'all 300ms var(--ease-out)' }}
      onClick={onChange}
    >
      <div className="absolute rounded-full" style={{
        width: 14, height: 14, top: 1, left: on ? 19 : 1,
        background: on ? 'rgba(244, 243, 240, 0.94)' : 'var(--text-tertiary)',
        transition: 'all 300ms var(--ease-out)',
      }} />
    </div>
  );
}

function RadioGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <div key={opt} className="flex items-center gap-3 cursor-pointer" onClick={() => onChange(opt.toLowerCase())}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${value === opt.toLowerCase() ? 'var(--border-focus)' : 'var(--border-dim)'}`, background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color var(--dur-fast) var(--ease-out)' }}>
            {value === opt.toLowerCase() && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(244,243,240,0.72)' }} />}
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{opt}</span>
        </div>
      ))}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 40, width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        padding: '0 12px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', outline: 'none',
        transition: 'border-color var(--dur-fast) var(--ease-out)',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-focus)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(220,219,216,0.04)'; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value} placeholder={placeholder} rows={rows}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', outline: 'none',
        resize: 'vertical', lineHeight: 1.5, transition: 'border-color var(--dur-fast) var(--ease-out)',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-focus)'; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
    />
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 40, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        padding: '0 12px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)',
        cursor: 'pointer', minWidth: 200, outline: 'none',
      }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function DangerButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer"
      style={{
        height: 38, background: 'var(--bg-surface)', color: '#f87171', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', padding: '0 16px', fontSize: 13, fontFamily: 'var(--font-sans)',
        transition: 'background var(--dur-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,113,113,0.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-surface)'; }}
    >
      {label}
    </button>
  );
}

function ConfirmDialog({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 24, maxWidth: 400, width: '90%' }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>{message}</div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="cursor-pointer" style={{ height: 36, padding: '0 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>Cancel</button>
          <button onClick={onConfirm} className="cursor-pointer" style={{ height: 36, padding: '0 16px', background: 'rgba(248,113,113,0.88)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ====== Tab Contents ====== */

function GeneralTab() {
  const { stream_responses, show_thinking, auto_title, default_model, synthesis_style, updateSetting } = useSettingsStore();
  return (
    <div>
      <SectionTitle>Default Model</SectionTitle>
      <div className="mb-6">
        <SelectInput
          value={default_model}
          onChange={(v) => updateSetting('default_model', v)}
          options={[
            { label: 'Claude Sonnet 4', value: 'anthropic/claude-sonnet-4' },
            { label: 'Claude Opus 4', value: 'anthropic/claude-opus-4' },
            { label: 'GPT-4o', value: 'openai/gpt-4o' },
            { label: 'Gemini 2.5 Pro', value: 'google/gemini-2.5-pro' },
            { label: 'Llama 3.3 70B', value: 'meta-llama/llama-3.3-70b-instruct' },
          ]}
        />
      </div>

      <SectionTitle>Synthesis Style</SectionTitle>
      <div className="mb-6">
        <RadioGroup
          options={['Conversational', 'Technical', 'Creative', 'Minimal']}
          value={synthesis_style}
          onChange={(v) => updateSetting('synthesis_style', v)}
        />
      </div>

      <SectionTitle>Response Behavior</SectionTitle>
      <SettingRow label="Stream responses" description="Show tokens as they arrive">
        <Toggle on={stream_responses} onChange={() => updateSetting('stream_responses', !stream_responses)} />
      </SettingRow>
      <SettingRow label="Show thinking" description="Display the model's internal reasoning">
        <Toggle on={show_thinking} onChange={() => updateSetting('show_thinking', !show_thinking)} />
      </SettingRow>
      <SettingRow label="Auto-title threads" description="Generate titles from first message">
        <Toggle on={auto_title} onChange={() => updateSetting('auto_title', !auto_title)} />
      </SettingRow>
    </div>
  );
}

const MODEL_CARDS = [
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', desc: 'Balanced intelligence and speed', badge: 'fast' },
  { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', desc: 'Maximum reasoning depth', badge: 'deep' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', desc: 'OpenAI multimodal flagship', badge: 'fast' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', desc: 'Google large context reasoning', badge: 'deep' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', desc: 'Open-source performant model', badge: 'fast' },
];

function ModelsTab() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyPreview, setKeyPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('user_api_keys').select('key_preview').single().then(({ data }) => {
      if (data) setKeyPreview(data.key_preview);
    });
  }, []);

  const saveKey = async () => {
    setSaving(true);
    await supabase.rpc('save_user_api_key', { p_key: apiKey });
    const { data } = await supabase.from('user_api_keys').select('key_preview').single();
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
    <div>
      <SectionTitle>Available Models</SectionTitle>
      <div className="grid gap-3 mb-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {MODEL_CARDS.map((m) => (
          <div key={m.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 16, transition: 'border-color var(--dur-fast) var(--ease-out)' }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{m.name}</span>
              <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 100, background: 'var(--bg-surface)', color: m.badge === 'deep' ? 'var(--luca)' : 'var(--text-tertiary)', border: '1px solid var(--border)' }}>{m.badge}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{m.desc}</div>
          </div>
        ))}
      </div>

      <SectionTitle>API Key</SectionTitle>
      {keyPreview ? (
        <div className="flex items-center gap-3 mb-3">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>{keyPreview}</span>
          <DangerButton label="Remove" onClick={deleteKey} />
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-3">
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey} placeholder="sk-or-..."
              onChange={(e) => setApiKey(e.target.value)}
              style={{
                height: 40, width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                padding: '0 40px 0 12px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', outline: 'none',
              }}
            />
            <button onClick={() => setShowKey(!showKey)} className="cursor-pointer" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-ghost)', fontSize: 12, fontFamily: 'var(--font-sans)' }}>
              {showKey ? 'hide' : 'show'}
            </button>
          </div>
          <button onClick={saveKey} disabled={!apiKey || saving} className="cursor-pointer" style={{ height: 40, padding: '0 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', opacity: !apiKey || saving ? 0.4 : 1 }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-ghost)', lineHeight: 1.4, marginBottom: 32 }}>Your OpenRouter API key. Encrypted and stored securely.</div>

      <EnsembleSettings />
    </div>
  );
}

function EnsembleSettings() {
  const { multi_model_enabled, ensemble_models, synthesis_model, reasoning_effort, updateSetting } = useSettingsStore();

  const AVAILABLE_MODELS = [
    // Reasoning models (frontier)
    { id: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (reasoning)' },
    { id: 'anthropic/claude-opus-4-20250514', label: 'Claude Opus 4 (reasoning)' },
    { id: 'openai/gpt-5.4', label: 'GPT-5.4 (reasoning)' },
    { id: 'openai/gpt-5.4-mini', label: 'GPT-5.4 Mini (reasoning)' },
    { id: 'openai/gpt-5.2', label: 'GPT-5.2 (reasoning)' },
    { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (reasoning)' },
    { id: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro (reasoning)' },
    { id: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (reasoning)' },
    // Non-reasoning models
    { id: 'anthropic/claude-haiku-3.5-20241022', label: 'Claude Haiku 3.5' },
    { id: 'openai/gpt-4o', label: 'GPT-4o' },
    { id: 'google/gemini-2.5-pro-preview-03-25', label: 'Gemini 2.5 Pro' },
    { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
  ];

  const updateEnsembleModel = (index: number, modelId: string) => {
    const updated = [...ensemble_models];
    updated[index] = modelId;
    updateSetting('ensemble_models', updated);
  };

  return (
    <>
      <SectionTitle>Ensemble Skill</SectionTitle>
      <SettingRow label="Default ensemble to on" description="When on, the ensemble pill is pre-armed for every new message. You can still toggle it per-message with ⌘E.">
        <Toggle on={multi_model_enabled} onChange={() => updateSetting('multi_model_enabled', !multi_model_enabled)} />
      </SettingRow>

      {multi_model_enabled && (
        <>
          <div style={{ marginBottom: 16, marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>
              Ensemble Models
            </div>
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <span style={{ fontSize: 11, color: 'var(--text-ghost)', width: 16, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{i + 1}</span>
                  <select
                    value={ensemble_models[i] || ''}
                    onChange={(e) => updateEnsembleModel(i, e.target.value)}
                    style={{
                      flex: 1, height: 36, background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 12, color: 'var(--text-primary)',
                      fontFamily: 'var(--font-sans)', outline: 'none', appearance: 'none',
                    }}
                  >
                    {AVAILABLE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>
              Synthesis Model
            </div>
            <select
              value={synthesis_model}
              onChange={(e) => updateSetting('synthesis_model', e.target.value)}
              style={{
                width: '100%', maxWidth: 320, height: 36, background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '0 12px', fontSize: 12, color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)', outline: 'none', appearance: 'none',
              }}
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 6, lineHeight: 1.4 }}>
              The model that synthesizes the final response from all ensemble outputs.
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>
              Default Thinking Effort
            </div>
            <div className="flex items-center gap-2">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => updateSetting('reasoning_effort', level)}
                  style={{
                    height: 32, padding: '0 14px', fontSize: 12,
                    background: reasoning_effort === level ? 'var(--bg-surface)' : 'transparent',
                    border: `1px solid ${reasoning_effort === level ? 'var(--border)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-sm)',
                    color: reasoning_effort === level ? 'var(--text-primary)' : 'var(--text-ghost)',
                    cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    transition: 'all 150ms ease',
                  }}
                >
                  {level === 'low' ? 'Light' : level === 'medium' ? 'Medium' : 'Deep'}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 6, lineHeight: 1.4 }}>
              Controls how deeply reasoning models think before responding. Can be overridden per-message in the chat input.
            </div>
          </div>
        </>
      )}
    </>
  );
}

function PersonalityTab() {
  const [agentName, setAgentName] = useState('Luca');
  const [voice, setVoice] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [innerLife, setInnerLife] = useState(true);
  const [verbosity, setVerbosity] = useState(1); // 0=quiet, 1=normal, 2=verbose

  useEffect(() => {
    supabase.from('agent_config').select('*').eq('agent_name', 'luca').single().then(({ data }) => {
      if (data) {
        setAgentName(data.agent_name || 'Luca');
        setVoice(data.voice || '');
        setSystemPrompt(data.system_prompt || '');
        const p = data.personality as Record<string, any> | null;
        if (p) {
          setInnerLife(p.inner_life !== false);
          setVerbosity(p.thought_verbosity ?? 1);
        }
      }
    });
  }, []);

  const save = async (field: string, value: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('agent_config').upsert({ user_id: user.id, agent_name: 'luca', [field]: value }, { onConflict: 'user_id' });
  };

  return (
    <div>
      <SectionTitle>Agent Identity</SectionTitle>
      <SettingRow label="Agent Name" description="Display name in chat">
        <div style={{ width: 200 }}>
          <TextInput value={agentName} onChange={(v) => { setAgentName(v); }} placeholder="Luca" />
        </div>
      </SettingRow>

      <SectionTitle>Voice</SectionTitle>
      <div className="mb-6">
        <TextArea value={voice} onChange={(v) => { setVoice(v); save('voice', v); }} placeholder="Describe how the agent should communicate..." rows={4} />
      </div>

      <SectionTitle>System Prompt</SectionTitle>
      <div className="mb-6">
        <TextArea value={systemPrompt} onChange={(v) => { setSystemPrompt(v); save('system_prompt', v); }} placeholder="Core instructions for the agent..." rows={8} />
      </div>

      <SectionTitle>Inner Life</SectionTitle>
      <SettingRow label="Enable Emotional State" description="Allow cognitive state tracking and visualization">
        <Toggle on={innerLife} onChange={() => { setInnerLife(!innerLife); save('personality', { inner_life: !innerLife, thought_verbosity: verbosity }); }} />
      </SettingRow>

      <SettingRow label="Thought Verbosity" description="How much internal reasoning to surface">
        <div className="flex items-center gap-3 shrink-0">
          <span style={{ fontSize: 11, color: 'var(--text-ghost)', minWidth: 36 }}>Quiet</span>
          <input
            type="range" min={0} max={2} step={1} value={verbosity}
            onChange={(e) => { const v = parseInt(e.target.value); setVerbosity(v); save('personality', { inner_life: innerLife, thought_verbosity: v }); }}
            style={{ width: 120, height: 3, borderRadius: 2, background: 'var(--bg-surface)', outline: 'none', appearance: 'none', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-ghost)', minWidth: 50 }}>Verbose</span>
        </div>
      </SettingRow>
    </div>
  );
}

function MemoryTab() {
  const [mnemos, setMnemos] = useState(true);
  const [decayRate, setDecayRate] = useState(50);
  const [dreamFreq, setDreamFreq] = useState('daily');
  const [consolidation, setConsolidation] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const clearAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await Promise.all([
      supabase.from('memory_events').delete().eq('user_id', user.id),
      supabase.from('thought_stream').delete().eq('user_id', user.id),
      supabase.from('cognitive_state').delete().eq('user_id', user.id),
    ]);
    setShowClearConfirm(false);
  };

  return (
    <div>
      {/* Import Section */}
      <SectionTitle>Import Conversations</SectionTitle>
      <div style={{ marginBottom: 24, padding: '16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
          Upload conversation exports from other AI platforms to build a deep psychological profile.
        </div>
        <button
          onClick={() => window.location.href = '/import'}
          className="cursor-pointer"
          style={{ height: 36, padding: '0 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-sans)', transition: 'all var(--dur-fast) var(--ease-out)' }}
        >
          Import Conversations →
        </button>
      </div>

      <SectionTitle>Memory System</SectionTitle>
      <SettingRow label="Enable mnemos Memory" description="Persistent memory extraction and recall">
        <Toggle on={mnemos} onChange={() => setMnemos(!mnemos)} />
      </SettingRow>

      <SettingRow label="Memory Decay Rate" description="How quickly older memories fade">
        <div className="flex items-center gap-3 shrink-0">
          <span style={{ fontSize: 11, color: 'var(--text-ghost)' }}>Slow</span>
          <input
            type="range" min={0} max={100} value={decayRate}
            onChange={(e) => setDecayRate(parseInt(e.target.value))}
            style={{ width: 120, height: 3, borderRadius: 2, background: 'var(--bg-surface)', outline: 'none', appearance: 'none', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-ghost)' }}>Fast</span>
        </div>
      </SettingRow>

      <SettingRow label="Dream Frequency" description="How often the agent processes memories">
        <SelectInput
          value={dreamFreq}
          onChange={setDreamFreq}
          options={[
            { label: 'Every hour', value: 'hourly' },
            { label: 'Every 6 hours', value: '6h' },
            { label: 'Daily', value: 'daily' },
            { label: 'Weekly', value: 'weekly' },
          ]}
        />
      </SettingRow>

      <SettingRow label="Enable Consolidation" description="Merge related memories over time">
        <Toggle on={consolidation} onChange={() => setConsolidation(!consolidation)} />
      </SettingRow>

      <div className="mt-8">
        <DangerButton label="Clear All Memory" onClick={() => setShowClearConfirm(true)} />
      </div>
      {showClearConfirm && (
        <ConfirmDialog
          title="Clear all memory"
          message="This will permanently delete all memory events, thoughts, and cognitive state. This cannot be undone."
          onConfirm={clearAll}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}

function AppearanceTab() {
  const { font_size, clockbar_visible, show_agent_colors, show_timestamps, interface_density, updateSetting } = useSettingsStore();
  return (
    <div>
      <SectionTitle>Interface Density</SectionTitle>
      <div className="mb-6">
        <RadioGroup
          options={['Compact', 'Default', 'Comfortable']}
          value={interface_density}
          onChange={(v) => updateSetting('interface_density', v)}
        />
      </div>

      <SectionTitle>Display</SectionTitle>
      <SettingRow label="Font size" description="Message text size">
        <div className="flex items-center gap-3 shrink-0">
          <input
            type="range" min={12} max={18} value={font_size}
            onChange={(e) => updateSetting('font_size', parseInt(e.target.value))}
            style={{ width: 160, height: 3, borderRadius: 2, background: 'var(--bg-surface)', outline: 'none', appearance: 'none', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', minWidth: 40, textAlign: 'right' }}>{font_size}px</span>
        </div>
      </SettingRow>
      <SettingRow label="Show timestamps" description="Display time on each message">
        <Toggle on={show_timestamps} onChange={() => updateSetting('show_timestamps', !show_timestamps)} />
      </SettingRow>
      <SettingRow label="Agent colors" description="Color-code agent names in chat">
        <Toggle on={show_agent_colors} onChange={() => updateSetting('show_agent_colors', !show_agent_colors)} />
      </SettingRow>
      <SettingRow label="Show clockbar" description="Persistent bottom time display">
        <Toggle on={clockbar_visible} onChange={() => updateSetting('clockbar_visible', !clockbar_visible)} />
      </SettingRow>
    </div>
  );
}

function AccountTab({ email, onSignOut }: { email?: string; onSignOut: () => void }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div>
      <SectionTitle>Account</SectionTitle>
      <SettingRow label="Email" description="Your account email">
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{email}</span>
      </SettingRow>
      <SettingRow label="Plan" description="Current subscription">
        <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 100, background: 'var(--bg-surface)', color: 'var(--luca)', border: '1px solid var(--border)' }}>pro</span>
      </SettingRow>

      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={onSignOut}
          className="cursor-pointer"
          style={{ height: 38, padding: '0 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-tertiary)', fontSize: 13, fontFamily: 'var(--font-sans)', transition: 'all var(--dur-fast) var(--ease-out)' }}
        >
          Sign out
        </button>
        <DangerButton label="Delete Account" onClick={() => setShowDeleteConfirm(true)} />
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete account"
          message="This will permanently delete your account and all associated data. This cannot be undone."
          onConfirm={() => { setShowDeleteConfirm(false); /* actual delete not implemented */ }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
