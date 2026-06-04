import { useRef, useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useThreadStore } from '@/stores/threadStore';
import { useImportStore, type PipelineStage } from '@/stores/importStore';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import { supabase } from '@/integrations/supabase/client';
import ConnectOpenRouter from '@/components/ConnectOpenRouter';
import EchoField from '@/components/EchoField';
import { buildOnboardingHandoffPrompt } from '@/lib/interfaceMode';
import { stashChatHandoff } from '@/lib/guestChat';
import {
  asProfileRecord,
  isProfileRecord,
  profileNumber,
  profileRankedValues,
  profileStringList,
  profileText,
} from '@/lib/profileData';

type ImportRecord = {
  id: string;
  agent_id: string;
  status: string;
  source_platform: string | null;
  total_conversations: number | null;
  processed_conversations: number | null;
  memories_created: number | null;
  file_size_bytes: number | null;
  pipeline_stage: string | null;
  created_at: string;
  completed_at: string | null;
};

const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: 'Ready',
  filtering: 'Analyzing conversations',
  parsing: 'Parsing conversations',
  extracting: 'Extracting memories',
  synthesizing: 'Synthesizing narrative',
  profiling: 'Deep psychological analysis',
  complete: 'Analysis complete',
  error: 'Error',
};

const STAGE_ORDER: PipelineStage[] = ['extracting', 'synthesizing', 'profiling', 'complete'];

