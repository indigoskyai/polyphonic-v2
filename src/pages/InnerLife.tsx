import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { usePageNavigate } from "@/hooks/usePageNavigate";
import { GLASS_STYLE, GLASS_BORDER, GLASS_MUTED, GLASS_LABEL, GLASS_ICON, GLASS_ICON_HOVER } from "@/lib/glassmorphism";
import PageTransition from "@/components/PageTransition";
import { EmotionalStateExpanded } from "@/components/EmotionalStateDisplay";
import { BeliefTracker } from "@/components/BeliefTracker";
import { ObserverPanel } from "@/components/ObserverPanel";
import { ArrowLeft, Brain, Eye, Heart, Activity } from "lucide-react";

// --- Activity type config ---

const ACTIVITY_CONFIG: Record<string, { icon: string; color: string }> = {
  thought: { icon: "\u{1F9E0}", color: "var(--gray-400, #9ca3af)" },
  reflection: { icon: "\u{1F49C}", color: "#a78bfa" },
  dream: { icon: "\u{1F4AD}", color: "#818cf8" },
  journal: { icon: "\u{1F4D3}", color: "#60a5fa" },
  question: { icon: "\u2753", color: "#22d3ee" },
  browse: { icon: "\u{1F50D}", color: "#4ade80" },
  image: { icon: "\u{1F3A8}", color: "#fb7185" },
  observation: { icon: "\u{1F441}", color: "#fbbf24" },
  belief_change: { icon: "\u{1F4A1}", color: "#f97316" },
  mood_shift: { icon: "\u{1F321}", color: "#2dd4bf" },
  connection: { icon: "\u{1F517}", color: "#94a3b8" },
  consolidation: { icon: "\u{1F9E9}", color: "#a78bfa" },
  initiation: { icon: "\u2728", color: "#fbbf24" },
  social_post: { icon: "\u{1F4E2}", color: "#f59e0b" },
  task: { icon: "\u{1F4CB}", color: "#6b7280" },
};

// --- Helpers ---

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function renderContentDetails(content: any): React.ReactNode {
  if (!content || typeof content !== "object") {
    return <span style={{ color: GLASS_MUTED, fontSize: "12px" }}>{String(content ?? "")}</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
      {Object.entries(content).map(([key, value]) => (
        <div key={key} style={{ display: "flex", gap: "8px", fontSize: "12px" }}>
          <span style={{ color: GLASS_LABEL, fontFamily: "var(--font-mono, monospace)", minWidth: "100px", flexShrink: 0 }}>
            {key}
          </span>
          <span style={{ color: "rgba(255,255,255,0.65)", wordBreak: "break-word" }}>
            {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "")}
          </span>
        </div>
      ))}
    </div>
  );
}

// --- Activity Card ---

