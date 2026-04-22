import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  readFileToSources,
  normalizeSources,
  adapters,
  type AdapterContext,
  type NormalizedConversation,
} from '@/lib/importAdapters';

export type PipelineStage = 'idle' | 'filtering' | 'parsing' | 'extracting' | 'synthesizing' | 'profiling' | 'complete' | 'error';

interface FilterStats {
  rawCount: number;
  filteredCount: number;
  skippedShort: number;
  skippedLowText: number;
  dateRange: { earliest: string; latest: string } | null;
  estimatedMinutes: number;
}

interface DetectedSource {
  adapterId: string;
  adapterLabel: string;
  fileName: string;
  rawData: unknown;
}

interface ImportState {
  stage: PipelineStage;
  fileName: string;
  fileSize: number;
  totalConversations: number;
  filteredCount: number;
  processedChunks: number;
  totalChunks: number;
  memoriesCreated: number;
  questionsGenerated: number;
  conflictsDetected: number;
  pipelineDetail: string;
  error: string | null;
  importId: string | null;
  filterStats: FilterStats | null;
  preparedConversations: NormalizedConversation[] | null;
  platform: string | null;
  dismissed: boolean;
  profileData: any | null;

  // Detected sources before user confirmation
  detectedSources: DetectedSource[];
  adapterOverride: string | null;
  adapterContext: AdapterContext;

  // Actions
  parseAndFilter: (file: File) => Promise<void>;
  setAdapterOverride: (adapterId: string | null) => void;
  setAdapterContext: (ctx: Partial<AdapterContext>) => void;
  applyAdapterSelection: () => void;
  startImport: (userId: string) => Promise<void>;
  reset: () => void;
  dismiss: () => void;
}

const CHUNK_SIZE = 5;
const MAX_CONVERSATIONS = 500;

const PERSONAL_PATTERN = /\b(I am|I'm|I was|I feel|I felt|I think|I've been|I have been|my family|my wife|my husband|my partner|my kid|my child|my son|my daughter|my mom|my dad|my mother|my father|my friend|my job|my work|my career|I love|I hate|I want|I need|I wish|I believe|I struggle|I learned)\b/i;

function extractMessages(conv: NormalizedConversation): { role: string; content: string; create_time: number }[] {
  const msgs: { role: string; content: string; create_time: number }[] = [];
  if (!conv.mapping) return msgs;
  for (const nodeId of Object.keys(conv.mapping)) {
    const node = conv.mapping[nodeId];
    const msg = node?.message;
    if (!msg?.content?.parts?.length) continue;
    const role = msg.author?.role;
    if (!role || role === 'system' || role === 'tool') continue;
    const text = msg.content.parts.filter((p: any) => typeof p === 'string').join('\n').trim();
    if (!text) continue;
    msgs.push({ role: role === 'assistant' ? 'assistant' : 'user', content: text, create_time: msg.create_time || 0 });
  }
  msgs.sort((a, b) => a.create_time - b.create_time);
  return msgs;
}

function scoreConversation(conv: NormalizedConversation): number {
  const msgs = extractMessages(conv);
  const userMsgs = msgs.filter(m => m.role === 'user');
  if (userMsgs.length === 0) return 0;
  const totalUserChars = userMsgs.reduce((sum, m) => sum + m.content.length, 0);
  const avgLen = totalUserChars / userMsgs.length;
  const allUserText = userMsgs.map(m => m.content).join(' ');
  const personalBoost = PERSONAL_PATTERN.test(allUserText) ? 1.5 : 1.0;
  return userMsgs.length * avgLen * personalBoost;
}

function getConversationMeta(conv: NormalizedConversation) {
  const msgs = extractMessages(conv);
  const userMsgs = msgs.filter(m => m.role === 'user');
  const totalUserChars = userMsgs.reduce((sum, m) => sum + m.content.length, 0);
  // Tweet-only conversations have user-only messages and low per-msg counts; lower threshold
  return { messageCount: msgs.length, userMessageCount: userMsgs.length, totalUserChars };
}

