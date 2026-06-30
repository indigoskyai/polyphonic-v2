import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { InterfaceMode, OnboardingPreferences } from '@/lib/interfaceMode';

export interface Settings {
  default_model: string;
  synthesis_style: string;
  stream_responses: boolean;
  show_thinking: boolean;
  auto_title: boolean;
  interface_density: string;
  font_size: number;
  interface_mode: InterfaceMode;
  onboarding_completed_at: string | null;
  onboarding_preferences: OnboardingPreferences | Record<string, never>;
  show_timestamps: boolean;
  show_agent_colors: boolean;
  clockbar_visible: boolean;
  // Multi-model ensemble settings
  multi_model_enabled: boolean;
  ensemble_models: string[];
  synthesis_model: string;
  reasoning_effort: 'low' | 'medium' | 'high';
  // Voice
  default_voice_id: string;
  elevenlabs_agent_id: string | null;
  voice_autospeak: boolean;
  // The agent whose signature shape + name becomes the default landing the
  // user sees on login. null → Luca / the standard "polyphonic" landing.
  // Set when the user adopts a forged agent ("say hello") or picks one in
  // the agent switcher; cleared by selecting Luca again.
  landing_agent_id: string | null;
  last_chat_target_kind: 'agent' | 'model';
  last_chat_target_id: string;
}

interface SettingsState extends Settings {
  loaded: boolean;
  loadSettings: (userId: string) => Promise<void>;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  setLastChatTarget: (target: { kind: 'agent' | 'model'; id: string }) => Promise<void>;
}

export const defaultSettings: Settings = {
  default_model: 'moonshotai/kimi-k2.6',
  synthesis_style: 'conversational',
  stream_responses: true,
  show_thinking: true,
  auto_title: true,
  interface_density: 'default',
  font_size: 14,
  interface_mode: 'guided',
  onboarding_completed_at: null,
  onboarding_preferences: {},
  show_timestamps: true,
  show_agent_colors: true,
  clockbar_visible: false,
  // Multi-model defaults — ensemble is opt-in per Riley's preference; the
  // single-Luca path with the L7 tool planner gives a coherent voice while
  // the ensemble's three-voice synthesis adds latency and an editorialization
  // risk on tool-heavy turns. Users can flip it back on in Settings.
  multi_model_enabled: false,
  ensemble_models: [
    'anthropic/claude-opus-4-7',
    'openai/gpt-5.4',
    'google/gemini-3.1-pro-preview',
  ],
  synthesis_model: 'anthropic/claude-opus-4-7',
  reasoning_effort: 'medium',
  default_voice_id: 'EXAVITQu4vr4xnSDxMaL',
  elevenlabs_agent_id: null,
  voice_autospeak: false,
  landing_agent_id: null,
  last_chat_target_kind: 'agent',
  last_chat_target_id: 'luca',
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaultSettings,
  loaded: false,

  loadSettings: async (userId) => {
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (data) {
      set({ ...defaultSettings, ...data, loaded: true });
      // Cross-device source of truth: hydrate the interface mode store
      // from server so a user who picked 'studio' on desktop and
      // 'guided' on mobile sees consistent visibility per device login.
      if (data.interface_mode) {
        const { useInterfaceModeStore } = await import('@/stores/interfaceModeStore');
        useInterfaceModeStore.getState().hydrateFromServer(data.interface_mode as InterfaceMode);
      }
    } else {
      set({ loaded: true });
    }
  },

  updateSetting: async (key, value) => {
    set({ [key]: value } as any);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_settings')
        .update({ [key]: value })
        .eq('user_id', user.id);
    }
  },

  setLastChatTarget: async (target) => {
    const kind = target.kind === 'model' ? 'model' : 'agent';
    const id = target.id?.trim() || (kind === 'model' ? defaultSettings.default_model : 'luca');
    const patch = {
      last_chat_target_kind: kind,
      last_chat_target_id: id,
      landing_agent_id: kind === 'agent' ? (id === 'luca' ? null : id) : null,
    } satisfies Partial<Settings>;
    set(patch as any);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_settings')
        .update(patch)
        .eq('user_id', user.id);
    }
  },
}));