function ActivityCard({ activity }: { activity: any }) {
  const [expanded, setExpanded] = useState(false);
  const config = ACTIVITY_CONFIG[activity.activity_type] || { icon: "\u2022", color: GLASS_MUTED };

  return (
    <div
      style={{
        background: "var(--surface-1, #0a0a0a)",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: "8px",
        padding: "12px 14px",
      }}
    >
      {/* Top row: icon + title + time */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span style={{ fontSize: "16px", lineHeight: "20px", flexShrink: 0 }}>{config.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
            <span
              style={{
                color: config.color,
                fontSize: "13px",
                fontWeight: 500,
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {activity.title || activity.activity_type}
            </span>
            <span
              style={{
                color: GLASS_LABEL,
                fontSize: "10px",
                fontFamily: "var(--font-mono, monospace)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {timeAgo(activity.created_at)}
            </span>
          </div>

          {/* Summary */}
          {activity.summary && (
            <p
              style={{
                color: "rgba(255,255,255,0.55)",
                fontSize: "12px",
                lineHeight: "1.5",
                marginTop: "4px",
                display: "-webkit-box",
                WebkitLineClamp: expanded ? undefined : 2,
                WebkitBoxOrient: "vertical",
                overflow: expanded ? "visible" : "hidden",
              }}
            >
              {activity.summary}
            </p>
          )}

          {/* Source badge + expand toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
            {activity.source && (
              <span
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "10px",
                  letterSpacing: "0.04em",
                  color: "var(--gray-500, #6b7280)",
                  padding: "2px 6px",
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: "4px",
                }}
              >
                {activity.source}
              </span>
            )}
            {activity.content && (
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "10px",
                  color: GLASS_MUTED,
                  padding: "2px 4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <span style={{ transform: expanded ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 150ms ease" }}>
                  {"\u25B8"}
                </span>
                {expanded ? "collapse" : "expand"}
              </button>
            )}
          </div>

          {/* Expanded content */}
          {expanded && activity.content && (
            <div
              style={{
                marginTop: "8px",
                padding: "8px 10px",
                background: "rgba(255,255,255,0.02)",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              {renderContentDetails(activity.content)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Tab types ---

type Tab = "activity" | "emotions" | "beliefs" | "observer";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "activity", label: "Activity", icon: Activity },
  { id: "emotions", label: "Emotional State", icon: Heart },
  { id: "beliefs", label: "Beliefs", icon: Brain },
  { id: "observer", label: "Observer", icon: Eye },
];

// --- Page ---

const PAGE_SIZE = 20;

const InnerLife = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { exiting, navigateTo } = usePageNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("activity");
  const [stats, setStats] = useState<any>(null);

  // Mood line
  const [moodSummary, setMoodSummary] = useState<string | null>(null);

  // Activity state
  const [activities, setActivities] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  // Fetch mood summary
  useEffect(() => {
    if (!user) return;
    (supabase as any)
      .from("emotional_state")
      .select("mood_summary")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }: any) => {
        if (data?.mood_summary) {
          setMoodSummary(data.mood_summary);
        }
      });
  }, [user]);

  // Fetch activities
  const fetchActivities = useCallback(
    async (currentOffset: number, append: boolean) => {
      if (!user) return;
      setActivitiesLoading(true);
      const { data } = await (supabase as any)
        .from("entity_activity_log")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(currentOffset, currentOffset + PAGE_SIZE - 1);

      if (data) {
        setActivities((prev) => (append ? [...prev, ...data] : data));
        setHasMore(data.length === PAGE_SIZE);
      } else {
        setHasMore(false);
      }
      setActivitiesLoading(false);
    },
    [user],
  );

  useEffect(() => {
    if (!user) return;
    fetchActivities(0, false);
  }, [user, fetchActivities]);

  // Realtime subscription for new activity
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("activity-updates")
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "entity_activity_log",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          setActivities((prev) => [payload.new, ...prev]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Fetch stats
  useEffect(() => {
    if (!user) return;
    Promise.all([
      (supabase as any).from("beliefs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("active", true),
      (supabase as any).from("beliefs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("stagnant", true),
      (supabase as any).from("memories").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_deleted", false),
      (supabase as any).from("observer_logs").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      (supabase as any).from("thought_initiations").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "pending"),
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

  const handleLoadMore = () => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    fetchActivities(newOffset, true);
  };

  return (
    <PageTransition exiting={exiting}>
      <div className="h-screen flex flex-col" style={{ background: "#0A0C10" }}>
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

        {/* Mood line */}
        {moodSummary && (
          <div className="px-4 py-2" style={{ borderBottom: `1px solid ${GLASS_BORDER}` }}>
            <p
              style={{
                fontStyle: "italic",
                color: "var(--gray-400, #9ca3af)",
                fontSize: "14px",
                fontFamily: "var(--font-mono, monospace)",
                margin: 0,
              }}
            >
              {moodSummary}
            </p>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex px-4 gap-1 py-2" style={{ borderBottom: `1px solid ${GLASS_BORDER}` }}>
          {TABS.map((tab) => {
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
            {activeTab === "activity" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {activities.length === 0 && !activitiesLoading ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "48px 16px",
                      color: GLASS_MUTED,
                    }}
                  >
                    <p style={{ fontSize: "13px", marginBottom: "4px" }}>
                      Your entity hasn't done anything yet.
                    </p>
                    <p style={{ fontSize: "12px", color: GLASS_LABEL }}>
                      Start a conversation to wake it up.
                    </p>
                  </div>
                ) : (
                  <>
                    {activities.map((activity) => (
                      <ActivityCard key={activity.id} activity={activity} />
                    ))}
                    {hasMore && (
                      <button
                        onClick={handleLoadMore}
                        disabled={activitiesLoading}
                        style={{
                          display: "block",
                          margin: "12px auto",
                          padding: "6px 16px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: "6px",
                          color: GLASS_MUTED,
                          fontSize: "12px",
                          fontFamily: "var(--font-mono, monospace)",
                          cursor: activitiesLoading ? "default" : "pointer",
                          opacity: activitiesLoading ? 0.5 : 1,
                        }}
                      >
                        {activitiesLoading ? "loading..." : "load more"}
                      </button>
                    )}
                  </>
                )}
                {activitiesLoading && activities.length === 0 && (
                  <div style={{ textAlign: "center", padding: "32px 0", color: GLASS_MUTED, fontSize: "12px" }}>
                    loading...
                  </div>
                )}
              </div>
            )}

            {activeTab !== "activity" && (
              <div className="rounded-xl p-4" style={GLASS_STYLE}>
                {activeTab === "emotions" && <EmotionalStateExpanded />}
                {activeTab === "beliefs" && <BeliefTracker />}
                {activeTab === "observer" && <ObserverPanel />}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default InnerLife;
