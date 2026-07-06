import { describe, it, expect } from "vitest";
import {
  computeDecayedValues,
  determineState,
} from "../../supabase/functions/_shared/mnemos/decay";
import { computeEncodingSalience } from "../../supabase/functions/_shared/mnemos/salience";
import {
  buildDurableCandidateDraft,
  computeDurableCandidateConfidence,
  inferDurableCandidateMemoryType,
} from "../../supabase/functions/_shared/mnemos/consolidation";
import { computeSeedActivation } from "../../supabase/functions/_shared/mnemos/retrieval";
import { validateSofteningProposal } from "../../supabase/functions/_shared/mnemos/softening";
import type { Engram } from "../../supabase/functions/_shared/mnemos/types";

describe("mnemos salience gate", () => {
  it("rejects low-signal small talk", () => {
    const d = computeEncodingSalience({
      surprise: 0.15,
      emotionalArousal: 0,
      emotionalValence: 0,
      tags: [],
      existingEngramCount: 100,
    });
    expect(d.encode).toBe(false);
  });

  it("encodes high-surprise emotional content", () => {
    const d = computeEncodingSalience({
      surprise: 0.9,
      emotionalArousal: 0.85,
      emotionalValence: -0.8,
      tags: [],
      existingEngramCount: 100,
    });
    expect(d.encode).toBe(true);
  });

  it("forces encoding for identity-class tags", () => {
    const d = computeEncodingSalience({
      surprise: 0.05,
      emotionalArousal: 0,
      emotionalValence: 0,
      tags: ["preference"],
      existingEngramCount: 100,
    });
    expect(d.encode).toBe(true);
    expect(d.reason).toContain("forcing_tag");
  });

  it("forces encoding for explicit continuity-carry tags", () => {
    const d = computeEncodingSalience({
      surprise: 0.05,
      emotionalArousal: 0,
      emotionalValence: 0,
      tags: ["conversation", "continuity-carry"],
      existingEngramCount: 100,
    });
    expect(d.encode).toBe(true);
    expect(d.reason).toBe("forcing_tag:continuity-carry");
  });

  it("loosens during the bootstrap window", () => {
    const beat = {
      surprise: 0.55,
      emotionalArousal: 0.1,
      emotionalValence: 0,
      tags: [],
    };
    const cold = computeEncodingSalience({ ...beat, existingEngramCount: 5 });
    const warm = computeEncodingSalience({ ...beat, existingEngramCount: 500 });
    expect(cold.encode).toBe(true);
    expect(warm.encode).toBe(false);
  });

  it("dampens tiny mundane chat even when novelty is high", () => {
    const d = computeEncodingSalience({
      surprise: 1,
      emotionalArousal: 0.3,
      emotionalValence: 0,
      tags: ["conversation"],
      content: "User: hey\nAssistant: hey.",
      sourceType: "chat_exchange",
      existingEngramCount: 500,
    });

    expect(d.encode).toBe(false);
    expect(d.reason).toBe("mundane_chat");
  });

  it("does not dampen short durable preference markers", () => {
    const d = computeEncodingSalience({
      surprise: 0.9,
      emotionalArousal: 0.3,
      emotionalValence: 0,
      tags: ["conversation"],
      content: "User: remember cedar mode\nAssistant: noted.",
      sourceType: "chat_exchange",
      existingEngramCount: 500,
    });

    expect(d.encode).toBe(true);
  });
});

describe("mnemos dual-trace decay", () => {
  const base = {
    strength: 0.7,
    stability: 0.1,
    accessibility: 0.7,
    connections: 0,
    elapsedHours: 24,
    ageHours: 24 * 30, // outside the 72h floor
  };

  it("accessibility decays faster than strength", () => {
    const r = computeDecayedValues(base);
    const accessibilityLoss = base.accessibility - r.accessibility;
    const strengthLoss = base.strength - r.strength;
    expect(accessibilityLoss).toBeGreaterThan(strengthLoss * 5);
  });

  it("high stability slows decay dramatically", () => {
    const fresh = computeDecayedValues(base);
    const consolidated = computeDecayedValues({ ...base, stability: 0.9 });
    expect(consolidated.accessibility).toBeGreaterThan(fresh.accessibility);
    // Consolidated memories should retain >95% of accessibility after 24h.
    expect(consolidated.accessibility).toBeGreaterThan(0.66);
  });

  it("connection-rich engrams resist decay and gain stability", () => {
    const lonely = computeDecayedValues(base);
    const networked = computeDecayedValues({ ...base, connections: 8, stability: 0.2 });
    expect(networked.accessibility).toBeGreaterThan(lonely.accessibility);
    expect(networked.stability).toBeGreaterThan(0.2);
  });

  it("recent engrams have an accessibility floor (72h)", () => {
    const recent = computeDecayedValues({ ...base, ageHours: 24, elapsedHours: 1 });
    expect(recent.accessibility).toBeGreaterThanOrEqual(0.4);
  });

  it("transitions to dormant when accessibility falls below 0.1", () => {
    const state = determineState(0.4, 0.05, "active", 100);
    expect(state).toBe("dormant");
  });

  it("only archives dormant engrams after 30 days untouched", () => {
    expect(determineState(0.005, 0.005, "dormant", 24 * 5)).toBe("dormant");
    expect(determineState(0.005, 0.005, "dormant", 24 * 31)).toBe("archived");
  });
});

