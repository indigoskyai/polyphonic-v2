/**
 * Architecture Audit — Static Source Analysis
 *
 * These tests read actual source files and verify that model defaults,
 * frontend constants, and structural patterns remain correct.
 * They prevent silent regressions when someone swaps a model string
 * or removes a critical code path.
 */

import { resolve } from "path";
import { readFileSync, existsSync } from "fs";

const ROOT = resolve(__dirname, "../../..");

function readSource(relativePath: string): string {
  const full = resolve(ROOT, relativePath);
  if (!existsSync(full)) {
    throw new Error(`Source file not found: ${full}`);
  }
  return readFileSync(full, "utf-8");
}

// ─────────────────────────────────────────────
// 1. Edge function model defaults
// ─────────────────────────────────────────────

describe("Edge function model defaults", () => {
  test("anima-dream defaults to gemini-3-pro-preview (alternating pool)", () => {
    const source = readSource("supabase/functions/anima-dream/index.ts");
    expect(source).toContain('"google/gemini-3-pro-preview"');
    expect(source).toContain('"moonshotai/kimi-k2.5"');
  });

  test("anima-observe uses grok-4, gemini-3-pro-preview, kimi-k2.5 as default observers", () => {
    const source = readSource("supabase/functions/anima-observe/index.ts");
    expect(source).toContain('"x-ai/grok-4"');
    expect(source).toContain('"google/gemini-3-pro-preview"');
    expect(source).toContain('"moonshotai/kimi-k2.5"');
  });

  test("chat defaults to claude-opus-4.6", () => {
    const source = readSource("supabase/functions/chat/index.ts");
    expect(source).toContain('"anthropic/claude-opus-4.6"');
  });

  test("journal-write defaults to claude-opus-4.6", () => {
    const source = readSource("supabase/functions/journal-write/index.ts");
    expect(source).toContain('"anthropic/claude-opus-4.6"');
  });

  test("anima-initiate defaults to claude-sonnet-4.6", () => {
    const source = readSource("supabase/functions/anima-initiate/index.ts");
    expect(source).toContain('"anthropic/claude-sonnet-4.6"');
  });

  test("anima-believe defaults to gemini-3-pro-preview", () => {
    const source = readSource("supabase/functions/anima-believe/index.ts");
    expect(source).toContain('"google/gemini-3-pro-preview"');
  });

  test("memory-reflect defaults to claude-sonnet-4.6", () => {
    const source = readSource("supabase/functions/memory-reflect/index.ts");
    expect(source).toContain('"anthropic/claude-sonnet-4.6"');
  });
});

// ─────────────────────────────────────────────
// 2. Frontend defaults
// ─────────────────────────────────────────────

