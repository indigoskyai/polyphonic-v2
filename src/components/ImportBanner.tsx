import { Sparkles, CheckCircle2, AlertCircle, X, Loader2 } from "lucide-react";
import type { ImportProgress } from "@/hooks/useImportStatus";

interface ImportBannerProps {
  importProgress: ImportProgress;
  isActive: boolean;
  onDismiss: () => void;
  onCancel?: () => void;
}

export function ImportBanner({ importProgress, isActive, onDismiss, onCancel }: ImportBannerProps) {
  const pct = importProgress.total > 0 ? Math.round((importProgress.processed / importProgress.total) * 100) : 0;

  if (importProgress.status === "failed") {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2.5 rounded-xl mx-4 mt-2"
        style={{ background: "hsl(0 30% 15%)", border: "1px solid hsl(0 40% 25%)" }}
      >
        <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "hsl(0 65% 55%)" }} />
        <span className="flex-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Import failed: {importProgress.errorMessage || "Unknown error"}
        </span>
        <button onClick={onDismiss} className="p-1 rounded-md hover:bg-white/5 transition-colors">
          <X className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
        </button>
      </div>
    );
  }

  if (importProgress.status === "completed") {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2.5 rounded-xl mx-4 mt-2"
        style={{ background: "hsl(142 30% 12%)", border: "1px solid hsl(142 30% 22%)" }}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "hsl(142 71% 45%)" }} />
        <span className="flex-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Import complete — {importProgress.memoriesCreated} memories from {importProgress.processed} conversations
        </span>
        <button onClick={onDismiss} className="p-1 rounded-md hover:bg-white/5 transition-colors">
          <X className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
        </button>
      </div>
    );
  }

  // Active / processing
  const isSynthesizing = importProgress.pipelineStage === "synthesizing";
  const stageLabel = isSynthesizing
    ? "Synthesizing memories..."
    : `Processing chunk ${importProgress.chunksCompleted + 1} of ${importProgress.totalChunks}`;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl mx-4 mt-2"
      style={{ background: "var(--bg-input)", border: "1px solid hsl(var(--border-subtle))" }}
    >
      {isSynthesizing ? (
        <Sparkles className="h-4 w-4 shrink-0 animate-pulse" style={{ color: "var(--text-primary)" }} />
      ) : (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: "var(--text-primary)" }} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {stageLabel}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {importProgress.processed}/{importProgress.total} · {importProgress.memoriesCreated} memories · {pct}%
          </span>
        </div>
        <div className="w-full h-1 rounded-full mt-1.5 overflow-hidden" style={{ background: "var(--gray-800)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ background: "var(--text-primary)", width: isSynthesizing ? "95%" : `${pct}%` }}
          />
        </div>
      </div>
      {onCancel && (
        <button
          onClick={onCancel}
          className="text-xs px-2 py-1 rounded-md hover:bg-white/5 transition-colors"
          style={{ color: "var(--text-muted)", border: "1px solid hsl(var(--border-subtle))" }}
        >
          Cancel
        </button>
      )}
      <button onClick={onDismiss} className="p-1 rounded-md hover:bg-white/5 transition-colors">
        <X className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
      </button>
    </div>
  );
}