export default function ImportView() {
  const user = useAuthStore((s) => s.user);
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const navigate = useNavigate();
  const createThread = useThreadStore((s) => s.createThread);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [companionLaunching, setCompanionLaunching] = useState(false);
  const [modelKeyPreview, setModelKeyPreview] = useState<string | null>(null);
  const [modelKeyLoading, setModelKeyLoading] = useState(true);

  const {
    stage, fileName, fileSize, totalConversations, filteredCount,
    processedChunks, totalChunks, memoriesCreated, conflictsDetected,
    pipelineDetail, error, filterStats, profileData,
    parseAndFilter, startImport, reset,
  } = useImportStore();

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseAndFilter(file);
  }, [parseAndFilter]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseAndFilter(file);
  }, [parseAndFilter]);

  const [pastImports, setPastImports] = useState<ImportRecord[]>([]);

  const refreshImports = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('chat_imports')
      .select('id, agent_id, status, source_platform, total_conversations, processed_conversations, memories_created, file_size_bytes, pipeline_stage, created_at, completed_at')
      .eq('user_id', user.id)
      .eq('agent_id', activeAgentId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setPastImports(data as ImportRecord[]);
  }, [activeAgentId, user]);

  const isProcessing = ['extracting', 'synthesizing', 'profiling'].includes(stage);
  const showPreAnalysis = stage === 'idle' && filterStats !== null;
  const showUpload = stage === 'idle' && filterStats === null;
  const hasActiveImport = pastImports.some((imp) => imp.status === 'processing');
  const showImportHistory = pastImports.length > 0 && !showPreAnalysis;
  const completedProfile = asProfileRecord(profileData);
  const completedPersonality = asProfileRecord(completedProfile.personality_dimensions);
  const completedBigFive = asProfileRecord(completedPersonality.big_five);
  const completedValues = asProfileRecord(completedProfile.values_hierarchy);
  const completedRankedValues = profileRankedValues(completedValues.ranked_values);
  const completedShadow = asProfileRecord(completedProfile.shadow_patterns);
  const completedBlindSpots = profileStringList(completedShadow.blind_spots);
  const completedContradictions = profileStringList(completedShadow.contradictions);
  const completedGrowth = profileStringList(asProfileRecord(completedProfile.growth_edges).active_growth);
  const modelKeyConnected = Boolean(modelKeyPreview);

  const startCompanionMigration = useCallback(async () => {
    if (!user || companionLaunching) return;
    if (!modelKeyConnected) return;
    setCompanionLaunching(true);
    try {
      const threadId = await createThread(user.id, 'luca');
      stashChatHandoff(buildOnboardingHandoffPrompt({
        intent: 'bring_existing',
        comfort: 'medium',
        expectations: ['migration', 'memory', 'companion'],
      }), { hidden: true });
      navigate(`/chat/${threadId}`);
    } catch (err) {
      console.error('[ImportView] companion migration handoff failed', err);
      setCompanionLaunching(false);
    }
  }, [companionLaunching, createThread, modelKeyConnected, navigate, user]);

  useEffect(() => {
    let cancelled = false;
    const loadKey = async () => {
      if (!user) {
        if (!cancelled) {
          setModelKeyPreview(null);
          setModelKeyLoading(false);
        }
        return;
      }
      setModelKeyLoading(true);
      const { data } = await supabase
        .from('user_api_keys')
        .select('key_preview')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled) {
        setModelKeyPreview(data?.key_preview ?? null);
        setModelKeyLoading(false);
      }
    };
    loadKey();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    refreshImports();
  }, [refreshImports, stage]);

  useEffect(() => {
    if (!user || (!isProcessing && !hasActiveImport)) return;
    const interval = window.setInterval(refreshImports, 5000);
    return () => window.clearInterval(interval);
  }, [user, isProcessing, hasActiveImport, refreshImports]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      <div className="flex items-center flex-shrink-0" style={{ height: 44, padding: '0 24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>Import Conversations</span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '48px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div className="import-companion-card">
            <div>
              <div className="import-companion-kicker">companion migration</div>
              <h2>Bring an existing digital companion into Polyphonic.</h2>
              <p>
                If you already have a companion somewhere else, start with Luca.
                They will stage the source material, ask what must be preserved,
                and turn it into a Forge proposal before anything becomes live memory.
              </p>
            </div>
            <div className="import-companion-actions">
              {modelKeyConnected ? (
                <>
                  <div className="import-key-status connected">OpenRouter connected · {modelKeyPreview}</div>
                  <button type="button" onClick={startCompanionMigration} disabled={companionLaunching}>
                    {companionLaunching ? 'Opening Luca…' : 'Start with Luca'}
                  </button>
                </>
              ) : (
                <>
                  <div className="import-key-status">
                    {modelKeyLoading ? 'Checking OpenRouter…' : 'Connect OpenRouter before migration.'}
                  </div>
                  <ConnectOpenRouter
                    variant="ghost"
                    label="Connect OpenRouter"
                    onConnected={(preview) => setModelKeyPreview(preview)}
                  />
                </>
              )}
            </div>
          </div>

          {/* ── IDLE: Upload Zone ── */}
          {showUpload && (
            <div style={{ animation: 'viewFadeIn 0.6s var(--ease-out) both' }}>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <EchoField size={160} particleCount={6000} state="idle" style={{ margin: '0 auto 24px' }} />
                <h1 style={{ fontSize: 24, fontWeight: 280, letterSpacing: '0.1em', color: 'var(--text-tertiary)', textTransform: 'lowercase', marginBottom: 12 }}>
                  import your history
                </h1>
                <p style={{ fontSize: 13, color: 'var(--text-ghost)', maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
                  Upload your conversation exports and let the AI build a deep understanding of who you are. Large datasets are automatically filtered for signal.
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
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Drop your export file here</div>
                <div style={{ fontSize: 12, color: 'var(--text-ghost)' }}>Supports ChatGPT and Claude JSON exports</div>
                <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} style={{ display: 'none' }} />
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-ghost)', lineHeight: 1.6, padding: '0 8px' }}>
                <div style={{ fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>How to export</div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>ChatGPT:</span> Settings → Data Controls → Export Data → extract conversations.json from the .zip
                </div>
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Claude:</span> Settings → Account → Export Data → use the conversations .json file
                </div>
              </div>
            </div>
          )}

          {/* ── IMPORT HISTORY ── */}
          {showImportHistory && (
            <div style={{
              marginTop: stage === 'complete' ? 48 : 40,
              paddingTop: 32,
              borderTop: '1px solid var(--border-subtle)',
              animation: 'viewFadeIn 0.6s var(--ease-out) both',
            }}>
              <div style={{
                fontSize: 10, fontWeight: 500, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text-ghost)', marginBottom: 20,
              }}>
                Import History
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {pastImports.map((imp, i) => {
                  const platform = (imp.source_platform ?? 'unknown').toLowerCase();
                  const isGpt = platform === 'chatgpt';
                  const isClaude = platform === 'claude';
                  const platformLabel = isGpt ? 'GPT' : isClaude ? 'CL' : '?';
                  const platformColor = isGpt ? 'rgba(228, 178, 98, 0.8)' : isClaude ? 'rgba(135, 165, 200, 0.8)' : 'var(--text-ghost)';
                  const platformBg = isGpt ? 'rgba(228, 178, 98, 0.12)' : isClaude ? 'rgba(135, 165, 200, 0.10)' : 'rgba(244, 243, 240, 0.06)';

                  const date = new Date(imp.created_at);
                  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                  const sizeStr = imp.file_size_bytes
                    ? imp.file_size_bytes > 1_000_000
                      ? `${(imp.file_size_bytes / 1_000_000).toFixed(1)} MB`
                      : `${Math.round(imp.file_size_bytes / 1_000)} KB`
                    : null;

                  const isActive = imp.status === 'processing';
                  const isError = imp.status === 'error' || imp.status === 'failed';
                  const isCompleted = imp.status === 'completed';

                  let duration: string | null = null;
                  if (imp.completed_at && imp.created_at) {
                    const ms = new Date(imp.completed_at).getTime() - new Date(imp.created_at).getTime();
                    const mins = Math.floor(ms / 60000);
                    const secs = Math.round((ms % 60000) / 1000);
                    duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
                  }

                  return (
                    <div key={imp.id}>
                      {/* Timeline connector */}
                      {i > 0 && (
                        <div style={{ display: 'flex', paddingLeft: 15 }}>
                          <div style={{ width: 1, height: 12, background: 'var(--border-subtle)' }} />
                        </div>
                      )}
                      <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: 14,
                        padding: '12px 0',
                      }}>
                        {/* Platform icon */}
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%',
                          background: platformBg,
                          border: `1px solid ${isActive ? platformColor : 'transparent'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 600,
                          color: platformColor,
                          letterSpacing: '0.04em',
                          flexShrink: 0,
                          animation: isActive ? 'breathe 2s ease-in-out infinite' : undefined,
                        }}>
                          {platformLabel}
                        </div>

                        {/* Details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 420 }}>
                              {dateStr}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
                              {timeStr}
                            </span>
                          </div>
                          <div style={{
                            fontSize: 11, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.02em', display: 'flex', flexWrap: 'wrap', gap: '2px 12px',
                          }}>
                            {imp.total_conversations != null && (
                              <span>{imp.total_conversations} conversations</span>
                            )}
                            {imp.memories_created != null && imp.memories_created > 0 && (
                              <span>{imp.memories_created} memories</span>
                            )}
                            {sizeStr && <span>{sizeStr}</span>}
                            {duration && <span>{duration}</span>}
                          </div>
                        </div>

                        {/* Status badge */}
                        <div style={{
                          fontSize: 9, fontFamily: 'var(--font-mono)',
                          letterSpacing: '0.08em', textTransform: 'uppercase',
                          padding: '3px 8px', borderRadius: 999,
                          fontWeight: 500,
                          background: isCompleted ? 'rgba(74, 222, 128, 0.10)'
                            : isActive ? 'rgba(228, 178, 98, 0.10)'
                            : isError ? 'rgba(248, 113, 113, 0.10)'
                            : 'rgba(244, 243, 240, 0.06)',
                          color: isCompleted ? 'rgba(74, 222, 128, 0.8)'
                            : isActive ? 'rgba(228, 178, 98, 0.8)'
                            : isError ? 'rgba(248, 113, 113, 0.8)'
                            : 'var(--text-ghost)',
                          flexShrink: 0,
                        }}>
                          {isCompleted ? 'completed' : isActive ? (imp.pipeline_stage ?? 'processing') : isError ? 'error' : imp.status}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── FILTERING ── */}
          {stage === 'filtering' && (
            <div style={{ animation: 'viewFadeIn 0.6s var(--ease-out) both', textAlign: 'center' }}>
              <EchoField size={160} particleCount={8000} state="thinking" style={{ margin: '0 auto 24px' }} />
              <h2 style={{ fontSize: 18, fontWeight: 300, letterSpacing: '0.08em', color: 'var(--text-secondary)', textTransform: 'lowercase' }}>
                analyzing conversations
              </h2>
              <div style={{ fontSize: 12, color: 'var(--text-ghost)', marginTop: 8 }}>Scoring for signal quality...</div>
            </div>
          )}

          {/* ── PRE-ANALYSIS SUMMARY ── */}
          {showPreAnalysis && filterStats && (
            <div style={{ animation: 'viewFadeIn 0.6s var(--ease-out) both' }}>
              <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <EchoField size={140} particleCount={6000} state="idle" style={{ margin: '0 auto 24px' }} />
                <h2 style={{ fontSize: 20, fontWeight: 280, letterSpacing: '0.1em', color: 'var(--text-secondary)', textTransform: 'lowercase', marginBottom: 8 }}>
                  ready to analyze
                </h2>
                <div style={{ fontSize: 13, color: 'var(--text-ghost)' }}>{fileName}</div>
              </div>

              {/* Filter stats */}
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 32 }}>
                <StatCard label="Total conversations" value={String(filterStats.rawCount)} />
                <StatCard label="Selected (high signal)" value={String(filterStats.filteredCount)} highlight />
                <StatCard label="Estimated time" value={`~${filterStats.estimatedMinutes} min`} />
              </div>

              {/* Breakdown */}
              <div style={{ padding: '20px 24px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', marginBottom: 32 }}>
                <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', marginBottom: 16 }}>Filtering Summary</div>
                <div className="flex flex-col gap-2" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  <div className="flex justify-between">
                    <span>Skipped (too short, &lt;6 messages)</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)' }}>{filterStats.skippedShort}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Skipped (minimal user text)</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)' }}>{filterStats.skippedLowText}</span>
                  </div>
                  <div className="flex justify-between" style={{ paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontWeight: 450 }}>Substantial conversations</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{filterStats.filteredCount}</span>
                  </div>
                  {filterStats.dateRange && (
                    <div className="flex justify-between" style={{ fontSize: 12, color: 'var(--text-ghost)' }}>
                      <span>Date range</span>
                      <span>{filterStats.dateRange.earliest} — {filterStats.dateRange.latest}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => user && startImport(user.id, activeAgentId)}
                  className="cursor-pointer"
                  style={{
                    height: 40, padding: '0 28px',
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                    fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 450,
                  }}
                >
                  Begin Analysis
                </button>
                <button
                  onClick={reset}
                  className="cursor-pointer"
                  style={{
                    height: 40, padding: '0 20px',
                    background: 'transparent', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)', color: 'var(--text-tertiary)',
                    fontSize: 13, fontFamily: 'var(--font-sans)',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── PROCESSING: Pipeline Visualization ── */}
          {isProcessing && (
            <div style={{ animation: 'viewFadeIn 0.6s var(--ease-out) both' }}>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <EchoField size={200} particleCount={14000} state="thinking" style={{ margin: '0 auto 24px' }} />
                <h2 style={{ fontSize: 18, fontWeight: 300, letterSpacing: '0.08em', color: 'var(--text-secondary)', textTransform: 'lowercase', marginBottom: 8 }}>
                  {STAGE_LABELS[stage]}
                </h2>
                {pipelineDetail && (
                  <div style={{ fontSize: 12, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
                    {pipelineDetail}
                  </div>
                )}
              </div>

              {/* Pipeline Steps */}
              <div style={{ marginBottom: 40 }}>
                {STAGE_ORDER.slice(0, -1).map((s, i) => {
                  const currentIdx = STAGE_ORDER.indexOf(stage);
                  const isDone = currentIdx > i;
                  const isActive = currentIdx === i;
                  return (
                    <div key={s} className="flex items-center gap-3" style={{ padding: '10px 0', opacity: isDone ? 0.5 : isActive ? 1 : 0.25, transition: 'opacity var(--dur-normal) var(--ease-out)' }}>
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
                        {STAGE_LABELS[s]}
                      </span>
                      {isActive && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--luca)', animation: 'pulse-thread 1.5s ease-in-out infinite', marginLeft: 4 }} />}
                    </div>
                  );
                })}
              </div>

              {/* Live Counters */}
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <StatCard
                  label="Conversations"
                  value={stage === 'extracting' ? `${Math.min(processedChunks * 50, filteredCount)}/${filteredCount}` : String(filteredCount)}
                />
                <StatCard label="Memories" value={String(memoriesCreated)} />
                <StatCard label="Patterns" value={String(conflictsDetected)} />
              </div>

              <div style={{ marginTop: 32, textAlign: 'center', fontSize: 12, color: 'var(--text-ghost)' }}>
                You can navigate away — progress will continue in the background
              </div>
            </div>
          )}

          {/* ── ERROR ── */}
          {stage === 'error' && (
            <div style={{ animation: 'viewFadeIn 0.6s var(--ease-out) both', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>⚠</div>
              <div style={{ fontSize: 14, color: '#f87171', marginBottom: 8 }}>{error}</div>
              <button
                onClick={reset}
                className="cursor-pointer"
                style={{ height: 36, padding: '0 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'var(--font-sans)', marginTop: 16 }}
              >
                Try again
              </button>
            </div>
          )}

          {/* ── COMPLETE: Results ── */}
          {stage === 'complete' && (
            <div style={{ animation: 'viewFadeIn 0.8s var(--ease-out) both' }}>
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <EchoField size={160} particleCount={8000} state="idle" style={{ margin: '0 auto 24px' }} />
                <h2 style={{ fontSize: 20, fontWeight: 280, letterSpacing: '0.1em', color: 'var(--text-secondary)', textTransform: 'lowercase', marginBottom: 8 }}>
                  analysis complete
                </h2>
                <div style={{ fontSize: 12, color: 'var(--text-ghost)' }}>
                  {filteredCount} conversations → {memoriesCreated} memories extracted
                </div>
              </div>

              {/* Identity Portrait */}
              {profileText(completedProfile.identity_narrative) && (
                <div style={{ marginBottom: 40, padding: '28px 24px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', marginBottom: 16 }}>Portrait</div>
                  <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8, fontWeight: 350, fontStyle: 'italic' }}>
                    {profileText(completedProfile.identity_narrative)}
                  </p>
                </div>
              )}

              {/* Big Five */}
              {Object.keys(completedBigFive).length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', marginBottom: 16 }}>Personality Dimensions</div>
                  <div className="flex flex-col gap-3">
                    {Object.entries(completedBigFive).map(([key, val]: [string, any]) => (
                      <DimensionBar
                        key={key}
                        label={key}
                        score={profileNumber(isProfileRecord(val) ? val.score : val, 50)}
                        evidence={isProfileRecord(val) ? profileText(val.evidence) : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Communication */}
              {Object.keys(asProfileRecord(completedProfile.communication_patterns)).length > 0 && (
                <InsightSection title="Communication Style" data={asProfileRecord(completedProfile.communication_patterns)} />
              )}

              {/* Values */}
              {completedRankedValues.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', marginBottom: 16 }}>Core Values</div>
                  <div className="flex flex-col gap-2">
                    {completedRankedValues.slice(0, 8).map((v, i: number) => (
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
              {(completedBlindSpots.length > 0 || completedContradictions.length > 0) && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', marginBottom: 16 }}>Hidden Patterns</div>
                  {completedBlindSpots.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 450 }}>Blind Spots</div>
                      {completedBlindSpots.map((b: string, i: number) => (
                        <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>{b}</div>
                      ))}
                    </div>
                  )}
                  {completedContradictions.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 450 }}>Contradictions</div>
                      {completedContradictions.map((c: string, i: number) => (
                        <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>{c}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Growth Edges */}
              {completedGrowth.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', marginBottom: 16 }}>Growth Edges</div>
                  {completedGrowth.map((g: string, i: number) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '6px 0' }}>→ {g}</div>
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
                  onClick={() => navigate('/profile')}
                  className="cursor-pointer"
                  style={{ height: 38, padding: '0 20px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-tertiary)', fontSize: 13, fontFamily: 'var(--font-sans)' }}
                >
                  View full profile
                </button>
                <button
                  onClick={reset}
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

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: `1px solid ${highlight ? 'var(--border)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', padding: '16px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 300, color: highlight ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function DimensionBar({ label, score, evidence }: { label: string; score: number; evidence?: string }) {
  const safeScore = Math.max(0, Math.min(100, profileNumber(score, 50)));
  return (
    <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize', fontWeight: 450 }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>{safeScore}/100</span>
      </div>
      <div style={{ height: 3, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${safeScore}%`, height: '100%', background: 'var(--text-ghost)', borderRadius: 2, transition: 'width 1s var(--ease-out)' }} />
      </div>
      {evidence && <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 6, lineHeight: 1.4 }}>{evidence}</div>}
    </div>
  );
}

function InsightSection({ title, data }: { title: string; data: Record<string, any> }) {
  const displayKeys = Object.entries(data)
    .map(([key, value]) => [key, profileText(value)] as const)
    .filter(([, value]) => value.length > 0);
  if (displayKeys.length === 0) return null;
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-ghost)', marginBottom: 16 }}>{title}</div>
      <div className="flex flex-col gap-2">
        {displayKeys.map(([key, value]) => (
          <div key={key} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-ghost)', textTransform: 'capitalize', marginBottom: 4 }}>{key.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
