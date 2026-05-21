import type { LucaIdentityDocs } from "./luca-identity.ts";

export type CustomAgentPromptParts = {
  agentName: string;
  agentPrompt?: string | null;
  identityDocs?: LucaIdentityDocs | null;
  projectContextBlock?: string;
  hypomnemaBlock?: string;
  continuityNote?: string;
  crisisDirective?: string;
};

function hasText(value: string | null | undefined): value is string {
  return Boolean(value && value.trim().length > 0);
}

function formatCustomIdentityDocs(docs: LucaIdentityDocs | null | undefined): string {
  if (!docs) return "";
  return [
    hasText(docs.soulMd) ? `## How you understand yourself\n${docs.soulMd.trim()}` : "",
    hasText(docs.convictions) ? `## Convictions you hold\n${docs.convictions.trim()}` : "",
    hasText(docs.userModel) ? `## Who you're talking with\n${docs.userModel.trim()}` : "",
    hasText(docs.selfModel) ? `## How you've been showing up\n${docs.selfModel.trim()}` : "",
  ].filter(Boolean).join("\n\n");
}

export function buildCustomAgentSystemPrompt(parts: CustomAgentPromptParts): string {
  const agentName = hasText(parts.agentName) ? parts.agentName.trim() : "this agent";
  const agentPrompt = hasText(parts.agentPrompt)
    ? parts.agentPrompt.trim()
    : `You are ${agentName}, the active agent in this thread. Follow your configured identity and answer as yourself.`;

  return [
    `You are ${agentName}, the active agent in this thread. Speak from this agent's identity and continuity.`,
    `## Agent instructions\n${agentPrompt}`,
    formatCustomIdentityDocs(parts.identityDocs),
    parts.projectContextBlock || "",
    parts.hypomnemaBlock || "",
    parts.continuityNote || "",
    parts.crisisDirective || "",
  ].filter(Boolean).join("\n\n");
}