describe("Frontend defaults", () => {
  test("FRONTIER_MODELS is exported from ModelSelector", () => {
    const source = readSource("src/components/ModelSelector.tsx");
    expect(source).toContain("export const FRONTIER_MODELS");
  });

  test("ModelSelector imports Sparkles from lucide-react", () => {
    const source = readSource("src/components/ModelSelector.tsx");
    expect(source).toMatch(/import\s*\{[^}]*Sparkles[^}]*\}\s*from\s*["']lucide-react["']/);
  });

  test("FRONTIER_MODELS includes all six frontier models", () => {
    const source = readSource("src/components/ModelSelector.tsx");
    expect(source).toContain('"anthropic/claude-opus-4.6"');
    expect(source).toContain('"anthropic/claude-sonnet-4.6"');
    expect(source).toContain('"openai/gpt-5.2"');
    expect(source).toContain('"google/gemini-3-pro-preview"');
    expect(source).toContain('"moonshotai/kimi-k2.5"');
    expect(source).toContain('"x-ai/grok-4"');
  });

  test("useUserSettings defaults selected_model to claude-opus-4.6", () => {
    const source = readSource("src/hooks/useUserSettings.ts");
    expect(source).toContain('selected_model: "anthropic/claude-opus-4.6"');
  });

  test("SettingsDialog shows correct role-model defaults (journal, dreamer, observer)", () => {
    const source = readSource("src/components/SettingsDialog.tsx");
    // Journal default
    expect(source).toContain('"anthropic/claude-opus-4.6"');
    // Dreamer default
    expect(source).toContain('"google/gemini-3-pro-preview"');
    // Observer defaults
    expect(source).toContain('"x-ai/grok-4"');
    expect(source).toContain('"moonshotai/kimi-k2.5"');
  });

  test("ObserverPanel defines MODEL_COLORS for grok-4, gemini-3-pro-preview, kimi-k2.5, synthesis", () => {
    const source = readSource("src/components/ObserverPanel.tsx");
    expect(source).toContain("MODEL_COLORS");
    expect(source).toContain('"grok-4"');
    expect(source).toContain('"gemini-3-pro-preview"');
    expect(source).toContain('"kimi-k2.5"');
    expect(source).toContain("synthesis");
  });

  test("useUserSettings interface includes role-based model fields", () => {
    const source = readSource("src/hooks/useUserSettings.ts");
    expect(source).toContain("journal_model");
    expect(source).toContain("dreamer_model");
    expect(source).toContain("observer_models");
    expect(source).toContain("belief_model");
    expect(source).toContain("memory_model");
  });
});

// ─────────────────────────────────────────────
// 3. Structural verification
// ─────────────────────────────────────────────

describe("Structural verification", () => {
  test("anima-dream implements alternating model logic (DREAM_MODELS array)", () => {
    const source = readSource("supabase/functions/anima-dream/index.ts");
    expect(source).toContain("DREAM_MODELS");
    // Verify alternation: checks last dream model to pick the other
    expect(source).toMatch(/lastDream\?\.model_used/);
  });

  test("anima-dream reads user_settings.dreamer_model", () => {
    const source = readSource("supabase/functions/anima-dream/index.ts");
    expect(source).toMatch(/user_settings.*dreamer_model/);
  });

  test("anima-observe reads user_settings.observer_models", () => {
    const source = readSource("supabase/functions/anima-observe/index.ts");
    expect(source).toMatch(/user_settings.*observer_models/);
  });

  test("journal-write reads user_settings.journal_model", () => {
    const source = readSource("supabase/functions/journal-write/index.ts");
    expect(source).toContain("user_settings");
    expect(source).toContain("journal_model");
  });

  test("memory-reflect reads user_settings.memory_model", () => {
    const source = readSource("supabase/functions/memory-reflect/index.ts");
    expect(source).toMatch(/user_settings.*memory_model/);
  });

  test("role_model_settings migration exists", () => {
    const migrationPath = resolve(ROOT, "supabase/migrations/20260312000000_role_model_settings_and_thought_stream.sql");
    expect(existsSync(migrationPath)).toBe(true);
  });
});

// ─────────────────────────────────────────────
// 4. Organic inner life modules
// ─────────────────────────────────────────────

describe("Organic inner life — shared modules", () => {
  test("activity-gate.ts exists and exports evaluate + logProcessRan", () => {
    const source = readSource("supabase/functions/_shared/activity-gate.ts");
    expect(source).toContain("export async function evaluate");
    expect(source).toContain("export async function logProcessRan");
    expect(source).toContain("export async function logActivityEvent");
    expect(source).toContain("PROCESS_CONFIGS");
  });

  test("emotional-context.ts exists and exports loadEmotionalState + formatEmotionalPrompt", () => {
    const source = readSource("supabase/functions/_shared/emotional-context.ts");
    expect(source).toContain("export async function loadEmotionalState");
    expect(source).toContain("export function formatEmotionalPrompt");
    expect(source).toContain("export function getDominantDimensions");
    expect(source).toContain("DIMENSION_DESCRIPTIONS");
  });

  test("activity gate migration exists with activity_events table and resonance triggers", () => {
    const migrationPath = resolve(ROOT, "supabase/migrations/20260312100000_activity_gate_and_resonance.sql");
    expect(existsSync(migrationPath)).toBe(true);
    const source = readFileSync(migrationPath, "utf-8");
    expect(source).toContain("activity_events");
    expect(source).toContain("trigger_resonance");
    expect(source).toContain("trigger_emotional_resonance");
  });
});

