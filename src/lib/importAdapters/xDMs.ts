import { buildMapping, type ImportAdapter, type NormalizedConversation, type NormalizedMessage } from './types';

// X/Twitter `direct-messages.js` — wrapped like tweets.js:
//   window.YTD.direct_messages.part0 = [ { dmConversation: { conversationId, messages: [{ messageCreate: {...} }] } } ]
// Treated as relational conversations. The current user's id needs to be inferred.

function getDmConversations(data: any): any[] {
  if (Array.isArray(data)) return data;
  return [];
}

function inferUserId(convs: any[]): string | null {
  // Most-frequent senderId across all messages is almost always the archive owner
  const counts = new Map<string, number>();
  for (const c of convs) {
    const msgs = c?.dmConversation?.messages || [];
    for (const m of msgs) {
      const sid = m?.messageCreate?.senderId;
      if (sid) counts.set(sid, (counts.get(sid) || 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, n] of counts) {
    if (n > bestCount) { best = id; bestCount = n; }
  }
  return best;
}

export const xDMsAdapter: ImportAdapter = {
  id: 'x-dms',
  label: 'X / Twitter — DMs',

  detect: (data, fileName) => {
    if (/direct[-_]messages?\.js$/i.test(fileName || '')) return true;
    const list = getDmConversations(data);
    if (list.length === 0) return false;
    return !!list[0]?.dmConversation?.messages;
  },

  normalize: (data): NormalizedConversation[] => {
    const convs = getDmConversations(data);
    const ownerId = inferUserId(convs);
    if (!ownerId) return [];

    return convs
      .map((c: any) => {
        const dmConv = c.dmConversation;
        if (!dmConv?.messages) return null;
        const rawMsgs = dmConv.messages
          .map((m: any) => m?.messageCreate)
          .filter(Boolean)
          .sort((a: any, b: any) => {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return ta - tb;
          });

        const messages: NormalizedMessage[] = rawMsgs
          .map((m: any): NormalizedMessage | null => {
            const text = String(m.text || '').trim();
            if (!text) return null;
            const time = m.createdAt ? new Date(m.createdAt).getTime() / 1000 : 0;
            // Owner = "user" (this is *me*). Other party = "assistant" slot,
            // since downstream extraction expects user/assistant roles.
            const role: 'user' | 'assistant' = m.senderId === ownerId ? 'user' : 'assistant';
            return { role, content: text, create_time: time };
          })
          .filter((m: NormalizedMessage | null): m is NormalizedMessage => m !== null);

        if (messages.length < 4) return null;

        const firstTime = messages[0].create_time;
        return {
          title: `DM ${dmConv.conversationId?.slice(0, 12) || 'thread'}`,
          create_time: firstTime,
          mapping: buildMapping(messages),
          source_type: 'dms' as const,
        };
      })
      .filter((c): c is NormalizedConversation => c !== null);
  },
};
