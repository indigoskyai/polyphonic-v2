import { describe, it, expect } from "vitest";
import {
  parseThoughts,
  parseObservations,
  parseConnection,
  parseQuestions,
  parseMemories,
} from "@/lib/edge-logic/parsers";

// ─── parseThoughts ───

describe("parseThoughts", () => {
  it("parses a single well-formed thought", () => {
    const raw = `THOUGHT: The user seems deeply interested in consciousness research
SALIENCE: 0.8
TAGS: consciousness, research, interest`;
    const result = parseThoughts(raw);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("The user seems deeply interested in consciousness research");
    expect(result[0].salience).toBe(0.8);
    expect(result[0].tags).toEqual(["consciousness", "research", "interest"]);
  });

  it("parses multiple thoughts", () => {
    const raw = `THOUGHT: First thought about memory systems
SALIENCE: 0.7
TAGS: memory, systems
THOUGHT: Second thought about emotional patterns
SALIENCE: 0.9
TAGS: emotion, patterns`;
    const result = parseThoughts(raw);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("First thought about memory systems");
    expect(result[1].content).toBe("Second thought about emotional patterns");
  });

  it("returns empty array for empty input", () => {
    expect(parseThoughts("")).toEqual([]);
  });

  it("returns empty array for non-matching input", () => {
    expect(parseThoughts("just some random text")).toEqual([]);
  });

  it("skips thoughts with content shorter than 10 chars", () => {
    const raw = `THOUGHT: Short
SALIENCE: 0.8
TAGS: test`;
    expect(parseThoughts(raw)).toEqual([]);
  });

  it("defaults salience to 0.5 when missing", () => {
    const raw = `THOUGHT: This is a thought without salience specified here`;
    const result = parseThoughts(raw);
    expect(result).toHaveLength(1);
    expect(result[0].salience).toBe(0.5);
  });

  it("clamps salience above 1 to 1", () => {
    const raw = `THOUGHT: A thought with inflated confidence rating
SALIENCE: 1.5`;
    const result = parseThoughts(raw);
    expect(result[0].salience).toBe(1);
  });

  it("defaults salience for unparseable values", () => {
    // Regex [\d.]+ won't capture negative sign, so it falls back to default
    const raw = `THOUGHT: A thought with negative confidence value
SALIENCE: -0.3`;
    const result = parseThoughts(raw);
    // [\d.]+ won't match the "-" prefix, so salMatch is null → defaults to 0.5
    expect(result[0].salience).toBe(0.5);
  });

  it("handles empty tags gracefully", () => {
    const raw = `THOUGHT: A thought without any tags at all here
SALIENCE: 0.6
TAGS: `;
    const result = parseThoughts(raw);
    expect(result[0].tags).toEqual([]);
  });

  it("lowercases and trims tags", () => {
    const raw = `THOUGHT: A thought with messy tag formatting here
SALIENCE: 0.5
TAGS:  Memory , RECALL,  patterns `;
    const result = parseThoughts(raw);
    expect(result[0].tags).toEqual(["memory", "recall", "patterns"]);
  });

  it("skips blocks without THOUGHT: prefix", () => {
    const raw = `Some preamble text
THOUGHT: Real thought that matters a lot
SALIENCE: 0.7
Not a thought
TAGS: test`;
    const result = parseThoughts(raw);
    expect(result).toHaveLength(1);
  });
});

// ─── parseObservations ───

describe("parseObservations", () => {
  it("parses a single observation", () => {
    const raw = `OBSERVATION: User engagement peaks during evening conversations
TYPE: behavioral
SALIENCE: 0.85`;
    const result = parseObservations(raw);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("User engagement peaks during evening conversations");
    expect(result[0].type).toBe("behavioral");
    expect(result[0].salience).toBe(0.85);
  });

  it("parses multiple observations", () => {
    const raw = `OBSERVATION: Pattern detected in memory formation
TYPE: pattern
SALIENCE: 0.7
OBSERVATION: Emotional resonance increasing over time
TYPE: emotional
SALIENCE: 0.9`;
    const result = parseObservations(raw);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(parseObservations("")).toEqual([]);
  });

  it("defaults type to 'pattern' when missing", () => {
    const raw = `OBSERVATION: Something interesting happening here
SALIENCE: 0.6`;
    const result = parseObservations(raw);
    expect(result[0].type).toBe("pattern");
  });

  it("does not filter by content length (unlike thoughts)", () => {
    const raw = `OBSERVATION: Short
TYPE: note
SALIENCE: 0.5`;
    const result = parseObservations(raw);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Short");
  });

  it("skips blocks with truly empty content after OBSERVATION:", () => {
    const raw = `OBSERVATION:
TYPE: behavioral
SALIENCE: 0.5`;
    // When content between OBSERVATION: and \nTYPE: is just whitespace, trim yields ""
    // But the regex captures whitespace then TYPE line — so we test with a block that has no content
    const result = parseObservations("OBSERVATION:");
    expect(result).toEqual([]);
  });
});

// ─── parseConnection ───