describe("Organic inner life — edge function integration", () => {
  test("anima-think imports activity gate and emotional context", () => {
    const source = readSource("supabase/functions/anima-think/index.ts");
    expect(source).toContain("activity-gate.ts");
    expect(source).toContain("emotional-context.ts");
    expect(source).toContain("activityGate");
    expect(source).toContain("triggerContext");
    expect(source).toContain("logProcessRan");
  });

  test("anima-reflect imports activity gate and emotional context", () => {
    const source = readSource("supabase/functions/anima-reflect/index.ts");
    expect(source).toContain("activity-gate.ts");
    expect(source).toContain("emotional-context.ts");
    expect(source).toContain("activityGate");
    expect(source).toContain("triggerContext");
  });

  test("anima-question imports activity gate and emotional context", () => {
    const source = readSource("supabase/functions/anima-question/index.ts");
    expect(source).toContain("activity-gate.ts");
    expect(source).toContain("emotional-context.ts");
    expect(source).toContain("activityGate");
  });

  test("anima-connect imports activity gate for logging", () => {
    const source = readSource("supabase/functions/anima-connect/index.ts");
    expect(source).toContain("activity-gate.ts");
    expect(source).toContain("triggerContext");
    expect(source).toContain("logProcessRan");
  });

  test("anima-observe imports emotional context", () => {
    const source = readSource("supabase/functions/anima-observe/index.ts");
    expect(source).toContain("emotional-context.ts");
    expect(source).toContain("logProcessRan");
    expect(source).toContain("formatEmotionalPrompt");
  });

  test("chat/index.ts has emotionally-aware memory scoring", () => {
    const source = readSource("supabase/functions/chat/index.ts");
    expect(source).toContain("EMOTIONAL_TYPE_AFFINITIES");
    expect(source).toContain("dominantEmotions");
    expect(source).toContain("emotionalStateForScoring");
  });
});

// ─────────────────────────────────────────────
// 5. New edge functions exist
// ─────────────────────────────────────────────

describe("New edge functions exist", () => {
  test("anima-think exists and defaults to claude-opus-4.6", () => {
    const source = readSource("supabase/functions/anima-think/index.ts");
    expect(source).toContain('"anthropic/claude-opus-4.6"');
    expect(source).toContain("thought_stream");
  });

  test("anima-reflect exists and defaults to claude-opus-4.6", () => {
    const source = readSource("supabase/functions/anima-reflect/index.ts");
    expect(source).toContain('"anthropic/claude-opus-4.6"');
    expect(source).toContain("REFLECTOR_PROMPT");
  });

  test("anima-connect exists and defaults to claude-sonnet-4.6", () => {
    const source = readSource("supabase/functions/anima-connect/index.ts");
    expect(source).toContain('"anthropic/claude-sonnet-4.6"');
    expect(source).toContain("memory_connections");
  });

  test("anima-question exists and defaults to claude-opus-4.6", () => {
    const source = readSource("supabase/functions/anima-question/index.ts");
    expect(source).toContain('"anthropic/claude-opus-4.6"');
    expect(source).toContain("curiosity_questions");
  });

  test("anima-consolidate exists and defaults to claude-opus-4.6", () => {
    const source = readSource("supabase/functions/anima-consolidate/index.ts");
    expect(source).toContain('"anthropic/claude-opus-4.6"');
    expect(source).toContain("CONSOLIDATION_PROMPT");
  });
});
