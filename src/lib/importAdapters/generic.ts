import { buildMapping, type ImportAdapter, type NormalizedConversation, type NormalizedMessage } from './types';

// Generic fallback — best-effort extraction from arbitrary JSON or text.
// For text, treats the entire content as one user utterance (so the
// extractor still finds personal facts from journals, notes, etc).

function tryExtractFromUnknownJson(data: any): NormalizedConversation[] {
  // Case 1: array of {role, content} messages
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && 'role' in data[0] && 'content' in data[0]) {
    const messages: NormalizedMessage[] = data
      .map((m: any, i: number): NormalizedMessage | null => {
        const role = m.role === 'user' || m.role === 'human' ? 'user' :
                     m.role === 'assistant' || m.role === 'ai' || m.role === 'bot' ? 'assistant' : null;
        const content = typeof m.content === 'string' ? m.content : '';
        if (!role || !content.trim()) return null;
        return { role, content, create_time: m.timestamp || m.create_time || i };
      })
      .filter((m): m is NormalizedMessage => m !== null);
    if (messages.length >= 2) {
      return [{
        title: 'Imported conversation',
        create_time: messages[0].create_time,
        mapping: buildMapping(messages),
        source_type: 'chat',
      }];
    }
  }

  // Case 2: array of conversations each with a `messages` array
  if (Array.isArray(data)) {
    const out: NormalizedConversation[] = [];
    for (const conv of data) {
      if (conv && Array.isArray(conv.messages)) {
        const sub = tryExtractFromUnknownJson(conv.messages);
        if (sub.length > 0) {
          sub[0].title = conv.title || conv.name || sub[0].title;
          out.push(...sub);
        }
      }
    }
    if (out.length > 0) return out;
  }

  return [];
}

export const genericAdapter: ImportAdapter = {
  id: 'generic',
  label: 'Generic',

  // Always returns false in detect so it's only used as an explicit fallback
  detect: () => false,

  normalize: (data): NormalizedConversation[] => {
    if (typeof data === 'string') {
      // Plain text: bundle into one user-only "conversation"
      const text = data.trim();
      if (text.length < 50) return [];
      const messages: NormalizedMessage[] = [{
        role: 'user',
        content: text.slice(0, 50000),
        create_time: Math.floor(Date.now() / 1000),
      }];
      return [{
        title: 'Imported text',
        create_time: Math.floor(Date.now() / 1000),
        mapping: buildMapping(messages),
        source_type: 'chat',
      }];
    }
    return tryExtractFromUnknownJson(data);
  },
};
