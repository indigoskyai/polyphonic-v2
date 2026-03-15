import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, FileText, Loader2, AlertCircle, Sparkles, CheckCircle2, RotateCcw, Filter, Eye, Check, X, Pencil, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { PersonaReview } from "@/components/PersonaReview";
import JSZip from "jszip";

interface ChatGPTConversation {
  title?: string;
  mapping?: Record<string, any>;
  create_time?: number;
}

type ImportStatus = "idle" | "parsing" | "previewing" | "processing" | "synthesizing" | "extracting_persona" | "persona_reviewing" | "reviewing" | "completed" | "failed";

interface DetectedPersona {
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

interface FilterStats {
  total: number;
  kept: number;
  skippedTooFew: number;
  skippedCodeOnly: number;
  skippedTooOld: number;
}

interface ImportStats {
  totalConversations: number;
  keptConversations: number;
  dateRange: string;
  estimatedTime: string;
  totalChunks: number;
  filterStats: FilterStats;
}

interface ChunkProgress {
  currentChunk: number;
  totalChunks: number;
  memoriesCreated: number;
  questionsGenerated: number;
  conflictsDetected: number;
  conversationsProcessed: number;
  totalConversations: number;
  failedChunks: number;
}

interface ReviewMemory {
  id: string;
  content: string;
  memory_type: string;
  confidence: number;
  staleness_risk: string | null;
  import_needs_confirmation: boolean;
  user_confirmed: boolean | null;
}

interface ChatGPTImportProps {
  onImportStarted?: (importId: string, total: number) => void;
  onPersonaReady?: (importId: string) => void;
}

const CHUNK_SIZE = 10;
const MAX_CONVERSATIONS = 500;

export function ChatGPTImport({ onImportStarted, onPersonaReady }: ChatGPTImportProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const importIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [conversations, setConversations] = useState<ChatGPTConversation[]>([]);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<ChunkProgress | null>(null);
  const [clearing, setClearing] = useState(false);
  const [reviewMemories, setReviewMemories] = useState<ReviewMemory[]>([]);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editingReviewContent, setEditingReviewContent] = useState("");
  const [detectedPersonas, setDetectedPersonas] = useState<DetectedPersona[]>([]);

  // ── Conversation filtering ──
  const TWO_YEARS_MS = 2 * 365 * 86400 * 1000;

  function countUserMessages(conv: ChatGPTConversation): number {
    if (!conv.mapping) return 0;
    let count = 0;
    for (const nodeId of Object.keys(conv.mapping)) {
      const msg = conv.mapping[nodeId]?.message;
      if (msg?.author?.role === "user" && msg?.content?.parts?.some((p: any) => typeof p === "string" && p.trim())) {
        count++;
      }
    }
    return count;
  }

  function isCodeOnlyConversation(conv: ChatGPTConversation): boolean {
    if (!conv.mapping) return false;
    let assistantCodeMsgs = 0;
    let assistantTotal = 0;
    let userPersonalPronouns = 0;

    for (const nodeId of Object.keys(conv.mapping)) {
      const msg = conv.mapping[nodeId]?.message;
      if (!msg?.content?.parts) continue;
      const text = msg.content.parts.filter((p: any) => typeof p === "string").join(" ");
      if (msg.author?.role === "assistant") {
        assistantTotal++;
        if (text.includes("```")) assistantCodeMsgs++;
      }
      if (msg.author?.role === "user") {
        const pronouns = (text.match(/\b(i|me|my|mine|myself|i'm|i've|i'll|i'd)\b/gi) || []).length;
        userPersonalPronouns += pronouns;
      }
    }

    if (assistantTotal < 2) return false;
    return (assistantCodeMsgs / assistantTotal) > 0.8 && userPersonalPronouns < 2;
  }

