import { describe, it, expect } from "vitest";
import {
  sanitizeMemoryType,
  isVagueMemory,
  isTransientMemory,
  isDuplicate,
  VALID_MEMORY_TYPES,
} from "@/lib/edge-logic/memory-filters";

// ─── sanitizeMemoryType ───

describe("sanitizeMemoryType", () => {
  it("passes through valid types", () => {
    for (const type of VALID_MEMORY_TYPES) {
      expect(sanitizeMemoryType(type)).toBe(type);
    }
  });

  it("maps 'observation' to 'context'", () => {
    expect(sanitizeMemoryType("observation")).toBe("context");
  });

  it("maps 'emotion' to 'moment'", () => {
    expect(sanitizeMemoryType("emotion")).toBe("moment");
  });

  it("maps 'belief' to 'principle'", () => {
    expect(sanitizeMemoryType("belief")).toBe("principle");
  });

  it("maps 'experience' to 'moment'", () => {
    expect(sanitizeMemoryType("experience")).toBe("moment");
  });

  it("maps 'identity' to 'fact'", () => {
    expect(sanitizeMemoryType("identity")).toBe("fact");
  });

  it("maps 'value' to 'principle'", () => {
    expect(sanitizeMemoryType("value")).toBe("principle");
  });

  it("defaults unknown types to 'fact'", () => {
    expect(sanitizeMemoryType("unknown_garbage")).toBe("fact");
    expect(sanitizeMemoryType("random")).toBe("fact");
  });

  it("handles undefined", () => {
    expect(sanitizeMemoryType(undefined)).toBe("fact");
  });

  it("handles empty string", () => {
    expect(sanitizeMemoryType("")).toBe("fact");
  });
});

// ─── isVagueMemory ───

describe("isVagueMemory", () => {
  it("catches 'user mentioned' prefix", () => {
    expect(isVagueMemory("User mentioned something")).toBe(true);
  });

  it("catches 'user talked about' prefix", () => {
    expect(isVagueMemory("User talked about stuff")).toBe(true);
  });

  it("catches 'something about' in content", () => {
    expect(isVagueMemory("something about AI")).toBe(true);
  });

  it("catches 'user seems' prefix", () => {
    expect(isVagueMemory("User seems interested")).toBe(true);
  });

  it("does NOT flag vague pattern if content is long enough (>=40 chars)", () => {
    expect(isVagueMemory("User mentioned they are building a project called Polyphonic for multi-model AI conversations")).toBe(false);
  });

  it("passes real, specific content", () => {
    expect(isVagueMemory("User works as a software engineer at Anthropic")).toBe(false);
  });

  it("passes content that doesn't match any pattern", () => {
    expect(isVagueMemory("Enjoys playing jazz piano on weekends")).toBe(false);
  });
});

// ─── isTransientMemory ───

describe("isTransientMemory", () => {
  it("catches 'user is feeling tired'", () => {
    expect(isTransientMemory("user is feeling tired")).toBe(true);
  });

  it("catches 'user is feeling tired today'", () => {
    expect(isTransientMemory("user is feeling tired today")).toBe(true);
  });

  it("catches greetings", () => {
    expect(isTransientMemory("user said good morning")).toBe(true);
  });

  it("catches weather references", () => {
    expect(isTransientMemory("the weather is nice today")).toBe(true);
  });

  it("catches meal mentions", () => {
    expect(isTransientMemory("user had pasta for lunch")).toBe(true);
  });

  it("catches in-session formatting requests", () => {
    expect(isTransientMemory("user asked to reformat the output")).toBe(true);
  });

  it("passes lasting preferences", () => {
    expect(isTransientMemory("User always prefers dark mode interfaces")).toBe(false);
  });

  it("passes real facts", () => {
    expect(isTransientMemory("User is a senior software engineer at Google")).toBe(false);
  });

  it("catches 'user was bored'", () => {
    expect(isTransientMemory("user was bored")).toBe(true);
  });
});

// ─── isDuplicate ───

describe("isDuplicate", () => {
  it("detects exact duplicate", () => {
    const result = isDuplicate(
      { content: "User enjoys hiking in mountains" },
      [{ content: "User enjoys hiking in mountains" }]
    );
    expect(result.duplicate).toBe(true);
  });

  it("detects case-insensitive exact duplicate", () => {
    const result = isDuplicate(
      { content: "User enjoys hiking" },
      [{ content: "user enjoys hiking" }]
    );
    expect(result.duplicate).toBe(true);
  });

  it("detects first-60-chars overlap", () => {
    const shared = "User has been working on a creative technology project that ";
    const result = isDuplicate(
      { content: shared + "involves AI consciousness" },
      [{ content: shared + "explores emergence patterns" }]
    );
    expect(result.duplicate).toBe(true);
  });

  it("returns not duplicate for different content", () => {
    const result = isDuplicate(
      { content: "User enjoys playing guitar" },
      [{ content: "User works as a data scientist" }]
    );
    expect(result.duplicate).toBe(false);
  });

  it("returns duplicate for empty content", () => {
    const result = isDuplicate({ content: "" }, []);
    expect(result.duplicate).toBe(true);
  });

  it("returns not duplicate for empty existing list", () => {
    const result = isDuplicate(
      { content: "User enjoys creative coding projects" },
      []
    );
    expect(result.duplicate).toBe(false);
  });

  it("detects tag-overlap duplicate (same type, >80% tags)", () => {
    const result = isDuplicate(
      { content: "User likes hiking trails", tags: ["hiking", "outdoors", "nature", "exercise"], memory_type: "preference" },
      [{ content: "User enjoys hiking paths", tags: ["hiking", "outdoors", "nature", "exercise"], memory_type: "preference", id: "abc" }]
    );
    expect(result.duplicate).toBe(true);
  });

  it("recognizes elaboration (same tags, longer content)", () => {
    const existing = { content: "User likes hiking", tags: ["hiking", "outdoors"], memory_type: "preference", id: "abc" };
    const longer = "User likes hiking and specifically enjoys multi-day backpacking trips through national parks";
    const result = isDuplicate(
      { content: longer, tags: ["hiking", "outdoors"], memory_type: "preference" },
      [existing]
    );
    expect(result.duplicate).toBe(false);
    expect(result.elaborates).toBe("abc");
  });

  it("does not flag tag overlap with different memory types", () => {
    const result = isDuplicate(
      { content: "User values hiking for health", tags: ["hiking", "health"], memory_type: "principle" },
      [{ content: "User goes hiking weekly", tags: ["hiking", "health"], memory_type: "fact", id: "xyz" }]
    );
    expect(result.duplicate).toBe(false);
  });

  it("skips 60-char check for short content", () => {
    // Both under 30 chars — should not trigger the prefix check
    const result = isDuplicate(
      { content: "User likes cats" },
      [{ content: "User likes dogs" }]
    );
    expect(result.duplicate).toBe(false);
  });
});
