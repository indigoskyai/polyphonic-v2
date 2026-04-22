import { buildMapping, type ImportAdapter, type NormalizedConversation, type NormalizedMessage } from './types';

// X/Twitter `tweets.js` archive — a JS file that starts with:
//   window.YTD.tweets.part0 = [ { tweet: {...} }, ... ]
// Once unwrapped, each entry has { tweet: { full_text, created_at, favorite_count, retweet_count, ... } }.
// Treated as USER-ONLY utterances (no AI counterparty).

const PERSONAL_PATTERN = /\b(I|I'm|I am|I've|my|me|mine|myself)\b/i;

function getTweets(data: any): any[] {
  // After unwrapping the `window.YTD...` prefix it's a plain array
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.tweets)) return data.tweets;
  return [];
}

export const xTweetsAdapter: ImportAdapter = {
  id: 'x-tweets',
  label: 'X / Twitter — Tweets',

  detect: (data, fileName) => {
    if (/tweets?\.js$/i.test(fileName || '')) return true;
    const list = getTweets(data);
    if (list.length === 0) return false;
    const sample = list[0]?.tweet || list[0];
    return sample && typeof sample === 'object' &&
      typeof sample.full_text === 'string' &&
      typeof sample.created_at === 'string';
  },

  normalize: (data): NormalizedConversation[] => {
    const raw = getTweets(data);
    const tweets = raw
      .map((entry: any) => entry?.tweet || entry)
      .filter((t: any) => typeof t?.full_text === 'string')
      .map((t: any) => {
        const text = String(t.full_text).trim();
        const time = t.created_at ? new Date(t.created_at).getTime() / 1000 : 0;
        const isReply = !!t.in_reply_to_status_id_str || /^@\w+/.test(text);
        const isRetweet = /^RT @/i.test(text);
        const favs = parseInt(t.favorite_count || '0', 10) || 0;
        const rts = parseInt(t.retweet_count || '0', 10) || 0;
        // Score: length + engagement + first-person boost; penalize RTs/replies
        const personal = PERSONAL_PATTERN.test(text) ? 1.5 : 1.0;
        const baseScore = (text.length + favs * 5 + rts * 3) * personal;
        const score = isRetweet ? 0 : isReply ? baseScore * 0.4 : baseScore;
        return { text, time, score, isRetweet };
      })
      .filter((t) => !t.isRetweet && t.text.length > 20);

    // Cap at top 1000 (per plan)
    tweets.sort((a, b) => b.score - a.score);
    const selected = tweets.slice(0, 1000);
    selected.sort((a, b) => a.time - b.time);

    // Bundle into pseudo-"conversations" of ~25 user-only utterances each
    const BUNDLE = 25;
    const conversations: NormalizedConversation[] = [];
    for (let i = 0; i < selected.length; i += BUNDLE) {
      const slice = selected.slice(i, i + BUNDLE);
      if (slice.length === 0) continue;
      const messages: NormalizedMessage[] = slice.map((t) => ({
        role: 'user' as const,
        content: t.text,
        create_time: t.time,
      }));
      conversations.push({
        title: `Tweets ${new Date(slice[0].time * 1000).toISOString().slice(0, 10)}`,
        create_time: slice[0].time,
        mapping: buildMapping(messages),
        source_type: 'tweets' as const,
      });
    }
    return conversations;
  },
};

// Helper to strip `window.YTD.tweets.part0 = ` prefix from a tweets.js file
export function stripTwitterJsPrefix(text: string): string {
  return text.replace(/^\s*window\.YTD\.[a-zA-Z0-9_]+\.part\d+\s*=\s*/, '').trim();
}
