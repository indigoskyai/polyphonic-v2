import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { usePageNavigate } from "@/hooks/usePageNavigate";
import { useUserSettings } from "@/hooks/useUserSettings";
import { getBackgroundStyle } from "@/lib/backgrounds";
import { GLASS_STYLE, GLASS_BORDER, GLASS_MUTED, GLASS_LABEL, GLASS_ICON, GLASS_ICON_HOVER } from "@/lib/glassmorphism";
import PageTransition from "@/components/PageTransition";
import { EmotionalStateExpanded } from "@/components/EmotionalStateDisplay";
import { BeliefTracker } from "@/components/BeliefTracker";
import { ObserverPanel } from "@/components/ObserverPanel";
import { ArrowLeft, Brain, Eye, Heart, Sparkles, BookOpen } from "lucide-react";

type Tab = "emotions" | "beliefs" | "observer" | "dreams";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "emotions", label: "Emotional State", icon: Heart },
  { id: "beliefs", label: "Beliefs", icon: Brain },
  { id: "observer", label: "Observer", icon: Eye },
  { id: "dreams", label: "Dreams", icon: Sparkles },
];

const InnerLife = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { exiting, navigateTo } = usePageNavigate();
  const { settings } = useUserSettings();
  const [activeTab, setActiveTab] = useState<Tab>("emotions");
  const [dreams, setDreams] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  const bgStyle = getBackgroundStyle(settings?.background_style || undefined);

  useEffect(() => {
    if (!user) return;
    // Fetch dreams (journal entries with mood=dreaming)
    supabase
      .from("journal_entries")
      .select("id, content, mood, created_at")
      .eq("user_id", user.id)
      .eq("mood", "dreaming")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setDreams(data);
      });

    // Fetch stats
    Promise.all([
      supabase.from("beliefs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("active", true),
      supabase.from("beliefs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("stagnant", true),
      supabase.from("memories").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_deleted", false),
      supabase.from("observer_logs").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("thought_initiations").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "pending"),
    ]).then(([beliefs, stagnant, memories, observations, pending]) => {
      setStats({
        beliefs: beliefs.count || 0,
        stagnant: stagnant.count || 0,
        memories: memories.count || 0,
        observations: observations.count || 0,
        pending: pending.count || 0,
      });
    });
  }, [user]);

  return (
    <PageTransition exiting={exiting}>
      <div className="h-screen flex flex-col" style={bgStyle || { background: "#0A0C10" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${GLASS_BORDER}` }}>
          <button
            onClick={() => navigateTo("/chat")}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: GLASS_ICON }}
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>Inner Life</h1>

          {/* Quick stats */}
          {stats && (
            <div className="ml-auto flex items-center gap-3 text-[10px]" style={{ color: GLASS_LABEL }}>
              <span>{stats.beliefs} beliefs</span>
              <span>{stats.memories} memories</span>
              <span>{stats.observations} observations</span>
              {stats.pending > 0 && (
                <span style={{ color: "#4ECDC4" }}>{stats.pending} pending</span>
              )}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex px-4 gap-1 py-2" style={{ borderBottom: `1px solid ${GLASS_BORDER}` }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
                style={{
                  background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                  color: isActive ? "rgba(255,255,255,0.9)" : GLASS_MUTED,
                }}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto">
            <div className="rounded-xl p-4" style={GLASS_STYLE}>
              {activeTab === "emotions" && <EmotionalStateExpanded />}
              {activeTab === "beliefs" && <BeliefTracker />}
              {activeTab === "observer" && <ObserverPanel />}
              {activeTab === "dreams" && (
                <div className="space-y-3">
                  {dreams.length === 0 ? (
                    <div className="text-center py-6">
                      <Sparkles size={20} className="mx-auto mb-2" style={{ color: GLASS_MUTED }} />
                      <p className="text-sm" style={{ color: GLASS_MUTED }}>
                        No dreams yet. Dreams happen during quiet hours (11pm-8am).
                      </p>
                    </div>
                  ) : (
                    dreams.map(dream => (
                      <div
                        key={dream.id}
                        className="p-3 rounded-md"
                        style={{ background: "rgba(155, 89, 182, 0.06)", border: "1px solid rgba(155, 89, 182, 0.12)" }}
                      >
                        <p className="text-sm italic" style={{ color: "rgba(255,255,255,0.7)" }}>
                          {dream.content}
                        </p>
                        <span className="text-[10px] mt-2 block" style={{ color: GLASS_LABEL }}>
                          {new Date(dream.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default InnerLife;
