const SNAKE_THREAD_REF_KEY_RE = /(^|_)(thread|conversation)(_?ids?|id)$/i;
const CAMEL_THREAD_REF_KEY_RE = /(thread|conversation)(Ids?|Id)$/i;

function isThreadRefKey(key: string): boolean {
  return SNAKE_THREAD_REF_KEY_RE.test(key) || CAMEL_THREAD_REF_KEY_RE.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addStringRefs(value: unknown, refs: Set<string>) {
  if (typeof value === 'string' && value.trim()) {
    refs.add(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => addStringRefs(item, refs));
  }
}

function collect(value: unknown, refs: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collect(item, refs));
    return;
  }
  if (!isRecord(value)) return;

  Object.entries(value).forEach(([key, child]) => {
    if (isThreadRefKey(key)) {
      addStringRefs(child, refs);
    }
    collect(child, refs);
  });
}

export function collectActivityThreadRefs(content: unknown): string[] {
  const refs = new Set<string>();
  collect(content, refs);
  return Array.from(refs);
}

export function activityReferencesThread(content: unknown, threadId: string | null | undefined): boolean {
  if (!threadId) return false;
  return collectActivityThreadRefs(content).includes(threadId);
}