describe("mnemos durable candidate bridge", () => {
  const engram = (overrides: Partial<Engram> = {}): Engram => ({
    id: "engram-1",
    user_id: "user-1",
    agent_id: "agent-1",
    content: "The user values quiet continuity work.",
    engram_type: "semantic",
    strength: 0.8,
    stability: 0.75,
    accessibility: 0.7,
    emotional_valence: 0.2,
    emotional_arousal: 0.2,
    surprise_score: 0.2,
    source_context: {},
    tags: ["continuity"],
    state: "active",
    last_accessed_at: "2026-06-28T00:00:00.000Z",
    access_count: 4,
    created_at: "2026-06-28T00:00:00.000Z",
    updated_at: "2026-06-28T00:00:00.000Z",
    ...overrides,
  });

  it("maps promoted engram tags into reviewable memory types", () => {
    expect(inferDurableCandidateMemoryType({ tags: ["relationship", "trust"], source_context: {} }))
      .toBe("relationship");
    expect(inferDurableCandidateMemoryType({ tags: ["preference"], source_context: {} }))
      .toBe("preference");
    expect(inferDurableCandidateMemoryType({ tags: ["continuity"], source_context: { type: "hypomnema_graduation" } }))
      .toBe("pattern");
  });

  it("keeps promoted candidate confidence bounded but meaningful", () => {
    const weak = computeDurableCandidateConfidence({
      strength: 0.1,
      stability: 0.1,
      access_count: 0,
      surprise_score: 0,
      emotional_arousal: 0,
    });
    const strong = computeDurableCandidateConfidence({
      strength: 0.9,
      stability: 0.8,
      access_count: 8,
      surprise_score: 0.5,
      emotional_arousal: 0.2,
    });

    expect(weak).toBeGreaterThanOrEqual(0.48);
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeLessThanOrEqual(0.92);
  });

  it("distills a meaningful conversation-only quiz moment instead of surfacing raw transcript", () => {
    const draft = buildDurableCandidateDraft(engram({
      content: `User: We did the Knights Radiant quiz and it turns out he is an Edgedancer. He loved that.\nAssistant: That feels meaningful.`,
      tags: ["conversation"],
      engram_type: "semantic",
      stability: 0.9,
      surprise_score: 0.7,
    }));

    expect(draft?.content).toContain("Knights Radiant quiz");
    expect(draft?.content).toContain("Edgedancer");
    expect(draft?.content).not.toContain("User:");
    expect(draft?.tags).toContain("self-understanding");
    expect(draft?.distilled).toBe(true);
  });

  it("skips raw conversation substrate when it cannot be distilled", () => {
    const draft = buildDurableCandidateDraft(engram({
      content: "User: hey\nAssistant: hi, how can I help?",
      tags: ["conversation"],
      engram_type: "semantic",
    }));

    expect(draft).toBeNull();
  });

  it("skips deep-analysis and big-five profile artifacts", () => {
    const draft = buildDurableCandidateDraft(engram({
      content: "PERSONALITY DIMENSIONS — openness: 0.95/100, neuroticism: 0.85/100",
      tags: ["profile", "big-five", "deep-analysis"],
      engram_type: "semantic",
    }));

    expect(draft).toBeNull();
  });

  it("skips explicit intimate content even when the engram is semantic", () => {
    const draft = buildDurableCandidateDraft(engram({
      content: "The user described straddling the agent and grinding slowly during roleplay.",
      tags: ["relationship"],
      engram_type: "semantic",
    }));

    expect(draft).toBeNull();
  });
});

describe("mnemos retrieval activation", () => {
  const engram = (overrides: Partial<Engram> = {}): Engram => ({
    id: "engram-1",
    user_id: "user-1",
    agent_id: "agent-1",
    content: "The user values quiet continuity work.",
    engram_type: "semantic",
    strength: 0.8,
    stability: 0.75,
    accessibility: 0.7,
    emotional_valence: 0.2,
    emotional_arousal: 0.2,
    surprise_score: 0.2,
    source_context: {},
    tags: ["continuity"],
    state: "active",
    last_accessed_at: "2026-06-28T00:00:00.000Z",
    access_count: 4,
    created_at: "2026-06-28T00:00:00.000Z",
    updated_at: "2026-06-28T00:00:00.000Z",
    ...overrides,
  });

  it("lets accessibility matter when ranking otherwise similar engrams", () => {
    const lowStrengthAccessible = engram({
      id: "accessible",
      strength: 0.34,
      accessibility: 0.95,
      last_accessed_at: "2026-06-28T00:00:00.000Z",
    });
    const highStrengthInaccessible = engram({
      id: "inaccessible",
      strength: 0.46,
      accessibility: 0.02,
      last_accessed_at: "2026-06-28T00:00:00.000Z",
    });

    expect(computeSeedActivation(lowStrengthAccessible, 0.5))
      .toBeGreaterThan(computeSeedActivation(highStrengthInaccessible, 0.5));
  });
});

describe("mnemos softening conservator", () => {
  const original = "Riley said the Knights Radiant quiz result seemed meaningful because Edgedancer matched his care for ordinary continuity and overlooked people.";

  it("rejects proposals that flatten specific content", () => {
    const result = validateSofteningProposal(original, "The user had an important experience.");

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("generic_flattening");
  });

  it("rejects proposals that convert uncertainty into certainty", () => {
    const result = validateSofteningProposal(original, "The Knights Radiant quiz definitely proves Riley is an Edgedancer.");

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("certainty_inflation");
  });

  it("accepts shorter proposals that preserve concrete anchors", () => {
    const result = validateSofteningProposal(
      original,
      "Riley linked the Knights Radiant quiz to Edgedancer, continuity, and care for overlooked people.",
    );

    expect(result.valid).toBe(true);
  });
});
