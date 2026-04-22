import type { ImportAdapter, NormalizedConversation } from './types';

export const chatgptAdapter: ImportAdapter = {
  id: 'chatgpt',
  label: 'ChatGPT',

  detect: (data) => Array.isArray(data) && data.length > 0 && (data[0] as any)?.mapping !== undefined,

  normalize: (data): NormalizedConversation[] => {
    if (!Array.isArray(data)) return [];
    return data
      .filter((c: any) => c.mapping && typeof c.mapping === 'object')
      .map((c: any) => ({
        title: c.title || 'Untitled',
        create_time: c.create_time || 0,
        mapping: c.mapping,
        source_type: 'chat' as const,
      }));
  },
};
