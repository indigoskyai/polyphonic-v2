import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Settings, Palette, UserCircle,
  Save, Loader2, Check, Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChatGPTImport } from "@/components/ChatGPTImport";
import { Switch } from "@/components/ui/switch";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportStarted?: (importId: string, total: number) => void;
  onNavigate?: (path: string) => void;
  settings: import("@/hooks/useUserSettings").UserSettings | null;
  onUpdateSettings: (updates: Partial<Omit<import("@/hooks/useUserSettings").UserSettings, "id" | "user_id">>) => Promise<any>;
}

type Tab = "general" | "appearance" | "account";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "account", label: "Account", icon: UserCircle },
];

export function SettingsDialog({ open, onOpenChange, onImportStarted, onNavigate, settings, onUpdateSettings }: SettingsDialogProps) {
  const { user, signOut } = useAuth();
  const updateSettings = onUpdateSettings;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [saving, setSaving] = useState(false);

  // Local state for editing
  const [customInstructions, setCustomInstructions] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [localTheme, setLocalTheme] = useState("dark");
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [apiKeyPreview, setApiKeyPreview] = useState<string | null>(null);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [localNickname, setLocalNickname] = useState("");
  const [localOccupation, setLocalOccupation] = useState("");
  const [localAboutMe, setLocalAboutMe] = useState("");

  // Sync local state with loaded settings
  useEffect(() => {
    if (settings) {
      setCustomInstructions(settings.custom_instructions || "");
      setLocalTheme(settings.theme || "dark");
      setLocalNickname(settings.nickname || "");
      setLocalOccupation(settings.occupation || "");
      setLocalAboutMe(settings.about_me || "");
    }
  }, [settings]);

  // Load API key preview from encrypted table
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_api_keys")
      .select("key_preview")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setApiKeyPreview(data?.key_preview || null);
      });
  }, [user]);

  // Load display name from profile
  useEffect(() => {
    if (!user) return;
    setDisplayName(user.user_metadata?.display_name || user.email?.split("@")[0] || "");
  }, [user]);

  const handleSave = async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      await updateSettings(updates as any);
      toast({ title: "Settings saved" });
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.auth.updateUser({ data: { display_name: displayName } });
      await supabase.from("profiles").update({ display_name: displayName }).eq("user_id", user.id);
      toast({ title: "Profile updated" });
    } catch {
      toast({ title: "Failed to update profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-input)",
    border: "1px solid transparent",
    color: "var(--text-primary)",
    fontSize: "14px",
    fontFamily: "var(--font-sans)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: "6px",
    display: "block",
  };

  const descStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--text-muted)",
    marginTop: "4px",
    lineHeight: 1.5,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("p-0 gap-0 overflow-hidden transition-all duration-300 max-w-2xl")}
        aria-describedby={undefined}
        style={{
          background: "var(--bg-sidebar)",
          border: "1px solid rgba(255, 255, 255, 0.04)",
          borderRadius: "16px",
          maxHeight: "85vh",
        }}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>

        <div className={cn("flex overflow-hidden transition-all duration-300 h-[min(85vh,640px)]")}>
          {/* Sidebar */}
          <div className="w-48 shrink-0 py-4 px-2 flex flex-col gap-0.5 overflow-y-auto" style={{ borderRight: "1px solid rgba(255, 255, 255, 0.04)" }}>
            <div className="px-3 pb-3">
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Settings
              </span>
            </div>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors w-full"
                  )}
                  style={{
                    background: active ? "var(--gray-850)" : "transparent",
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    fontSize: "14px",
                    fontWeight: active ? 500 : 400,
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--gray-850)"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <Icon className="h-4 w-4 shrink-0" style={{ color: active ? "var(--text-primary)" : "var(--gray-500)" }} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 pb-10" style={{ maxHeight: "100%" }}>
            {/* GENERAL TAB */}
            {activeTab === "general" && (
              <div className="space-y-6">
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>General</h3>
                  <p style={descStyle}>Customize how your AI companion behaves in your conversations.</p>
                </div>

                {/* Persona Selector */}
                <div>
                  <label style={labelStyle}>Persona</label>
                  {(() => {
                    const personas = [
                      { id: "neutral", label: "Neutral", desc: "Clear, concise, and balanced. A thoughtful assistant that stays focused on your needs." },
                      { id: "resonant", label: "Resonant", desc: "Warm, emotionally attuned, and deeply empathetic. A companion that truly listens." },
                      { id: "experimental", label: "Polyphonic Experimental", desc: "An evolving persona under active development. Prompt and behavior are controlled by the admin." },
                    ];
                    const currentPersona = personas.find(p => p.id === (settings?.persona ?? "neutral")) || personas[0];
                    return (
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p style={{ ...descStyle, marginBottom: "8px" }}>Choose a conversational style for your companion.</p>
                          <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                            {currentPersona.desc}
                          </p>
                        </div>
                        <Select
                          value={settings?.persona ?? "neutral"}
                          onValueChange={(value) => handleSave({ persona: value })}
                        >
                          <SelectTrigger
                            className="w-[180px] shrink-0"
                            style={{
                              background: "var(--bg-input)",
                              border: "1px solid transparent",
                              color: "var(--text-primary)",
                              fontSize: "14px",
                            }}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent
                            className="z-[100]"
                          >
                            {personas.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: "13px" }}>{p.label}</div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label style={labelStyle}>Custom Instructions</label>
                  <textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="Share about yourself, your preferences, how you'd like your companion to respond..."
                    rows={6}
                    className="w-full rounded-lg px-3 py-3 resize-none outline-none focus:ring-1"
                    style={{
                      ...inputStyle,
                      lineHeight: 1.6,
                      focusRing: "var(--gray-500)",
                    } as React.CSSProperties}
                  />
                  <p style={descStyle}>
                    These instructions are included in every conversation to personalize your companion's responses.
                  </p>
                </div>

                <button
                  onClick={() => handleSave({ custom_instructions: customInstructions })}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                  style={{
                    background: "var(--text-primary)",
                    color: "var(--bg-sidebar)",
                    fontSize: "13px",
                    fontWeight: 500,
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </button>

                {/* About You */}
                <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "8px" }}>
                  <label style={{ ...labelStyle, fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>About You</label>
                  <div className="space-y-4">
                    <div>
                      <label style={labelStyle}>What should your companion call you?</label>
                      <input
                        value={localNickname}
                        onChange={(e) => setLocalNickname(e.target.value)}
                        placeholder="Your name or nickname"
                        className="w-full rounded-lg px-3 py-2 outline-none focus:ring-1"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>What do you do?</label>
                      <input
                        value={localOccupation}
                        onChange={(e) => setLocalOccupation(e.target.value)}
                        placeholder="Your occupation or role"
                        className="w-full rounded-lg px-3 py-2 outline-none focus:ring-1"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Anything else you'd like your companion to know about you</label>
                      <textarea
                        value={localAboutMe}
                        onChange={(e) => setLocalAboutMe(e.target.value)}
                        placeholder="Interests, goals, communication preferences..."
                        rows={4}
                        className="w-full rounded-lg px-3 py-3 resize-none outline-none focus:ring-1"
                        style={{ ...inputStyle, lineHeight: 1.6 } as React.CSSProperties}
                      />
                    </div>
                    <button
                      onClick={() => handleSave({ nickname: localNickname, occupation: localOccupation, about_me: localAboutMe })}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                      style={{
                        background: "var(--text-primary)",
                        color: "var(--bg-sidebar)",
                        fontSize: "13px",
                        fontWeight: 500,
                        opacity: saving ? 0.7 : 1,
                      }}
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </button>
                  </div>
                </div>

                {/* Memory Toggle */}
                <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "8px" }}>
                  <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: "var(--bg-input)", border: "1px solid transparent" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>Memory</div>
                      <p style={{ ...descStyle, marginTop: "2px" }}>Allow your companion to form and use memories about you across conversations.</p>
                    </div>
                    <Switch
                      checked={settings?.memory_enabled ?? true}
                      onCheckedChange={(checked) => handleSave({ memory_enabled: checked })}
                    />
                  </div>
                </div>

                {/* Chat History Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: "var(--bg-input)", border: "1px solid transparent" }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>Chat History Reference</div>
                    <p style={{ ...descStyle, marginTop: "2px" }}>Allow your companion to reference information from past conversations.</p>
                  </div>
                  <Switch
                    checked={settings?.chat_history_enabled ?? true}
                    onCheckedChange={(checked) => handleSave({ chat_history_enabled: checked })}
                  />
                </div>

                <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "8px" }}>
                  <ChatGPTImport onImportStarted={onImportStarted} />
                </div>
              </div>
            )}

            {/* APPEARANCE TAB */}
            {activeTab === "appearance" && (
              <div className="space-y-6">
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Appearance</h3>
                  <p style={descStyle}>Customize the look and feel of your experience.</p>
                </div>

                <div>
                  <label style={labelStyle}>Theme</label>
                  <div className="flex gap-3">
                    {[
                      { id: "dark", label: "Neutral", desc: "Default dark theme" },
                      { id: "midnight", label: "Dim", desc: "Deeper blacks" },
                      { id: "lights-out", label: "Lights Out", desc: "True black" },
                    ].map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => {
                          setLocalTheme(theme.id);
                          handleSave({ theme: theme.id });
                        }}
                        className="flex-1 p-4 rounded-xl transition-colors text-left"
                        style={{
                          background: localTheme === theme.id ? "var(--gray-800)" : "var(--bg-input)",
                          border: localTheme === theme.id ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid transparent",
                        }}
                      >
                        <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>{theme.label}</span>
                        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>{theme.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ACCOUNT TAB */}
            {activeTab === "account" && (
              <div className="space-y-6">
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Account</h3>
                  <p style={descStyle}>Manage your profile and account settings.</p>
                </div>

                <div>
                  <label style={labelStyle}>Email</label>
                  <div
                    className="px-3 py-2 rounded-lg"
                    style={{ ...inputStyle, opacity: 0.7 }}
                  >
                    {user?.email}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Display Name</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 outline-none focus:ring-1"
                    style={inputStyle}
                  />
                </div>

                <button
                  onClick={handleUpdateProfile}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                  style={{
                    background: "var(--text-primary)",
                    color: "var(--bg-sidebar)",
                    fontSize: "13px",
                    fontWeight: 500,
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Profile
                </button>

                {/* OpenRouter API Key */}
                <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "8px" }}>
                  <label style={labelStyle}>OpenRouter API Key</label>
                  <p style={{ ...descStyle, marginTop: 0, marginBottom: "10px" }}>
                    Provide your own API key for unlimited usage. Get one at{" "}
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--text-primary)", textDecoration: "underline", textUnderlineOffset: "3px" }}
                    >
                      openrouter.ai/keys
                    </a>
                    . Without a key, you'll use shared free credits (limited).
                  </p>

                  {/* Status Badge — shown when a key is saved */}
                  {apiKeyPreview && (
                    <div className="flex items-center gap-2.5 mb-3 px-3 py-2.5 rounded-lg" style={{ background: "hsla(142, 71%, 45%, 0.1)", border: "1px solid hsla(142, 71%, 45%, 0.3)" }}>
                      <Check className="h-4 w-4 shrink-0" style={{ color: "hsl(142 71% 45%)" }} />
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "hsl(142 71% 45%)" }}>Key active</span>
                      <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "monospace" }}>{apiKeyPreview}</span>
                      <button
                        onClick={async () => {
                          setSavingApiKey(true);
                          try {
                            await supabase.rpc("delete_user_api_key");
                            setApiKeyPreview(null);
                            toast({ title: "API key removed" });
                          } catch {
                            toast({ title: "Failed to remove key", variant: "destructive" });
                          } finally {
                            setSavingApiKey(false);
                          }
                        }}
                        className="ml-auto p-1 rounded hover:bg-white/10"
                        disabled={savingApiKey}
                        title="Remove API key"
                      >
                        <Trash2 className="h-3.5 w-3.5" style={{ color: "hsl(0 65% 50%)" }} />
                      </button>
                    </div>
                  )}

                  <input
                    type="password"
                    value={openrouterApiKey}
                    onChange={(e) => { setOpenrouterApiKey(e.target.value); setApiKeyError(null); }}
                    placeholder={apiKeyPreview ? "Enter new key to replace..." : "sk-or-v1-..."}
                    className="w-full rounded-lg px-3 py-2 outline-none focus:ring-1"
                    style={{
                      ...inputStyle,
                      ...(apiKeyError ? { borderColor: "hsl(0 65% 50%)" } : {}),
                    }}
                  />
                  {apiKeyError && (
                    <p style={{ fontSize: "12px", color: "hsl(0 65% 50%)", marginTop: "4px" }}>{apiKeyError}</p>
                  )}
                  <p style={{ ...descStyle, marginTop: "6px" }}>
                    Your key is encrypted at rest and never returned to the browser after saving.
                  </p>
                </div>

                <button
                  onClick={async () => {
                    if (!openrouterApiKey.trim()) return;
                    setSavingApiKey(true);
                    setApiKeyError(null);
                    try {
                      const trimmedKey = openrouterApiKey.trim();
                      if (!trimmedKey.startsWith("sk-or-")) {
                        setApiKeyError("Key must start with \"sk-or-\"");
                        setSavingApiKey(false);
                        return;
                      }
                      if (trimmedKey.length < 20) {
                        setApiKeyError("Key must be at least 20 characters");
                        setSavingApiKey(false);
                        return;
                      }
                      const { error } = await supabase.rpc("save_user_api_key", { p_key: trimmedKey });
                      if (error) throw error;
                      // Refresh preview
                      const { data } = await supabase
                        .from("user_api_keys")
                        .select("key_preview")
                        .eq("user_id", user!.id)
                        .maybeSingle();
                      setApiKeyPreview(data?.key_preview || null);
                      setOpenrouterApiKey("");
                      toast({ title: "API key saved" });
                    } catch {
                      toast({ title: "Failed to save API key", variant: "destructive" });
                    } finally {
                      setSavingApiKey(false);
                    }
                  }}
                  disabled={savingApiKey || !openrouterApiKey.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                  style={{
                    background: "var(--text-primary)",
                    color: "var(--bg-sidebar)",
                    fontSize: "13px",
                    fontWeight: 500,
                    opacity: (savingApiKey || !openrouterApiKey.trim()) ? 0.7 : 1,
                  }}
                >
                  {savingApiKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save API Key
                </button>

                <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "20px" }}>
                  <button
                    onClick={() => { onOpenChange(false); signOut(); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                    style={{
                      background: "transparent",
                      border: "1px solid hsl(0 65% 50%)",
                      color: "hsl(0 65% 50%)",
                      fontSize: "13px",
                      fontWeight: 500,
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
