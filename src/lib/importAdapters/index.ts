import JSZip from 'jszip';
import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
import { geminiAdapter } from './gemini';
import { grokAdapter } from './grok';
import { xTweetsAdapter, stripTwitterJsPrefix } from './xTweets';
import { xDMsAdapter } from './xDMs';
import { genericAdapter } from './generic';
import type { AdapterContext, ImportAdapter, NormalizedConversation } from './types';

export const adapters: Record<string, ImportAdapter> = {
  chatgpt: chatgptAdapter,
  claude: claudeAdapter,
  gemini: geminiAdapter,
  grok: grokAdapter,
  'x-tweets': xTweetsAdapter,
  'x-dms': xDMsAdapter,
  generic: genericAdapter,
};

// Order matters: more specific detectors first
const DETECTION_ORDER = ['chatgpt', 'claude', 'gemini', 'grok', 'x-tweets', 'x-dms'];

export function detectAdapter(data: unknown, fileName?: string): ImportAdapter | null {
  for (const id of DETECTION_ORDER) {
    const a = adapters[id];
    try {
      if (a.detect(data, fileName)) return a;
    } catch {
      // ignore detection failures
    }
  }
  return null;
}

export interface ParsedSource {
  adapterId: string;
  data: unknown;
  fileName: string;
}

// Parse a single uploaded file into one or more "raw data" sources.
// JSON / TXT → single source. ZIP (e.g. X archive) → multiple sources from inner files.
export async function readFileToSources(file: File): Promise<ParsedSource[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.zip')) {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const sources: ParsedSource[] = [];
    const candidates = [
      'data/tweets.js', 'data/tweets-part0.js',
      'data/direct-messages.js', 'data/direct-messages-part0.js',
      'conversations.json',
      'MyActivity.json',
    ];

    for (const fileName of Object.keys(zip.files)) {
      const lower = fileName.toLowerCase();
      const f = zip.files[fileName];
      if (f.dir) continue;

      const isInteresting =
        candidates.some((c) => lower.endsWith(c.toLowerCase())) ||
        lower.endsWith('.json') ||
        /tweets.*\.js$/.test(lower) ||
        /direct[-_]messages.*\.js$/.test(lower);

      if (!isInteresting) continue;

      try {
        const text = await f.async('string');
        const cleaned = lower.endsWith('.js') ? stripTwitterJsPrefix(text) : text;
        const data = JSON.parse(cleaned);
        const adapter = detectAdapter(data, fileName);
        sources.push({
          adapterId: adapter?.id || 'generic',
          data,
          fileName,
        });
      } catch {
        // skip unreadable / non-JSON entries
      }
    }
    return sources;
  }

  // Single file (json/js/txt)
  const text = await file.text();
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return [{ adapterId: 'generic', data: text, fileName: file.name }];
  }

  const cleaned = name.endsWith('.js') ? stripTwitterJsPrefix(text) : text;
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    // Fallback to treating as text
    return [{ adapterId: 'generic', data: text, fileName: file.name }];
  }

  const adapter = detectAdapter(data, file.name);
  return [{ adapterId: adapter?.id || 'generic', data, fileName: file.name }];
}

export function normalizeSources(
  sources: ParsedSource[],
  ctx: AdapterContext = {}
): { conversations: NormalizedConversation[]; usedAdapters: string[] } {
  const conversations: NormalizedConversation[] = [];
  const usedAdapters = new Set<string>();

  for (const src of sources) {
    const adapter = adapters[src.adapterId] || genericAdapter;

    // Honor X archive include flags
    if (adapter.id === 'x-tweets' && ctx.includeTweets === false) continue;
    if (adapter.id === 'x-dms' && ctx.includeDMs === false) continue;

    const normalized = adapter.normalize(src.data, ctx);
    if (normalized.length > 0) {
      conversations.push(...normalized);
      usedAdapters.add(adapter.id);
    }
  }

  return { conversations, usedAdapters: Array.from(usedAdapters) };
}

export type { NormalizedConversation, ImportAdapter, AdapterContext } from './types';
