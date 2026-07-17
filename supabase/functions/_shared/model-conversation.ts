import type { ContinuityHistoryMessage } from './continuity/kernel.ts';
import {
  getModelInputTokenBudget,
  shouldPreserveReasoningDetails,
} from './models.ts';

export interface ModelConversationMessage {
  role: string;
  content: unknown;
  reasoning_details?: unknown[];
  reasoning_content?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

function metadataOf(message: ContinuityHistoryMessage): Record<string, unknown> {
  return message.metadata && typeof message.metadata === 'object' ? message.metadata : {};
}

export function reconstructModelHistoryMessage(
  message: ContinuityHistoryMessage,
  modelId: string,
): ModelConversationMessage | null {
  if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) return null;
  const metadata = metadataOf(message);
  const reconstructed: ModelConversationMessage = {
    role: message.role,
    content: message.provider_content ?? (message.content || ''),
  };

  if (message.role === 'assistant' && shouldPreserveReasoningDetails(modelId)) {
    if (Array.isArray(metadata.reasoning_details) && metadata.reasoning_details.length > 0) {
      reconstructed.reasoning_details = metadata.reasoning_details;
    } else if (typeof message.thinking_content === 'string' && message.thinking_content) {
      reconstructed.reasoning_content = message.thinking_content;
    }
    if (Array.isArray(metadata.tool_calls) && metadata.tool_calls.length > 0) {
      reconstructed.tool_calls = metadata.tool_calls;
    }
  }

  if (message.role === 'tool') {
    const toolCallId = typeof metadata.tool_call_id === 'string' ? metadata.tool_call_id : '';
    if (!toolCallId) return null;
    reconstructed.tool_call_id = toolCallId;
    if (typeof metadata.tool_name === 'string' && metadata.tool_name) {
      reconstructed.name = metadata.tool_name;
    }
  }

  return reconstructed;
}

export function estimateModelMessageTokens(message: ModelConversationMessage): number {
  // Conservative fallback for providers without a local tokenizer. The
  // separate 65K reserve absorbs JSON/tool/schema and tokenizer variance.
  return Math.max(1, Math.ceil(JSON.stringify(message).length / 4));
}

function groupCompleteTurns(messages: ModelConversationMessage[]): ModelConversationMessage[][] {
  const turns: ModelConversationMessage[][] = [];
  let current: ModelConversationMessage[] = [];
  for (const message of messages) {
    if (message.role === 'user' && current.length > 0) {
      turns.push(current);
      current = [];
    }
    current.push(message);
  }
  if (current.length > 0) turns.push(current);
  return turns;
}

function removeIncompleteToolBlocks(turn: ModelConversationMessage[]): ModelConversationMessage[] {
  const calledIds = new Set<string>();
  for (const message of turn) {
    for (const call of message.tool_calls || []) {
      const id = call && typeof call === 'object' && 'id' in call ? String((call as { id?: unknown }).id || '') : '';
      if (id) calledIds.add(id);
    }
  }
  const resultIds = new Set(
    turn
      .filter((message) => message.role === 'tool' && message.tool_call_id)
      .map((message) => message.tool_call_id as string),
  );
  const completeCallIds = new Set([...calledIds].filter((id) => resultIds.has(id)));

  return turn
    .map((message) => {
      if (message.role === 'tool') {
        return message.tool_call_id && completeCallIds.has(message.tool_call_id) ? message : null;
      }
      if (!message.tool_calls?.length) return message;
      const completeCalls = message.tool_calls.filter((call) => {
        const id = call && typeof call === 'object' && 'id' in call ? String((call as { id?: unknown }).id || '') : '';
        return id && completeCallIds.has(id);
      });
      const next = { ...message };
      if (completeCalls.length > 0) next.tool_calls = completeCalls;
      else delete next.tool_calls;
      return next;
    })
    .filter((message): message is ModelConversationMessage => Boolean(message));
}

/**
 * Fill K3 history newest-to-oldest without splitting a conversation turn or a
 * tool-call/result block. Other models retain the existing loaded history.
 */
export function buildCapabilityAwareModelHistory(
  history: ContinuityHistoryMessage[],
  modelId: string,
): ModelConversationMessage[] {
  const reconstructed = history.flatMap((message) => {
    const metadata = metadataOf(message);
    const toolState = shouldPreserveReasoningDetails(modelId) && Array.isArray(metadata.tool_state)
      ? metadata.tool_state
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => entry as ModelConversationMessage)
          .filter((entry) => ['assistant', 'tool'].includes(entry.role))
      : [];
    const primary = reconstructModelHistoryMessage(message, modelId);
    return primary ? [...toolState, primary] : toolState;
  });
  const budget = getModelInputTokenBudget(modelId);
  if (!budget) return reconstructed;

  const turns = groupCompleteTurns(reconstructed).map(removeIncompleteToolBlocks);
  const selected: ModelConversationMessage[][] = [];
  let used = 0;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const tokens = turn.reduce((sum, message) => sum + estimateModelMessageTokens(message), 0);
    if (used + tokens > budget) continue;
    selected.push(turn);
    used += tokens;
  }
  return selected.reverse().flat();
}