  function filterConversations(convs: ChatGPTConversation[]): { kept: ChatGPTConversation[]; filterStats: FilterStats } {
    const now = Date.now();
    let skippedTooFew = 0;
    let skippedCodeOnly = 0;
    let skippedTooOld = 0;
    const kept: ChatGPTConversation[] = [];

    for (const conv of convs) {
      if (countUserMessages(conv) < 3) { skippedTooFew++; continue; }
      if (conv.create_time && (now - conv.create_time * 1000) > TWO_YEARS_MS) { skippedTooOld++; continue; }
      if (isCodeOnlyConversation(conv)) { skippedCodeOnly++; continue; }
      kept.push(conv);
    }

    return {
      kept,
      filterStats: { total: convs.length, kept: kept.length, skippedTooFew, skippedCodeOnly, skippedTooOld },
    };
  }

  // ── File parsing with ZIP support ──
  const parseFile = useCallback(async (file: File) => {
    setStatus("parsing");
    setError(null);

    try {
      let parsed: any[];

      if (file.name.endsWith(".zip")) {
        // Extract conversations.json from ZIP
        const zip = await JSZip.loadAsync(file);
        const convFile = zip.file("conversations.json");
        if (!convFile) {
          throw new Error("No conversations.json found in the ZIP file. Make sure this is a ChatGPT data export.");
        }
        const text = await convFile.async("string");
        parsed = JSON.parse(text);
      } else {
        const text = await file.text();
        parsed = JSON.parse(text);
      }

      if (!Array.isArray(parsed)) {
        throw new Error("Expected an array of conversations. Make sure you're uploading the conversations.json file from your ChatGPT export.");
      }

      const valid = parsed.filter(
        (c: any) => c.mapping && typeof c.mapping === "object"
      );

      if (valid.length === 0) {
        throw new Error("No valid conversations found. The file should contain ChatGPT conversations with a 'mapping' field.");
      }

      // Apply filtering
      const { kept, filterStats } = filterConversations(valid);

      if (kept.length === 0) {
        throw new Error(`All ${valid.length} conversations were filtered out (${filterStats.skippedTooFew} too short, ${filterStats.skippedCodeOnly} code-only, ${filterStats.skippedTooOld} too old).`);
      }

      const times = kept
        .map((c: any) => c.create_time)
        .filter(Boolean)
        .sort((a: number, b: number) => a - b);

      const earliest = times[0] ? new Date(times[0] * 1000).toLocaleDateString() : "Unknown";
      const latest = times[times.length - 1] ? new Date(times[times.length - 1] * 1000).toLocaleDateString() : "Unknown";
      const capped = Math.min(kept.length, MAX_CONVERSATIONS);
      const totalChunks = Math.ceil(capped / CHUNK_SIZE);
      const estimatedMinutes = Math.max(1, Math.ceil((totalChunks * 15) / 60));

      setConversations(kept);
      setStats({
        totalConversations: valid.length,
        keptConversations: kept.length,
        dateRange: `${earliest} — ${latest}`,
        estimatedTime: `~${estimatedMinutes} min`,
        totalChunks,
        filterStats,
      });
      setStatus("previewing");
    } catch (e: any) {
      setError(e.message || "Failed to parse file");
      setStatus("idle");
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith(".json") || file.name.endsWith(".zip"))) {
      parseFile(file);
    } else {
      setError("Please drop a .json or .zip file");
    }
  };

