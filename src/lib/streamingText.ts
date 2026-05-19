export function appendStreamingDelta(current: string, chunk: unknown): string {
  const text = typeof chunk === 'string' ? chunk : '';
  if (!text) return current;
  if (!current) return text.trimStart();
  return current + text;
}
