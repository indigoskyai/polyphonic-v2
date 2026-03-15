import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GLASS_BORDER, GLASS_MUTED, GLASS_LABEL } from "@/lib/glassmorphism";
import { Eye, ChevronDown, ChevronRight } from "lucide-react";

interface ObserverLog {
  id: string;
  model: string;
  observations: any[];
  synthesis: string | null;
  created_at: string;
}

const MODEL_COLORS: Record<string, string> = {
  "grok-4": "#FF6B6B",
  "gemini-3-pro-preview": "#4ECDC4",
  "kimi-k2.5": "#9B59B6",
  synthesis: "#FFD93D",
};

export function ObserverPanel() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ObserverLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("observer_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setLogs(data as any[]);
        setLoading(false);
      });
  }, [user]);

  if (loading) return <div className="text-sm animate-pulse" style={{ color: GLASS_MUTED }}>Loading observations...</div>;

  if (logs.length === 0) {
    return (
      <div className="text-center py-6">
        <Eye size={20} className="mx-auto mb-2" style={{ color: GLASS_MUTED }} />
        <p className="text-sm" style={{ color: GLASS_MUTED }}>
          No observations yet. The observer panel runs periodically.
        </p>
      </div>
    );
  }

  // Group logs by timestamp (panel runs produce multiple logs at same time)
  const latestSynthesis = logs.find(l => l.model === "synthesis");
  const latestObservations = logs.filter(l => l.model !== "synthesis");

  return (
    <div className="space-y-4">
      {/* Synthesis (if available) */}
      {latestSynthesis?.synthesis && (
        <div
          className="p-3 rounded-md text-sm"
          style={{
            background: "rgba(255, 217, 61, 0.06)",
            border: "1px solid rgba(255, 217, 61, 0.15)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: MODEL_COLORS.synthesis }} />
            <span className="text-xs font-medium" style={{ color: MODEL_COLORS.synthesis }}>Synthesis</span>
            <span className="text-[10px] ml-auto" style={{ color: GLASS_LABEL }}>
              {new Date(latestSynthesis.created_at).toLocaleString()}
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.75)" }}>{latestSynthesis.synthesis}</p>
        </div>
      )}

      {/* Individual model observations */}
      <div className="space-y-2">
        {latestObservations.map(log => {
          const modelColor = MODEL_COLORS[log.model] || "#888";
          const isExpanded = expandedLog === log.id;
          const observations = log.observations as any[];
          const topObs = observations?.[0];

          return (
            <div key={log.id}>
              <button
                onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                className="w-full text-left px-3 py-2 rounded-md transition-colors"
                style={{ background: isExpanded ? "rgba(255,255,255,0.04)" : "transparent" }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-8 rounded-full" style={{ background: modelColor, opacity: 0.6 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium" style={{ color: modelColor }}>{log.model}</span>
                      <span className="text-[10px]" style={{ color: GLASS_LABEL }}>
                        {observations?.length || 0} observation{(observations?.length || 0) !== 1 ? "s" : ""}
                      </span>
                      {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    </div>
                    {topObs && (
                      <p className="text-xs truncate mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>
                        {topObs.content}
                      </p>
                    )}
                  </div>
                </div>
              </button>

              {isExpanded && observations && (
                <div className="ml-5 pl-3 py-1 space-y-2" style={{ borderLeft: `1px solid ${modelColor}30` }}>
                  {observations.map((obs: any, i: number) => (
                    <div key={i} className="text-xs space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded" style={{ background: `${modelColor}15`, color: modelColor }}>
                          {obs.type || "pattern"}
                        </span>
                        <span className="font-mono" style={{ color: GLASS_LABEL }}>
                          sal={obs.salience?.toFixed(2) || "?"}
                        </span>
                      </div>
                      <p style={{ color: "rgba(255,255,255,0.7)" }}>{obs.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center">
        <span className="text-[10px]" style={{ color: GLASS_LABEL }}>
          Last observation: {logs[0] ? new Date(logs[0].created_at).toLocaleString() : "never"}
        </span>
      </div>
    </div>
  );
}
