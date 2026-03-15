import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Save, Loader2, MessageSquare, Cpu, Users,
  BarChart3, Brain, Eye, Shield, ChevronRight, FlaskConical
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "prompts" | "models" | "users" | "usage" | "memories" | "conversations" | "experimental";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "prompts", label: "System Prompts", icon: MessageSquare },
  { id: "models", label: "Model Routing", icon: Cpu },
  { id: "experimental", label: "Experimental", icon: FlaskConical },
  { id: "users", label: "Users", icon: Users },
  { id: "usage", label: "Usage Stats", icon: BarChart3 },
  { id: "memories", label: "Memories", icon: Brain },
  { id: "conversations", label: "Conversations", icon: Eye },
];

interface SystemPrompt {
  id: string;
  feature_key: string;
  name: string;
  description: string | null;
  prompt: string;
  is_active: boolean;
}

interface ModelConfig {
  id: string;
  feature_key: string;
  model_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface UserProfile {
  user_id: string;
  display_name: string | null;
  created_at: string;
  roles: string[];
}

interface Memory {
  id: string;
  user_id: string;
  content: string;
  memory_type: string;
  created_at: string;
  relevance_score: number | null;
}

interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

const BACKEND_MODELS = [
  { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
  { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro Preview" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { id: "openai/gpt-4o", name: "GPT-4o" },
  { id: "openai/gpt-4o-2024-11-20", name: "GPT-4o (2024-11-20)" },
  { id: "openai/gpt-4o-2024-08-06", name: "GPT-4o (2024-08-06)" },
  { id: "openai/gpt-4o-2024-05-13", name: "GPT-4o (2024-05-13)" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
  { id: "openai/gpt-4o-mini-2024-07-18", name: "GPT-4o Mini (2024-07-18)" },
  { id: "openai/gpt-5", name: "GPT-5" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini" },
  { id: "openai/gpt-5-nano", name: "GPT-5 Nano" },
  { id: "openai/gpt-5.2", name: "GPT-5.2" },
];

export default function Admin() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("prompts");
  const [saving, setSaving] = useState(false);

  // Data states
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState({ users: 0, conversations: 0, messages: 0, memories: 0 });
  const [expPrompt, setExpPrompt] = useState("");
  const [expTemperature, setExpTemperature] = useState(0.7);
  const [expActive, setExpActive] = useState(true);
  const [expId, setExpId] = useState<string | null>(null);
  const [savingExp, setSavingExp] = useState(false);

  // Redirect non-admins
  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate("/chat", { replace: true });
    }
  }, [adminLoading, isAdmin, navigate]);

  // Load data based on active tab
  useEffect(() => {
    if (!isAdmin) return;
    loadTabData(activeTab);
  }, [activeTab, isAdmin]);

  const loadTabData = async (tab: Tab) => {
    switch (tab) {
      case "prompts": {
        const { data } = await supabase.from("system_prompts").select("*").order("feature_key");
        if (data) setPrompts(data);
        break;
      }
      case "models": {
        const { data } = await supabase.from("model_configs").select("*").order("feature_key");
        if (data) setModelConfigs(data);
        break;
      }
      case "users": {
        const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
        const { data: roles } = await supabase.from("user_roles").select("*");
        if (profiles) {
          setUsers(profiles.map((p) => ({
            user_id: p.user_id,
            display_name: p.display_name,
            created_at: p.created_at,
            roles: roles?.filter((r) => r.user_id === p.user_id).map((r) => r.role) || [],
          })));
        }
        break;
      }
      case "usage": {
        const [convRes, msgRes, memRes, profileRes] = await Promise.all([
          supabase.from("conversations").select("id", { count: "exact", head: true }),
          supabase.from("messages").select("id", { count: "exact", head: true }),
          supabase.from("memories").select("id", { count: "exact", head: true }),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
        ]);
        setStats({
          users: profileRes.count ?? 0,
          conversations: convRes.count ?? 0,
          messages: msgRes.count ?? 0,
          memories: memRes.count ?? 0,
        });
        break;
      }
      case "memories": {
        const { data } = await supabase.from("memories").select("*").order("created_at", { ascending: false }).limit(100);
        if (data) setMemories(data);
        break;
      }
      case "conversations": {
        const { data } = await supabase.from("conversations").select("*").order("updated_at", { ascending: false }).limit(100);
        if (data) setConversations(data);
        break;
      }
      case "experimental": {
        const { data } = await supabase.from("experimental_persona_config").select("*").limit(1).maybeSingle();
        if (data) {
          setExpId(data.id);
          setExpPrompt(data.system_prompt);
          setExpTemperature(data.temperature);
          setExpActive(data.is_active);
        }
        break;
      }
    }
  };

  const handleSavePrompt = async (prompt: SystemPrompt) => {
    setSaving(true);
    const { error } = await supabase.from("system_prompts").update({
      prompt: prompt.prompt,
      is_active: prompt.is_active,
    }).eq("id", prompt.id);
    setSaving(false);
    if (error) {
      toast({ title: "Failed to save prompt", variant: "destructive" });
    } else {
      toast({ title: "Prompt saved" });
    }
  };

  const handleSaveModelConfig = async (config: ModelConfig) => {
    setSaving(true);
    const { error } = await supabase.from("model_configs").update({
      model_id: config.model_id,
      is_active: config.is_active,
    }).eq("id", config.id);
    setSaving(false);
    if (error) {
      toast({ title: "Failed to save model config", variant: "destructive" });
    } else {
      toast({ title: "Model config saved" });
    }
  };

  const handleSaveExperimental = async () => {
    if (!expId) return;
    setSavingExp(true);
    const { error } = await supabase.from("experimental_persona_config").update({
      system_prompt: expPrompt,
      temperature: expTemperature,
      is_active: expActive,
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    }).eq("id", expId);
    setSavingExp(false);
    if (error) {
      toast({ title: "Failed to save experimental config", variant: "destructive" });
    } else {
      toast({ title: "Experimental persona saved" });
    }
  };

  const handleDeleteMemory = async (id: string) => {
    const { error } = await supabase.from("memories").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete memory", variant: "destructive" });
    } else {
      setMemories((prev) => prev.filter((m) => m.id !== id));
      toast({ title: "Memory deleted" });
    }
  };

