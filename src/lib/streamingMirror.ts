type StreamMirrorMessage = {
  id?: string | null;
  role?: string | null;
  agent?: string | null;
  content?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

const STREAM_MIRROR_RECENT_MS = 60_000;

export function normalizeStreamComparableContent(value: string | null | undefined) {
  return (value || '').trim().replace(/\s+/g, ' ');
}

export function isSameVisibleAssistantAgent(
  messageAgent: string | null | undefined,
  activeAgent: string | null | undefined,
) {
  const message = messageAgent ?? null;
  const active = activeAgent ?? null;
  if (message === active) return true;

  // Classic-model Luca turns persist as agent=null, while agent-mode Luca
  // turns persist as agent='luca'. Visually both are Luca, so the transient
  // stream mirror needs to treat them as the same assistant.
  return (message === 'luca' && active === null) || (message === null && active === 'luca');
}

export function shouldHideStreamingMirrorMessage({
  message,
  isLast,
  isStreaming,
  lingeringStream,
  activeStreamNorm,
  activeMessageAgent,
  completedStreamMessageId,
  now = Date.now(),
}: {
  message: StreamMirrorMessage;
  isLast: boolean;
  isStreaming: boolean;
  lingeringStream: string | null;
  activeStreamNorm: string;
  activeMessageAgent: string | null | undefined;
  completedStreamMessageId?: string | null;
  now?: number;
}) {
  const streamingAssistantActive = isStreaming || lingeringStream != null;
  if (!streamingAssistantActive) return false;
  if (message.role !== 'assistant') return false;
  if (!isSameVisibleAssistantAgent(message.agent, activeMessageAgent)) return false;

  const createdAt = new Date(message.created_at || '').getTime();
  const isRecent = Number.isFinite(createdAt) && now - createdAt < STREAM_MIRROR_RECENT_MS;
  if (!isRecent) return false;

  const messageMatchesActiveStream =
    activeStreamNorm.length > 0 &&
    normalizeStreamComparableContent(message.content) === activeStreamNorm;
  const messageMatchesCompletedId =
    !!completedStreamMessageId && message.id === completedStreamMessageId;
  const isLocalStreamStub = message.metadata?.local_stream_stub === true;

  return isLast || messageMatchesActiveStream || messageMatchesCompletedId || isLocalStreamStub;
}
