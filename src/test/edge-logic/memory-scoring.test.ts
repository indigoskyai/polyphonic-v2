import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  scoreMemory,
  confidenceIndicator,
  freshnessNote,
  TYPE_WEIGHTS,
  type MemoryRow,
  type ScoredMemory,
} from "@/lib/edge-logic/memory-scoring";

function makeMemory(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    content: "User enjoys building creative technology projects",
    confidence: 0.8,
    decay_factor: 1.0,
    created_at: new Date().toISOString(),
    access_count: 0,
    emotional_intensity: 0,
    memory_type: "fact",
    detail_level: "standard",
    tags: [],
    provenance: null,
    estimated_date: null,
    ...overrides,
  };
}

describe("scoreMemory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("recent memory (<=7 days) gets 1.5x recency boost", () => {
    const recent = makeMemory({ created_at: "2026-03-10T12:00:00Z" });
    const older = makeMemory({ created_at: "2026-02-01T12:00:00Z" });
    const ctx = new Set<string>();
    expect(scoreMemory(recent, ctx)).toBeGreaterThan(scoreMemory(older, ctx));
  });

  it("higher confidence scores higher", () => {
    const high = makeMemory({ confidence: 0.95 });
    const low = makeMemory({ confidence: 0.3 });
    const ctx = new Set<string>();
    expect(scoreMemory(high, ctx)).toBeGreaterThan(scoreMemory(low, ctx));
  });

  it("keyword match boosts score", () => {
    const mem = makeMemory({ content: "User enjoys building creative technology projects" });
    const withContext = scoreMemory(mem, new Set(["creative", "technology"]));
    const noContext = scoreMemory(mem, new Set());
    expect(withContext).toBeGreaterThan(noContext);
  });

  it("null confidence defaults to 0.5", () => {
    const mem = makeMemory({ confidence: null });
    const score = scoreMemory(mem, new Set());
    expect(score).toBeGreaterThan(0);
  });

  it("access count provides diminishing boost", () => {
    const noAccess = makeMemory({ access_count: 0 });
    const someAccess = makeMemory({ access_count: 10 });
    const manyAccess = makeMemory({ access_count: 100 });
    const ctx = new Set<string>();
    const s0 = scoreMemory(noAccess, ctx);
    const s10 = scoreMemory(someAccess, ctx);
    const s100 = scoreMemory(manyAccess, ctx);
    expect(s10).toBeGreaterThan(s0);
    expect(s100).toBeGreaterThan(s10);
    // Diminishing: gap between 10->100 should be less than 10x the 0->10 gap
    expect(s100 - s10).toBeLessThan((s10 - s0) * 10);
  });

  it("emotional intensity boosts score", () => {
    const neutral = makeMemory({ emotional_intensity: 0 });
    const emotional = makeMemory({ emotional_intensity: 0.9 });
    const ctx = new Set<string>();
    expect(scoreMemory(emotional, ctx)).toBeGreaterThan(scoreMemory(neutral, ctx));
  });

  it("synthesis type outweighs context type", () => {
    const synthesis = makeMemory({ memory_type: "synthesis" });
    const context = makeMemory({ memory_type: "context" });
    const ctx = new Set<string>();
    expect(scoreMemory(synthesis, ctx)).toBeGreaterThan(scoreMemory(context, ctx));
  });

  it("detailed memories score higher than brief ones", () => {
    const detailed = makeMemory({ detail_level: "detailed" });
    const brief = makeMemory({ detail_level: "brief" });
    const ctx = new Set<string>();
    expect(scoreMemory(detailed, ctx)).toBeGreaterThan(scoreMemory(brief, ctx));
  });

  it("decay_factor reduces score", () => {
    const fresh = makeMemory({ decay_factor: 1.0 });
    const decayed = makeMemory({ decay_factor: 0.3 });
    const ctx = new Set<string>();
    expect(scoreMemory(fresh, ctx)).toBeGreaterThan(scoreMemory(decayed, ctx));
  });

  it("context words only count words > 3 chars", () => {
    const mem = makeMemory({ content: "I am ok at it" });
    // "am", "ok", "at", "it" all <=3 chars, only "I" is 1 char — none qualify
    const withShortCtx = scoreMemory(mem, new Set(["am", "ok"]));
    const noCtx = scoreMemory(mem, new Set());
    expect(withShortCtx).toBe(noCtx);
  });

  it("emotional boost increases score for matching memory types", () => {
    const relationship = makeMemory({ memory_type: "relationship" });
    const ctx = new Set<string>();
    const withBoost = scoreMemory(relationship, ctx, { dominantDimensions: ["warmth"] });
    const without = scoreMemory(relationship, ctx);
    expect(withBoost).toBeGreaterThan(without);
  });

  it("emotional boost does not affect non-matching types", () => {
    const fact = makeMemory({ memory_type: "fact" });
    const ctx = new Set<string>();
    const withBoost = scoreMemory(fact, ctx, { dominantDimensions: ["warmth"] });
    const without = scoreMemory(fact, ctx);
    expect(withBoost).toBe(without);
  });

  it("curiosity boosts insight and experience types", () => {
    const insight = makeMemory({ memory_type: "insight" });
    const ctx = new Set<string>();
    const boosted = scoreMemory(insight, ctx, { dominantDimensions: ["curiosity"] });
    const base = scoreMemory(insight, ctx);
    expect(boosted).toBeGreaterThan(base);
  });

  it("empty dominantDimensions has no effect", () => {
    const mem = makeMemory();
    const ctx = new Set<string>();
    const withEmpty = scoreMemory(mem, ctx, { dominantDimensions: [] });
    const without = scoreMemory(mem, ctx);
    expect(withEmpty).toBe(without);
  });
});