  const startImport = async () => {
    if (!user) return;
    setStatus("processing");
    setError(null);
    abortRef.current = false;

    try {
      // Sort by recency, cap
      const sorted = [...conversations]
        .sort((a, b) => (b.create_time || 0) - (a.create_time || 0))
        .slice(0, MAX_CONVERSATIONS);

      const totalConversations = sorted.length;
      const totalChunks = Math.ceil(totalConversations / CHUNK_SIZE);

      // Create import record
      const { data: importRecord, error: insertError } = await supabase
        .from("chat_imports")
        .insert({
          user_id: user.id,
          status: "processing",
          source_platform: "chatgpt",
          total_conversations: totalConversations,
          started_at: new Date().toISOString(),
          pipeline_stage: "extracting",
        })
        .select("id")
        .single();

      if (insertError || !importRecord) {
        throw new Error("Failed to create import record");
      }

      const importId = importRecord.id;
      importIdRef.current = importId;
      onImportStarted?.(importId, totalConversations);

      const { data: session } = await supabase.auth.getSession();
      const accessToken = session?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      // Accumulate created memory contents across chunks for cross-chunk dedup
      const accumulatedMemories: string[] = [];

      // Initialize progress
      const prog: ChunkProgress = {
        currentChunk: 0,
        totalChunks,
        memoriesCreated: 0,
        questionsGenerated: 0,
        conflictsDetected: 0,
        conversationsProcessed: 0,
        totalConversations,
        failedChunks: 0,
      };
      setProgress(prog);

      // Process chunks sequentially
      for (let i = 0; i < totalChunks; i++) {
        if (abortRef.current) break;

        const chunk = sorted.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        prog.currentChunk = i + 1;
        setProgress({ ...prog });

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 120_000);

          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-chatgpt`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                conversations: chunk,
                import_id: importId,
                chunk_index: i,
                total_chunks: totalChunks,
                accumulated_memories: accumulatedMemories,
              }),
              signal: controller.signal,
            }
          );

          clearTimeout(timeout);

          if (!resp.ok) {
            const errText = await resp.text().catch(() => "");
            console.error(`Chunk ${i + 1} failed (${resp.status}):`, errText);
            prog.failedChunks++;
          } else {
            const result = await resp.json();
            prog.memoriesCreated += result.memories_created || 0;
            prog.questionsGenerated += result.questions_generated || 0;
            prog.conflictsDetected += result.conflicts_detected || 0;
            // Collect created memory contents for cross-chunk dedup
            if (Array.isArray(result.created_contents)) {
              accumulatedMemories.push(...result.created_contents);
            }
          }
        } catch (e: any) {
          if (e?.name === "AbortError") {
            console.error(`Chunk ${i + 1} timed out after 120s`);
          } else {
            console.error(`Chunk ${i + 1} error:`, e);
          }
          prog.failedChunks++;
        }

        prog.conversationsProcessed = Math.min((i + 1) * CHUNK_SIZE, totalConversations);
        setProgress({ ...prog });
      }

      // Synthesis pass
      if (prog.memoriesCreated > 5 && !abortRef.current) {
        setStatus("synthesizing");
        try {
          const synthController = new AbortController();
          const synthTimeout = setTimeout(() => synthController.abort(), 120_000);

          const synthResp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/memory-synthesize`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ import_id: importId }),
              signal: synthController.signal,
            }
          );

          clearTimeout(synthTimeout);

          if (synthResp.ok) {
            const synthResult = await synthResp.json();
            prog.memoriesCreated += synthResult.synthesis_memories_created || 0;
          }
        } catch (e) {
          console.error("Synthesis failed:", e);
        }
      }

      // ── Persona extraction phase ──
      if (prog.memoriesCreated > 3 && !abortRef.current) {
        setStatus("extracting_persona");
        try {
          const personaController = new AbortController();
          const personaTimeout = setTimeout(() => personaController.abort(), 120_000);

          const personaResp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-persona`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                import_id: importId,
                conversations: sorted.slice(0, 20),
              }),
              signal: personaController.signal,
            }
          );

          clearTimeout(personaTimeout);

          if (personaResp.ok) {
            const personaResult = await personaResp.json();
            const profiles = personaResult.profiles || [];
            if (profiles.length > 0) {
              setDetectedPersonas(profiles);
              setStatus("persona_reviewing");
              // Wait for user to review personas before continuing
              return;
            }
            onPersonaReady?.(importId);
          } else {
            console.error("Persona extraction failed:", await personaResp.text());
          }
        } catch (e) {
          console.error("Persona extraction error:", e);
        }
      }

      // Finalize import record
      await supabase.from("chat_imports").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        pipeline_stage: "completed",
        processed_conversations: prog.conversationsProcessed,
        memories_created: prog.memoriesCreated,
        questions_generated: prog.questionsGenerated,
        conflicts_detected: prog.conflictsDetected,
      }).eq("id", importId);

      setProgress({ ...prog });

      // ── Load memories for review ──
      if (prog.memoriesCreated > 0) {
        const { data: importedMems } = await supabase
          .from("memories")
          .select("id, content, memory_type, confidence, staleness_risk, import_needs_confirmation, user_confirmed")
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .not("provenance", "is", null)
          .order("import_needs_confirmation", { ascending: false })
          .order("confidence", { ascending: false })
          .limit(200);

        const filtered = (importedMems || []).filter((m: any) => {
          const prov = m.provenance || {};
          return prov.source === "chatgpt_import" && prov.import_id === importId;
        });

        if (filtered.length > 0) {
          setReviewMemories(filtered as ReviewMemory[]);
          setStatus("reviewing");
          return; // Don't show "completed" yet — show review first
        }
      }

      setStatus("completed");
      toast({
        title: "Import complete",
        description: `Created ${prog.memoriesCreated} memories from ${prog.conversationsProcessed} conversations.`,
      });
    } catch (e: any) {
      setError(e.message || "Import failed");
      setStatus("failed");
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    }
  };

  const finishAfterPersonaReview = async () => {
    if (!user || !importIdRef.current) return;

    // Finalize import record
    await supabase.from("chat_imports").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      pipeline_stage: "completed",
      processed_conversations: progress?.conversationsProcessed || 0,
      memories_created: progress?.memoriesCreated || 0,
      questions_generated: progress?.questionsGenerated || 0,
      conflicts_detected: progress?.conflictsDetected || 0,
    }).eq("id", importIdRef.current);

    // Load memories for review
    if (progress && progress.memoriesCreated > 0) {
      const { data: importedMems } = await supabase
        .from("memories")
        .select("id, content, memory_type, confidence, staleness_risk, import_needs_confirmation, user_confirmed")
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .not("provenance", "is", null)
        .order("import_needs_confirmation", { ascending: false })
        .order("confidence", { ascending: false })
        .limit(200);

      const filtered = (importedMems || []).filter((m: any) => {
        const prov = m.provenance || {};
        return prov.source === "chatgpt_import" && prov.import_id === importIdRef.current;
      });

      if (filtered.length > 0) {
        setReviewMemories(filtered as ReviewMemory[]);
        setDetectedPersonas([]);
        setStatus("reviewing");
        return;
      }
    }

    setDetectedPersonas([]);
    setStatus("completed");
    toast({
      title: "Import complete",
      description: `Created ${progress?.memoriesCreated || 0} memories from ${progress?.conversationsProcessed || 0} conversations.`,
    });
  };

  const reset = () => {
    abortRef.current = true;
    setStatus("idle");
    setConversations([]);
    setStats(null);
    setError(null);
    setProgress(null);
    setClearing(false);
    setDetectedPersonas([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearAndRestart = async () => {
    if (!importIdRef.current || !user) return;
    setClearing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clear-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ import_id: importIdRef.current }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Failed to clear import data");
      }

      const result = await resp.json();
      toast({
        title: "Import data cleared",
        description: `Removed ${result.memories_deleted} memories and ${result.questions_deleted} questions.`,
      });
      importIdRef.current = null;
      reset();
    } catch (e: any) {
      toast({ title: "Failed to clear data", description: e.message, variant: "destructive" });
      setClearing(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: "6px",
    display: "block",
  };

  const descStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--text-muted)",
    lineHeight: 1.5,
  };

  const pct = progress
    ? Math.round((progress.conversationsProcessed / progress.totalConversations) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div>
        <label style={labelStyle}>Import ChatGPT History</label>
        <p style={descStyle}>
          Upload your <code style={{ fontSize: "11px", background: "var(--gray-800)", padding: "1px 5px", borderRadius: "4px" }}>conversations.json</code> or <code style={{ fontSize: "11px", background: "var(--gray-800)", padding: "1px 5px", borderRadius: "4px" }}>.zip</code> export from ChatGPT. Conversations are filtered and processed in chunks — you can keep chatting while it runs.
        </p>
      </div>

      {/* Idle / completed: file upload */}
      {(status === "idle" || status === "completed") && (
        <>
           {status === "completed" && progress && (
            <div
              className="flex items-center gap-3 p-4 rounded-xl"
              style={{ background: "hsl(142 30% 12%)", border: "1px solid hsl(142 30% 22%)" }}
            >
              <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "hsl(142 71% 45%)" }} />
              <div className="flex-1">
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>Import Complete</p>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                  {progress.memoriesCreated} memories from {progress.conversationsProcessed} conversations
                  {progress.failedChunks > 0 && ` (${progress.failedChunks} chunks had errors)`}
                </p>
              </div>
              <button
                onClick={clearAndRestart}
                disabled={clearing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs disabled:opacity-50"
                style={{
                  background: "transparent",
                  border: "1px solid hsl(var(--border-subtle))",
                  color: "var(--text-secondary)",
                }}
              >
                {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Clear & Restart
              </button>
            </div>
          )}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl cursor-pointer transition-colors"
            style={{
              border: `2px dashed ${dragOver ? "var(--text-primary)" : "hsl(var(--border-subtle))"}`,
              background: dragOver ? "var(--gray-800)" : "var(--bg-input)",
            }}
          >
            <Upload className="h-8 w-8" style={{ color: "var(--text-muted)" }} />
            <div className="text-center">
              <p style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 500 }}>
                Drop conversations.json or .zip here
              </p>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                or click to browse
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.zip"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </>
      )}

      {/* Parsing */}
      {status === "parsing" && (
        <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: "var(--bg-input)", border: "1px solid hsl(var(--border-subtle))" }}>
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--text-muted)" }} />
          <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Parsing file...</span>
        </div>
      )}

      {/* Preview */}
      {status === "previewing" && stats && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl space-y-3" style={{ background: "var(--bg-input)", border: "1px solid hsl(var(--border-subtle))" }}>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" style={{ color: "var(--text-primary)" }} />
              <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>Ready to Import</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Kept", value: stats.keptConversations > MAX_CONVERSATIONS ? `${MAX_CONVERSATIONS} of ${stats.keptConversations}` : stats.keptConversations },
                { label: "Chunks", value: stats.totalChunks },
                { label: "Date Range", value: stats.dateRange },
                { label: "Est. Time", value: stats.estimatedTime },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>{item.value}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Filter breakdown */}
            {(stats.filterStats.skippedTooFew > 0 || stats.filterStats.skippedCodeOnly > 0 || stats.filterStats.skippedTooOld > 0) && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: "var(--gray-800)" }}>
                <Filter className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }} />
                <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                  <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Filtered {stats.totalConversations - stats.keptConversations} conversations: </span>
                  {[
                    stats.filterStats.skippedTooFew > 0 && `${stats.filterStats.skippedTooFew} too short (<3 messages)`,
                    stats.filterStats.skippedCodeOnly > 0 && `${stats.filterStats.skippedCodeOnly} code-only`,
                    stats.filterStats.skippedTooOld > 0 && `${stats.filterStats.skippedTooOld} older than 2 years`,
                  ].filter(Boolean).join(", ")}
                </div>
              </div>
            )}

            {stats.keptConversations > MAX_CONVERSATIONS && (
              <p style={{ fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic" }}>
                Processing the {MAX_CONVERSATIONS} most recent conversations.
              </p>
            )}

            <div className="pt-2" style={{ borderTop: "1px solid hsl(var(--border-subtle))" }}>
              <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                <strong style={{ color: "var(--text-secondary)" }}>Chunked processing:</strong> Each chunk of {CHUNK_SIZE} conversations is analyzed independently, then a synthesis pass extracts your companion profile.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={startImport}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
              style={{
                background: "var(--text-primary)",
                color: "var(--bg-sidebar)",
                fontSize: "13px",
                fontWeight: 500,
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Start Import
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
              style={{
                background: "transparent",
                border: "1px solid hsl(var(--border-subtle))",
                color: "var(--text-secondary)",
                fontSize: "13px",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Processing / Synthesizing / Extracting Persona */}
      {(status === "processing" || status === "synthesizing" || status === "extracting_persona") && progress && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl space-y-3" style={{ background: "var(--bg-input)", border: "1px solid hsl(var(--border-subtle))" }}>
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--text-primary)" }} />
              <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                {status === "extracting_persona" ? "Extracting companion profile..."
                  : status === "synthesizing" ? "Synthesizing memories..."
                  : `Processing chunk ${progress.currentChunk} of ${progress.totalChunks}`}
              </span>
            </div>

            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--gray-800)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  background: "var(--text-primary)",
                  width: status === "extracting_persona" ? "98%" : status === "synthesizing" ? "95%" : `${pct}%`,
                }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                  {progress.conversationsProcessed}/{progress.totalConversations}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Conversations</div>
              </div>
              <div className="text-center">
                <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                  {progress.memoriesCreated}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Memories</div>
              </div>
              <div className="text-center">
                <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                  {progress.questionsGenerated}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Questions</div>
              </div>
            </div>

            {progress.failedChunks > 0 && (
              <p style={{ fontSize: "11px", color: "hsl(0 65% 55%)" }}>
                {progress.failedChunks} chunk(s) failed — continuing with remaining data.
              </p>
            )}
          </div>

          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
            style={{
              background: "transparent",
              border: "1px solid hsl(var(--border-subtle))",
              color: "var(--text-secondary)",
              fontSize: "13px",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Persona Review */}
      {status === "persona_reviewing" && detectedPersonas.length > 0 && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl space-y-3" style={{ background: "var(--bg-input)", border: "1px solid hsl(var(--border-subtle))" }}>
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4" style={{ color: "var(--text-primary)" }} />
              <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                Companion Personas Detected
              </span>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
              We found {detectedPersonas.length} distinct AI persona{detectedPersonas.length > 1 ? "s" : ""} in your conversations. Review and activate the ones you'd like your companion to embody.
            </p>
          </div>

          <PersonaReview
            personas={detectedPersonas}
            mode="import-review"
            onComplete={finishAfterPersonaReview}
            onUpdate={() => {}}
          />
        </div>
      )}

      {/* Failed */}
      {status === "failed" && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: "var(--bg-input)", border: "1px solid hsl(0 65% 50% / 0.3)" }}>
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "hsl(0 65% 50%)" }} />
            <div>
              <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>Import Failed</p>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>{error}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg transition-colors"
              style={{
                background: "transparent",
                border: "1px solid hsl(var(--border-subtle))",
                color: "var(--text-secondary)",
                fontSize: "13px",
              }}
            >
              Try Again
            </button>
            {importIdRef.current && (
              <button
                onClick={clearAndRestart}
                disabled={clearing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                style={{
                  background: "transparent",
                  border: "1px solid hsl(var(--border-subtle))",
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                }}
              >
                {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Clear & Restart
              </button>
            )}
          </div>
        </div>
      )}

      {/* Post-Import Review */}
      {status === "reviewing" && reviewMemories.length > 0 && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl space-y-3" style={{ background: "var(--bg-input)", border: "1px solid hsl(var(--border-subtle))" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4" style={{ color: "var(--text-primary)" }} />
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                  Review Imported Memories
                </span>
              </div>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {reviewMemories.length} memories
              </span>
            </div>

            <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
              Memories highlighted in amber may be outdated and need your confirmation. You can confirm, edit, or remove individual memories.
            </p>

            {/* Bulk actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={async () => {
                  const highConfidence = reviewMemories.filter(m => !m.import_needs_confirmation);
                  for (const m of highConfidence) {
                    await supabase.from("memories").update({ user_confirmed: true }).eq("id", m.id);
                  }
                  setReviewMemories(prev => prev.map(m => !m.import_needs_confirmation ? { ...m, user_confirmed: true } : m));
                  toast({ title: `Confirmed ${highConfidence.length} high-confidence memories` });
                }}
                className="px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: "var(--gray-800)", border: "1px solid hsl(var(--border-subtle))", color: "var(--text-secondary)", fontSize: "11px" }}
              >
                Accept All High-Confidence
              </button>
              <button
                onClick={async () => {
                  const flagged = reviewMemories.filter(m => m.import_needs_confirmation && !m.user_confirmed);
                  for (const m of flagged) {
                    await supabase.from("memories").update({ is_deleted: true }).eq("id", m.id);
                  }
                  setReviewMemories(prev => prev.filter(m => !(m.import_needs_confirmation && !m.user_confirmed)));
                  toast({ title: `Removed ${flagged.length} flagged memories` });
                }}
                className="px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: "transparent", border: "1px solid hsl(0 65% 50% / 0.3)", color: "hsl(0 65% 55%)", fontSize: "11px" }}
              >
                Reject All Flagged
              </button>
            </div>
          </div>

          {/* Memory list */}
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
            {reviewMemories.map((mem) => (
              <div
                key={mem.id}
                className="flex items-start gap-2 p-3 rounded-lg group"
                style={{
                  background: mem.import_needs_confirmation && !mem.user_confirmed
                    ? "hsl(38 80% 50% / 0.06)"
                    : "var(--bg-input)",
                  border: mem.import_needs_confirmation && !mem.user_confirmed
                    ? "1px solid hsl(38 80% 50% / 0.15)"
                    : "1px solid transparent",
                }}
              >
                <div className="flex-1 min-w-0">
                  {editingReviewId === mem.id ? (
                    <div className="flex gap-2">
                      <input
                        value={editingReviewContent}
                        onChange={(e) => setEditingReviewContent(e.target.value)}
                        className="flex-1 rounded px-2 py-1 outline-none"
                        style={{ background: "var(--gray-800)", color: "var(--text-primary)", fontSize: "12px", border: "1px solid hsl(var(--border-subtle))" }}
                        autoFocus
                      />
                      <button
                        onClick={async () => {
                          await supabase.from("memories").update({ content: editingReviewContent, user_confirmed: true }).eq("id", mem.id);
                          setReviewMemories(prev => prev.map(m => m.id === mem.id ? { ...m, content: editingReviewContent, user_confirmed: true } : m));
                          setEditingReviewId(null);
                        }}
                        className="p-1 rounded"
                        style={{ color: "hsl(142 71% 45%)" }}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setEditingReviewId(null)} className="p-1 rounded" style={{ color: "var(--text-muted)" }}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p style={{ fontSize: "12px", color: "var(--text-primary)", lineHeight: 1.5 }}>{mem.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{mem.memory_type}</span>
                        {mem.staleness_risk && mem.staleness_risk !== "low" && (
                          <span style={{ fontSize: "10px", color: mem.staleness_risk === "high" ? "hsl(38 80% 50%)" : "var(--text-muted)" }}>
                            {mem.staleness_risk === "high" ? "possibly outdated" : "~6-12mo old"}
                          </span>
                        )}
                        {mem.user_confirmed && (
                          <span style={{ fontSize: "10px", color: "hsl(142 71% 45%)" }}>confirmed</span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {editingReviewId !== mem.id && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={async () => {
                        await supabase.from("memories").update({ user_confirmed: true, import_needs_confirmation: false }).eq("id", mem.id);
                        setReviewMemories(prev => prev.map(m => m.id === mem.id ? { ...m, user_confirmed: true, import_needs_confirmation: false } : m));
                      }}
                      className="p-1 rounded hover:bg-white/5"
                      title="Confirm"
                    >
                      <Check className="h-3 w-3" style={{ color: "hsl(142 71% 45%)" }} />
                    </button>
                    <button
                      onClick={() => { setEditingReviewId(mem.id); setEditingReviewContent(mem.content); }}
                      className="p-1 rounded hover:bg-white/5"
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" style={{ color: "var(--text-muted)" }} />
                    </button>
                    <button
                      onClick={async () => {
                        await supabase.from("memories").update({ is_deleted: true }).eq("id", mem.id);
                        setReviewMemories(prev => prev.filter(m => m.id !== mem.id));
                      }}
                      className="p-1 rounded hover:bg-white/5"
                      title="Remove"
                    >
                      <X className="h-3 w-3" style={{ color: "hsl(0 65% 55%)" }} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              setStatus("completed");
              setReviewMemories([]);
              toast({ title: "Import finalized", description: `${progress?.memoriesCreated || 0} memories imported.` });
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
            style={{ background: "var(--text-primary)", color: "var(--bg-sidebar)", fontSize: "13px", fontWeight: 500 }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Done
          </button>
        </div>
      )}

      {/* Error display for parsing errors */}
      {error && status === "idle" && (
        <div className="p-3 rounded-lg flex items-start gap-2" style={{ background: "hsl(0 65% 50% / 0.1)", border: "1px solid hsl(0 65% 50% / 0.2)" }}>
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "hsl(0 65% 50%)" }} />
          <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{error}</p>
        </div>
      )}
    </div>
  );
}
