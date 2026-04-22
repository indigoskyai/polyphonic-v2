// Shared types for import adapters.
// All adapters normalize their input into the internal "Conversation" shape
// (the existing ChatGPT mapping format), so downstream extraction logic stays unchanged.

export interface NormalizedMessage {
  role: 'user' | 'assistant';
  content: string;
  create_time: number; // unix seconds
}

// Internal conversation shape (matches ChatGPT mapping format used by import-chatgpt edge fn)
export interface NormalizedConversation {
  title: string;
  create_time: number;
  mapping: Record<string, {
    message: {
      author: { role: string };
      content: { parts: string[] };
      create_time: number;
    };
  }>;
  // Optional metadata used for routing extraction prompts
  source_type?: 'chat' | 'tweets' | 'dms';
}

export interface AdapterContext {
  // For X archives: which sub-streams to include
  includeTweets?: boolean;
  includeDMs?: boolean;
}

export interface ImportAdapter {
  id: string;          // 'chatgpt', 'claude', 'gemini', 'grok', 'x', 'generic'
  label: string;       // Human-readable
  detect: (data: unknown, fileName?: string) => boolean;
  normalize: (data: unknown, ctx?: AdapterContext) => NormalizedConversation[];
}

// Helper used by every adapter to build a node id
export function buildMapping(messages: NormalizedMessage[]): NormalizedConversation['mapping'] {
  const mapping: NormalizedConversation['mapping'] = {};
  messages.forEach((msg, i) => {
    if (!msg.content?.trim()) return;
    mapping[`node-${i}`] = {
      message: {
        author: { role: msg.role },
        content: { parts: [msg.content] },
        create_time: msg.create_time || 0,
      },
    };
  });
  return mapping;
}
