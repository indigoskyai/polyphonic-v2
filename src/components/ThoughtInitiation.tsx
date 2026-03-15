import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { X, MessageCircle } from "lucide-react";

interface Initiation {
  id: string;
  message: string;
  salience_total: number;
  created_at: string;
}

export function ThoughtInitiation({ onEngage }: { onEngage?: (message: string) => void }) {
  const { user } = useAuth();
  const [initiation, setInitiation] = useState<Initiation | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    (supabase as any)
      .from("thought_initiations")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setInitiation(data as any);
      });
  }, [user]);

  if (!initiation || dismissed) return null;

  const handleDismiss = async () => {
    setDismissed(true);
    await (supabase as any)
      .from("thought_initiations")
      .update({ status: "dismissed" })
      .eq("id", initiation.id);
  };

  const handleEngage = () => {
    onEngage?.(initiation.message);
    setDismissed(true);
    supabase
      .from("thought_initiations")
      .update({ status: "delivered", delivered_at: new Date().toISOString() })
      .eq("id", initiation.id);
  };

  return (
    <div
      className="mx-4 mb-3 p-3 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500"
      style={{
        background: "rgba(78, 205, 196, 0.08)",
        border: "1px solid rgba(78, 205, 196, 0.2)",
      }}
    >
      <MessageCircle size={16} className="mt-0.5 shrink-0" style={{ color: "#4ECDC4" }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
          {initiation.message}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleEngage}
            className="text-xs px-2.5 py-1 rounded-md transition-colors"
            style={{
              background: "rgba(78, 205, 196, 0.15)",
              color: "#4ECDC4",
            }}
          >
            Let's talk about it
          </button>
          <button
            onClick={handleDismiss}
            className="text-xs px-2.5 py-1 rounded-md transition-colors"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            Not now
          </button>
        </div>
      </div>
      <button onClick={handleDismiss} className="shrink-0">
        <X size={14} style={{ color: "rgba(255,255,255,0.3)" }} />
      </button>
    </div>
  );
}