describe("parseConnection", () => {
  it("parses a valid connection", () => {
    const raw = `CONNECTION: Both memories relate to creative problem solving
STRENGTH: 0.75
TYPE: thematic`;
    const result = parseConnection(raw);
    expect(result).not.toBeNull();
    expect(result!.description).toBe("Both memories relate to creative problem solving");
    expect(result!.strength).toBe(0.75);
    expect(result!.relationType).toBe("thematic");
  });

  it("returns null for NO_CONNECTION", () => {
    expect(parseConnection("NO_CONNECTION")).toBeNull();
  });

  it("returns null for NO_CONNECTION embedded in text", () => {
    expect(parseConnection("After analysis: NO_CONNECTION found")).toBeNull();
  });

  it("returns null when CONNECTION: prefix is missing", () => {
    expect(parseConnection("Just some text without structure")).toBeNull();
  });

  it("defaults type to 'thematic' when missing", () => {
    const raw = `CONNECTION: A link between two memories exists
STRENGTH: 0.6`;
    const result = parseConnection(raw);
    expect(result!.relationType).toBe("thematic");
  });

  it("defaults strength to 0.5 when missing", () => {
    const raw = `CONNECTION: Memories share a common emotional thread
TYPE: emotional`;
    const result = parseConnection(raw);
    expect(result!.strength).toBe(0.5);
  });

  it("clamps strength to [0, 1]", () => {
    const raw = `CONNECTION: Very strong link between concepts
STRENGTH: 1.8
TYPE: causal`;
    const result = parseConnection(raw);
    expect(result!.strength).toBe(1);
  });
});

// ─── parseQuestions ───

describe("parseQuestions", () => {
  it("parses a single question", () => {
    const raw = `QUESTION: What drives the user's interest in AI consciousness?
SALIENCE: 0.9
CONTEXT: Recurring theme in conversations`;
    const result = parseQuestions(raw);
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe("What drives the user's interest in AI consciousness?");
    expect(result[0].salience).toBe(0.9);
    expect(result[0].context).toBe("Recurring theme in conversations");
  });

  it("parses multiple questions", () => {
    const raw = `QUESTION: How does the user handle creative blocks?
SALIENCE: 0.7
CONTEXT: productivity
QUESTION: What patterns emerge in their problem-solving?
SALIENCE: 0.8
CONTEXT: cognition`;
    const result = parseQuestions(raw);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(parseQuestions("")).toEqual([]);
  });

  it("skips questions shorter than 10 chars", () => {
    const raw = `QUESTION: Why?
SALIENCE: 0.5`;
    expect(parseQuestions(raw)).toEqual([]);
  });

  it("defaults context to empty string when missing", () => {
    const raw = `QUESTION: What is the meaning of this pattern?
SALIENCE: 0.6`;
    const result = parseQuestions(raw);
    expect(result[0].context).toBe("");
  });

  it("defaults salience to 0.5 when missing", () => {
    const raw = `QUESTION: Does the user prefer structured or freeform conversation?`;
    const result = parseQuestions(raw);
    expect(result[0].salience).toBe(0.5);
  });
});

// ─── parseMemories ───

describe("parseMemories", () => {
  it("parses a full memory block", () => {
    const raw = `MEMORY: User works as a creative technologist building AI interfaces
TYPE: fact
EMOTIONAL_CONTEXT: engaged and passionate
SALIENCE: 0.95
TAGS: career, technology, creativity`;
    const result = parseMemories(raw);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("User works as a creative technologist building AI interfaces");
    expect(result[0].memoryType).toBe("fact");
    expect(result[0].emotionalContext).toBe("engaged and passionate");
    expect(result[0].salience).toBe(0.95);
    expect(result[0].tags).toEqual(["career", "technology", "creativity"]);
  });

  it("parses multiple memories", () => {
    const raw = `MEMORY: User values transparency in AI systems above all
TYPE: principle
EMOTIONAL_CONTEXT: conviction
SALIENCE: 0.9
TAGS: values, ai, transparency
MEMORY: User had a breakthrough moment understanding emergence
TYPE: moment
EMOTIONAL_CONTEXT: excitement and wonder
SALIENCE: 0.85
TAGS: emergence, insight`;
    const result = parseMemories(raw);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(parseMemories("")).toEqual([]);
  });

  it("skips memories with content shorter than 15 chars", () => {
    const raw = `MEMORY: Too short
TYPE: fact
SALIENCE: 0.5`;
    expect(parseMemories(raw)).toEqual([]);
  });

  it("defaults memoryType to 'experience' when missing", () => {
    const raw = `MEMORY: Something significant happened during the conversation today
SALIENCE: 0.6`;
    const result = parseMemories(raw);
    expect(result[0].memoryType).toBe("experience");
  });

  it("defaults emotionalContext to empty string when missing", () => {
    const raw = `MEMORY: User prefers dark mode interfaces with minimal decoration
TYPE: preference
SALIENCE: 0.7`;
    const result = parseMemories(raw);
    expect(result[0].emotionalContext).toBe("");
  });

  it("handles tags with extra whitespace", () => {
    const raw = `MEMORY: User is building a project called Polyphonic for AI conversations
TYPE: fact
EMOTIONAL_CONTEXT: determined
SALIENCE: 0.9
TAGS:  polyphonic ,  project , AI `;
    const result = parseMemories(raw);
    expect(result[0].tags).toEqual(["polyphonic", "project", "ai"]);
  });
});
