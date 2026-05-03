import { describe, it, expect } from "vitest";
import {
  computeDecayedValues,
  determineState,
} from "../../supabase/functions/_shared/mnemos/decay";
import { computeEncodingSalience } from "../../supabase/functions/_shared/mnemos/salience";

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