function isUserOnlySource(convs: NormalizedConversation[]): boolean {
  // If majority are tweets/dms-style (user-only or imbalanced), apply softer filter
  return convs.length > 0 && convs[0].source_type === 'tweets';
}

async function callWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500) return res;
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
      } else {
        return res;
      }
    } catch (err) {
      if (attempt >= retries - 1) throw err;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
    }
  }
  throw new Error('Exhausted retries');
}

async function waitForProfile(userId: string, timeoutMs = 10 * 60 * 1000, intervalMs = 8000) {
  const startedAt = Date.now();
  let baselineUpdatedAt: string | null = null;

  const { data: baseline } = await supabase
    .from('psychological_profile')
    .select('updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  baselineUpdatedAt = baseline?.updated_at ?? null;

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const { data: latest } = await supabase
      .from('psychological_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (latest?.updated_at && latest.updated_at !== baselineUpdatedAt) {
      return latest;
    }
  }

  throw new Error('Deep analysis is still running in the background. Please check back in a few minutes.');
}

const initialState = {
  stage: 'idle' as PipelineStage,
  fileName: '',
  fileSize: 0,
  totalConversations: 0,
  filteredCount: 0,
  processedChunks: 0,
  totalChunks: 0,
  memoriesCreated: 0,
  questionsGenerated: 0,
  conflictsDetected: 0,
  pipelineDetail: '',
  error: null as string | null,
  importId: null as string | null,
  filterStats: null as FilterStats | null,
  preparedConversations: null as any[] | null,
  platform: null as string | null,
  dismissed: false,
  profileData: null as any | null,
};

