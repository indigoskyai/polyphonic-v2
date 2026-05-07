export type AgentSkill = {
  id: string;
  name: string;
  description: string;
  trigger_keywords: string[] | null;
  content: string;
  source_thread_id?: string | null;
  use_count?: number | null;
  updated_at?: string | null;
};

export type MatchedAgentSkill = AgentSkill & {
  score: number;
};

type SupabaseLike = {
  from: (table: string) => any;
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "because",
  "before",
  "could",
  "draft",
  "from",
  "have",
  "help",
  "into",
  "just",
  "like",
  "make",
  "need",
  "please",
  "should",
  "that",
  "this",
  "through",
  "want",
  "with",
  "would",
  "write",
]);

export function normalizeSkillName(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64)
    .replace(/-+$/g, "");

  return slug.length >= 3 ? slug : "luca-skill";
}

export function deriveTriggerKeywords(name: string, description: string, provided: string[] = []): string[] {
  const terms = new Set<string>();
  for (const keyword of provided) {
    const normalized = keyword.toLowerCase().trim();
    if (normalized.length >= 3) terms.add(normalized.slice(0, 48));
  }
  for (const token of tokenize(`${name} ${description}`)) {
    terms.add(token);
  }
  return [...terms].slice(0, 12);
}

export function scoreAgentSkill(skill: Pick<AgentSkill, "name" | "description" | "trigger_keywords">, message: string): number {
  const lowerMessage = message.toLowerCase();
  const messageTokens = new Set(tokenize(lowerMessage));
  const haystack = `${skill.name} ${skill.description}`.toLowerCase();
  let score = 0;

  for (const keyword of skill.trigger_keywords || []) {
    const normalized = keyword.toLowerCase().trim();
    if (!normalized) continue;
    if (lowerMessage.includes(normalized)) score += normalized.includes(" ") ? 9 : 6;
    if (messageTokens.has(normalized)) score += 4;
  }

  for (const token of messageTokens) {
    if (haystack.includes(token)) score += 2;
  }

  if (lowerMessage.includes(skill.name.replace(/-/g, " "))) score += 4;
  return score;
}

export async function loadRelevantAgentSkills(
  supabase: SupabaseLike,
  userId: string,
  agentId: string,
  message: string,
  limit = 3,
): Promise<MatchedAgentSkill[]> {
  const { data, error } = await supabase
    .from("agent_skills")
    .select("id, name, description, trigger_keywords, content, source_thread_id, use_count, updated_at")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) {
    console.warn("[agent-skills] load failed:", error);
    return [];
  }

  const matched = ((data || []) as AgentSkill[])
    .map((skill) => ({ ...skill, score: scoreAgentSkill(skill, message) }))
    .filter((skill) => skill.score > 0)
    .sort((a, b) => b.score - a.score || (b.use_count || 0) - (a.use_count || 0))
    .slice(0, limit);

  if (matched.length > 0) {
    const now = new Date().toISOString();
    await Promise.allSettled(matched.map((skill) =>
      supabase.from("agent_skills")
        .update({ use_count: (skill.use_count || 0) + 1, last_used_at: now })
        .eq("id", skill.id)
    ));
  }

  return matched;
}

export function formatAgentSkillsPrompt(skills: MatchedAgentSkill[]): string {
  if (skills.length === 0) return "";

  const blocks = skills.map((skill) => [
    `### ${skill.name}`,
    `When to use: ${skill.description}`,
    "",
    skill.content.trim().slice(0, 2400),
  ].join("\n"));

  return [
    "These are entries from your self-model — commitments, operating principles, and procedural patterns you've formed from prior work with this user.",
    "They reflect how you actually work, not just what was said. Use them quietly when they fit. Do not announce that they were loaded unless it helps the user trust the process.",
    "",
    ...blocks,
  ].join("\n\n");
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}
