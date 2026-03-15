import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ImportProgress {
  id: string;
  status: string;
  pipelineStage: string;
  processed: number;
  total: number;
  memoriesCreated: number;
  questionsGenerated: number;
  conflictsDetected: number;
  errorMessage: string | null;
  chunksCompleted: number;
  totalChunks: number;
}

const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function useImportStatus() {
  const { user } = useAuth();
  const [activeImport, setActiveImport] = useState<ImportProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stalenessRef = useRef<{ lastProcessed: number; lastProgressAt: number }>({
    lastProcessed: -1,
    lastProgressAt: Date.now(),
  });

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const markAsStalled = useCallback(async (importId: string) => {
    await supabase
      .from("chat_imports")
      .update({ status: "completed", pipeline_stage: "completed" })
      .eq("id", importId);
  }, []);

  const poll = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("chat_imports")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) {
      if (activeImport) {
        const { data: finished } = await supabase
          .from("chat_imports")
          .select("*")
          .eq("id", activeImport.id)
          .maybeSingle();

        if (finished) {
          setActiveImport({
            id: finished.id,
            status: finished.status,
            pipelineStage: finished.pipeline_stage || "completed",
            processed: finished.processed_conversations || 0,
            total: finished.total_conversations || 0,
            memoriesCreated: finished.memories_created || 0,
            questionsGenerated: finished.questions_generated || 0,
            conflictsDetected: finished.conflicts_detected || 0,
            errorMessage: finished.error_message,
            chunksCompleted: finished.processed_conversations
              ? Math.ceil(finished.processed_conversations / 10)
              : 0,
            totalChunks: finished.total_conversations
              ? Math.ceil(finished.total_conversations / 10)
              : 0,
          });
        }
        stopPolling();
      }
      return;
    }

    const currentProcessed = data.processed_conversations || 0;

    // Staleness detection
    if (data.status === "processing") {
      if (currentProcessed !== stalenessRef.current.lastProcessed) {
        stalenessRef.current = { lastProcessed: currentProcessed, lastProgressAt: Date.now() };
      } else if (Date.now() - stalenessRef.current.lastProgressAt > STALE_TIMEOUT_MS) {
        await markAsStalled(data.id);
        setActiveImport({
          id: data.id,
          status: "completed",
          pipelineStage: "completed",
          processed: currentProcessed,
          total: data.total_conversations || 0,
          memoriesCreated: data.memories_created || 0,
          questionsGenerated: data.questions_generated || 0,
          conflictsDetected: data.conflicts_detected || 0,
          errorMessage: null,
          chunksCompleted: Math.ceil(currentProcessed / 10),
          totalChunks: Math.ceil((data.total_conversations || 0) / 10),
        });
        stopPolling();
        return;
      }
    }

    setActiveImport({
      id: data.id,
      status: data.status,
      pipelineStage: data.pipeline_stage || "queued",
      processed: currentProcessed,
      total: data.total_conversations || 0,
      memoriesCreated: data.memories_created || 0,
      questionsGenerated: data.questions_generated || 0,
      conflictsDetected: data.conflicts_detected || 0,
      errorMessage: data.error_message,
      chunksCompleted: Math.ceil(currentProcessed / 10),
      totalChunks: Math.ceil((data.total_conversations || 0) / 10),
    });
  }, [user, activeImport, stopPolling, markAsStalled]);

  const startTracking = useCallback((importId: string, total: number) => {
    setActiveImport({
      id: importId,
      status: "processing",
      pipelineStage: "extracting",
      processed: 0,
      total,
      memoriesCreated: 0,
      questionsGenerated: 0,
      conflictsDetected: 0,
      errorMessage: null,
      chunksCompleted: 0,
      totalChunks: Math.ceil(total / 10),
    });
    stopPolling();
    pollRef.current = setInterval(poll, 3000);
  }, [poll, stopPolling]);

  // On mount, check for any active imports
  useEffect(() => {
    if (!user) return;
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Start interval when activeImport is in-progress
  useEffect(() => {
    if (activeImport && (activeImport.status === "pending" || activeImport.status === "processing")) {
      if (!pollRef.current) {
        pollRef.current = setInterval(poll, 3000);
      }
    }
    return () => {};
  }, [activeImport?.status, poll]);

  useEffect(() => {
    return stopPolling;
  }, [stopPolling]);

  const dismiss = useCallback(() => {
    setActiveImport(null);
    stopPolling();
  }, [stopPolling]);

  const cancel = useCallback(async () => {
    if (!activeImport) return;
    await supabase
      .from("chat_imports")
      .update({ status: "completed", pipeline_stage: "completed", completed_at: new Date().toISOString() })
      .eq("id", activeImport.id);
    setActiveImport({
      ...activeImport,
      status: "completed",
      pipelineStage: "completed",
    });
    stopPolling();
  }, [activeImport, stopPolling]);

  const isActive = activeImport && (activeImport.status === "pending" || activeImport.status === "processing");

  return { activeImport, isActive: !!isActive, startTracking, dismiss, cancel };
}