describe("confidenceIndicator", () => {
  it("returns ● for >= 0.9", () => {
    expect(confidenceIndicator(0.9)).toBe("●");
    expect(confidenceIndicator(1.0)).toBe("●");
  });

  it("returns ◐ for >= 0.7", () => {
    expect(confidenceIndicator(0.7)).toBe("◐");
    expect(confidenceIndicator(0.89)).toBe("◐");
  });

  it("returns ○ for >= 0.4", () => {
    expect(confidenceIndicator(0.4)).toBe("○");
    expect(confidenceIndicator(0.69)).toBe("○");
  });

  it("returns ◌ for < 0.4", () => {
    expect(confidenceIndicator(0.39)).toBe("◌");
    expect(confidenceIndicator(0)).toBe("◌");
  });
});

describe("freshnessNote", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty string for non-imported memories", () => {
    const m = { ...makeMemory(), _score: 1 } as ScoredMemory;
    expect(freshnessNote(m)).toBe("");
  });

  it("returns '[imported]' for chatgpt import without date", () => {
    const m = {
      ...makeMemory({ provenance: { source: "chatgpt_import" } }),
      _score: 1,
    } as ScoredMemory;
    expect(freshnessNote(m)).toBe(" [imported]");
  });

  it("returns '[imported, recent]' for import <= 1 month ago", () => {
    const m = {
      ...makeMemory({
        provenance: { source: "chatgpt_import" },
        estimated_date: "2026-03-01",
      }),
      _score: 1,
    } as ScoredMemory;
    expect(freshnessNote(m)).toBe(" [imported, recent]");
  });

  it("returns months ago for 2-12 months", () => {
    const m = {
      ...makeMemory({
        provenance: { source: "chatgpt_import" },
        estimated_date: "2025-09-01",
      }),
      _score: 1,
    } as ScoredMemory;
    const note = freshnessNote(m);
    expect(note).toMatch(/\[imported, ~\d+mo ago\]/);
  });

  it("returns years ago for > 12 months", () => {
    const m = {
      ...makeMemory({
        provenance: { source: "chatgpt_import" },
        estimated_date: "2024-01-01",
      }),
      _score: 1,
    } as ScoredMemory;
    const note = freshnessNote(m);
    expect(note).toMatch(/\[imported, ~\d+y ago\]/);
  });
});
