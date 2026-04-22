import { buildMapping, type ImportAdapter, type NormalizedConversation, type NormalizedMessage } from './types';

export const claudeAdapter: ImportAdapter = {
  id: 'claude',
  label: 'Claude',

  detect: (data) => Array.isArray(data) && data.length > 0 && (data[0] as any)?.uuid !== undefined && (data[0] as any)?.chat_messages !== undefined,

  normalize: (data): NormalizedConversation[] => {
    if (!Array.isArray(data)) return [];
    return data
      .filter((c: any) => Array.isArray(c.chat_messages) && c.chat_messages.length >= 2)
      .map((conv: any) => {
        const baseTime = conv.created_at ? new Date(conv.created_at).getTime() / 1000 : 0;
        const messages: NormalizedMessage[] = conv.chat_messages
          .map((msg: any, i: number) => {
            const role = msg.sender === 'human' ? 'user' : msg.sender === 'assistant' ? 'assistant' : null;
            if (!role || !msg.text?.trim()) return null;
            return {
              role,
              content: msg.text,
              create_time: msg.created_at_utc
                ? new Date(msg.created_at_utc).getTime() / 1000
                : baseTime + i,
            } as NormalizedMessage;
          })
          .filter(Boolean);
        return {
          title: conv.name || 'Untitled',
          create_time: baseTime,
          mapping: buildMapping(messages),
          source_type: 'chat' as const,
        };
      });
  },
};
