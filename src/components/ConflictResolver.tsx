import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Check, X, ChevronRight, Edit3, Loader2 } from "lucide-react";

interface ConflictResolverProps {
  userId: string;
  onResolved?: () => void;
}

interface MemorySnapshot {
  id: string;
  content: string;
  memory_type: string;
  provenance: any;
  created_at: string;
}

interface Conflict {
  id: string;
  conflict_type: string;
  status: string;
  created_at: string;
  memory_a: MemorySnapshot;
  memory_b: MemorySnapshot;
}

type ResolutionAction = "keep_new" | "keep_both" | "corrected" | "dismissed";

export function ConflictResolver({ userId, onResolved }: ConflictResolverProps) {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const [allDone, setAllDone] = useState(false);

  const fetchConflicts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("memory_conflicts")
      .select(
        "*, memory_a:memories!memory_conflicts_memory_a_id_fkey(id, content, memory_type, provenance, created_at), memory_b:memories!memory_conflicts_memory_b_id_fkey(id, content, memory_type, provenance, created_at)"
      )
      .eq("user_id", userId)
      .eq("status", "unresolved");

    if (!error && data) {
      const parsed = data
        .filter((d: any) => d.memory_a && d.memory_b)
        .map((d: any) => ({
          id: d.id,
          conflict_type: d.conflict_type,
          status: d.status,
          created_at: d.created_at,
          memory_a: d.memory_a as MemorySnapshot,
          memory_b: d.memory_b as MemorySnapshot,
        }));
      setConflicts(parsed);
      setTotalCount(parsed.length);
      setResolvedCount(0);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchConflicts();
  }, [fetchConflicts]);

  const resolveConflict = async (
    conflictId: string,
    action: ResolutionAction,
    correctionMemoryId?: string
  ) => {
    setResolvingId(conflictId);
    const now = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      status: "resolved",
      resolution: action,
      user_choice: action,
      resolved_at: now,
    };
    if (correctionMemoryId) {
      updatePayload.correction_memory_id = correctionMemoryId;
    }

    await supabase.from("memory_conflicts").update(updatePayload).eq("id", conflictId);

    const conflict = conflicts.find((c) => c.id === conflictId);
    if (conflict) {
      if (action === "keep_new") {
        await supabase
          .from("memories")
          .update({ superseded_by: conflict.memory_b.id })
          .eq("id", conflict.memory_a.id);
      } else if (action === "keep_both") {
        const existing = (conflict.memory_a.provenance as any) || {};
        await supabase
          .from("memories")
          .update({
            provenance: { ...existing, historical: true },
          })
          .eq("id", conflict.memory_a.id);
      }
    }

    setConflicts((prev) => prev.filter((c) => c.id !== conflictId));
    const newResolved = resolvedCount + 1;
    setResolvedCount(newResolved);
    setResolvingId(null);
    setCorrectingId(null);
    setCorrectionText("");

    if (newResolved >= totalCount) {
      setAllDone(true);
      onResolved?.();
    }
  };

  const handleCorrection = async (conflictId: string) => {
    if (!correctionText.trim()) return;

    const conflict = conflicts.find((c) => c.id === conflictId);
    if (!conflict) return;

    setResolvingId(conflictId);

    const { data: newMemory } = await supabase
      .from("memories")
      .insert({
        user_id: userId,
        content: correctionText.trim(),
        memory_type: conflict.memory_b.memory_type || "fact",
        confidence: 1.0,
        confidence_source: "user_explicit",
        provenance: { source: "user_correction", corrected_from: [conflict.memory_a.id, conflict.memory_b.id] },
      })
      .select("id")
      .single();

    await resolveConflict(conflictId, "corrected", newMemory?.id || undefined);
  };

  const formatAge = (dateStr: string): string => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths}mo ago`;
  };

  const getProvenanceLabel = (provenance: any): string => {
    if (!provenance) return "organic";
    const src = provenance.source;
    if (src === "chatgpt_import" || src === "import") return "imported";
    if (src === "user_correction") return "user correction";
    return src || "organic";
  };

  const conflictTypeBadge = (type: string) => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      contradiction: { bg: "hsl(0 30% 15%)", text: "hsl(0 65% 65%)", border: "hsl(0 40% 25%)" },
      update: { bg: "hsl(45 30% 13%)", text: "hsl(45 70% 60%)", border: "hsl(45 35% 25%)" },
      ambiguity: { bg: "hsl(210 30% 14%)", text: "hsl(210 60% 65%)", border: "hsl(210 35% 25%)" },
      import_conflict: { bg: "hsl(270 25% 14%)", text: "hsl(270 50% 65%)", border: "hsl(270 30% 25%)" },
    };
    const c = colors[type] || colors.ambiguity;
    return (
      <span
        style={{
          fontSize: "11px",
          fontWeight: 500,
          padding: "2px 8px",
          borderRadius: "6px",
          background: c.bg,
          color: c.text,
          border: `1px solid ${c.border}`,
          textTransform: "capitalize",
          whiteSpace: "nowrap",
        }}
      >
        {type.replace("_", " ")}
      </span>
    );
  };

  // --- Styles matching SettingsDialog patterns ---
  const cardStyle: React.CSSProperties = {
    background: "var(--bg-input)",
    border: "1px solid hsl(var(--border-subtle))",
    borderRadius: "12px",
    padding: "16px",
  };

  const memorySideStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: "12px",
    borderRadius: "8px",
    background: "var(--gray-850)",
    border: "1px solid rgba(255, 255, 255, 0.04)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: "6px",
    display: "block",
  };

  const contentStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "var(--text-primary)",
    lineHeight: 1.6,
    wordBreak: "break-word",
  };

  const metaStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--text-muted)",
    marginTop: "8px",
    display: "flex",
    gap: "8px",
    alignItems: "center",
  };

  const actionBtnBase: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 500,
    padding: "6px 12px",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    background: "var(--gray-800)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
    display: "flex",
    alignItems: "center",
    gap: "5px",
    whiteSpace: "nowrap",
  };

  // --- Loading ---
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: "8px" }}>
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Loading conflicts...</span>
      </div>
    );
  }

  // --- All resolved ---
  if (allDone) {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px" }}>
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "hsl(142 30% 12%)",
            border: "1px solid hsl(142 30% 22%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <Check className="h-5 w-5" style={{ color: "hsl(142 71% 45%)" }} />
        </div>
        <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
          All conflicts resolved
        </h3>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 }}>
          {totalCount} conflict{totalCount !== 1 ? "s" : ""} resolved. Your memories are now consistent.
        </p>
      </div>
    );
  }

  // --- Empty state ---
  if (conflicts.length === 0 && totalCount === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px" }}>
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "var(--gray-850)",
            border: "1px solid rgba(255, 255, 255, 0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <Check className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
        </div>
        <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
          No conflicts
        </h3>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 }}>
          Your memories are consistent. No conflicts to resolve.
        </p>
      </div>
    );
  }

  // --- Conflict list ---
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Progress bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              height: "4px",
              borderRadius: "2px",
              background: "var(--gray-800)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: "2px",
                background: "var(--text-primary)",
                width: totalCount > 0 ? `${(resolvedCount / totalCount) * 100}%` : "0%",
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
        <span style={{ fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {resolvedCount} of {totalCount} resolved
        </span>
      </div>

      {/* Conflict cards */}
      {conflicts.map((conflict) => {
        const isResolving = resolvingId === conflict.id;
        const isCorrecting = correctingId === conflict.id;

        return (
          <div key={conflict.id} style={{ ...cardStyle, opacity: isResolving ? 0.6 : 1, transition: "opacity 0.2s" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
              {conflictTypeBadge(conflict.conflict_type)}
              <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "auto" }}>
                {formatAge(conflict.created_at)}
              </span>
            </div>

            {/* Side-by-side memories */}
            <div style={{ display: "flex", gap: "12px", marginBottom: "14px" }}>
              {/* Memory A - existing/older */}
              <div style={memorySideStyle}>
                <span style={labelStyle}>Existing</span>
                <p style={contentStyle}>{conflict.memory_a.content}</p>
                <div style={metaStyle}>
                  <span>{conflict.memory_a.memory_type}</span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span>{getProvenanceLabel(conflict.memory_a.provenance)}</span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span>{formatAge(conflict.memory_a.created_at)}</span>
                </div>
              </div>

              {/* Divider arrow */}
              <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                <ChevronRight className="h-4 w-4" style={{ color: "var(--text-muted)", opacity: 0.4 }} />
              </div>

              {/* Memory B - newer/imported */}
              <div style={memorySideStyle}>
                <span style={labelStyle}>Newer</span>
                <p style={contentStyle}>{conflict.memory_b.content}</p>
                <div style={metaStyle}>
                  <span>{conflict.memory_b.memory_type}</span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span>{getProvenanceLabel(conflict.memory_b.provenance)}</span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span>{formatAge(conflict.memory_b.created_at)}</span>
                </div>
              </div>
            </div>

            {/* Correction input (shown when "Neither" is clicked) */}
            {isCorrecting && (
              <div style={{ marginBottom: "12px" }}>
                <label style={{ ...labelStyle, textTransform: "none", letterSpacing: "normal", fontWeight: 500 }}>
                  Write the correct version
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={correctionText}
                    onChange={(e) => setCorrectionText(e.target.value)}
                    placeholder="Enter the correct information..."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && correctionText.trim()) handleCorrection(conflict.id);
                      if (e.key === "Escape") {
                        setCorrectingId(null);
                        setCorrectionText("");
                      }
                    }}
                    style={{
                      flex: 1,
                      background: "var(--gray-850)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      fontSize: "13px",
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={() => handleCorrection(conflict.id)}
                    disabled={!correctionText.trim() || isResolving}
                    style={{
                      ...actionBtnBase,
                      background: "var(--text-primary)",
                      color: "var(--bg-sidebar)",
                      border: "none",
                      opacity: !correctionText.trim() || isResolving ? 0.5 : 1,
                    }}
                  >
                    {isResolving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setCorrectingId(null);
                      setCorrectionText("");
                    }}
                    style={actionBtnBase}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {!isCorrecting && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  onClick={() => resolveConflict(conflict.id, "keep_new")}
                  disabled={isResolving}
                  style={actionBtnBase}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--gray-850)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--gray-800)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  {isResolving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Keep New
                </button>

                <button
                  onClick={() => resolveConflict(conflict.id, "keep_both")}
                  disabled={isResolving}
                  style={actionBtnBase}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--gray-850)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--gray-800)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  Keep Both
                </button>

                <button
                  onClick={() => {
                    setCorrectingId(conflict.id);
                    setCorrectionText("");
                  }}
                  disabled={isResolving}
                  style={actionBtnBase}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--gray-850)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--gray-800)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  <Edit3 className="h-3 w-3" />
                  Neither -- Correct
                </button>

                <button
                  onClick={() => resolveConflict(conflict.id, "dismissed")}
                  disabled={isResolving}
                  style={{ ...actionBtnBase, marginLeft: "auto" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--gray-850)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--gray-800)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  <X className="h-3 w-3" />
                  Dismiss
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
