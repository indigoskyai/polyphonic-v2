import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import EchoField from '@/components/EchoField';

type PipelineStage = 'idle' | 'parsing' | 'extracting' | 'synthesizing' | 'profiling' | 'complete' | 'error';

interface ImportState {
  stage: PipelineStage;
  fileName: string;
  fileSize: number;
  totalConversations: number;
  processedChunks: number;
  totalChunks: number;
  memoriesCreated: number;
  questionsGenerated: number;
  conflictsDetected: number;
  pipelineDetail: string;
  error: string | null;
}

interface ProfileData {
  identity_narrative: string | null;
  personality_dimensions: any;
  communication_patterns: any;
  emotional_landscape: any;
  values_hierarchy: any;
  relational_dynamics: any;
  cognitive_tendencies: any;
  growth_edges: any;
  shadow_patterns: any;
}

const CHUNK_SIZE = 15; // conversations per chunk

const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: 'Ready',
  parsing: 'Parsing conversations',
  extracting: 'Extracting memories',
  synthesizing: 'Synthesizing narrative',
  profiling: 'Deep psychological analysis',
  complete: 'Analysis complete',
  error: 'Error',
};

const STAGE_ORDER: PipelineStage[] = ['parsing', 'extracting', 'synthesizing', 'profiling', 'complete'];

function detectPlatform(data: any): string {
  if (Array.isArray(data) && data[0]?.mapping) return 'chatgpt';
  if (Array.isArray(data) && data[0]?.uuid && data[0]?.chat_messages) return 'claude';
  return 'unknown';
}

/**
 * Convert Claude conversations into ChatGPT-compatible format
 * so they can be processed by the same import-chatgpt edge function.
 * Claude format: { uuid, name, created_at, chat_messages: [{sender, text, created_at_utc}] }
 * ChatGPT format: { title, create_time, mapping: { [nodeId]: { message: { author: { role }, content: { parts }, create_time } } } }
 */
function convertClaudeToMapping(conversations: any[]): any[] {
  return conversations
    .filter((c: any) => c.chat_messages?.length >= 2)
    .map((conv: any) => {
      const mapping: Record<string, any> = {};
      conv.chat_messages.forEach((msg: any, i: number) => {
        const role = msg.sender === 'human' ? 'user' : msg.sender === 'assistant' ? 'assistant' : null;
        if (!role || !msg.text?.trim()) return;
        mapping[`node-${i}`] = {
          message: {
            author: { role },
            content: { parts: [msg.text] },
            create_time: msg.created_at_utc ? new Date(msg.created_at_utc).getTime() / 1000 : (conv.created_at ? new Date(conv.created_at).getTime() / 1000 : 0) + i,
          },
        };
      });
      return {
        title: conv.name || 'Untitled',
        create_time: conv.created_at ? new Date(conv.created_at).getTime() / 1000 : 0,
        mapping,
      };
    });
}

