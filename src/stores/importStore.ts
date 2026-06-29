import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

export type PipelineStage = 'idle' | 'filtering' | 'parsing' | 'extracting' | 'synthesizing' | 'profiling' | 'complete' | 'error';

const PROFILE_STILL_RUNNING_MESSAGE = 'Deep analysis is still running in the background. Progress will keep updating here.';

type UnknownRecord = Record<string, unknown>;
type ConversationNode = {
  message?: {
    author?: { role?: unknown };
    content?: { parts?: unknown };
    create_time?: unknown;
  };
};
type PreparedConversation = {
  title?: string;
  create_time?: number;
  mapping?: Record<string, ConversationNode>;
};
type ProfileData = UnknownRecord;

export class ProfileStillRunningError extends Error {
  constructor(message = PROFILE_STILL_RUNNING_MESSAGE) {
    super(message);
    this.name = 'ProfileStillRunningError';
  }
}

interface FilterStats {
  rawCount: number;
  filteredCount: number;
  skippedShort: number;
  skippedLowText: number;
  dateRange: { earliest: string; latest: string } | null;
  estimatedMinutes: number;
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
  preparedConversations: PreparedConversation[] | null;
  platform: string | null;
  dismissed: boolean;
  profileData: ProfileData | null;

  // Actions
  parseAndFilter: (file: File) => Promise<void>;
  startImport: (userId: string, agentId?: string) => Promise<void>;
  syncImportStatus: (userId: string, agentId?: string) => Promise<void>;
  reset: () => void;
  dismiss: () => void;
}

type ImportStatusRow = {
  status: string;
  pipeline_stage: string | null;
  memories_created: number | null;
  questions_generated: number | null;
  conflicts_detected: number | null;
};

const CHUNK_SIZE = 5;
const MAX_CONVERSATIONS = 500;

const PERSONAL_PATTERN = /\b(I am|I'm|I was|I feel|I felt|I think|I've been|I have been|my family|my wife|my husband|my partner|my kid|my child|my son|my daughter|my mom|my dad|my mother|my father|my friend|my job|my work|my career|I love|I hate|I want|I need|I wish|I believe|I struggle|I learned)\b/i;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function objectRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function detectPlatform(data: unknown): string {
  if (Array.isArray(data) && isRecord(data[0]) && isRecord(data[0].mapping)) return 'chatgpt';
  if (Array.isArray(data) && isRecord(data[0]) && data[0].uuid && Array.isArray(data[0].chat_messages)) return 'claude';
  return 'unknown';
}

function convertClaudeToMapping(conversations: unknown[]): PreparedConversation[] {
  return conversations
    .filter((c) => isRecord(c) && Array.isArray(c.chat_messages) && c.chat_messages.length >= 2)
    .map((conv) => {
      const row = conv as UnknownRecord & { chat_messages: unknown[] };
      const mapping: Record<string, ConversationNode> = {};
      row.chat_messages.forEach((rawMsg, i: number) => {
        if (!isRecord(rawMsg)) return;
        const role = rawMsg.sender === 'human' ? 'user' : rawMsg.sender === 'assistant' ? 'assistant' : null;
        const text = stringValue(rawMsg.text).trim();
        if (!role || !text) return;
        const createdAtUtc = stringValue(rawMsg.created_at_utc);
        const createdAt = stringValue(row.created_at);
        mapping[`node-${i}`] = {
          message: {
            author: { role },
            content: { parts: [text] },
            create_time: createdAtUtc ? new Date(createdAtUtc).getTime() / 1000 : (createdAt ? new Date(createdAt).getTime() / 1000 : 0) + i,
          },
        };
      });
      return {
        title: stringValue(row.name) || 'Untitled',
        create_time: stringValue(row.created_at) ? new Date(stringValue(row.created_at)).getTime() / 1000 : 0,
        mapping,
      };
    });
}

function isChatGptConversation(value: unknown): value is PreparedConversation {
  return isRecord(value) && isRecord(value.mapping);
}

function extractMessages(conv: PreparedConversation): { role: string; content: string; create_time: number }[] {
  const msgs: { role: string; content: string; create_time: number }[] = [];
  if (!conv.mapping) return msgs;
  for (const nodeId of Object.keys(conv.mapping)) {
    const node = conv.mapping[nodeId];
    const msg = node?.message;
    const parts = Array.isArray(msg?.content?.parts) ? msg.content.parts : [];
    if (parts.length === 0) continue;
    const role = stringValue(msg?.author?.role);
    if (!role || role === 'system' || role === 'tool') continue;
    const text = parts.filter((p): p is string => typeof p === 'string').join('\n').trim();
    if (!text) continue;
    msgs.push({ role: role === 'assistant' ? 'assistant' : 'user', content: text, create_time: numberValue(msg?.create_time) });
  }
  msgs.sort((a, b) => a.create_time - b.create_time);
  return msgs;
}

