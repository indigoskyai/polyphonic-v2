export const STREAM_SNAPSHOT_INTERVAL_MS = 700;
export const MAX_PARALLEL_ATTACHMENT_UPLOADS = 2;

type StreamHandoffMessage = {
  role: string;
  agent?: string | null;
  created_at: string;
};

export function shouldCompleteStreamHandoff({
  lingeringStream,
  typewriterSettled,
  messages,
  activeAgent,
  now = Date.now(),
}: {
  lingeringStream: string | null;
  typewriterSettled: boolean;
  messages: readonly StreamHandoffMessage[];
  activeAgent: string | null;
  now?: number;
}): boolean {
  if (!lingeringStream || !typewriterSettled) return false;
  return messages.some((message) =>
    message.role === 'assistant' &&
    (message.agent ?? null) === activeAgent &&
    now - new Date(message.created_at).getTime() < 60_000,
  );
}

/** Human-paced near-live reveal that catches large buffered bursts up fast. */
export function getStreamRevealAdvance(elapsedMs: number, bufferedCharacters: number): number {
  if (elapsedMs <= 0 || bufferedCharacters <= 0) return 0;
  const charsPerSecond = Math.min(
    1400,
    90 + Math.pow(bufferedCharacters, 0.72) * 8.5,
  );
  return Math.max(1, Math.min(bufferedCharacters, Math.round((elapsedMs * charsPerSecond) / 1000)));
}

/** Run independent work in a small pool while preserving input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
