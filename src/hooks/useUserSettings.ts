import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface UserSettings {
  id: string;
  user_id: string;
  custom_instructions: string;
  selected_model: string;
  temperature: number;
  max_tokens: number;
  theme: string;
  memory_enabled: boolean;
  chat_history_enabled: boolean;
  background_style: string;
  persona: string;
  nickname: string;
  occupation: string;
  about_me: string;
  memory_tier: string;
  journal_model: string | null;
  // Role-based model assignments
  voice_model: string | null;
  dreamer_model: string | null;
  observer_models: string[] | null;
  synthesis_model: string | null;
  belief_model: string | null;
  memory_model: string | null;
}

const DEFAULT_SETTINGS: Omit<UserSettings, "id" | "user_id"> = {
  custom_instructions: "",
  selected_model: "anthropic/claude-opus-4.6",
  temperature: 0.7,
  max_tokens: 4096,
  theme: "dark",
  memory_enabled: true,
  chat_history_enabled: true,
  background_style: "wallpaper",
  persona: "neutral",
  nickname: "",
  occupation: "",
  about_me: "",
  memory_tier: "standard",
  journal_model: null,
  voice_model: null,
  dreamer_model: null,
  observer_models: null,
  synthesis_model: null,
  belief_model: null,
  memory_model: null,
};

export function useUserSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to load settings:", error);
      setLoading(false);
      return;
    }

    if (!data) {
      // Create default settings
      const { data: created } = await supabase
        .from("user_settings")
        .insert({ user_id: user.id })
        .select("*")
        .single();
      if (created) {
        setSettings(created as UserSettings);
        if ((created as UserSettings).background_style) {
          localStorage.setItem("polyphonic_bg", (created as UserSettings).background_style);
        }
      }
    } else {
      setSettings(data as UserSettings);
      if (data.background_style) {
        localStorage.setItem("polyphonic_bg", data.background_style);
      }
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Apply theme to DOM
  useEffect(() => {
    const theme = settings?.theme || "dark";
    if (theme === "midnight" || theme === "lights-out") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [settings?.theme]);

  const updateSettings = async (updates: Partial<Omit<UserSettings, "id" | "user_id">>) => {
    if (!user || !settings) return;
    const { data, error } = await supabase
      .from("user_settings")
      .update(updates)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to update settings:", error);
      throw error;
    }
    if (data) {
      setSettings(data as UserSettings);
      if ((data as UserSettings).background_style) {
        localStorage.setItem("polyphonic_bg", (data as UserSettings).background_style);
      }
    }
    return data;
  };

  return { settings, loading, updateSettings, reload: loadSettings, setSettings };
}
