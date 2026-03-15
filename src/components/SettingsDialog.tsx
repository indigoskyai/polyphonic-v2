import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Settings, Cpu, Palette, BarChart3, UserCircle,
  Save, Loader2, ChevronRight, X, Brain, Pencil, Trash2, Check, Upload, ArrowLeft, Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GLASS_DROPDOWN_STYLE } from "@/lib/glassmorphism";
import { AVAILABLE_MODELS, DEFAULT_MAX_TEMP } from "@/components/ModelSelector";
import { ChatGPTImport } from "@/components/ChatGPTImport";
import { PersonaReview } from "@/components/PersonaReview";
import { ConflictResolver } from "@/components/ConflictResolver";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BACKGROUND_OPTIONS } from "@/lib/backgrounds";
import { GLASS_STYLE, GLASS_HOVER, GLASS_BORDER, GLASS_ICON, GLASS_ICON_HOVER, GLASS_LABEL, GLASS_MUTED, GLASS_INPUT_BG, GLASS_INPUT_BORDER, GLASS_DIVIDER, GLASS_ACTIVE, GLASS_ACTIVE_BORDER } from "@/lib/glassmorphism";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportStarted?: (importId: string, total: number) => void;
  onNavigate?: (path: string) => void;
  settings: import("@/hooks/useUserSettings").UserSettings | null;
  onUpdateSettings: (updates: Partial<Omit<import("@/hooks/useUserSettings").UserSettings, "id" | "user_id">>) => Promise<any>;
  frosted?: boolean;
}

// Models are imported from ModelSelector

type Tab = "general" | "memory" | "models" | "appearance" | "usage" | "account";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "models", label: "Mind & API", icon: Cpu },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "usage", label: "Usage", icon: BarChart3 },
  { id: "account", label: "Account", icon: UserCircle },
];

