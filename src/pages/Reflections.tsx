import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Loader2, MessageSquare } from "lucide-react";
import { useUserSettings } from "@/hooks/useUserSettings";
import { usePageNavigate } from "@/hooks/usePageNavigate";
import PageTransition from "@/components/PageTransition";
import { getBackgroundStyle } from "@/lib/backgrounds";
import { GLASS_STYLE, GLASS_HOVER, GLASS_BORDER } from "@/lib/glassmorphism";

interface ReflectionItem {
  id: string;
  content: string;
  source: "reflection" | "consolidation" | "question";
  score: number;
  created_at: string;
  table: "thought_stream" | "curiosity_questions";
}

const SOURCE_ICONS: Record<string, string> = {
  reflection: "\u{1F4AD}",
  consolidation: "\u{1F9E9}",
  question: "\u{2753}",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const PAGE_SIZE = 30;

const Reflections = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { exiting, navigateTo } = usePageNavigate();
  const { settings } = useUserSettings();
  const [items, setItems] = useState<ReflectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  const bgStyle = getBackgroundStyle(settings?.background_style);
  const hasCustomBg = !!bgStyle;

  const fetchItems = useCallback(async (fromOffset: number, append: boolean) => {
    if (!user) return;
    if (append) setLoadingMore(true); else setLoading(true);

    // Fetch both sources in parallel
    const [thoughtResult, questionResult] = await Promise.all([
      // thought_stream may not exist yet — handle gracefully
      supabase
        .from("thought_stream")
        .select("id, content, source, salience, created_at, delivered")
        .eq("user_id", user.id)
        .in("source", ["reflection", "consolidation", "question"])
        .order("created_at", { ascending: false })
        .range(fromOffset, fromOffset + PAGE_SIZE - 1)
        .then((res) => res, () => ({ data: null, error: { message: "table not found" } })),

      supabase
        .from("curiosity_questions")
        .select("id, question, curiosity_score, created_at, status")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("curiosity_score", { ascending: false })
        .limit(10),
    ]);

    const thoughts: ReflectionItem[] = (thoughtResult.data || []).map((t: any) => ({
      id: t.id,
      content: t.content,
      source: t.source as ReflectionItem["source"],
      score: t.salience ?? 0,
      created_at: t.created_at,
      table: "thought_stream" as const,
    }));

    const questions: ReflectionItem[] = (questionResult.data || []).map((q: any) => ({
      id: q.id,
      content: q.question,
      source: "question" as const,
      score: q.curiosity_score ?? 0,
      created_at: q.created_at,
      table: "curiosity_questions" as const,
    }));

    // Merge and deduplicate (questions might overlap with thought_stream questions)
    const merged = append ? [...items] : [] as ReflectionItem[];
    const existingIds = new Set(merged.map((i) => i.id));

    for (const item of [...thoughts, ...questions]) {
      if (!existingIds.has(item.id)) {
        merged.push(item);
        existingIds.add(item.id);
      }
    }

    // Sort by score DESC, then created_at DESC
    merged.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setItems(merged);
    setHasMore(thoughts.length >= PAGE_SIZE);
    setOffset(fromOffset + PAGE_SIZE);
    setLoading(false);
    setLoadingMore(false);
  }, [user, items]);

  useEffect(() => {
    if (user) fetchItems(0, false);
  }, [user]);

  const handleChatAbout = async (item: ReflectionItem) => {
    if (!user || navigatingId) return;
    setNavigatingId(item.id);

    try {
      const title = `Reflection: ${item.content.slice(0, 40)}`;
      const { data: convData, error: convError } = await supabase
        .from("conversations")
        .insert({ user_id: user.id, title })
        .select("id")
        .single();

      if (convError || !convData) {
        setNavigatingId(null);
        return;
      }

      await supabase.from("messages").insert({
        conversation_id: convData.id,
        user_id: user.id,
        role: "user",
        content: `I'd like to discuss this with you: ${item.content}`,
      });

      // Mark as answered/delivered
      if (item.table === "curiosity_questions") {
        await supabase
          .from("curiosity_questions")
          .update({ status: "answered", answered_at: new Date().toISOString() })
          .eq("id", item.id);
      } else {
        await supabase
          .from("thought_stream")
          .update({ delivered: true })
          .eq("id", item.id)
          .then(() => {})
          .catch(() => {});
      }

      navigate(`/chat?conversation=${convData.id}`);
    } catch {
      setNavigatingId(null);
    }
  };

  return (
    <PageTransition exiting={exiting}>
      <div className="flex flex-col h-screen relative" style={{ background: hasCustomBg ? "transparent" : "var(--bg-content)" }}>
        {/* Background layer */}
        {hasCustomBg && bgStyle && (
          <>
            <div className="absolute inset-0 z-0" style={bgStyle} />
            <div className="absolute inset-0 z-[1]" style={{ background: "rgba(0, 0, 0, 0.3)" }} />
          </>
        )}

        {/* Header */}
        <div
          className="flex items-center gap-3 px-6 pt-5 pb-4 relative z-10"
          style={hasCustomBg ? { ...GLASS_STYLE, borderRadius: 0, borderTop: "none", borderLeft: "none", borderRight: "none" } : { borderBottom: "1px solid var(--gray-850)" }}
        >
          <button
            onClick={() => navigateTo("/chat")}
            className="h-7 w-7 flex items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--gray-400)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_BORDER : "var(--gray-800)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Sparkles className="h-4 w-4" style={{ color: "var(--gray-400)" }} />
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
            }}
          >
            Reflections
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-2xl mx-auto px-6 py-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--gray-500)" }} />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 px-4">
                <Sparkles className="h-6 w-6" style={{ color: "var(--gray-600)" }} />
                <p style={{ fontSize: "14px", color: "var(--gray-500)", textAlign: "center", lineHeight: 1.6, maxWidth: "360px" }}>
                  Your entity hasn't had any reflections yet. Start a conversation to give it something to think about.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg p-4 transition-colors"
                    style={hasCustomBg ? {
                      ...GLASS_STYLE,
                      borderRadius: "10px",
                    } : {
                      background: "var(--gray-900)",
                      border: "1px solid var(--gray-850)",
                      borderRadius: "10px",
                    }}
                  >
                    {/* Top row: icon + source badge + timestamp */}
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{ fontSize: "14px" }}>{SOURCE_ICONS[item.source]}</span>
                      <span
                        className="px-1.5 py-0.5 rounded"
                        style={{
                          fontSize: "10px",
                          fontFamily: "monospace",
                          fontWeight: 500,
                          color: "var(--gray-400)",
                          background: hasCustomBg ? GLASS_BORDER : "var(--gray-800)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {item.source}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--gray-500)", marginLeft: "auto" }}>
                        {timeAgo(item.created_at)}
                      </span>
                    </div>

                    {/* Content preview */}
                    <p
                      style={{
                        fontSize: "14px",
                        lineHeight: 1.6,
                        color: "var(--text-primary)",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        margin: "0 0 12px 0",
                      }}
                    >
                      {item.content}
                    </p>

                    {/* Chat button */}
                    <button
                      onClick={() => handleChatAbout(item)}
                      disabled={navigatingId === item.id}
                      className="flex items-center gap-1.5 transition-colors"
                      style={{
                        fontSize: "12px",
                        fontWeight: 500,
                        color: "var(--gray-400)",
                        background: "transparent",
                        border: "none",
                        cursor: navigatingId === item.id ? "wait" : "pointer",
                        padding: 0,
                      }}
                      onMouseEnter={(e) => { if (navigatingId !== item.id) e.currentTarget.style.color = "var(--text-primary)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--gray-400)"; }}
                    >
                      {navigatingId === item.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <MessageSquare className="h-3 w-3" />
                      )}
                      <span>Chat about this &rarr;</span>
                    </button>
                  </div>
                ))}

                {/* Load more */}
                {hasMore && (
                  <div className="flex justify-center pt-4 pb-8">
                    <button
                      onClick={() => fetchItems(offset, true)}
                      disabled={loadingMore}
                      className="px-4 py-2 rounded-lg transition-colors"
                      style={{
                        fontSize: "13px",
                        color: "var(--gray-400)",
                        background: hasCustomBg ? GLASS_BORDER : "var(--gray-850)",
                        border: "1px solid var(--gray-800)",
                        cursor: loadingMore ? "wait" : "pointer",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-800)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_BORDER : "var(--gray-850)"; }}
                    >
                      {loadingMore ? (
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      ) : (
                        "Load more"
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default Reflections;
