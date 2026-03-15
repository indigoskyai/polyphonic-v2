import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Info, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useUserSettings } from "@/hooks/useUserSettings";
import { usePageNavigate } from "@/hooks/usePageNavigate";
import PageTransition from "@/components/PageTransition";
import { getBackgroundStyle } from "@/lib/backgrounds";
import { GLASS_STYLE, GLASS_HOVER, GLASS_BORDER } from "@/lib/glassmorphism";
import { preprocessAsciiArt } from "@/lib/asciiArt";
import { CodeBlock, InlineCode } from "@/components/CodeBlock";

interface JournalEntry {
  id: string;
  content: string;
  mood: string | null;
  model_used: string | null;
  trigger_type: string;
  created_at: string;
  is_read: boolean;
}

const Journal = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { exiting, navigateTo } = usePageNavigate();
  const { settings } = useUserSettings();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

  const bgStyle = getBackgroundStyle(settings?.background_style);
  const hasCustomBg = !!bgStyle;

  useEffect(() => {
    if (user) loadEntries();
  }, [user]);

  // Mark entries as read when viewing
  useEffect(() => {
    if (!user || entries.length === 0) return;
    const unreadIds = entries.filter((e) => !e.is_read).map((e) => e.id);
    if (unreadIds.length > 0) {
      supabase
        .from("journal_entries")
        .update({ is_read: true })
        .in("id", unreadIds)
        .then();
    }
  }, [entries, user]);

  const loadEntries = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("journal_entries")
      .select("id, content, mood, model_used, trigger_type, created_at, is_read")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setEntries(data);
      if (data.length > 0 && !selectedEntry) {
        setSelectedEntry(data[0]);
      }
    }
    setLoading(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  // Group entries by date
  const groupedEntries: Record<string, JournalEntry[]> = {};
  for (const entry of entries) {
    const dateKey = new Date(entry.created_at).toLocaleDateString();
    if (!groupedEntries[dateKey]) groupedEntries[dateKey] = [];
    groupedEntries[dateKey].push(entry);
  }

  return (
    <PageTransition exiting={exiting}>
    <div className="flex h-screen relative" style={{ background: hasCustomBg ? "transparent" : "var(--bg-content)" }}>
      {/* Background layer */}
      {hasCustomBg && bgStyle && (
        <>
          <div className="absolute inset-0 z-0" style={bgStyle} />
          <div className="absolute inset-0 z-[1]" style={{ background: "rgba(0, 0, 0, 0.3)" }} />
        </>
      )}

      {/* Entry list sidebar */}
      <div
        className="w-72 flex flex-col h-full border-r relative z-10"
        style={hasCustomBg ? { ...GLASS_STYLE, borderRadius: 0 } : { background: "var(--bg-sidebar)", borderColor: "hsl(var(--border-subtle))" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <button
            onClick={() => navigateTo("/chat")}
            className="h-7 w-7 flex items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--gray-400)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_BORDER : "var(--gray-800)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
            }}
          >
            Journal
          </span>
        </div>

        {/* Info banner */}
        <div
          className="mx-3 mb-2 px-3 py-2.5 rounded-lg flex gap-2"
          style={{
            background: hasCustomBg ? GLASS_BORDER : "var(--gray-850)",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "var(--gray-400)",
          }}
        >
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "var(--gray-500)" }} />
          <span>
            Journal entries are written automatically after conversations. If you haven't chatted in over 24 hours, new entries won't generate until you return.
          </span>
        </div>

        {/* Entries list */}
        <div className="flex-1 overflow-y-auto px-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--gray-500)" }} />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 px-4">
              <BookOpen className="h-5 w-5" style={{ color: "var(--gray-500)" }} />
              <span style={{ fontSize: "13px", color: "var(--gray-500)", textAlign: "center" }}>
                No journal entries yet. Your AI companion will write here after conversations.
              </span>
            </div>
          ) : (
            Object.entries(groupedEntries).map(([dateKey, dayEntries]) => (
              <div key={dateKey} className="mb-3">
                <div className="px-3 py-1.5">
                  <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {formatDate(dayEntries[0].created_at)}
                  </span>
                </div>
                {dayEntries.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="w-full text-left px-3 py-2.5 rounded-lg transition-colors mb-0.5"
                    style={{
                      background: selectedEntry?.id === entry.id ? (hasCustomBg ? GLASS_BORDER : "var(--gray-850)") : "transparent",
                      fontSize: "13px",
                      color: selectedEntry?.id === entry.id ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedEntry?.id !== entry.id) e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-850)";
                    }}
                    onMouseLeave={(e) => {
                      if (selectedEntry?.id !== entry.id) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ fontSize: "12px", color: "var(--gray-500)" }}>{formatTime(entry.created_at)}</span>
                      {entry.mood && (
                        <span
                          className="px-1.5 py-0.5 rounded"
                          style={{
                            fontSize: "10px",
                            fontWeight: 500,
                            color: "var(--text-secondary)",
                            background: hasCustomBg ? GLASS_BORDER : "var(--gray-800)",
                            textTransform: "capitalize",
                          }}
                        >
                          {entry.mood}
                        </span>
                      )}
                      {!entry.is_read && (
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: "hsl(210 80% 60%)" }}
                        />
                      )}
                    </div>
                    <p className="truncate" style={{ color: "inherit", lineHeight: 1.4 }}>
                      {entry.content.slice(0, 80)}...
                    </p>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Entry reader */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {selectedEntry ? (
          <div className="flex-1 overflow-y-auto">
            <div
              className="max-w-2xl mx-auto px-8 py-12"
            style={hasCustomBg ? {
                ...GLASS_STYLE,
                borderRadius: "16px",
                marginTop: "24px",
                marginBottom: "24px",
              } : undefined}
            >
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <span style={{ fontSize: "13px", color: "var(--gray-500)" }}>
                    {formatDate(selectedEntry.created_at)} · {formatTime(selectedEntry.created_at)}
                  </span>
                  {selectedEntry.mood && (
                    <span
                      className="px-2 py-0.5 rounded"
                      style={{
                        fontSize: "11px",
                        fontWeight: 500,
                        color: "var(--text-secondary)",
                        background: "var(--gray-800)",
                        textTransform: "capitalize",
                      }}
                    >
                      {selectedEntry.mood}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: "11px", color: "var(--gray-600)" }}>
                    {selectedEntry.trigger_type === "post_conversation" ? "After conversation" : "Periodic reflection"}
                  </span>
                </div>
              </div>

              <div
                className="chat-prose"
                style={{
                  fontSize: "16px",
                  lineHeight: 1.9,
                  color: "var(--text-primary)",
                  fontWeight: 400,
                  letterSpacing: "-0.003em",
                }}
              >
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p style={{ margin: "16px 0" }}>{children}</p>,
                    strong: ({ children }) => <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{children}</strong>,
                    em: ({ children }) => <em style={{ color: "var(--text-primary)" }}>{children}</em>,
                    code: ({ children, className }) => {
                      const match = /language-(\w+)/.exec(className || "");
                      const codeStr = String(children).replace(/\n$/, "");
                      if (match) {
                        return <CodeBlock language={match[1]} code={codeStr} />;
                      }
                      if (codeStr.includes("\n")) {
                        return <CodeBlock language="text" code={codeStr} />;
                      }
                      return <InlineCode>{children}</InlineCode>;
                    },
                    pre: ({ children }) => <>{children}</>,
                    blockquote: ({ children }) => (
                      <blockquote style={{
                        borderLeft: "3px solid var(--gray-600)",
                        paddingLeft: "16px",
                        margin: "16px 0",
                        color: "var(--text-secondary)",
                        fontStyle: "italic",
                      }}>{children}</blockquote>
                    ),
                  }}
                >
                  {preprocessAsciiArt(selectedEntry.content)}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <BookOpen className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--gray-600)" }} />
              <p style={{ fontSize: "15px", color: "var(--gray-500)" }}>
                {entries.length === 0
                  ? "Journal entries will appear here after conversations."
                  : "Select an entry to read."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
    </PageTransition>
  );
};

export default Journal;