  if (adminLoading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg-void)" }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }

  if (!isAdmin) return null;

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-input)",
    border: "1px solid hsl(var(--border-subtle))",
    color: "var(--text-primary)",
    fontSize: "14px",
    fontFamily: "var(--font-sans)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: "8px",
    display: "block",
  };

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-void)" }}>
      {/* Sidebar */}
      <div
        className="w-56 shrink-0 flex flex-col"
        style={{ background: "var(--bg-sidebar)", borderRight: "1px solid hsl(var(--border-subtle))" }}
      >
        <div className="p-4">
          <button
            onClick={() => navigate("/chat")}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors w-full"
            style={{ color: "var(--text-secondary)", fontSize: "13px" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Chat
          </button>
        </div>

        <div className="px-4 pb-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Admin
            </span>
          </div>
        </div>

        <div className="flex-1 px-2 space-y-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors w-full"
                style={{
                  background: active ? "var(--gray-850)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  fontSize: "14px",
                  fontWeight: active ? 500 : 400,
                }}
              >
                <Icon className="h-4 w-4 shrink-0" style={{ color: active ? "var(--text-primary)" : "var(--gray-500)" }} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto">

          {/* SYSTEM PROMPTS */}
          {activeTab === "prompts" && (
            <div className="space-y-6">
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)" }}>System Prompts</h2>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Edit the system prompts used by each feature. Changes take effect immediately.
                </p>
              </div>

              {prompts.map((prompt) => (
                <div
                  key={prompt.id}
                  className="rounded-xl p-5 space-y-4"
                  style={{ background: "var(--bg-card)", border: "1px solid hsl(var(--border-subtle))" }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>{prompt.name}</h3>
                      {prompt.description && (
                        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{prompt.description}</p>
                      )}
                    </div>
                    <span
                      className="px-2 py-0.5 rounded-md"
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        background: prompt.is_active ? "hsl(140 40% 20%)" : "hsl(0 40% 20%)",
                        color: prompt.is_active ? "hsl(140 60% 70%)" : "hsl(0 60% 70%)",
                      }}
                    >
                      {prompt.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div>
                    <label style={labelStyle}>Feature Key: {prompt.feature_key}</label>
                    <textarea
                      value={prompt.prompt}
                      onChange={(e) => setPrompts((prev) => prev.map((p) => p.id === prompt.id ? { ...p, prompt: e.target.value } : p))}
                      rows={6}
                      className="w-full rounded-lg px-3 py-3 resize-none outline-none focus:ring-1"
                      style={{ ...inputStyle, lineHeight: 1.6, fontFamily: "var(--font-mono)", fontSize: "13px" }}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleSavePrompt(prompt)}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                      style={{ background: "var(--text-primary)", color: "var(--bg-sidebar)", fontSize: "13px", fontWeight: 500 }}
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setPrompts((prev) => prev.map((p) => p.id === prompt.id ? { ...p, is_active: !p.is_active } : p));
                        handleSavePrompt({ ...prompt, is_active: !prompt.is_active });
                      }}
                      className="px-3 py-2 rounded-lg transition-colors"
                      style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", fontSize: "13px" }}
                    >
                      {prompt.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* MODEL ROUTING */}
          {activeTab === "models" && (
            <div className="space-y-6">
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)" }}>Model Routing</h2>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Configure which AI model powers each backend feature.
                </p>
              </div>

              {modelConfigs.map((config) => (
                <div
                  key={config.id}
                  className="rounded-xl p-5 space-y-4"
                  style={{ background: "var(--bg-card)", border: "1px solid hsl(var(--border-subtle))" }}
                >
                  <div>
                    <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>{config.name}</h3>
                    {config.description && (
                      <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{config.description}</p>
                    )}
                  </div>

                  <div>
                    <label style={labelStyle}>Model</label>
                    <select
                      value={config.model_id}
                      onChange={(e) => setModelConfigs((prev) => prev.map((c) => c.id === config.id ? { ...c, model_id: e.target.value } : c))}
                      className="w-full rounded-lg px-3 py-2.5 outline-none"
                      style={inputStyle}
                    >
                      {BACKEND_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => handleSaveModelConfig(config)}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                    style={{ background: "var(--text-primary)", color: "var(--bg-sidebar)", fontSize: "13px", fontWeight: 500 }}
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* EXPERIMENTAL PERSONA */}
          {activeTab === "experimental" && (
            <div className="space-y-6">
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)" }}>Experimental Persona</h2>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Control the system prompt and temperature for the "Polyphonic Experimental" persona. Changes take effect immediately for all users who select it.
                </p>
              </div>

              <div
                className="rounded-xl p-5 space-y-5"
                style={{ background: "var(--bg-card)", border: "1px solid hsl(var(--border-subtle))" }}
              >
                {/* Active toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>Status</h3>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>When inactive, users selecting this persona will get the default system prompt.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded-md"
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        background: expActive ? "hsl(140 40% 20%)" : "hsl(0 40% 20%)",
                        color: expActive ? "hsl(140 60% 70%)" : "hsl(0 60% 70%)",
                      }}
                    >
                      {expActive ? "Active" : "Inactive"}
                    </span>
                    <button
                      onClick={() => setExpActive(!expActive)}
                      className="px-3 py-1.5 rounded-lg transition-colors"
                      style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", fontSize: "12px" }}
                    >
                      {expActive ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>

                {/* System Prompt */}
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: "8px", display: "block" }}>
                    System Prompt
                  </label>
                  <textarea
                    value={expPrompt}
                    onChange={(e) => setExpPrompt(e.target.value)}
                    rows={12}
                    className="w-full rounded-lg px-3 py-3 resize-y outline-none focus:ring-1"
                    style={{ background: "var(--bg-input)", border: "1px solid hsl(var(--border-subtle))", color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-mono)", lineHeight: 1.6 }}
                  />
                </div>

                {/* Temperature */}
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: "8px", display: "block" }}>
                    Temperature: {expTemperature.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={expTemperature}
                    onChange={(e) => setExpTemperature(parseFloat(e.target.value))}
                    className="w-full accent-[hsl(var(--primary))]"
                  />
                  <div className="flex justify-between mt-1">
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Precise (0.0)</span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Creative (2.0)</span>
                  </div>
                </div>

                {/* Save */}
                <button
                  onClick={handleSaveExperimental}
                  disabled={savingExp}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                  style={{ background: "var(--text-primary)", color: "var(--bg-sidebar)", fontSize: "13px", fontWeight: 500, opacity: savingExp ? 0.7 : 1 }}
                >
                  {savingExp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </button>
              </div>
            </div>
          )}

          {/* USERS */}
          {activeTab === "users" && (
            <div className="space-y-6">
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)" }}>User Management</h2>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                  View registered users and their roles.
                </p>
              </div>

              <div className="space-y-2">
                {users.map((u) => (
                  <div
                    key={u.user_id}
                    className="flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{ background: "var(--bg-card)", border: "1px solid hsl(var(--border-subtle))" }}
                  >
                    <div>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                        {u.display_name || "Unnamed"}
                      </span>
                      <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                        Joined {new Date(u.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {u.roles.map((role) => (
                        <span
                          key={role}
                          className="px-2 py-0.5 rounded-md"
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            background: role === "admin" ? "hsl(280 40% 20%)" : "var(--bg-elevated)",
                            color: role === "admin" ? "hsl(280 60% 75%)" : "var(--text-secondary)",
                          }}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {users.length === 0 && (
                  <p style={{ fontSize: "14px", color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>
                    No users found
                  </p>
                )}
              </div>
            </div>
          )}

          {/* USAGE STATS */}
          {activeTab === "usage" && (
            <div className="space-y-6">
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)" }}>Usage Statistics</h2>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Platform-wide usage statistics.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Total Users", value: stats.users, icon: Users },
                  { label: "Conversations", value: stats.conversations, icon: MessageSquare },
                  { label: "Messages", value: stats.messages, icon: Eye },
                  { label: "Memories", value: stats.memories, icon: Brain },
                ].map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={stat.label}
                      className="p-5 rounded-xl"
                      style={{ background: "var(--bg-card)", border: "1px solid hsl(var(--border-subtle))" }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
                        <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                          {stat.label}
                        </span>
                      </div>
                      <div style={{ fontSize: "32px", fontWeight: 600, color: "var(--text-primary)" }}>{stat.value}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MEMORIES */}
          {activeTab === "memories" && (
            <div className="space-y-6">
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)" }}>Memory Management</h2>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                  View and manage all user memories. Showing most recent 100.
                </p>
              </div>

              <div className="space-y-2">
                {memories.map((m) => (
                  <div
                    key={m.id}
                    className="px-4 py-3 rounded-xl"
                    style={{ background: "var(--bg-card)", border: "1px solid hsl(var(--border-subtle))" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: "14px", color: "var(--text-primary)", lineHeight: 1.5 }}>{m.content}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span
                            className="px-1.5 py-0.5 rounded"
                            style={{ fontSize: "11px", fontWeight: 600, background: "var(--bg-elevated)", color: "var(--text-muted)" }}
                          >
                            {m.memory_type}
                          </span>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {new Date(m.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteMemory(m.id)}
                        className="shrink-0 px-2 py-1 rounded-lg transition-colors"
                        style={{ fontSize: "12px", color: "hsl(0 60% 60%)", background: "transparent" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "hsl(0 40% 15%)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {memories.length === 0 && (
                  <p style={{ fontSize: "14px", color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>
                    No memories found
                  </p>
                )}
              </div>
            </div>
          )}

          {/* CONVERSATIONS */}
          {activeTab === "conversations" && (
            <div className="space-y-6">
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)" }}>Conversation Oversight</h2>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                  View recent conversations across all users. Showing most recent 100.
                </p>
              </div>

              <div className="space-y-2">
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{ background: "var(--bg-card)", border: "1px solid hsl(var(--border-subtle))" }}
                  >
                    <div>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                        {c.title || "Untitled"}
                      </span>
                      <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                        {new Date(c.updated_at).toLocaleString()}
                      </p>
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      {c.user_id.slice(0, 8)}...
                    </span>
                  </div>
                ))}
                {conversations.length === 0 && (
                  <p style={{ fontSize: "14px", color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>
                    No conversations found
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
