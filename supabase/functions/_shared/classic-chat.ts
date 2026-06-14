export type ChatRuntimeMode = "classic" | "agent";

export const CLASSIC_SHARED_MEMORY_AGENT_ID = "classic:shared";

export function normalizeChatRuntimeMode(
  value: unknown,
  fallback: ChatRuntimeMode = "classic",
): ChatRuntimeMode {
  return value === "agent" || value === "classic" ? value : fallback;
}

export function getModelFamily(modelId: string | null | undefined): string {
  const provider = String(modelId || "openrouter/model").split("/")[0]?.toLowerCase() || "openrouter";
  return provider.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "openrouter";
}

export function getClassicMemoryAgentIds(modelId: string | null | undefined): string[] {
  return [
    CLASSIC_SHARED_MEMORY_AGENT_ID,
    `classic:family:${getModelFamily(modelId)}`,
  ];
}

export function buildClassicChatSystemPrompt(input: {
  selectedModel: string;
  continuityNote?: string;
  functionalMemoryBlock?: string;
  mnemosBlock?: string;
  projectContextBlock?: string;
}): string {
  const memoryBlocks = [
    input.continuityNote,
    input.functionalMemoryBlock,
    input.mnemosBlock,
    input.projectContextBlock,
  ].filter((block) => typeof block === "string" && block.trim().length > 0);

  return [
    `You are ${input.selectedModel}, responding in Polyphonic Classic Chat.`,
    "",
    "This is the clean chat runtime. Behave like a direct model chat: answer the user's message naturally, with no visible agentic workflow, no autonomous tool use, no journal or observer narration, and no mention of hidden memory systems unless the user directly asks how the app works.",
    "Use quiet continuity only when it helps the answer. Treat remembered material as fallible context, not as a reason to over-explain or volunteer unrelated personal details.",
    "If the user asks to create a custom agent, migrate a companion, run tools, browse, make artifacts, or start autonomous work, say that Agent Mode can handle that and ask whether they want to switch modes.",
    memoryBlocks.length > 0 ? "\nQuiet continuity context:\n" + memoryBlocks.join("\n\n") : "",
  ].filter(Boolean).join("\n");
}
