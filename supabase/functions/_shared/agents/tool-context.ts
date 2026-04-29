// Distill the tool messages produced by the tool planner into a short
// factual context block that the chat-multi synthesis judge / chairman can
// read alongside the variant responses. Without this, the judge tends to
// editorialize about "AI capabilities" using its own training-time priors
// and dismisses real tool actions (e.g. the subagent dispatch denial caught
// during the L9 smoke). With it, the judge gets ground truth: "this tool
// fired, here is the result, do not flag responses for reflecting that."

export interface ToolPlannerMessage {
  role: string;
  content?: unknown;
  tool_calls?: Array<{
    id: string;
    function?: {
      name?: string;
      arguments?: string | Record<string, unknown>;
    };
  }>;
  tool_call_id?: string;
}

const ARG_TRUNCATE = 200;
const RESULT_TRUNCATE = 480;

const KNOWN_TOOLS = [
  "web_search",
  "read_url",
  "browse",
  "workspace_file",
  "create_artifact",
  "dispatch_subagent",
  "update_soul",
  "update_self_model",
];

/**
 * Returns the empty string when no tools fired, so the prompt stays clean
 * for normal conversational turns.
 */
export function summarizeToolContext(toolMessages: ToolPlannerMessage[] | null | undefined): string {
  if (!Array.isArray(toolMessages) || toolMessages.length === 0) return "";

  const calls: Array<{ id: string; name: string; args: string }> = [];
  const results = new Map<string, string>();

  for (const msg of toolMessages) {
    if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        const args = typeof tc.function?.arguments === "string"
          ? tc.function.arguments
          : JSON.stringify(tc.function?.arguments ?? {});
        calls.push({
          id: tc.id,
          name: tc.function?.name || "unknown_tool",
          args,
        });
      }
    } else if (msg.role === "tool" && msg.tool_call_id) {
      const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? {});
      results.set(msg.tool_call_id, text);
    }
  }

  if (calls.length === 0) return "";

  const lines: string[] = ["WHAT ACTUALLY HAPPENED THIS TURN (ground truth, do not second-guess):"];
  for (const call of calls) {
    const result = results.get(call.id) ?? "(no result captured)";
    lines.push(`- Called ${call.name}(${truncate(call.args, ARG_TRUNCATE)}) → ${truncate(result, RESULT_TRUNCATE)}`);
  }
  lines.push("");
  lines.push(
    "These tool calls are real and already committed. Luca actually has these capabilities — they are not hypothetical. " +
      `Tools available to Luca include: ${KNOWN_TOOLS.join(", ")}. ` +
      "Do NOT critique a response for claiming a tool action that the system above shows actually fired. " +
      "Do NOT add disclaimers about AI capability. Evaluate only on clarity, warmth, helpfulness, and fit.",
  );
  return lines.join("\n");
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
