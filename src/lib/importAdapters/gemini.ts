import { buildMapping, type ImportAdapter, type NormalizedConversation, type NormalizedMessage } from './types';

// Google Takeout's "Gemini Apps" / "MyActivity.json" format.
// Each entry typically looks like:
//   { "header": "Gemini Apps", "title": "Asked Gemini: ...", "titleUrl": "...", "time": "2024-...", "subtitles": [...], "details": [...] }
// The user prompt is in `title` (after "Asked Gemini:"), the response is sometimes embedded.
// Each entry becomes a single one-shot conversation.

function isGeminiActivity(data: any): boolean {
  if (!Array.isArray(data) || data.length === 0) return false;
  const sample = data[0];
  return typeof sample === 'object' &&
    sample !== null &&
    typeof sample.header === 'string' &&
    /gemini|bard/i.test(sample.header) &&
    typeof sample.title === 'string';
}

export const geminiAdapter: ImportAdapter = {
  id: 'gemini',
  label: 'Gemini (Google Takeout)',

  detect: (data, fileName) => {
    if (isGeminiActivity(data)) return true;
    return /myactivity\.json$/i.test(fileName || '') && Array.isArray(data);
  },

  normalize: (data): NormalizedConversation[] => {
    if (!Array.isArray(data)) return [];
    return data
      .filter((entry: any) => entry && typeof entry.title === 'string' && /gemini|bard/i.test(entry.header || ''))
      .map((entry: any, i: number) => {
        const time = entry.time ? new Date(entry.time).getTime() / 1000 : 0;
        const userPrompt = String(entry.title)
          .replace(/^(Asked Gemini:|Asked Bard:|Said to Gemini:|Said to Bard:)\s*/i, '')
          .trim();
        const responseText = Array.isArray(entry.details)
          ? entry.details.map((d: any) => d?.name || '').filter(Boolean).join(' ')
          : '';

        const messages: NormalizedMessage[] = [];
        if (userPrompt) messages.push({ role: 'user', content: userPrompt, create_time: time });
        if (responseText) messages.push({ role: 'assistant', content: responseText, create_time: time + 1 });

        return {
          title: userPrompt.slice(0, 80) || `Gemini ${i}`,
          create_time: time,
          mapping: buildMapping(messages),
          source_type: 'chat' as const,
        };
      })
      .filter((c) => Object.keys(c.mapping).length > 0);
  },
};
