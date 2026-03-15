import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GLASS_STYLE, GLASS_BORDER, GLASS_MUTED, GLASS_LABEL, GLASS_HOVER } from "@/lib/glassmorphism";
import { ChevronDown, ChevronRight, AlertTriangle, Plus } from "lucide-react";

interface Belief {
  id: string;
  content: string;
  confidence: number;
  domain: string;
  stagnant: boolean;
  revision_history: any[];
  tags: string[];
  created_at: string;
  last_revised: string;
  last_challenged: string;
}

const DOMAIN_COLORS: Record<string, string> = {
  general: "#8B8B8B",
  professional: "#4ECDC4",
  relationships: "#FF8C42",
  wellbeing: "#95E1D3",
  philosophy: "#9B59B6",
  identity: "#FF6B6B",
  creativity: "#FFD93D",
};

export function BeliefTracker() {
  const { user } = useAuth();
  const [beliefs, setBeliefs] = useState<Belief[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (supabase as any)
      .from("beliefs")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("confidence", { ascending: false })
      .then(({ data }) => {
        if (data) setBeliefs(data as any[]);
        setLoading(false);
      });
  }, [user]);

  if (loading) return <div className="text-sm animate-pulse" style={{ color: GLASS_MUTED }}>Loading beliefs...</div>;

  if (beliefs.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm" style={{ color: GLASS_MUTED }}>
          No beliefs tracked yet. They'll emerge naturally from conversations.
        </p>
      </div>
    );
  }

  const stagnantCount = beliefs.filter(b => b.stagnant).length;

  return (
    <div className="space-y-3">
      {stagnantCount > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs"
          style={{ background: "rgba(255, 171, 0, 0.1)", border: "1px solid rgba(255, 171, 0, 0.2)", color: "#FFAB00" }}
        >
          <AlertTriangle size={12} />
          <span>{stagnantCount} belief{stagnantCount > 1 ? "s" : ""} unchallenged for 14+ days</span>
        </div>
      )}

      <div className="space-y-1">
        {beliefs.map(belief => {
          const isExpanded = expanded === belief.id;
          const domainColor = DOMAIN_COLORS[belief.domain] || DOMAIN_COLORS.general;

          return (
            <div key={belief.id}>
              <button
                onClick={() => setExpanded(isExpanded ? null : belief.id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors text-sm"
                style={{
                  background: isExpanded ? "rgba(255,255,255,0.06)" : "transparent",
                }}
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}

                {/* Confidence bar */}
                <div className="w-12 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${belief.confidence * 100}%`,
                      background: domainColor,
                      opacity: belief.stagnant ? 0.5 : 0.8,
                    }}
                  />
                </div>

                <span
                  className="flex-1 truncate"
                  style={{ color: belief.stagnant ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.8)" }}
                >
                  {belief.content}
                </span>

                {belief.stagnant && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255, 171, 0, 0.15)", color: "#FFAB00" }}>
                    stagnant
                  </span>
                )}

                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${domainColor}20`, color: domainColor }}>
                  {belief.domain}
                </span>
              </button>

              {isExpanded && (
                <div className="ml-6 pl-3 py-2 space-y-2 text-xs" style={{ borderLeft: `1px solid ${GLASS_BORDER}` }}>
                  <div style={{ color: GLASS_LABEL }}>
                    Confidence: <span className="font-mono" style={{ color: domainColor }}>{belief.confidence.toFixed(2)}</span>
                    {" | "}
                    Revised: {(belief.revision_history || []).length}x
                    {" | "}
                    Last challenged: {belief.last_challenged ? new Date(belief.last_challenged).toLocaleDateString() : "never"}
                  </div>

                  {(belief.revision_history || []).length > 0 && (
                    <div className="space-y-1">
                      <p style={{ color: GLASS_LABEL }}>Revision history:</p>
                      {(belief.revision_history as any[]).slice(-3).map((rev, i) => (
                        <div key={i} className="flex items-center gap-2" style={{ color: GLASS_MUTED }}>
                          <span className="font-mono">
                            {rev.old_confidence?.toFixed(2)} → {rev.new_confidence?.toFixed(2)}
                          </span>
                          <span className="truncate">{rev.reasoning || rev.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center pt-2">
        <span className="text-xs" style={{ color: GLASS_LABEL }}>
          {beliefs.length} active belief{beliefs.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
