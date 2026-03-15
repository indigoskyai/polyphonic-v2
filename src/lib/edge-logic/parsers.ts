/**
 * Shared parsers for cognitive edge functions.
 * Extracts structured data from LLM text output.
 */

export interface ParsedThought {
  content: string;
  salience: number;
  tags: string[];
}

export interface ParsedObservation {
  content: string;
  type: string;
  salience: number;
}

export interface ParsedConnection {
  description: string;
  strength: number;
  relationType: string;
}

export interface ParsedQuestion {
  question: string;
  salience: number;
  context: string;
}

export interface ParsedMemory {
  content: string;
  memoryType: string;
  emotionalContext: string;
  salience: number;
  tags: string[];
}

function clampSalience(val: string | undefined, fallback = 0.5): number {
  if (!val) return fallback;
  return Math.max(0, Math.min(1, parseFloat(val)));
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
}

/**
 * Parse THOUGHT/SALIENCE/TAGS blocks (used by anima-think, anima-reflect)
 */
export function parseThoughts(raw: string): ParsedThought[] {
  const thoughts: ParsedThought[] = [];
  const blocks = raw.split(/(?=THOUGHT:)/);
  for (const block of blocks) {
    if (!block.trim().startsWith("THOUGHT:")) continue;
    const contentMatch = block.match(/THOUGHT:\s*(.+?)(?=\nSALIENCE:|$)/s);
    const salMatch = block.match(/SALIENCE:\s*([\d.]+)/);
    const tagsMatch = block.match(/TAGS:\s*(.+)/);
    if (!contentMatch) continue;
    const content = contentMatch[1].trim();
    if (!content || content.length < 10) continue;
    thoughts.push({
      content,
      salience: clampSalience(salMatch?.[1]),
      tags: parseTags(tagsMatch?.[1]),
    });
  }
  return thoughts;
}

/**
 * Parse OBSERVATION/TYPE/SALIENCE blocks (used by anima-observe)
 */
export function parseObservations(raw: string): ParsedObservation[] {
  const observations: ParsedObservation[] = [];
  const blocks = raw.split(/(?=OBSERVATION:)/);
  for (const block of blocks) {
    if (!block.trim().startsWith("OBSERVATION:")) continue;
    const obsMatch = block.match(/OBSERVATION:\s*(.+?)(?=\nTYPE:|$)/s);
    const typeMatch = block.match(/TYPE:\s*(\S+)/);
    const salMatch = block.match(/SALIENCE:\s*([\d.]+)/);
    if (!obsMatch) continue;
    const content = obsMatch[1].trim();
    if (!content) continue;
    observations.push({
      content,
      type: typeMatch?.[1]?.toLowerCase() || "pattern",
      salience: clampSalience(salMatch?.[1]),
    });
  }
  return observations;
}

/**
 * Parse CONNECTION/STRENGTH/TYPE from a single pair response (used by anima-connect)
 */
export function parseConnection(raw: string): ParsedConnection | null {
  if (raw.includes("NO_CONNECTION")) return null;
  const connMatch = raw.match(/CONNECTION:\s*(.+?)(?=\nSTRENGTH:|$)/s);
  const strMatch = raw.match(/STRENGTH:\s*([\d.]+)/);
  const typeMatch = raw.match(/TYPE:\s*(\S+)/);
  if (!connMatch) return null;
  const description = connMatch[1].trim();
  const strength = clampSalience(strMatch?.[1]);
  const relationType = typeMatch?.[1]?.toLowerCase() || "thematic";
  return { description, strength, relationType };
}

/**
 * Parse QUESTION/SALIENCE/CONTEXT blocks (used by anima-question)
 */
export function parseQuestions(raw: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  const blocks = raw.split(/(?=QUESTION:)/);
  for (const block of blocks) {
    if (!block.trim().startsWith("QUESTION:")) continue;
    const qMatch = block.match(/QUESTION:\s*(.+?)(?=\nSALIENCE:|$)/s);
    const salMatch = block.match(/SALIENCE:\s*([\d.]+)/);
    const ctxMatch = block.match(/CONTEXT:\s*(.+)/);
    if (!qMatch) continue;
    const question = qMatch[1].trim();
    if (!question || question.length < 10) continue;
    questions.push({
      question,
      salience: clampSalience(salMatch?.[1]),
      context: ctxMatch?.[1]?.trim() || "",
    });
  }
  return questions;
}

/**
 * Parse MEMORY/TYPE/EMOTIONAL_CONTEXT/SALIENCE/TAGS blocks (used by anima-consolidate)
 */
export function parseMemories(raw: string): ParsedMemory[] {
  const memories: ParsedMemory[] = [];
  const blocks = raw.split(/(?=MEMORY:)/);
  for (const block of blocks) {
    if (!block.trim().startsWith("MEMORY:")) continue;
    const contentMatch = block.match(/MEMORY:\s*(.+?)(?=\nTYPE:|$)/s);
    const typeMatch = block.match(/TYPE:\s*(\S+)/);
    const emotionMatch = block.match(/EMOTIONAL_CONTEXT:\s*(.+?)(?=\nSALIENCE:|$)/s);
    const salMatch = block.match(/SALIENCE:\s*([\d.]+)/);
    const tagsMatch = block.match(/TAGS:\s*(.+)/);
    if (!contentMatch) continue;
    const content = contentMatch[1].trim();
    if (!content || content.length < 15) continue;
    memories.push({
      content,
      memoryType: typeMatch?.[1]?.toLowerCase() || "experience",
      emotionalContext: emotionMatch?.[1]?.trim() || "",
      salience: clampSalience(salMatch?.[1]),
      tags: parseTags(tagsMatch?.[1]),
    });
  }
  return memories;
}