export default function ImportView() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [state, setState] = useState<ImportState>({
    stage: 'idle',
    fileName: '',
    fileSize: 0,
    totalConversations: 0,
    processedChunks: 0,
    totalChunks: 0,
    memoriesCreated: 0,
    questionsGenerated: 0,
    conflictsDetected: 0,
    pipelineDetail: '',
    error: null,
  });
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [pollingImportId, setPollingImportId] = useState<string | null>(null);

  // Poll for pipeline_stage updates during profiling
  useEffect(() => {
    if (!pollingImportId || state.stage !== 'profiling') return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('chat_imports')
        .select('pipeline_stage, status')
        .eq('id', pollingImportId)
        .maybeSingle();
      if (data) {
        const detail = data.pipeline_stage?.includes(':') ? data.pipeline_stage.split(':')[1] : '';
        setState((s) => ({ ...s, pipelineDetail: detail }));
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(interval);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pollingImportId, state.stage]);

  const processFile = useCallback(async (file: File) => {
    if (!user) return;

    setState((s) => ({ ...s, stage: 'parsing', fileName: file.name, fileSize: file.size, error: null }));

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const platform = detectPlatform(data);

      if (platform === 'unknown') {
        setState((s) => ({ ...s, stage: 'error', error: 'Unrecognized format. Supports ChatGPT (.json with mapping) and Claude (.json with chat_messages) exports.' }));
        return;
      }

      // Normalize both formats into ChatGPT-compatible structure
      let normalizedConvos: any[];
      if (platform === 'claude') {
        const rawConvos = Array.isArray(data) ? data : [];
        normalizedConvos = convertClaudeToMapping(rawConvos);
      } else {
        const rawConvos = Array.isArray(data) ? data : [];
        normalizedConvos = rawConvos.filter((c: any) => c.mapping && typeof c.mapping === 'object');
      }

      const validConvos = normalizedConvos;
      const totalChunks = Math.ceil(validConvos.length / CHUNK_SIZE);

      setState((s) => ({
        ...s,
        totalConversations: validConvos.length,
        totalChunks,
        stage: 'extracting',
      }));

      // Create import record
      const { data: importRow } = await supabase
        .from('chat_imports')
        .insert({
          user_id: user.id,
          status: 'processing',
          pipeline_stage: 'extracting',
          source_platform: platform,
          total_conversations: validConvos.length,
          file_size_bytes: file.size,
        })
        .select('id')
        .single();

      const importId = importRow?.id;
      if (!importId) throw new Error('Failed to create import record');

      setPollingImportId(importId);

      // Get session token
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('No auth session');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      // ── Stage 1: Extract memories in chunks ──
      let accumulatedMemories: string[] = [];
      let totalMemories = 0;
      let totalQuestions = 0;
      let totalConflicts = 0;

      for (let i = 0; i < totalChunks; i++) {
        const chunk = validConvos.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

        setState((s) => ({
          ...s,
          processedChunks: i,
          pipelineDetail: `chunk ${i + 1}/${totalChunks}`,
        }));

        const response = await fetch(`${supabaseUrl}/functions/v1/import-chatgpt`, {
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
            accumulated_memories: accumulatedMemories,
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(err.error || `Chunk ${i + 1} failed`);
        }

        const result = await response.json();
        totalMemories += result.memories_created || 0;
        totalQuestions += result.questions_generated || 0;
        totalConflicts += result.conflicts_detected || 0;
        if (result.created_contents) {
          accumulatedMemories = [...accumulatedMemories, ...result.created_contents];
        }

        setState((s) => ({
          ...s,
          processedChunks: i + 1,
          memoriesCreated: totalMemories,
          questionsGenerated: totalQuestions,
          conflictsDetected: totalConflicts,
        }));
      }

      // ── Stage 2: Synthesize ──
      setState((s) => ({ ...s, stage: 'synthesizing', pipelineDetail: '' }));

      await fetch(`${supabaseUrl}/functions/v1/memory-synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ import_id: importId }),
      });

      // ── Stage 3: Deep Psychological Analysis ──
      setState((s) => ({ ...s, stage: 'profiling', pipelineDetail: '' }));

      const profileResponse = await fetch(`${supabaseUrl}/functions/v1/profile-deep-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ import_id: importId }),
      });

      if (!profileResponse.ok) {
        console.error('Profile analysis failed, continuing without it');
      }

      // ── Load results ──
      const { data: profileData } = await supabase
        .from('psychological_profile')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData as unknown as ProfileData);
      }

      setState((s) => ({ ...s, stage: 'complete', pipelineDetail: '' }));
    } catch (err: any) {
      console.error('Import error:', err);
      setState((s) => ({ ...s, stage: 'error', error: err.message || 'An unexpected error occurred' }));
    }
  }, [user]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const isProcessing = !['idle', 'complete', 'error'].includes(state.stage);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      {/* Header */}
      <div className="flex items-center flex-shrink-0" style={{ height: 44, padding: '0 24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>Import Conversations</span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '48px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>

          {/* ── IDLE: Upload Zone ── */}
          {state.stage === 'idle' && (
            <div style={{ animation: 'viewFadeIn 0.6s var(--ease-out) both' }}>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <EchoField size={160} particleCount={6000} state="idle" style={{ margin: '0 auto 24px' }} />
                <h1 style={{ fontSize: 24, fontWeight: 280, letterSpacing: '0.1em', color: 'var(--text-tertiary)', textTransform: 'lowercase', marginBottom: 12 }}>
                  import your history
                </h1>
                <p style={{ fontSize: 13, color: 'var(--text-ghost)', maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
                  Upload your conversation exports and let the AI build a deep understanding of who you are. The more data you provide, the more nuanced the analysis.
                </p>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer"
                style={{
                  border: `1px dashed ${dragOver ? 'var(--border-focus)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '48px 24px',
                  textAlign: 'center',
                  background: dragOver ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                  transition: 'all var(--dur-fast) var(--ease-out)',
                  marginBottom: 32,
                }}
              >
                <div style={{ fontSize: 32, color: 'var(--text-ghost)', marginBottom: 12, fontWeight: 200 }}>↑</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Drop your export file here
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-ghost)' }}>
                  Supports ChatGPT JSON exports • .json
                </div>
                <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} style={{ display: 'none' }} />
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-ghost)', lineHeight: 1.6, padding: '0 8px' }}>
                <div style={{ fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>How to export</div>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>ChatGPT:</span> Settings → Data Controls → Export Data → Download the .zip → extract conversations.json
                </div>
              </div>
            </div>
          )}

          {/* ── PROCESSING: Pipeline Visualization ── */}
          {isProcessing && (
            <div style={{ animation: 'viewFadeIn 0.6s var(--ease-out) both' }}>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <EchoField size={200} particleCount={14000} state="thinking" style={{ margin: '0 auto 24px' }} />
                <h2 style={{ fontSize: 18, fontWeight: 300, letterSpacing: '0.08em', color: 'var(--text-secondary)', textTransform: 'lowercase', marginBottom: 8 }}>
                  {STAGE_LABELS[state.stage]}
                </h2>
                {state.pipelineDetail && (
                  <div style={{ fontSize: 12, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
                    {state.pipelineDetail}
                  </div>
                )}
              </div>

              {/* Pipeline Steps */}
              <div style={{ marginBottom: 40 }}>
                {STAGE_ORDER.slice(0, -1).map((stage, i) => {
                  const currentIdx = STAGE_ORDER.indexOf(state.stage);
                  const stageIdx = i;
                  const isDone = currentIdx > stageIdx;
                  const isActive = currentIdx === stageIdx;
                  return (
                    <div key={stage} className="flex items-center gap-3" style={{ padding: '10px 0', opacity: isDone ? 0.5 : isActive ? 1 : 0.25, transition: 'opacity var(--dur-normal) var(--ease-out)' }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: `1.5px solid ${isDone ? 'var(--text-ghost)' : isActive ? 'var(--text-secondary)' : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: isDone ? 'var(--text-ghost)' : 'var(--text-tertiary)',
                        background: isDone ? 'var(--bg-surface)' : 'transparent',
                      }}>
                        {isDone ? '✓' : i + 1}
                      </div>
                      <span style={{ fontSize: 13, color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: isActive ? 450 : 400 }}>
                        {STAGE_LABELS[stage]}
                      </span>
                      {isActive && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--luca)', animation: 'pulse-thread 1.5s ease-in-out infinite', marginLeft: 4 }} />}
                    </div>
                  );
                })}
              </div>

              {/* Live Counters */}
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <CounterCard label="Conversations" value={state.stage === 'extracting' ? `${state.processedChunks * CHUNK_SIZE}/${state.totalConversations}` : String(state.totalConversations)} />
                <CounterCard label="Memories" value={String(state.memoriesCreated)} />
                <CounterCard label="Patterns" value={String(state.conflictsDetected)} />
              </div>
            </div>
          )}

          {/* ── ERROR ── */}
          {state.stage === 'error' && (
            <div style={{ animation: 'viewFadeIn 0.6s var(--ease-out) both', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>⚠</div>
              <div style={{ fontSize: 14, color: '#f87171', marginBottom: 8 }}>{state.error}</div>
              <button
                onClick={() => setState((s) => ({ ...s, stage: 'idle', error: null }))}
                className="cursor-pointer"
                style={{ height: 36, padding: '0 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'var(--font-sans)', marginTop: 16 }}
              >
                Try again
              </button>
            </div>
          )}

          {/* ── COMPLETE: Results ── */}
          {state.stage === 'complete' && (
            <div style={{ animation: 'viewFadeIn 0.8s var(--ease-out) both' }}>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <EchoField size={160} particleCount={8000} state="idle" style={{ margin: '0 auto 24px' }} />
                <h2 style={{ fontSize: 20, fontWeight: 280, letterSpacing: '0.1em', color: 'var(--text-secondary)', textTransform: 'lowercase', marginBottom: 8 }}>
                  analysis complete
                </h2>
                <div style={{ fontSize: 12, color: 'var(--text-ghost)' }}>
                  {state.totalConversations} conversations → {state.memoriesCreated} memories extracted
                </div>
              </div>

              {/* Identity Portrait */}
              {profile?.identity_narrative && (
                <div style={{ marginBottom: 40, padding: '28px 24px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', marginBottom: 16 }}>Portrait</div>
                  <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8, fontWeight: 350, fontStyle: 'italic' }}>
                    {profile.identity_narrative}
                  </p>
                </div>
              )}

              {/* Big Five */}
              {profile?.personality_dimensions?.big_five && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', marginBottom: 16 }}>Personality Dimensions</div>
                  <div className="flex flex-col gap-3">
                    {Object.entries(profile.personality_dimensions.big_five).map(([key, val]: [string, any]) => (
                      <DimensionBar key={key} label={key} score={val.score} evidence={val.evidence} />
                    ))}
                  </div>
                </div>
              )}

              {/* Communication */}
              {profile?.communication_patterns && (
                <InsightSection title="Communication Style" data={profile.communication_patterns} />
              )}

              {/* Values */}
              {profile?.values_hierarchy?.ranked_values && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', marginBottom: 16 }}>Core Values</div>
                  <div className="flex flex-col gap-2">
                    {profile.values_hierarchy.ranked_values.slice(0, 8).map((v: any, i: number) => (
                      <div key={i} className="flex items-start gap-3" style={{ padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', minWidth: 16 }}>{i + 1}</span>
                        <div>
                          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 450 }}>{v.value}</div>
                          {v.evidence && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4, marginTop: 2 }}>{v.evidence}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Shadow Patterns */}
              {profile?.shadow_patterns && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', marginBottom: 16 }}>Hidden Patterns</div>
                  {profile.shadow_patterns.blind_spots?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 450 }}>Blind Spots</div>
                      {profile.shadow_patterns.blind_spots.map((b: string, i: number) => (
                        <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                          {b}
                        </div>
                      ))}
                    </div>
                  )}
                  {profile.shadow_patterns.contradictions?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 450 }}>Contradictions</div>
                      {profile.shadow_patterns.contradictions.map((c: string, i: number) => (
                        <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                          {c}
                        </div>
                      ))}
                    </div>
                  )}
                  {profile.shadow_patterns.unasked_questions?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 450 }}>Questions Worth Sitting With</div>
                      {profile.shadow_patterns.unasked_questions.map((q: string, i: number) => (
                        <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '6px 0', fontStyle: 'italic' }}>
                          "{q}"
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Growth Edges */}
              {profile?.growth_edges?.active_growth?.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', marginBottom: 16 }}>Growth Edges</div>
                  {profile.growth_edges.active_growth.map((g: string, i: number) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '6px 0' }}>
                      → {g}
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3" style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => navigate('/chat')}
                  className="cursor-pointer"
                  style={{ height: 38, padding: '0 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-sans)' }}
                >
                  Start chatting
                </button>
                <button
                  onClick={() => { setState((s) => ({ ...s, stage: 'idle' })); setProfile(null); }}
                  className="cursor-pointer"
                  style={{ height: 38, padding: '0 20px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-tertiary)', fontSize: 13, fontFamily: 'var(--font-sans)' }}
                >
                  Import more
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function CounterCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 300, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function DimensionBar({ label, score, evidence }: { label: string; score: number; evidence?: string }) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize', fontWeight: 450 }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>{score}/100</span>
      </div>
      <div style={{ height: 3, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: 'var(--text-ghost)', borderRadius: 2, transition: 'width 1s var(--ease-out)' }} />
      </div>
      {evidence && <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 6, lineHeight: 1.4 }}>{evidence}</div>}
    </div>
  );
}

function InsightSection({ title, data }: { title: string; data: Record<string, any> }) {
  const displayKeys = Object.entries(data).filter(([_, v]) => typeof v === 'string' && v.length > 0);
  if (displayKeys.length === 0) return null;

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', marginBottom: 16 }}>{title}</div>
      <div className="flex flex-col gap-2">
        {displayKeys.map(([key, value]) => (
          <div key={key} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-ghost)', textTransform: 'capitalize', marginBottom: 4 }}>{key.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{String(value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