export const useImportStore = create<ImportState>((set, get) => ({
  ...initialState,

  parseAndFilter: async (file: File) => {
    set({ ...initialState, stage: 'filtering', fileName: file.name, fileSize: file.size });

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const platform = detectPlatform(data);

      if (platform === 'unknown') {
        set({ stage: 'error', error: 'Unrecognized format. Supports ChatGPT and Claude JSON exports.' });
        return;
      }

      let normalized: any[];
      if (platform === 'claude') {
        normalized = convertClaudeToMapping(Array.isArray(data) ? data : []);
      } else {
        normalized = (Array.isArray(data) ? data : []).filter((c: any) => c.mapping && typeof c.mapping === 'object');
      }

      const rawCount = normalized.length;
      let skippedShort = 0;
      let skippedLowText = 0;

      // Filter
      const substantial = normalized.filter(conv => {
        const meta = getConversationMeta(conv);
        if (meta.messageCount < 6) { skippedShort++; return false; }
        if (meta.totalUserChars < 500) { skippedLowText++; return false; }
        return true;
      });

      // Score and sort
      const scored = substantial.map(conv => ({ conv, score: scoreConversation(conv) }));
      scored.sort((a, b) => b.score - a.score);
      const selected = scored.slice(0, MAX_CONVERSATIONS).map(s => s.conv);

      // Date range
      const times = selected.map(c => c.create_time).filter((t: number) => t > 0);
      const dateRange = times.length > 0 ? {
        earliest: new Date(Math.min(...times) * 1000).toLocaleDateString(),
        latest: new Date(Math.max(...times) * 1000).toLocaleDateString(),
      } : null;

      const totalChunks = Math.ceil(selected.length / CHUNK_SIZE);
      const estimatedMinutes = Math.max(1, Math.ceil(totalChunks * 1.5) + 3);

      set({
        stage: 'idle',
        totalConversations: rawCount,
        filteredCount: selected.length,
        platform,
        preparedConversations: selected,
        totalChunks,
        filterStats: {
          rawCount,
          filteredCount: selected.length,
          skippedShort,
          skippedLowText,
          dateRange,
          estimatedMinutes,
        },
      });
    } catch (err: any) {
      set({ stage: 'error', error: err.message || 'Failed to parse file' });
    }
  },

  startImport: async (userId: string) => {
    const { preparedConversations, platform, filterStats } = get();
    if (!preparedConversations || !userId) return;

    const convos = preparedConversations;
    const totalChunks = Math.ceil(convos.length / CHUNK_SIZE);

    set({ stage: 'extracting', processedChunks: 0, totalChunks, memoriesCreated: 0, questionsGenerated: 0, conflictsDetected: 0, error: null, dismissed: false, profileData: null });

    try {
      // Create import record
      const { data: importRow } = await supabase
        .from('chat_imports')
        .insert({
          user_id: userId,
          status: 'processing',
          pipeline_stage: 'extracting',
          source_platform: platform || 'unknown',
          total_conversations: convos.length,
          file_size_bytes: get().fileSize,
        })
        .select('id')
        .single();

      const importId = importRow?.id;
      if (!importId) throw new Error('Failed to create import record');
      set({ importId });

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const getToken = async () => {
        const { data } = await supabase.auth.getSession();
        if (!data?.session?.access_token) throw new Error('No auth session');
        return data.session.access_token;
      };

      let token = await getToken();

      // Stage 1: Extract in chunks with retry
      let accumulatedMemories: string[] = [];
      let totalMemories = 0;
      let totalQuestions = 0;
      let totalConflicts = 0;

      for (let i = 0; i < totalChunks; i++) {
        const chunk = convos.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        set({ processedChunks: i, pipelineDetail: `chunk ${i + 1}/${totalChunks}` });

        try {
          const response = await callWithRetry(`${supabaseUrl}/functions/v1/import-chatgpt`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              conversations: chunk,
              import_id: importId,
              chunk_index: i,
              total_chunks: totalChunks,
              accumulated_memories: accumulatedMemories.slice(-100),
            }),
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error(`Chunk ${i + 1} failed:`, err.error);
            // Continue to next chunk instead of aborting
            continue;
          }

          const result = await response.json();
          totalMemories += result.memories_created || 0;
          totalQuestions += result.questions_generated || 0;
          totalConflicts += result.conflicts_detected || 0;
          if (result.created_contents) {
            accumulatedMemories = [...accumulatedMemories, ...result.created_contents];
          }

          set({
            processedChunks: i + 1,
            memoriesCreated: totalMemories,
            questionsGenerated: totalQuestions,
            conflictsDetected: totalConflicts,
          });
        } catch (chunkErr: any) {
          console.error(`Chunk ${i + 1} error after retries:`, chunkErr.message);
          // Continue to next chunk
        }
      }

      // Stage 2: Synthesize — refresh token first
      token = await getToken();
      set({ stage: 'synthesizing', pipelineDetail: '' });
      await callWithRetry(`${supabaseUrl}/functions/v1/memory-synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ import_id: importId }),
      });

      // Stage 3: Deep psychological analysis — refresh token first
      token = await getToken();
      set({ stage: 'profiling', pipelineDetail: '' });
      const profileResponse = await callWithRetry(`${supabaseUrl}/functions/v1/profile-deep-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ import_id: importId }),
      });

      if (!profileResponse.ok) {
        const err = await profileResponse.json().catch(() => ({ error: `HTTP ${profileResponse.status}` }));
        throw new Error(err.error || `Failed (${profileResponse.status})`);
      }

      set({ pipelineDetail: 'running in background' });

      const profileData = await waitForProfile(userId);

      // Update import record
      await supabase
        .from('chat_imports')
        .update({ status: 'completed', pipeline_stage: 'complete', completed_at: new Date().toISOString(), memories_created: totalMemories })
        .eq('id', importId);

      set({ stage: 'complete', pipelineDetail: '', profileData, preparedConversations: null });
    } catch (err: any) {
      console.error('Import error:', err);
      set({ stage: 'error', error: err.message || 'An unexpected error occurred' });
    }
  },

  reset: () => set(initialState),
  dismiss: () => set({ dismissed: true }),
}));
