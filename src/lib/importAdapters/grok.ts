import { buildMapping, type ImportAdapter, type NormalizedConversation, type NormalizedMessage } from './types';

// Grok (xAI) export shape — based on observed exports:
//   [{ id, title, createdAt, messages: [{ role, content, createdAt }] }]
// Some variants nest as { conversations: [...] }.

function getList(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.conversations)) return data.conversations;
  if (Array.isArray(data?.chats)) return data.chats;
  return [];
}

export const grokAdapter: ImportAdapter = {
  id: 'grok',
  label: 'Grok (xAI)',

  detect: (data) => {
    const list = getList(data);
    if (list.length === 0) return false;
    const sample = list[0];
    if (!sample || typeof sample !== 'object') return false;
    const hasMessages = Array.isArray(sample.messages) || Array.isArray(sample.turns);
    const hasGrokSignal =
      /grok/i.test(sample.title || '') ||
      /grok/i.test(sample.model || '') ||
      sample.assistantName === 'Grok' ||
      sample.provider === 'xai';
    // Also accept generic "messages" arrays w/ role+content if there's no ChatGPT mapping
    return hasMessages && (hasGrokSignal || (sample.id && sample.title && sample.messages));
  },

  normalize: (data): NormalizedConversation[] => {
    const list = getList(data);
    return list
      .map((conv: any) => {
        const rawMsgs = conv.messages || conv.turns || [];
        const baseTime = conv.createdAt
          ? new Date(conv.createdAt).getTime() / 1000
          : conv.create_time || 0;
        const messages: NormalizedMessage[] = rawMsgs
          .map((m: any, i: number): NormalizedMessage | null => {
            const rawRole = m.role || m.sender || m.author;
            const role = rawRole === 'user' || rawRole === 'human' ? 'user' :
                         rawRole === 'assistant' || rawRole === 'grok' || rawRole === 'ai' ? 'assistant' : null;
            const content = typeof m.content === 'string' ? m.content : (m.text || '');
            if (!role || !content?.trim()) return null;
            const t = m.createdAt
              ? new Date(m.createdAt).getTime() / 1000
              : (m.create_time || baseTime + i);
            return { role, content, create_time: t };
          })
          .filter((m: NormalizedMessage | null): m is NormalizedMessage => m !== null);
        return {
          title: conv.title || 'Untitled',
          create_time: baseTime,
          mapping: buildMapping(messages),
          source_type: 'chat' as const,
        };
      })
      .filter((c) => Object.keys(c.mapping).length >= 2);
  },
};
