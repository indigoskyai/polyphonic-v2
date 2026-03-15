import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GLASS_STYLE, GLASS_BORDER, GLASS_MUTED, GLASS_LABEL } from "@/lib/glassmorphism";

const DIMENSION_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  curiosity: { label: "Curiosity", color: "#4ECDC4", emoji: "?" },
  restlessness: { label: "Restlessness", color: "#FF6B6B", emoji: "~" },
  warmth: { label: "Warmth", color: "#FF8C42", emoji: "*" },
  clarity: { label: "Clarity", color: "#95E1D3", emoji: "." },
  creative_flow: { label: "Creative Flow", color: "#9B59B6", emoji: "+" },
  isolation: { label: "Isolation", color: "#7B8794", emoji: "-" },
};

const DIMENSIONS = ["curiosity", "restlessness", "warmth", "clarity", "creative_flow", "isolation"] as const;

interface EmotionalState {
  curiosity: number;
  restlessness: number;
  warmth: number;
  clarity: number;
  creative_flow: number;
  isolation: number;
  mood_summary: string | null;
}

export function EmotionalStateCompact() {
  const { user } = useAuth();
  const [state, setState] = useState<EmotionalState | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("emotional_state")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setState(data as any);
      });
  }, [user]);

  if (!state) return null;

  // Find dominant dimension
  let dominant = "curiosity";
  let maxVal = 0;
  for (const dim of DIMENSIONS) {
    if (state[dim] > maxVal) {
      maxVal = state[dim];
      dominant = dim;
    }
  }

  const config = DIMENSION_CONFIG[dominant];

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
      style={{
        background: `${config.color}15`,
        border: `1px solid ${config.color}30`,
        color: config.color,
      }}
    >
      <span className="font-mono">{config.emoji}</span>
      <span>{state.mood_summary || config.label.toLowerCase()}</span>
    </div>
  );
}

export function EmotionalStateExpanded() {
  const { user } = useAuth();
  const [state, setState] = useState<EmotionalState | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from("emotional_state")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("emotional_history")
        .select("state, timestamp")
        .eq("user_id", user.id)
        .order("timestamp", { ascending: false })
        .limit(20),
    ]).then(([{ data: stateData }, { data: histData }]) => {
      if (stateData) setState(stateData as any);
      if (histData) setHistory(histData);
    });
  }, [user]);

  if (!state) return <div className="text-sm" style={{ color: GLASS_MUTED }}>No emotional state data yet</div>;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>
          {state.mood_summary || "present"}
        </p>
      </div>

      <div className="space-y-2">
        {DIMENSIONS.map(dim => {
          const config = DIMENSION_CONFIG[dim];
          const value = state[dim];
          return (
            <div key={dim} className="flex items-center gap-3">
              <span className="text-xs w-24 text-right" style={{ color: GLASS_LABEL }}>
                {config.label}
              </span>
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${value * 100}%`,
                    background: config.color,
                    opacity: 0.7 + value * 0.3,
                  }}
                />
              </div>
              <span className="text-xs font-mono w-8" style={{ color: config.color }}>
                {value.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mini sparkline from history */}
      {history.length > 2 && (
        <div className="pt-2" style={{ borderTop: `1px solid ${GLASS_BORDER}` }}>
          <p className="text-xs mb-2" style={{ color: GLASS_LABEL }}>Recent trajectory</p>
          <div className="flex items-end gap-0.5 h-8">
            {history.slice(0, 20).reverse().map((h, i) => {
              const dominant = DIMENSIONS.reduce((a, b) =>
                (h.state?.[b] || 0) > (h.state?.[a] || 0) ? b : a
              );
              const val = h.state?.[dominant] || 0.5;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${val * 100}%`,
                    background: DIMENSION_CONFIG[dominant]?.color || "#888",
                    opacity: 0.4 + (i / 20) * 0.6,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
