import { useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';

const TABS = ['General', 'Models', 'Personality', 'Memory', 'Appearance', 'Account'] as const;
type Tab = typeof TABS[number];

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
        <div className="shrink-0 overflow-y-auto" style={{ width: 200, borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', padding: '24px 0' }}>
          {TABS.map((tab) => (
            <div
              key={tab}
              className="flex items-center gap-3 cursor-pointer relative"
              style={{
                height: 36,
                padding: '0 16px',
                fontSize: 14,
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: activeTab === tab ? 'var(--card)' : undefined,
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
              onClick={() => setActiveTab(tab)}
            >
              {activeTab === tab && <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r" style={{ background: 'var(--text-secondary)' }} />}
              {tab}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 32, background: 'var(--bg-primary)' }}>
          <div style={{ maxWidth: 640 }}>
            {activeTab === 'General' && <GeneralTab />}
            {activeTab === 'Models' && <ModelsTab />}
            {activeTab === 'Personality' && <PlaceholderTab name="Personality" />}
            {activeTab === 'Memory' && <PlaceholderTab name="Memory" />}
            {activeTab === 'Appearance' && <AppearanceTab />}
            {activeTab === 'Account' && <AccountTab email={user?.email} onSignOut={signOut} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] font-medium uppercase mb-4" style={{ letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>{children}</div>;
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center mb-3 rounded-[var(--radius-md)] p-4" style={{ transition: 'all var(--dur-fast) var(--ease-out)' }}>
      <div className="flex-1">
        <div className="text-sm mb-1" style={{ color: 'var(--text-primary)', fontWeight: 450 }}>{label}</div>
        {description && <div className="text-xs" style={{ color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{description}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div
      className="relative cursor-pointer shrink-0"
      style={{ width: 40, height: 22, background: 'var(--bg-elevated)', border: `1px solid ${on ? 'var(--border-strong)' : 'var(--border)'}`, borderRadius: 11, transition: 'all var(--dur-fast) var(--ease-out)' }}
      onClick={onChange}
    >
      <div className="absolute rounded-full" style={{
        width: 18, height: 18, top: 1,
        left: on ? 19 : 1,
        background: on ? 'rgba(244, 243, 240, 0.94)' : 'var(--text-tertiary)',
        transition: 'all var(--dur-fast) var(--ease-out)',
      }} />
    </div>
  );
}

function GeneralTab() {
  const { stream_responses, show_thinking, auto_title, show_timestamps, updateSetting } = useSettingsStore();
  return (
    <div>
      <SectionTitle>Responses</SectionTitle>
      <SettingRow label="Stream responses" description="Show tokens as they arrive">
        <Toggle on={stream_responses} onChange={() => updateSetting('stream_responses', !stream_responses)} />
      </SettingRow>
      <SettingRow label="Show thinking" description="Display the model's internal reasoning">
        <Toggle on={show_thinking} onChange={() => updateSetting('show_thinking', !show_thinking)} />
      </SettingRow>
      <SettingRow label="Auto-title threads" description="Generate titles from first message">
        <Toggle on={auto_title} onChange={() => updateSetting('auto_title', !auto_title)} />
      </SettingRow>
      <SettingRow label="Show timestamps" description="Display time on each message">
        <Toggle on={show_timestamps} onChange={() => updateSetting('show_timestamps', !show_timestamps)} />
      </SettingRow>
    </div>
  );
}

function ModelsTab() {
  const { default_model, updateSetting } = useSettingsStore();
  return (
    <div>
      <SectionTitle>Default Model</SectionTitle>
      <select
        value={default_model}
        onChange={(e) => updateSetting('default_model', e.target.value)}
        style={{
          background: 'var(--bg-void)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
          padding: '10px 14px', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-sans)',
          cursor: 'pointer', minWidth: 200, appearance: 'none' as any,
        }}
      >
        <option value="anthropic/claude-sonnet-4">Claude Sonnet 4</option>
        <option value="anthropic/claude-opus-4">Claude Opus 4</option>
        <option value="openai/gpt-4o">GPT-4o</option>
        <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
        <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B</option>
      </select>
    </div>
  );
}

function AppearanceTab() {
  const { font_size, clockbar_visible, show_agent_colors, updateSetting } = useSettingsStore();
  return (
    <div>
      <SectionTitle>Display</SectionTitle>
      <SettingRow label="Show clockbar" description="Persistent bottom time display">
        <Toggle on={clockbar_visible} onChange={() => updateSetting('clockbar_visible', !clockbar_visible)} />
      </SettingRow>
      <SettingRow label="Agent colors" description="Color-code agent names in chat">
        <Toggle on={show_agent_colors} onChange={() => updateSetting('show_agent_colors', !show_agent_colors)} />
      </SettingRow>
      <SettingRow label="Font size" description="Message text size">
        <div className="flex items-center gap-3 shrink-0">
          <input
            type="range" min={12} max={18} value={font_size}
            onChange={(e) => updateSetting('font_size', parseInt(e.target.value))}
            style={{ width: 160, height: 4, borderRadius: 2, background: 'var(--bg-surface)', outline: 'none', appearance: 'none', cursor: 'pointer' }}
          />
          <span className="text-[13px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', minWidth: 40, textAlign: 'right' }}>{font_size}px</span>
        </div>
      </SettingRow>
    </div>
  );
}

function AccountTab({ email, onSignOut }: { email?: string; onSignOut: () => void }) {
  return (
    <div>
      <SectionTitle>Account</SectionTitle>
      <SettingRow label="Email" description="Your account email">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{email}</span>
      </SettingRow>
      <div className="mt-8">
        <button
          onClick={onSignOut}
          className="text-sm cursor-pointer rounded-[var(--radius-md)]"
          style={{ padding: '10px 16px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', transition: 'all var(--dur-fast) var(--ease-out)' }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function PlaceholderTab({ name }: { name: string }) {
  return (
    <div>
      <SectionTitle>{name}</SectionTitle>
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{name} settings coming soon.</p>
    </div>
  );
}