function scoreConversation(conv: PreparedConversation): number {
  const msgs = extractMessages(conv);
  const userMsgs = msgs.filter(m => m.role === 'user');
  if (userMsgs.length === 0) return 0;
  const totalUserChars = userMsgs.reduce((sum, m) => sum + m.content.length, 0);
  const avgLen = totalUserChars / userMsgs.length;
  const allUserText = userMsgs.map(m => m.content).join(' ');
  const personalBoost = PERSONAL_PATTERN.test(allUserText) ? 1.5 : 1.0;
  return userMsgs.length * avgLen * personalBoost;
}

function getConversationMeta(conv: PreparedConversation) {
  const msgs = extractMessages(conv);
  const userMsgs = msgs.filter(m => m.role === 'user');
  const totalUserChars = userMsgs.reduce((sum, m) => sum + m.content.length, 0);
  return { messageCount: msgs.length, userMessageCount: userMsgs.length, totalUserChars };
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

async function getProfileUpdatedAt(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('psychological_profile')
    .select('updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  return data?.updated_at ?? null;
}

function normalizeAgentId(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'luca';
}

function stageFromImportPipeline(status?: string | null, pipelineStage?: string | null): PipelineStage | null {
  if (status === 'completed' || pipelineStage === 'complete') return 'complete';
  if (status === 'failed' || status === 'error' || pipelineStage === 'error') return 'error';
  if (!pipelineStage) return null;
  if (pipelineStage.startsWith('profiling')) return 'profiling';
  if (pipelineStage === 'synthesizing') return 'synthesizing';
  if (pipelineStage === 'extracting') return 'extracting';
  if (pipelineStage === 'parsing') return 'parsing';
  return null;
}

function detailFromImportPipeline(pipelineStage?: string | null): string {
  if (!pipelineStage || pipelineStage === 'profiling') return 'background profiling';
  if (pipelineStage.startsWith('profiling:')) {
    return `background profiling - ${pipelineStage.slice('profiling:'.length)}`;
  }
  return '';
}

async function loadCompletedProfile(userId: string) {
  const { data } = await supabase
    .from('psychological_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  return data ?? null;
}

export async function waitForProfile(
  userId: string,
  options: { baselineUpdatedAt?: string | null; timeoutMs?: number; intervalMs?: number } = {},
) {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const intervalMs = options.intervalMs ?? 8000;
  const startedAt = Date.now();
  const baselineUpdatedAt = options.baselineUpdatedAt ?? null;

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

  throw new ProfileStillRunningError();
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
  preparedConversations: null as PreparedConversation[] | null,
  platform: null as string | null,
  dismissed: false,
  profileData: null as ProfileData | null,
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

      let normalized: PreparedConversation[];
      if (platform === 'claude') {
        normalized = convertClaudeToMapping(Array.isArray(data) ? data : []);
      } else {
        normalized = (Array.isArray(data) ? data : []).filter(isChatGptConversation);
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
    } catch (err: unknown) {
      set({ stage: 'error', error: errorMessage(err, 'Failed to parse file') });
    }
  },

  startImport: async (userId: string, requestedAgentId?: string) => {
    const { preparedConversations, platform, filterStats } = get();
    if (!preparedConversations || !userId) return;

    const convos = preparedConversations;
    const totalChunks = Math.ceil(convos.length / CHUNK_SIZE);
    const agentId = normalizeAgentId(requestedAgentId);

    set({ stage: 'extracting', processedChunks: 0, totalChunks, memoriesCreated: 0, questionsGenerated: 0, conflictsDetected: 0, error: null, dismissed: false, profileData: null });

    try {
      // Create import record
      const { data: importRow } = await supabase
        .from('chat_imports')
        .insert({
          user_id: userId,
          agent_id: agentId,
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
              agent_id: agentId,
              chunk_index: i,
              total_chunks: totalChunks,
              accumulated_memories: accumulatedMemories.slice(-100),
            }),
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(`Import chunk ${i + 1}/${totalChunks} failed: ${errorMessage(err.error, `HTTP ${response.status}`)}`);
          }

          const result = objectRecord(await response.json());
          totalMemories += numberValue(result.memories_created);
          totalQuestions += numberValue(result.questions_generated);
          totalConflicts += numberValue(result.conflicts_detected);
          const createdContents = Array.isArray(result.created_contents)
            ? result.created_contents.filter((item): item is string => typeof item === 'string')
            : [];
          if (createdContents.length > 0) {
            accumulatedMemories = [...accumulatedMemories, ...createdContents];
          }

          set({
            processedChunks: i + 1,
            memoriesCreated: totalMemories,
            questionsGenerated: totalQuestions,
            conflictsDetected: totalConflicts,
          });
        } catch (chunkErr: unknown) {
          console.error(`Chunk ${i + 1} error after retries:`, errorMessage(chunkErr, 'Unknown chunk error'));
          throw chunkErr instanceof Error
            ? chunkErr
            : new Error(`Import chunk ${i + 1}/${totalChunks} failed`);
        }
      }

      // Stage 2: Synthesize — refresh token first
      token = await getToken();
      set({ stage: 'synthesizing', pipelineDetail: '' });
      const synthesisResponse = await callWithRetry(`${supabaseUrl}/functions/v1/memory-synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ import_id: importId, agent_id: agentId }),
      });

      if (!synthesisResponse.ok) {
        const err = await synthesisResponse.json().catch(() => ({ error: `HTTP ${synthesisResponse.status}` }));
        throw new Error(err.error || `Synthesis failed (${synthesisResponse.status})`);
      }

      // Stage 3: Deep psychological analysis — refresh token first
      token = await getToken();
      set({ stage: 'profiling', pipelineDetail: '' });
      const baselineUpdatedAt = await getProfileUpdatedAt(userId);
      const profileResponse = await callWithRetry(`${supabaseUrl}/functions/v1/profile-deep-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ import_id: importId, agent_id: agentId }),
      });

      if (!profileResponse.ok) {
        const err = await profileResponse.json().catch(() => ({ error: `HTTP ${profileResponse.status}` }));
        throw new Error(err.error || `Failed (${profileResponse.status})`);
      }

      set({ pipelineDetail: 'background profiling' });

      let profileData: ProfileData | null = null;
      try {
        profileData = await waitForProfile(userId, { baselineUpdatedAt });
      } catch (err) {
        if (err instanceof ProfileStillRunningError) {
          await get().syncImportStatus(userId, agentId);
          const current = get();
          if (current.stage === 'profiling') {
            set({
              stage: 'profiling',
              pipelineDetail: current.pipelineDetail || 'background profiling',
              error: null,
              preparedConversations: null,
            });
          }
          return;
        }
        throw err;
      }

      // Update import record
      await supabase
        .from('chat_imports')
        .update({ status: 'completed', pipeline_stage: 'complete', completed_at: new Date().toISOString(), memories_created: totalMemories })
        .eq('id', importId);

      set({ stage: 'complete', pipelineDetail: '', profileData, preparedConversations: null });
    } catch (err: unknown) {
      console.error('Import error:', err);
      const message = errorMessage(err, 'An unexpected error occurred');
      const importId = get().importId;
      if (importId) {
        await supabase
          .from('chat_imports')
          .update({ status: 'failed', pipeline_stage: 'error', completed_at: new Date().toISOString() })
          .eq('id', importId);
      }
      set({ stage: 'error', error: message });
    }
  },

  syncImportStatus: async (userId: string, requestedAgentId?: string) => {
    const { importId, stage } = get();
    if (!importId || !userId || stage === 'idle' || stage === 'filtering') return;

    const agentId = normalizeAgentId(requestedAgentId);
    const { data } = await supabase
      .from('chat_imports')
      .select('status, pipeline_stage, memories_created, questions_generated, conflicts_detected')
      .eq('id', importId)
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .maybeSingle();

    const row = data as ImportStatusRow | null;
    if (!row) return;

    const nextStage = stageFromImportPipeline(row.status, row.pipeline_stage);
    const counts = {
      memoriesCreated: row.memories_created ?? get().memoriesCreated,
      questionsGenerated: row.questions_generated ?? get().questionsGenerated,
      conflictsDetected: row.conflicts_detected ?? get().conflictsDetected,
    };

    if (nextStage === 'complete') {
      const profileData = await loadCompletedProfile(userId);
      set({
        ...counts,
        stage: 'complete',
        pipelineDetail: '',
        error: null,
        profileData,
        preparedConversations: null,
      });
      return;
    }

    if (nextStage === 'error') {
      set({
        ...counts,
        stage: 'error',
        pipelineDetail: '',
        error: 'Import failed during background profiling.',
        preparedConversations: null,
      });
      return;
    }

    if (nextStage) {
      set({
        ...counts,
        stage: nextStage,
        pipelineDetail: detailFromImportPipeline(row.pipeline_stage),
        error: null,
        preparedConversations: nextStage === 'profiling' ? null : get().preparedConversations,
      });
    }
  },

  reset: () => set(initialState),
  dismiss: () => set({ dismissed: true }),
}));
