import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Settings, Palette, UserCircle,
  Save, Loader2, Check, Trash2, Brain, Pencil, ChevronRight, X, Search, ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChatGPTImport } from "@/components/ChatGPTImport";
import { PersonaReview } from "@/components/PersonaReview";
import { ConflictResolver } from "@/components/ConflictResolver";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportStarted?: (importId: string, total: number) => void;
  onNavigate?: (path: string) => void;
  settings: import("@/hooks/useUserSettings").UserSettings | null;
  onUpdateSettings: (updates: Partial<Omit<import("@/hooks/useUserSettings").UserSettings, "id" | "user_id">>) => Promise<any>;
}

type Tab = "general" | "memory" | "appearance" | "account";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "memory", label: "Memory", icon: Brain },
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) setMemoriesView(false); onOpenChange(v); }}>
      <DialogContent
        className={cn("p-0 gap-0 overflow-hidden transition-all duration-300", memoriesView ? "max-w-4xl" : "max-w-2xl")}
        aria-describedby={undefined}
        style={{
          background: "var(--bg-sidebar)",
          border: "1px solid rgba(255, 255, 255, 0.04)",
          borderRadius: "16px",
          maxHeight: "85vh",
        }}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>

        <div className={cn("flex overflow-hidden transition-all duration-300", memoriesView ? "h-[min(90vh,780px)]" : "h-[min(85vh,640px)]")}>
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
                  onClick={() => { setActiveTab(tab.id); setMemoriesView(false); }}
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
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--gray-850)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <div>
                        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>Saved Memories</h3>
                        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                          {allMemories.length} memories · Browse, search, edit, or remove
                        </p>
                      </div>
                    </div>

                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--text-muted)" }} />
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
                            background: memoryFilter === tab.id ? "var(--gray-800)" : "transparent",
                            border: memoryFilter === tab.id ? "1px solid hsl(var(--border-hover))" : "1px solid transparent",
                            color: memoryFilter === tab.id ? "var(--text-primary)" : "var(--text-secondary)",
                            fontWeight: memoryFilter === tab.id ? 500 : 400,
                            fontSize: "13px",
                          }}
                        >
                          {tab.label} ({tab.count})
                        </button>
                      ))}
                    </div>

                    {/* Memory List */}
                    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-input)", border: "1px solid transparent", maxHeight: "calc(85vh - 280px)", overflowY: "auto" }}>
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
                        <div className="divide-y" style={{ borderColor: "rgba(255, 255, 255, 0.04)" }}>
                          {filteredMemories.map((m) => (
                            <div key={m.id} className="flex items-start gap-3 px-4 py-3 group">
                              <div className="flex-1 min-w-0">
                                {editingMemoryId === m.id ? (
                                  <div className="flex flex-col gap-2">
                                    <textarea
                                      value={editingContent}
                                      onChange={(e) => setEditingContent(e.target.value)}
                                      className="w-full rounded-lg px-3 py-2 outline-none text-sm resize-y"
                                      style={{ background: "var(--gray-800)", color: "var(--text-primary)", border: "1px solid rgba(255, 255, 255, 0.08)", minHeight: "80px", maxHeight: "160px", overflowY: "auto", lineHeight: 1.6, wordBreak: "break-word" }}
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
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ background: "var(--gray-800)", color: "var(--text-muted)", border: "none" }}>
                                        {m.memory_type}
                                      </Badge>
                                      {isImported(m) && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ color: "var(--text-muted)", borderColor: "var(--gray-700)" }}>
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
                    style={{ background: "var(--bg-input)", border: "1px solid transparent" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--gray-850)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-input)"; }}
                  >
                    <Brain className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
                    <div className="flex-1 text-left">
                      <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>Manage Memories</div>
                      <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                        Browse, search, edit, and remove saved memories
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
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
                    <div className="p-4 rounded-xl" style={{ background: "var(--bg-input)", border: "1px solid transparent" }}>
                      <ConflictResolver
                        userId={user!.id}
                        onResolved={() => setUnresolvedConflicts(0)}
                      />
                    </div>
                  </div>
                )}

                {/* Companion Personas */}
                <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "8px" }}>
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
                    <div className="p-4 rounded-xl text-center" style={{ background: "var(--bg-input)", border: "1px solid transparent" }}>
                      <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                        No companion personas. Import your ChatGPT history to generate companion personalities.
                      </p>
                    </div>
                  )}
                </div>

                {/* ChatGPT Import */}
                <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "8px" }}>
                  <ChatGPTImport onImportStarted={onImportStarted} />
                </div>

                {/* Clear Imported Data */}
                {(importedMemoryCount > 0 || importedProfileCount > 0) && (
                  <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)", paddingTop: "20px", marginTop: "8px" }}>
                    <label style={{ ...labelStyle, fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Imported Data</label>
                    <div className="p-4 rounded-xl space-y-3" style={{ background: "var(--bg-input)", border: "1px solid transparent" }}>
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
            </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