export function SettingsDialog({ open, onOpenChange, onImportStarted, onNavigate, settings, onUpdateSettings, frosted }: SettingsDialogProps) {
  const { user, signOut } = useAuth();
  const updateSettings = onUpdateSettings;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [saving, setSaving] = useState(false);

  // Local state for editing
  const [customInstructions, setCustomInstructions] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [displayName, setDisplayName] = useState("");
  const [conversationCount, setConversationCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [memoryCount, setMemoryCount] = useState(0);
  const [localTheme, setLocalTheme] = useState("dark");
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [apiKeyPreview, setApiKeyPreview] = useState<string | null>(null);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [localNickname, setLocalNickname] = useState("");
  const [localOccupation, setLocalOccupation] = useState("");
  const [localAboutMe, setLocalAboutMe] = useState("");
  const [localJournalModel, setLocalJournalModel] = useState<string>("");
  const [localDreamerModel, setLocalDreamerModel] = useState<string>("");
  const [localObserverModels, setLocalObserverModels] = useState<[string, string, string]>(["x-ai/grok-3", "google/gemini-3-pro-preview", "moonshotai/kimi-k2.5"]);
  const [localSynthesisModel, setLocalSynthesisModel] = useState<string>("");
  const [localBeliefModel, setLocalBeliefModel] = useState<string>("");
  const [localMemoryModel, setLocalMemoryModel] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Memory tab state
  interface MemoryItem {
    id: string;
    content: string;
    memory_type: string;
    provenance: any;
    created_at: string;
  }
  const [aiMemories, setAiMemories] = useState<MemoryItem[]>([]);
  const [importedMemories, setImportedMemories] = useState<MemoryItem[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [showImported, setShowImported] = useState(false);
  const [memoriesView, setMemoriesView] = useState(false);

  // Persona & conflict state
  const [allPersonas, setAllPersonas] = useState<any[]>([]);
  const [personaLoading, setPersonaLoading] = useState(false);
  const [unresolvedConflicts, setUnresolvedConflicts] = useState(0);

  // Clear imported data state
  const [importedMemoryCount, setImportedMemoryCount] = useState(0);
  const [importedProfileCount, setImportedProfileCount] = useState(0);
  const [clearingImport, setClearingImport] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [memorySearchQuery, setMemorySearchQuery] = useState("");
  type MemoryFilter = "all" | "ai" | "imported";
  const [memoryFilter, setMemoryFilter] = useState<MemoryFilter>("all");

  // Sync local state with loaded settings
  useEffect(() => {
    if (settings) {
      setCustomInstructions(settings.custom_instructions || "");
      setSelectedModel(settings.selected_model || "openai/gpt-4.1");
      setTemperature(settings.temperature ?? 0.7);
      setMaxTokens(settings.max_tokens ?? 4096);
      setLocalTheme(settings.theme || "dark");
      setLocalNickname(settings.nickname || "");
      setLocalOccupation(settings.occupation || "");
      setLocalAboutMe(settings.about_me || "");
      setLocalJournalModel(settings.journal_model || "");
      setLocalDreamerModel((settings as any).dreamer_model || "");
      const obs = (settings as any).observer_models;
      if (Array.isArray(obs) && obs.length === 3) setLocalObserverModels(obs as [string, string, string]);
      setLocalSynthesisModel((settings as any).synthesis_model || "");
      setLocalBeliefModel((settings as any).belief_model || "");
      setLocalMemoryModel((settings as any).memory_model || "");
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

  // Load usage stats when usage tab is active
  useEffect(() => {
    if (activeTab !== "usage" || !user) return;
    Promise.all([
      supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("memories").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]).then(([convRes, msgRes, memRes]) => {
      setConversationCount(convRes.count ?? 0);
      setMessageCount(msgRes.count ?? 0);
      setMemoryCount(memRes.count ?? 0);
    });
  }, [activeTab, user]);

  // Load memories, personas, and conflict count when memory tab is active
  useEffect(() => {
    if (activeTab !== "memory" || !user) return;
    setMemoriesLoading(true);
    setPersonaLoading(true);
    Promise.all([
      supabase
        .from("memories")
        .select("id, content, memory_type, provenance, created_at")
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("companion_profiles")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("memory_conflicts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "unresolved"),
    ]).then(([memRes, personaRes, conflictsRes]) => {
      // Personas (all of them)
      setAllPersonas(personaRes.data || []);
      setImportedProfileCount((personaRes.data || []).length);
      setPersonaLoading(false);

      // Conflict count
      setUnresolvedConflicts(conflictsRes.count ?? 0);

      const all = (memRes.data || []) as MemoryItem[];
      const imported: MemoryItem[] = [];
      const organic: MemoryItem[] = [];
      for (const m of all) {
        const src = (m.provenance as any)?.source;
        if (src === "import" || src === "chatgpt_import") {
          imported.push(m);
        } else {
          organic.push(m);
        }
      }
      setAiMemories(organic);
      setImportedMemories(imported);
      setImportedMemoryCount(imported.length);
      setMemoriesLoading(false);
    });
  }, [activeTab, user]);

  const handleDeleteMemory = async (id: string) => {
    await supabase.from("memories").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("id", id);
    setAiMemories((prev) => prev.filter((m) => m.id !== id));
    setImportedMemories((prev) => prev.filter((m) => m.id !== id));
    toast({ title: "Memory removed" });
  };

  const handleSaveMemoryEdit = async (id: string) => {
    await supabase.from("memories").update({ content: editingContent }).eq("id", id);
    setAiMemories((prev) => prev.map((m) => (m.id === id ? { ...m, content: editingContent } : m)));
    setImportedMemories((prev) => prev.map((m) => (m.id === id ? { ...m, content: editingContent } : m)));
    setEditingMemoryId(null);
    toast({ title: "Memory updated" });
  };

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
    background: frosted ? GLASS_INPUT_BG : "var(--bg-input)",
    border: frosted ? "1px solid rgba(255, 255, 255, 0.04)" : "1px solid transparent",
    color: "var(--text-primary)",
    fontSize: "14px",
    fontFamily: "var(--font-sans)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 500,
    color: frosted ? "rgba(255, 255, 255, 0.55)" : "var(--text-secondary)",
    marginBottom: "6px",
    display: "block",
  };

  const descStyle: React.CSSProperties = {
    fontSize: "12px",
    color: frosted ? GLASS_MUTED : "var(--text-muted)",
    marginTop: "4px",
    lineHeight: 1.5,
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setMemoriesView(false); onOpenChange(v); }}>
      <DialogContent
        className={cn("p-0 gap-0 overflow-hidden transition-all duration-300", memoriesView ? "max-w-4xl" : "max-w-2xl")}
        aria-describedby={undefined}
        style={frosted ? {
          ...GLASS_STYLE,
          border: "1px solid rgba(255, 255, 255, 0.04)",
          borderRadius: "16px",
          maxHeight: "85vh",
        } : {
          background: "var(--bg-sidebar)",
          border: "1px solid rgba(255, 255, 255, 0.04)",
          borderRadius: "16px",
          maxHeight: "85vh",
        }}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>

        <div className={cn("flex overflow-hidden transition-all duration-300", memoriesView ? "h-[min(90vh,780px)]" : "h-[min(85vh,640px)]")}>
          {/* Sidebar */}
          <div className="w-48 shrink-0 py-4 px-2 flex flex-col gap-0.5 overflow-y-auto" style={{ borderRight: frosted ? "1px solid rgba(255, 255, 255, 0.03)" : "1px solid rgba(255, 255, 255, 0.04)" }}>
            <div className="px-3 pb-3">
              <span style={{ fontSize: "13px", fontWeight: 600, color: frosted ? GLASS_ICON : "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Settings
              </span>
            </div>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setMemoriesView(false); }}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors w-full"
                  )}
                  style={{
                    background: active ? (frosted ? GLASS_BORDER : "var(--gray-850)") : "transparent",
                    color: active ? "var(--text-primary)" : frosted ? "rgba(255, 255, 255, 0.55)" : "var(--text-secondary)",
                    fontSize: "14px",
                    fontWeight: active ? 500 : 400,
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = frosted ? GLASS_HOVER : "var(--gray-850)"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <Icon className="h-4 w-4 shrink-0" style={{ color: active ? "var(--text-primary)" : frosted ? GLASS_MUTED : "var(--gray-500)" }} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 pb-10" style={{ maxHeight: "100%" }}>
            {memoriesView ? (
              /* INLINE MEMORIES MANAGEMENT VIEW */
              (() => {
                const allMemories = [...aiMemories, ...importedMemories].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                const isImported = (m: MemoryItem) => {
                  const src = (m.provenance as any)?.source;
                  return src === "import" || src === "chatgpt_import";
                };
                let filteredMemories = allMemories;
                if (memoryFilter === "ai") filteredMemories = filteredMemories.filter((m) => !isImported(m));
                if (memoryFilter === "imported") filteredMemories = filteredMemories.filter((m) => isImported(m));
                if (memorySearchQuery.trim()) {
                  const q = memorySearchQuery.toLowerCase();
                  filteredMemories = filteredMemories.filter((m) => m.content.toLowerCase().includes(q));
                }
                const importedCount = allMemories.filter(isImported).length;
                const aiCount = allMemories.length - importedCount;
                const filterTabs: { id: MemoryFilter; label: string; count: number }[] = [
                  { id: "all", label: "All", count: allMemories.length },
                  { id: "ai", label: "AI-Generated", count: aiCount },
                  { id: "imported", label: "Imported", count: importedCount },
                ];

                return (
                  <div className="space-y-4">
                    {/* Header with back button */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setMemoriesView(false)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: "var(--text-secondary)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = frosted ? GLASS_HOVER : "var(--gray-850)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <div>
                        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>Saved Memories</h3>
                        <p style={{ fontSize: "12px", color: frosted ? GLASS_MUTED : "var(--text-muted)", marginTop: "2px" }}>
                          {allMemories.length} memories · Browse, search, edit, or remove
                        </p>
                      </div>
                    </div>

                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: frosted ? GLASS_MUTED : "var(--text-muted)" }} />
                      <input
                        value={memorySearchQuery}
                        onChange={(e) => setMemorySearchQuery(e.target.value)}
                        placeholder="Search memories..."
                        className="w-full rounded-lg pl-10 pr-3 py-2.5 outline-none focus:ring-1"
                        style={inputStyle}
                      />
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex gap-2">
                      {filterTabs.map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setMemoryFilter(tab.id)}
                          className="px-3 py-1.5 rounded-lg text-sm transition-colors"
                          style={{
                            background: memoryFilter === tab.id ? (frosted ? GLASS_ACTIVE : "var(--gray-800)") : "transparent",
                            border: memoryFilter === tab.id ? (frosted ? `1px solid ${GLASS_ACTIVE_BORDER}` : "1px solid hsl(var(--border-hover))") : "1px solid transparent",
                            color: memoryFilter === tab.id ? "var(--text-primary)" : (frosted ? GLASS_MUTED : "var(--text-secondary)"),
                            fontWeight: memoryFilter === tab.id ? 500 : 400,
                            fontSize: "13px",
                          }}
                        >
                          {tab.label} ({tab.count})
                        </button>
                      ))}
                    </div>

                    {/* Memory List */}
                    <div className="rounded-xl overflow-hidden" style={{ background: frosted ? GLASS_INPUT_BG : "var(--bg-input)", border: frosted ? `1px solid ${GLASS_INPUT_BORDER}` : "1px solid transparent", maxHeight: "calc(85vh - 280px)", overflowY: "auto" }}>
                      {memoriesLoading ? (
                        <div className="flex items-center justify-center py-16">
                          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--text-muted)" }} />
                        </div>
                      ) : filteredMemories.length === 0 ? (
                        <div className="py-16 text-center">
                          <Brain className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--text-muted)", opacity: 0.4 }} />
                          <p style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                            {memorySearchQuery ? "No memories match your search." : "No memories yet."}
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y" style={{ borderColor: frosted ? GLASS_DIVIDER : "rgba(255, 255, 255, 0.04)" }}>
                          {filteredMemories.map((m) => (
                            <div key={m.id} className="flex items-start gap-3 px-4 py-3 group">
                              <div className="flex-1 min-w-0">
                                {editingMemoryId === m.id ? (
                                  <div className="flex flex-col gap-2">
                                    <textarea
                                      value={editingContent}
                                      onChange={(e) => setEditingContent(e.target.value)}
                                      className="w-full rounded-lg px-3 py-2 outline-none text-sm resize-y"
                                      style={{ background: frosted ? GLASS_INPUT_BG : "var(--gray-800)", color: "var(--text-primary)", border: frosted ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(255, 255, 255, 0.08)", minHeight: "80px", maxHeight: "160px", overflowY: "auto", lineHeight: 1.6, wordBreak: "break-word" }}
                                      autoFocus
                                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveMemoryEdit(m.id); } if (e.key === "Escape") setEditingMemoryId(null); }}
                                    />
                                    <div className="flex items-center gap-2 justify-end">
                                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Enter to save · Esc to cancel</span>
                                      <button onClick={() => handleSaveMemoryEdit(m.id)} className="p-1 rounded hover:bg-white/10">
                                        <Check className="h-3.5 w-3.5" style={{ color: "var(--text-primary)" }} />
                                      </button>
                                      <button onClick={() => setEditingMemoryId(null)} className="p-1 rounded hover:bg-white/10">
                                        <X className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <p style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.5, wordBreak: "break-word" }}>{m.content}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ background: frosted ? GLASS_BORDER : "var(--gray-800)", color: frosted ? GLASS_MUTED : "var(--text-muted)", border: "none" }}>
                                        {m.memory_type}
                                      </Badge>
                                      {isImported(m) && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ color: frosted ? GLASS_MUTED : "var(--text-muted)", borderColor: frosted ? "rgba(255, 255, 255, 0.15)" : "var(--gray-700)" }}>
                                          imported
                                        </Badge>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                              {editingMemoryId !== m.id && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <button
                                    onClick={() => { setEditingMemoryId(m.id); setEditingContent(m.content); }}
                                    className="p-1 rounded hover:bg-white/10"
                                  >
                                    <Pencil className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                                  </button>
                                  <button onClick={() => handleDeleteMemory(m.id)} className="p-1 rounded hover:bg-white/10">
                                    <Trash2 className="h-3.5 w-3.5" style={{ color: "hsl(0 65% 50%)" }} />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
            <>
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
                              background: frosted ? GLASS_INPUT_BG : "var(--bg-input)",
                              border: frosted ? "1px solid rgba(255, 255, 255, 0.04)" : "1px solid transparent",
                              color: "var(--text-primary)",
                              fontSize: "14px",
                            }}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent
                            style={frosted ? GLASS_DROPDOWN_STYLE : undefined}
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
                <div style={{ borderTop: frosted ? "1px solid rgba(255, 255, 255, 0.03)" : "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "8px" }}>
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

                <div style={{ borderTop: frosted ? "1px solid rgba(255, 255, 255, 0.03)" : "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "8px" }}>
                  <ChatGPTImport onImportStarted={onImportStarted} />
                </div>
              </div>
            )}

            {/* MEMORY TAB */}
            {activeTab === "memory" && (
              <div className="space-y-6">
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Memory</h3>
                  <p style={descStyle}>Control how your AI companion remembers and uses information about you.</p>
                </div>

                {/* Memory Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: frosted ? GLASS_INPUT_BG : "var(--bg-input)", border: frosted ? "1px solid rgba(255, 255, 255, 0.04)" : "1px solid transparent" }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>Memory</div>
                    <p style={{ ...descStyle, marginTop: "2px" }}>Allow your companion to form and use memories about you across conversations.</p>
                  </div>
                  <Switch
                    checked={settings?.memory_enabled ?? true}
                    onCheckedChange={(checked) => handleSave({ memory_enabled: checked })}
                  />
                </div>

                {/* Chat History Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: frosted ? GLASS_INPUT_BG : "var(--bg-input)", border: frosted ? "1px solid rgba(255, 255, 255, 0.04)" : "1px solid transparent" }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>Chat History Reference</div>
                    <p style={{ ...descStyle, marginTop: "2px" }}>Allow your companion to reference information from past conversations.</p>
                  </div>
                  <Switch
                    checked={settings?.chat_history_enabled ?? true}
                    onCheckedChange={(checked) => handleSave({ chat_history_enabled: checked })}
                  />
                </div>

                {/* Manage Memories Button */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Saved Memories</label>
                  </div>
                  <button
                    onClick={() => {
                      setMemoriesView(true);
                      setMemorySearchQuery("");
                      setMemoryFilter("all");
                    }}
                    className="w-full flex items-center gap-3 p-4 rounded-xl transition-colors"
                    style={{ background: frosted ? GLASS_INPUT_BG : "var(--bg-input)", border: frosted ? "1px solid rgba(255, 255, 255, 0.04)" : "1px solid transparent" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = frosted ? GLASS_HOVER : "var(--gray-850)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = frosted ? GLASS_INPUT_BG : "var(--bg-input)"; }}
                  >
                    <Brain className="h-5 w-5" style={{ color: frosted ? GLASS_MUTED : "var(--text-muted)" }} />
                    <div className="flex-1 text-left">
                      <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>Manage Memories</div>
                      <p style={{ fontSize: "12px", color: frosted ? GLASS_MUTED : "var(--text-muted)", marginTop: "2px" }}>
                        Browse, search, edit, and remove saved memories
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4" style={{ color: frosted ? GLASS_MUTED : "var(--text-muted)" }} />
                  </button>
                </div>

                {/* Memory Conflicts */}
                {unresolvedConflicts > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <label style={{ ...labelStyle, marginBottom: 0 }}>Memory Conflicts</label>
                      <Badge variant="secondary" style={{ fontSize: "11px", background: "hsl(45 90% 50% / 0.15)", color: "hsl(45 90% 50%)", border: "1px solid hsl(45 90% 50% / 0.3)" }}>
                        {unresolvedConflicts}
                      </Badge>
                    </div>
                    <div className="p-4 rounded-xl" style={{ background: frosted ? GLASS_INPUT_BG : "var(--bg-input)", border: frosted ? "1px solid rgba(255, 255, 255, 0.04)" : "1px solid transparent" }}>
                      <ConflictResolver
                        userId={user!.id}
                        onResolved={() => setUnresolvedConflicts(0)}
                      />
                    </div>
                  </div>
                )}

                {/* Companion Personas */}
                <div style={{ borderTop: frosted ? "1px solid rgba(255, 255, 255, 0.03)" : "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "8px" }}>
                  <label style={{ ...labelStyle, fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Companion Personas</label>
                  {personaLoading ? (
                    <div className="flex items-center gap-2 py-4">
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--text-muted)" }} />
                      <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Loading personas...</span>
                    </div>
                  ) : allPersonas.length > 0 ? (
                    <PersonaReview
                      personas={allPersonas.map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        source_platform: p.source_platform || "chatgpt",
                        linguistic_fingerprint: p.linguistic_fingerprint || {},
                        psychological_profile: p.psychological_profile || {},
                        companion_summary: p.companion_summary || "",
                        system_prompt_fragment: p.system_prompt_fragment || "",
                        behavioral_rules: p.behavioral_rules || [],
                        conversations_analyzed: p.conversations_analyzed || 0,
                        date_range_start: p.date_range_start || null,
                        date_range_end: p.date_range_end || null,
                        extraction_model: p.extraction_model || "",
                        is_active: p.is_active,
                        user_approved: p.user_approved,
                      }))}
                      mode="settings"
                      onUpdate={() => {
                        // Reload personas after changes
                        if (!user) return;
                        supabase
                          .from("companion_profiles")
                          .select("*")
                          .eq("user_id", user.id)
                          .order("created_at", { ascending: false })
                          .then(({ data }) => setAllPersonas(data || []));
                      }}
                    />
                  ) : (
                    <div className="p-4 rounded-xl text-center" style={{ background: frosted ? GLASS_INPUT_BG : "var(--bg-input)", border: frosted ? "1px solid rgba(255, 255, 255, 0.04)" : "1px solid transparent" }}>
                      <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                        No companion personas. Import your ChatGPT history to generate companion personalities.
                      </p>
                    </div>
                  )}
                </div>

                {/* Clear Imported Data */}
                {(importedMemoryCount > 0 || importedProfileCount > 0) && (
                  <div style={{ borderTop: frosted ? "1px solid rgba(255, 255, 255, 0.03)" : "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "8px" }}>
                    <label style={{ ...labelStyle, fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Imported Data</label>
                    <div className="p-4 rounded-xl space-y-3" style={{ background: frosted ? GLASS_INPUT_BG : "var(--bg-input)", border: frosted ? "1px solid rgba(255, 255, 255, 0.04)" : "1px solid transparent" }}>
                      <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                        {importedMemoryCount} imported memor{importedMemoryCount === 1 ? "y" : "ies"} and {importedProfileCount} companion profile{importedProfileCount === 1 ? "" : "s"} from ChatGPT import.
                      </p>
                      {showClearConfirm ? (
                        <div className="space-y-2">
                          <p style={{ fontSize: "12px", color: "hsl(0 65% 55%)", fontWeight: 500 }}>
                            This will permanently delete all imported memories, companion profiles, and memory conflicts. This cannot be undone.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                if (!user) return;
                                setClearingImport(true);
                                try {
                                  await supabase
                                    .from("memories")
                                    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                                    .eq("user_id", user.id)
                                    .filter("provenance->>source", "in", '("chatgpt_import","import")');
                                  await supabase
                                    .from("companion_profiles")
                                    .delete()
                                    .eq("user_id", user.id);
                                  await supabase
                                    .from("memory_conflicts")
                                    .delete()
                                    .eq("user_id", user.id);
                                  setImportedMemoryCount(0);
                                  setImportedProfileCount(0);
                                  setImportedMemories([]);
                                  setAllPersonas([]);
                                  setUnresolvedConflicts(0);
                                  setShowClearConfirm(false);
                                  toast({ title: "Imported data cleared" });
                                } catch (e: any) {
                                  toast({ title: "Failed to clear data", description: e.message, variant: "destructive" });
                                } finally {
                                  setClearingImport(false);
                                }
                              }}
                              disabled={clearingImport}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs"
                              style={{
                                background: "hsl(0 65% 50%)",
                                color: "white",
                                fontWeight: 500,
                                opacity: clearingImport ? 0.7 : 1,
                              }}
                            >
                              {clearingImport ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              Confirm Delete
                            </button>
                            <button
                              onClick={() => setShowClearConfirm(false)}
                              className="px-3 py-1.5 rounded-lg transition-colors text-xs"
                              style={{ color: "var(--text-muted)", background: "transparent" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowClearConfirm(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs"
                          style={{
                            background: "transparent",
                            border: "1px solid hsl(0 65% 50% / 0.3)",
                            color: "hsl(0 65% 55%)",
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                          Clear All Imported Data
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MIND & API TAB */}
            {activeTab === "models" && (
              <div className="space-y-6">
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Mind & API</h3>
                  <p style={descStyle}>Assign models to each cognitive role.</p>
                </div>

                {/* Role-based model grid */}
                {(() => {
                  const roleModelDropdown = (
                    label: string,
                    description: string,
                    value: string,
                    onChange: (v: string) => void,
                    defaultModel?: string,
                  ) => (
                    <div
                      className="rounded-lg px-4 py-3"
                      style={{ background: frosted ? "rgba(255,255,255,0.03)" : "var(--bg-card)", border: frosted ? "1px solid rgba(255,255,255,0.06)" : "1px solid hsl(var(--border-subtle))" }}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{label}</span>
                          <p style={{ fontSize: "11px", color: frosted ? GLASS_MUTED : "var(--text-muted)", marginTop: "2px" }}>{description}</p>
                        </div>
                        <Select value={value || defaultModel || "__default__"} onValueChange={(v) => onChange(v === "__default__" ? "" : v)}>
                          <SelectTrigger className="w-44 shrink-0 rounded-lg" style={inputStyle}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">System Default</SelectItem>
                            {AVAILABLE_MODELS.map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );

                  return (
                    <div className="space-y-2">
                      {roleModelDropdown("Voice", "Chat responses", selectedModel, setSelectedModel, "anthropic/claude-opus-4.6")}
                      {roleModelDropdown("Journal", "Autonomous writing", localJournalModel, setLocalJournalModel, "anthropic/claude-opus-4.6")}
                      {roleModelDropdown("Dreamer", "Free-association", localDreamerModel, setLocalDreamerModel, "google/gemini-3-pro-preview")}
                      {roleModelDropdown("Observer 1", "Independent watcher", localObserverModels[0], (v) => setLocalObserverModels(p => [v, p[1], p[2]]), "x-ai/grok-4")}
                      {roleModelDropdown("Observer 2", "Independent watcher", localObserverModels[1], (v) => setLocalObserverModels(p => [p[0], v, p[2]]), "google/gemini-3-pro-preview")}
                      {roleModelDropdown("Observer 3", "Independent watcher", localObserverModels[2], (v) => setLocalObserverModels(p => [p[0], p[1], v]), "moonshotai/kimi-k2.5")}
                      {roleModelDropdown("Synthesis", "Cross-references", localSynthesisModel, setLocalSynthesisModel, "anthropic/claude-sonnet-4.6")}
                      {roleModelDropdown("Belief Challenger", "Challenges beliefs", localBeliefModel, setLocalBeliefModel, "google/gemini-3-pro-preview")}
                      {roleModelDropdown("Memory", "Extraction & reflection", localMemoryModel, setLocalMemoryModel, "google/gemini-3-pro-preview")}
                    </div>
                  );
                })()}

                {/* Advanced — collapsible */}
                <div>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 px-1 py-1 transition-colors"
                    style={{ color: frosted ? GLASS_MUTED : "var(--text-muted)", fontSize: "13px" }}
                  >
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-90")} />
                    Advanced
                  </button>

                  {showAdvanced && (
                    <div className="mt-3 space-y-5">
                      <div>
                        {(() => {
                          const currentModel = AVAILABLE_MODELS.find((m) => m.id === selectedModel);
                          const maxTemp = currentModel?.maxTemp ?? DEFAULT_MAX_TEMP;
                          const clampedTemp = Math.min(temperature, maxTemp);
                          if (clampedTemp !== temperature) {
                            setTimeout(() => setTemperature(clampedTemp), 0);
                          }
                          const getTemperatureLabel = (t: number) => {
                            if (t <= 0.3) return { text: "Focused and deterministic", warn: false };
                            if (t <= 0.7) return { text: "Balanced — recommended for most use", warn: false };
                            if (t <= 1.0) return { text: "Creative, more varied responses", warn: false };
                            return { text: "High randomness — responses may lose coherence", warn: true };
                          };
                          const label = getTemperatureLabel(clampedTemp);
                          return (
                            <>
                              <label style={labelStyle}>
                                Temperature: {clampedTemp.toFixed(1)}
                                {currentModel && (
                                  <span style={{ fontWeight: 400, color: frosted ? GLASS_MUTED : "var(--text-muted)", marginLeft: "8px" }}>
                                    (max {maxTemp.toFixed(1)} for {currentModel.name})
                                  </span>
                                )}
                              </label>
                              <input
                                type="range"
                                min="0"
                                max={maxTemp}
                                step="0.1"
                                value={clampedTemp}
                                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                className="w-full accent-white"
                              />
                              <div className="flex justify-between" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                <span>Precise</span>
                                <span>Creative</span>
                              </div>
                              <p style={{
                                fontSize: "12px",
                                marginTop: "6px",
                                color: label.warn ? "hsl(45 90% 55%)" : (frosted ? GLASS_MUTED : "var(--text-muted)"),
                                fontWeight: label.warn ? 500 : 400,
                              }}>
                                {label.warn && "⚠ "}{label.text}
                              </p>
                            </>
                          );
                        })()}
                      </div>

                      <div>
                        <label style={labelStyle}>Max Tokens</label>
                        <input
                          type="number"
                          value={maxTokens}
                          onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                          min={256}
                          max={128000}
                          className="w-32 rounded-lg px-3 py-2 outline-none focus:ring-1"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* OpenRouter API Key */}
                <div style={{ borderTop: frosted ? "1px solid rgba(255, 255, 255, 0.03)" : "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "8px" }}>
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
                    setSaving(true);
                    setApiKeyError(null);
                    try {
                      // 1. If user typed an API key, validate and save it
                      if (openrouterApiKey.trim()) {
                        const trimmedKey = openrouterApiKey.trim();
                        if (!trimmedKey.startsWith("sk-or-")) {
                          setApiKeyError("Key must start with \"sk-or-\"");
                          setSaving(false);
                          return;
                        }
                        if (trimmedKey.length < 20) {
                          setApiKeyError("Key must be at least 20 characters");
                          setSaving(false);
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
                      }
                      // 2. Save model settings
                      await updateSettings({
                        selected_model: selectedModel,
                        voice_model: selectedModel,
                        temperature,
                        max_tokens: maxTokens,
                        journal_model: localJournalModel || null,
                        dreamer_model: localDreamerModel || null,
                        observer_models: localObserverModels,
                        synthesis_model: localSynthesisModel || null,
                        belief_model: localBeliefModel || null,
                        memory_model: localMemoryModel || null,
                      } as any);
                      toast({ title: openrouterApiKey.trim() ? "Settings and API key saved" : "Settings saved" });
                    } catch {
                      toast({ title: "Failed to save settings", variant: "destructive" });
                    } finally {
                      setSaving(false);
                    }
                  }}
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
                          background: localTheme === theme.id ? (frosted ? GLASS_ACTIVE : "var(--gray-800)") : (frosted ? GLASS_INPUT_BG : "var(--bg-input)"),
                          border: localTheme === theme.id ? (frosted ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(255, 255, 255, 0.08)") : (frosted ? "1px solid rgba(255, 255, 255, 0.04)" : "1px solid transparent"),
                        }}
                      >
                        <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>{theme.label}</span>
                        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>{theme.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Background</label>
                  <div className="grid grid-cols-4 gap-3">
                    {BACKGROUND_OPTIONS.map((bg) => {
                      const isSelected = (settings?.background_style || "wallpaper") === bg.id;
                      const previewStyle: React.CSSProperties = bg.isImage
                        ? { backgroundImage: bg.css!, backgroundSize: "cover", backgroundPosition: "center 35%" }
                        : bg.css
                        ? { background: bg.css }
                        : { background: "var(--bg-content)" };

                      return (
                        <button
                          key={bg.id}
                          onClick={() => handleSave({ background_style: bg.id })}
                          className="flex flex-col items-center gap-1.5"
                        >
                          <div
                            className="w-full aspect-[16/10] rounded-lg transition-all relative flex items-center justify-center"
                            style={{
                              ...previewStyle,
                              border: isSelected
                                ? "2px solid rgba(255, 255, 255, 0.6)"
                                : bg.id === "none"
                                ? "1px dashed hsl(var(--border-hover))"
                                : "1px solid rgba(255, 255, 255, 0.04)",
                              boxShadow: isSelected ? "0 0 0 1px rgba(255, 255, 255, 0.15)" : "none",
                            }}
                          >
                            {bg.id === "none" && (
                              <X className="h-4 w-4" style={{ color: "var(--text-muted)", opacity: 0.5 }} />
                            )}
                          </div>
                          <span style={{
                            fontSize: "11px",
                            color: isSelected ? "var(--text-primary)" : "var(--text-muted)",
                            fontWeight: isSelected ? 500 : 400,
                          }}>
                            {bg.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* USAGE TAB */}
            {activeTab === "usage" && (
              <div className="space-y-6">
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Usage</h3>
                  <p style={descStyle}>Your usage statistics.</p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Conversations", value: conversationCount },
                    { label: "Messages", value: messageCount },
                    { label: "Memories", value: memoryCount },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="p-4 rounded-xl text-center"
                      style={{ background: frosted ? GLASS_INPUT_BG : "var(--bg-input)", border: frosted ? "1px solid rgba(255, 255, 255, 0.04)" : "1px solid transparent" }}
                    >
                      <div style={{ fontSize: "28px", fontWeight: 600, color: "var(--text-primary)" }}>{stat.value}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>{stat.label}</div>
                    </div>
                  ))}
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

                <div style={{ borderTop: frosted ? "1px solid rgba(255, 255, 255, 0.03)" : "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "20px" }}>
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
            </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
