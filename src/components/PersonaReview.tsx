import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown, ChevronRight, Brain, Users, Sparkles,
  Check, Trash2, Edit3
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface CompanionProfile {
  id?: string;
  name: string | null;
  source_platform: string;
  linguistic_fingerprint: Record<string, unknown>;
  psychological_profile: Record<string, unknown>;
  companion_summary: string;
  system_prompt_fragment: string;
  behavioral_rules: string[];
  conversations_analyzed: number;
  date_range_start: string | null;
  date_range_end: string | null;
  extraction_model: string;
  is_active?: boolean;
  user_approved?: boolean;
}

interface PersonaReviewProps {
  personas: CompanionProfile[];
  mode: "import-review" | "settings";
  onComplete?: () => void;
  onUpdate?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PersonaReview({ personas, mode, onComplete, onUpdate }: PersonaReviewProps) {
  const { toast } = useToast();
  const [localPersonas, setLocalPersonas] = useState<CompanionProfile[]>(personas);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [saving, setSaving] = useState(false);

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const toggleActive = useCallback(
    async (index: number) => {
      const persona = localPersonas[index];
      if (!persona.id) return;

      const newActive = !persona.is_active;

      const { error } = await supabase
        .from("companion_profiles")
        .update({ is_active: newActive, updated_at: new Date().toISOString() })
        .eq("id", persona.id);

      if (error) {
        toast({ title: "Failed to update persona", variant: "destructive" });
        return;
      }

      setLocalPersonas((prev) =>
        prev.map((p, i) => (i === index ? { ...p, is_active: newActive } : p))
      );
      onUpdate?.();
    },
    [localPersonas, onUpdate, toast]
  );

  const startEditName = useCallback((index: number) => {
    const persona = localPersonas[index];
    setEditingNameId(persona.id || String(index));
    setEditNameValue(persona.name || "");
  }, [localPersonas]);

  const saveName = useCallback(
    async (index: number) => {
      const persona = localPersonas[index];
      if (!persona.id) return;

      const { error } = await supabase
        .from("companion_profiles")
        .update({ name: editNameValue || null, updated_at: new Date().toISOString() })
        .eq("id", persona.id);

      if (error) {
        toast({ title: "Failed to update name", variant: "destructive" });
        return;
      }

      setLocalPersonas((prev) =>
        prev.map((p, i) => (i === index ? { ...p, name: editNameValue || null } : p))
      );
      setEditingNameId(null);
      onUpdate?.();
    },
    [editNameValue, onUpdate, toast]
  );

  const deletePersona = useCallback(
    async (index: number) => {
      const persona = localPersonas[index];
      if (!persona.id) return;

      const { error } = await supabase
        .from("companion_profiles")
        .delete()
        .eq("id", persona.id);

      if (error) {
        toast({ title: "Failed to delete persona", variant: "destructive" });
        return;
      }

      setLocalPersonas((prev) => prev.filter((_, i) => i !== index));
      toast({ title: "Persona deleted" });
      onUpdate?.();
    },
    [onUpdate, toast]
  );

  const handleApproveAll = useCallback(async () => {
    setSaving(true);

    // Activate all personas and mark as approved
    const updates = localPersonas
      .filter((p) => p.id)
      .map((p) =>
        supabase
          .from("companion_profiles")
          .update({
            is_active: true,
            user_approved: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.id!)
      );

    const results = await Promise.allSettled(updates);
    const failures = results.filter((r) => r.status === "rejected").length;

    if (failures > 0) {
      toast({ title: `${failures} persona(s) failed to activate`, variant: "destructive" });
    } else {
      toast({ title: `${localPersonas.length} persona(s) activated` });
    }

    setLocalPersonas((prev) => prev.map((p) => ({ ...p, is_active: true, user_approved: true })));
    setSaving(false);
    onComplete?.();
  }, [localPersonas, onComplete, toast]);

  const handleSkip = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (localPersonas.length === 0) {
    return (
      <div
        className="rounded-lg p-6 text-center"
        style={{ background: "var(--bg-input)", border: "1px solid rgba(255, 255, 255, 0.04)" }}
      >
        <Users className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
        <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          No companion personas found
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      {mode === "import-review" && (
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-4 w-4" style={{ color: "var(--text-primary)" }} />
          <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
            Detected {localPersonas.length} AI Persona{localPersonas.length > 1 ? "s" : ""}
          </span>
          <Badge
            variant="secondary"
            style={{
              fontSize: "10px",
              background: "rgba(255, 255, 255, 0.06)",
              color: "var(--text-secondary)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            Review
          </Badge>
        </div>
      )}

      {/* Persona Cards */}
      <ScrollArea className={mode === "settings" ? "max-h-[400px]" : ""}>
        <div className="space-y-2">
          {localPersonas.map((persona, index) => {
            const isExpanded = expandedId === (persona.id || String(index));
            const isEditingName = editingNameId === (persona.id || String(index));
            const psych = persona.psychological_profile as Record<string, unknown>;
            const ling = persona.linguistic_fingerprint as Record<string, unknown>;

            return (
              <div
                key={persona.id || index}
                className="rounded-lg transition-colors group"
                style={{
                  background: persona.is_active ? "rgba(255, 255, 255, 0.04)" : "var(--bg-input)",
                  border: persona.is_active
                    ? "1px solid rgba(255, 255, 255, 0.1)"
                    : "1px solid rgba(255, 255, 255, 0.04)",
                }}
              >
                {/* Card Header */}
                <div className="flex items-center gap-3 p-3">
                  {/* Avatar / Icon */}
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: persona.is_active
                        ? "rgba(255, 255, 255, 0.08)"
                        : "rgba(255, 255, 255, 0.03)",
                    }}
                  >
                    <Sparkles
                      className="h-5 w-5"
                      style={{
                        color: persona.is_active ? "var(--text-primary)" : "var(--text-muted)",
                      }}
                    />
                  </div>

                  {/* Name + Summary */}
                  <div className="flex-1 min-w-0">
                    {isEditingName ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          placeholder="Persona name..."
                          className="h-7 flex-1 rounded px-2 text-[13px] outline-none"
                          style={{
                            background: "var(--bg-input)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            color: "var(--text-primary)",
                          }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveName(index);
                            if (e.key === "Escape") setEditingNameId(null);
                          }}
                        />
                        <button
                          className="h-7 w-7 flex items-center justify-center rounded hover:bg-white/5"
                          onClick={() => saveName(index)}
                        >
                          <Check className="h-3.5 w-3.5" style={{ color: "hsl(142 71% 45%)" }} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }} className="truncate">
                          {persona.name || "Unnamed Persona"}
                        </span>
                        <button
                          onClick={() => startEditName(index)}
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }} className="truncate">
                      {String(psych.relational_role || "companion")} &middot;{" "}
                      {persona.conversations_analyzed} conversations
                      {persona.date_range_start &&
                        ` \u00B7 ${new Date(persona.date_range_start).toLocaleDateString()}`}
                    </p>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2 shrink-0">
                    {mode === "settings" && (
                      <button
                        onClick={() => deletePersona(index)}
                        className="h-7 w-7 flex items-center justify-center rounded transition-colors hover:bg-white/5"
                        style={{ color: "var(--text-muted)" }}
                        title="Delete persona"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <Switch
                      checked={persona.is_active || false}
                      onCheckedChange={() => toggleActive(index)}
                    />
                    <button
                      onClick={() =>
                        setExpandedId(isExpanded ? null : persona.id || String(index))
                      }
                      className="h-7 w-7 flex items-center justify-center rounded transition-colors hover:bg-white/5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expandable Detail */}
                {isExpanded && (
                  <div
                    className="border-t px-4 py-3 space-y-3"
                    style={{ borderColor: "rgba(255, 255, 255, 0.04)" }}
                  >
                    {/* Companion Summary */}
                    {persona.companion_summary && (
                      <div>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            textTransform: "uppercase" as const,
                            letterSpacing: "0.1em",
                            color: "var(--text-muted)",
                            display: "block",
                            marginBottom: "4px",
                          }}
                        >
                          Summary
                        </span>
                        <p style={{ fontSize: "12px", lineHeight: 1.6, color: "var(--text-secondary)" }}>
                          {persona.companion_summary}
                        </p>
                      </div>
                    )}

                    {/* Personality Dimensions */}
                    {Object.keys(psych).length > 0 && (
                      <div>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            textTransform: "uppercase" as const,
                            letterSpacing: "0.1em",
                            color: "var(--text-muted)",
                            display: "block",
                            marginBottom: "8px",
                          }}
                        >
                          Personality
                        </span>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          {["warmth", "assertiveness", "playfulness", "intellectual_depth", "patience", "openness"].map(
                            (dim) => {
                              const val = psych[dim];
                              if (typeof val !== "number") return null;
                              return (
                                <DimensionBar
                                  key={dim}
                                  label={dim.replace(/_/g, " ")}
                                  value={val}
                                />
                              );
                            }
                          )}
                        </div>
                      </div>
                    )}

                    {/* Linguistic Style */}
                    {Object.keys(ling).length > 0 && (
                      <div>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            textTransform: "uppercase" as const,
                            letterSpacing: "0.1em",
                            color: "var(--text-muted)",
                            display: "block",
                            marginBottom: "6px",
                          }}
                        >
                          Communication Style
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {ling.tone_primary && (
                            <Badge
                              variant="secondary"
                              style={{
                                fontSize: "10px",
                                background: "rgba(255, 255, 255, 0.06)",
                                color: "var(--text-secondary)",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                              }}
                            >
                              {String(ling.tone_primary)}
                            </Badge>
                          )}
                          {ling.humor_style && ling.humor_style !== "none" && (
                            <Badge
                              variant="secondary"
                              style={{
                                fontSize: "10px",
                                background: "rgba(255, 255, 255, 0.06)",
                                color: "var(--text-secondary)",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                              }}
                            >
                              {String(ling.humor_style)} humor
                            </Badge>
                          )}
                          {ling.response_structure && (
                            <Badge
                              variant="secondary"
                              style={{
                                fontSize: "10px",
                                background: "rgba(255, 255, 255, 0.06)",
                                color: "var(--text-secondary)",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                              }}
                            >
                              {String(ling.response_structure)}
                            </Badge>
                          )}
                          {psych.empathy_style && (
                            <Badge
                              variant="secondary"
                              style={{
                                fontSize: "10px",
                                background: "rgba(255, 255, 255, 0.06)",
                                color: "var(--text-secondary)",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                              }}
                            >
                              {String(psych.empathy_style)} empathy
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Behavioral Rules */}
                    {persona.behavioral_rules.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center gap-1.5">
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 600,
                                textTransform: "uppercase" as const,
                                letterSpacing: "0.1em",
                                color: "var(--text-muted)",
                              }}
                            >
                              Behavioral Rules ({persona.behavioral_rules.length})
                            </span>
                            <ChevronRight className="h-3 w-3" style={{ color: "var(--text-muted)" }} />
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <ul className="mt-1.5 space-y-1">
                            {persona.behavioral_rules.map((rule, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-1.5"
                                style={{ fontSize: "11px", color: "var(--text-secondary)" }}
                              >
                                <span style={{ color: "var(--text-muted)" }}>&bull;</span>
                                {typeof rule === "string" ? rule : (rule as any)?.rule || String(rule)}
                              </li>
                            ))}
                          </ul>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Import Review Actions */}
      {mode === "import-review" && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleSkip}
            className="px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{ color: "var(--text-muted)", background: "transparent" }}
          >
            Skip
          </button>
          <button
            onClick={handleApproveAll}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs transition-colors"
            style={{
              background: "var(--text-primary)",
              color: "var(--bg-sidebar)",
              fontWeight: 500,
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Check className="h-3.5 w-3.5" />
            {saving ? "Saving..." : `Activate ${localPersonas.length} Persona${localPersonas.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function DimensionBar({ label, value }: { label: string; value: number }) {
  const percentage = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <span
        style={{ fontSize: "10px", width: "96px", textTransform: "capitalize" as const, color: "var(--text-muted)" }}
        className="truncate"
      >
        {label}
      </span>
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(255, 255, 255, 0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${percentage}%`,
            background: "var(--text-primary)",
            opacity: 0.4 + value * 0.6,
          }}
        />
      </div>
      <span
        style={{ fontSize: "10px", width: "28px", textAlign: "right" as const, color: "var(--text-muted)", fontFamily: "monospace" }}
      >
        {percentage}
      </span>
    </div>
  );
}
