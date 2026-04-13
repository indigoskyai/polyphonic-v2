import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

interface Settings {
  default_model: string;
  synthesis_style: string;
  stream_responses: boolean;
  show_thinking: boolean;
  auto_title: boolean;
  interface_density: string;
  font_size: number;
  show_timestamps: boolean;
  show_agent_colors: boolean;
  clockbar_visible: boolean;
}

interface SettingsState extends Settings {
  loaded: boolean;
  loadSettings: (userId: string) => Promise<void>;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
}

const defaults: Settings = {
  default_model: 'anthropic/claude-sonnet-4',
  synthesis_style: 'conversational',
  stream_responses: true,
  show_thinking: true,
  auto_title: true,
  interface_density: 'default',
  font_size: 14,
  show_timestamps: true,
  show_agent_colors: true,
  clockbar_visible: true,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  loaded: false,

  loadSettings: async (userId) => {
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (data) {
      set({ ...defaults, ...data, loaded: true });
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
}));
