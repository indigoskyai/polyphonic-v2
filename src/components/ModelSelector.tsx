import { useState, useRef, useEffect } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  reasoning?: boolean;
  featured?: boolean;
  maxTemp?: number; // practical coherence limit (defaults to 1.5)
}

export const FRONTIER_MODELS: ModelOption[] = [
  { id: "anthropic/claude-opus-4.6", name: "Opus 4.6", provider: "Anthropic", featured: true, maxTemp: 1.0 },
  { id: "anthropic/claude-sonnet-4.6", name: "Sonnet 4.6", provider: "Anthropic", featured: true, maxTemp: 1.0 },
  { id: "openai/gpt-5.2", name: "GPT-5.2", provider: "OpenAI", featured: true, maxTemp: 1.2 },
  { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro", provider: "Google", featured: true, maxTemp: 1.2 },
  { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5", provider: "Moonshot AI", featured: true, maxTemp: 1.5 },
  { id: "x-ai/grok-4", name: "Grok 4", provider: "xAI", featured: true, maxTemp: 1.2 },
];

/** @deprecated Use FRONTIER_MODELS instead */
export const AVAILABLE_MODELS = FRONTIER_MODELS;

export const DEFAULT_MAX_TEMP = 1.5;

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  frosted?: boolean;
}

export function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = FRONTIER_MODELS.find((m) => m.id === selectedModel) || FRONTIER_MODELS[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const renderModelButton = (model: ModelOption) => (
    <button
      key={model.id}
      onClick={() => { onModelChange(model.id); setOpen(false); }}
      className="w-full flex items-center justify-between px-3 py-2 transition-colors"
      style={{
        background: selectedModel === model.id ? "var(--bg-active)" : "transparent",
        color: "var(--text-primary)",
        fontSize: "14px",
      }}
      onMouseEnter={(e) => { if (selectedModel !== model.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={(e) => { if (selectedModel !== model.id) e.currentTarget.style.background = "transparent"; }}
    >
      <div className="flex items-center gap-2">
        <span style={{ fontWeight: selectedModel === model.id ? 500 : 400 }}>
          {model.name}
        </span>
        {model.reasoning && (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
            style={{ fontSize: "10px", fontWeight: 600, background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
          >
            <Sparkles className="h-2.5 w-2.5" />
            Reasoning
          </span>
        )}
      </div>
      {selectedModel === model.id && (
        <div className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--text-primary)" }} />
      )}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors"
        style={{
          color: "var(--text-primary)",
          fontSize: "16px",
          fontWeight: 600,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <span className="truncate max-w-[200px]">
          {current.name}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} style={{ color: "var(--text-muted)" }} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-64 rounded-xl py-2 z-50"
          style={{
            background: "var(--bg-card)",
            border: "1px solid hsl(var(--border-subtle))",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          {FRONTIER_MODELS.map(renderModelButton)}
        </div>
      )}
    </div>
  );
}
