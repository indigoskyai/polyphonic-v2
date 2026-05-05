import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useFirstMount } from '@/lib/useFirstMount';
import { useNavigate, useParams } from 'react-router-dom';
import { useThreadStore } from '@/stores/threadStore';
import { AgentPicker } from '@/components/composer/AgentPicker';
import { ObserverEyeChip } from '@/components/composer/ObserverEyeChip';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useDrawerStore } from '@/stores/drawerStore';

import EchoField from '@/components/EchoField';
import RichBody from '@/components/rich/RichBody';
import AttachmentDropOverlay from '@/components/attachments/AttachmentDropOverlay';
import AttachmentChip from '@/components/attachments/AttachmentChip';
import CouncilPanel from '@/components/messages/CouncilPanel';
import MessageItem from '@/components/messages/MessageItem';
import PermissionInline from '@/components/permissions/PermissionInline';
import WelcomeBackCard from '@/components/chat/WelcomeBackCard';
import AgentErroredCard from '@/components/states/AgentErroredCard';
import ArtifactCard from '@/components/canvas/ArtifactCard';
import { useArtifactStore } from '@/stores/artifactStore';
import { useAttachmentStore, type Attachment } from '@/stores/attachmentStore';
import type { Message, MessageAttachment as PersistedAttachment } from '@/stores/threadStore';
import SubAgentRow from '@/components/subagents/SubAgentRow';
import { useSubAgentStore } from '@/stores/subAgentStore';
import { useAgentConsultRealtime } from '@/hooks/useAgentConsultRealtime';
import AgentDialogueChip from '@/components/agents/AgentDialogueChip';
import { useAgentConsultStore, selectByThread as selectConsultsByThread } from '@/stores/agentConsultStore';
import { parseEdgeError, friendlyMessage } from '@/lib/edgeError';
import { extractStreamingArtifacts } from '@/lib/streamingArtifacts';
import { clearHighlightCache } from '@/components/rich/highlightCache';
import {
  CHAT_ATTACHMENT_BUCKET,
  inferAttachmentLanguage,
  inferAttachmentType,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENTS,
  safeAttachmentFileName,
  shouldInlineCodeAttachment,
} from '@/lib/chatAttachments';

/* ─── Smooth, rate-limited typewriter hook ───
 * Decouples reveal speed from network chunk delivery. Maintains a steady
 * cadence (~60 chars/sec) that ramps up gracefully if the buffer falls behind.
 */
/* ─── Smooth, rate-limited typewriter hook ───
 * Decouples reveal speed from network chunk delivery. Maintains a steady
 * cadence that ramps gracefully when the buffer falls behind, capped so
 * bursts don't dump. Skips setState when nothing advances so React doesn't
 * re-render the streaming bubble idly.
 */
function useSmoothTypewriter(target: string, active = true) {
  const [displayed, setDisplayed] = useState(active ? '' : target);
  const displayedRef = useRef(displayed);
  const targetRef = useRef(target);
  const lastTickRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const prevTargetRef = useRef('');
  // Exponential moving average of the gap, so cadence eases instead of
  // stair-stepping when bursts of tokens land.
  const gapEmaRef = useRef(0);

  useEffect(() => { targetRef.current = target; }, [target]);

  useEffect(() => {
    if (!active) {
      displayedRef.current = target;
      setDisplayed(target);
      return;
    }

    // Detect a brand-new message (target no longer extends prior target):
    // reset the buffer and EMA so cadence doesn't start mid-curve.
    if (!target.startsWith(prevTargetRef.current) || prevTargetRef.current === '') {
      if (!target.startsWith(prevTargetRef.current)) {
        displayedRef.current = '';
        setDisplayed('');
        gapEmaRef.current = 0;
        lastTickRef.current = 0;
      }
    }
    prevTargetRef.current = target;

    const tick = (now: number) => {
      if (!lastTickRef.current) lastTickRef.current = now;
      const elapsed = Math.min(now - lastTickRef.current, 64); // clamp huge frames
      lastTickRef.current = now;

      const tgt = targetRef.current;
      const curLen = displayedRef.current.length;
      const gap = tgt.length - curLen;

      if (gap > 0) {
        // Smoothed gap with EMA so cadence rises and falls gracefully.
        gapEmaRef.current = gapEmaRef.current * 0.8 + gap * 0.2;
        const smoothedGap = gapEmaRef.current;

        // Continuous cadence curve: 180 cps base, ramps to ~520 cps cap.
        // sqrt-ish curve avoids the staircase from a tiered switch.
        const charsPerMs = Math.min(0.52, 0.18 + Math.sqrt(smoothedGap) * 0.024);

        const advance = Math.max(1, Math.round(elapsed * charsPerMs));
        const nextLen = Math.min(tgt.length, curLen + advance);
        if (nextLen !== curLen) {
          const next = tgt.slice(0, nextLen);
          displayedRef.current = next;
          setDisplayed(next);
        }
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Caught up — go idle. We re-arm via the effect when target grows.
        lastTickRef.current = 0;
        rafRef.current = 0;
      }
    };

    // Only start the loop if there's actually work to do; otherwise the
    // next target change re-runs this effect and starts it then.
    if (displayedRef.current.length < target.length) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      displayedRef.current = target;
      setDisplayed(target);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = 0;
    };
  }, [active, target]);

  return displayed;
}


/* ─── Smooth streaming text component ───
 * Holds the cursor through the typewriter catch-up phase, then fades it out
 * and signals onSettled so the parent can swap to the persisted message
 * without any visible flash.
 */
function StreamingText({
  content,
  isStreaming,
  className,
  style,
  onSettled,
}: {
  content: string;
  isStreaming: boolean;
  className?: string;
  style?: React.CSSProperties;
  onSettled?: () => void;
}) {
  const displayed = useSmoothTypewriter(content, true);
  const settled = !isStreaming && displayed.length === content.length && content.length > 0;
  const [cursorFading, setCursorFading] = useState(false);
  const settledFiredRef = useRef(false);

  // When settled, fade cursor then notify parent
  useEffect(() => {
    if (!settled) {
      setCursorFading(false);
      settledFiredRef.current = false;
      return;
    }
    setCursorFading(true);
    const t = setTimeout(() => {
      if (!settledFiredRef.current) {
        settledFiredRef.current = true;
        onSettled?.();
      }
    }, 240);
    return () => clearTimeout(t);
  }, [settled, onSettled]);

  // Throttle markdown reparse: re-render the tree only when the displayed
  // text grew by ≥8 chars, crossed a markdown boundary (newline / fence /
  // list marker), or finished settling. Cuts reparse cost dramatically on
  // long replies and keeps the typewriter at 60fps.
  const lastTreeLenRef = useRef(0);
  const treeSourceLen = useMemo(() => {
    const prev = lastTreeLenRef.current;
    const cur = displayed.length;
    if (cur === 0) { lastTreeLenRef.current = 0; return 0; }
    if (settled || !isStreaming) { lastTreeLenRef.current = cur; return cur; }
    if (cur - prev >= 8) { lastTreeLenRef.current = cur; return cur; }
    const tail = displayed.slice(prev);
    if (/[\n`*_>#-]/.test(tail)) { lastTreeLenRef.current = cur; return cur; }
    return prev;
  }, [displayed, settled, isStreaming]);

  const tree = useMemo(
    () => <RichBody source={displayed.slice(0, treeSourceLen)} streaming />,
    [displayed, treeSourceLen]
  );

  return (
    <div className={className} style={style}>
      {tree}
      <span className={`streaming-cursor-inline${cursorFading ? ' fading' : ''}`} />
    </div>
  );
}

/* ─── Static message renderer (delegates to RichBody for unified styling) ─── */
function MessageContent({ content }: { content: string }) {
  return <RichBody source={content} />;
}

function getAgentDisplayName(agentId: string | null | undefined, names: Map<string, string>) {
  if (!agentId) return 'Luca';
  const fromStore = names.get(agentId);
  if (fromStore) return fromStore;
  if (agentId === 'guardian' || agentId === 'observer') return 'Observer';
  return agentId.charAt(0).toUpperCase() + agentId.slice(1);
}

/* ─── Thinking Block (4-state: waiting → streaming → settling → complete) ─── */
type ThinkingState = 'waiting' | 'streaming' | 'settling' | 'complete';

function peekContent(text: string): string {
  const lines = text.split('\n').filter(Boolean);
  return lines.slice(-2).join('\n');
}

function thinkingLabel(state: ThinkingState): string {
  switch (state) {
    case 'waiting': return 'thinking\u2026';
    case 'streaming': return 'reasoning\u2026';
    case 'settling': return 'settling\u2026';
    case 'complete': return 'thought';
  }
}

function ThinkingBlock({
  content,
  state,
  duration,
  customLabel,
}: {
  content: string;
  state: ThinkingState;
  duration?: number;
  /** Overrides the state-derived label. Used to fold the council phase
   *  indicator (voices / deliberating / reviewing / speaking) into this
   *  same beautiful element instead of a separate 3-dot widget. */
  customLabel?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const isActive = state === 'waiting' || state === 'streaming' || state === 'settling';

  const peek = useMemo(() => peekContent(content), [content]);

  if (!content && state === 'complete') return null;

  const dataState = state;

  return (
    <div className={`thinking-block${expanded ? ' expanded' : ''}`} data-state={dataState}>
      {/* Header */}
      <div
        className="thinking-header"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } }}
      >
        {/* 3x3 Murmur Dot Grid — prime-derived timing per dot */}
        <div className="thinking-dots" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => <span key={i} className="td" />)}
        </div>

        {/* Shimmer label */}
        <span className="thinking-label">{customLabel || thinkingLabel(state)}</span>

        {/* Duration timer */}
        {duration != null && duration > 0 && (
          <span className="thinking-timer">{Math.round(duration)}s</span>
        )}

        {/* Token estimate (complete only) */}
        {state === 'complete' && content && (
          <span className="thinking-timer">{Math.ceil(content.length / 4)} tokens</span>
        )}

        {/* Chevron */}
        <span className="thinking-chevron" aria-hidden="true">›</span>
      </div>

      {/* Peek window — visible during streaming/settling, hidden when expanded */}
      {content && (
        <div className="thinking-peek">
          <div className="thinking-peek-inner">{peek}</div>
        </div>
      )}

      {/* Full body — revealed when expanded */}
      <div className="thinking-body">
        <div className="thinking-body-content">
          <div className="thinking-body-text">
            {content}
            {isActive && <span className="streaming-cursor-inline" />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Multi-model helpers ─── */
function isMultiModelThinking(thinkingContent: string): boolean {
  try {
    const parsed = JSON.parse(thinkingContent);
    return parsed?.type === 'multi_model' && Array.isArray(parsed?.variants);
  } catch { return false; }
}

function parseMultiModelVariants(thinkingContent: string): Array<{ model: string; content: string }> {
  try {
    const parsed = JSON.parse(thinkingContent);
    if (parsed?.type === 'multi_model' && Array.isArray(parsed?.variants)) {
      return parsed.variants;
    }
  } catch {}
  return [];
}

/* ─── Live activity context strip ───
 * Renders SubAgentRow + AgentDialogueChip when either has live state for
 * the active thread. Otherwise returns null so the conversation starts
 * flush against the natural top of the message column. */
function ContextStrip() {
  const subAgents = useSubAgentStore((s) => s.agents);
  const currentThreadId = useThreadStore((s) => s.currentThreadId);
  const consults = useAgentConsultStore(selectConsultsByThread(currentThreadId));
  const hasSubAgents = useMemo(
    () => !!currentThreadId && Object.values(subAgents).some((a) => a.parentAgent === 'luca' && a.threadId === currentThreadId),
    [subAgents, currentThreadId],
  );
  if (!hasSubAgents && consults.length === 0) return null;
  return (
    <div
      style={{
        marginBottom: 16,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <SubAgentRow parentAgent="luca" threadId={currentThreadId} />
      <AgentDialogueChip />
    </div>
  );
}

/* ─── Animated row wrapper ───
 * Plays the entry animation only on the row's first mount, so re-renders
 * triggered by streaming tokens (or any list reflow) don't re-pop existing
 * rows. CSS handles the actual keyframes via the [data-fresh] selector.
 */
function FreshMsgRow({ children, className = 'msg-row', style }: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const fresh = useFirstMount();
  return (
    <div className={className} data-fresh={fresh ? 'true' : undefined} style={style}>
      {children}
    </div>
  );
}

/* ─── Main ChatView ─── */
type ModelKeyStatus = 'checking' | 'present' | 'missing' | 'unknown';

export default function ChatView() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  // Narrow selectors — the parent renders the *list shell* and the
  // streaming bubble. Individual messages are handled by <MessageItem>,
  // which subscribes to its own row. This split is what makes per-token
  // streaming stop re-rendering the whole thread.
  const messages = useThreadStore((s) => s.messages);
  const currentThreadId = useThreadStore((s) => s.currentThreadId);
  const isStreaming = useThreadStore((s) => s.isStreaming);
  const streamingContent = useThreadStore((s) => s.streamingContent);
  const streamingThinking = useThreadStore((s) => s.streamingThinking);
  const threads = useThreadStore((s) => s.threads);
  const loadMessages = useThreadStore((s) => s.loadMessages);
  const subscribeMessages = useThreadStore((s) => s.subscribeMessages);
  const setCurrentThread = useThreadStore((s) => s.setCurrentThread);
  const createThread = useThreadStore((s) => s.createThread);
  const addMessage = useThreadStore((s) => s.addMessage);
  const patchMessage = useThreadStore((s) => s.patchMessage);
  const setStreaming = useThreadStore((s) => s.setStreaming);
  const setStreamingContent = useThreadStore((s) => s.setStreamingContent);
  const setStreamingThinking = useThreadStore((s) => s.setStreamingThinking);
  const loadThreads = useThreadStore((s) => s.loadThreads);
  const updateThreadAgent = useThreadStore((s) => s.updateThreadAgent);
  const loadArtifacts = useArtifactStore((s) => s.loadForThread);
  const artifactsByThread = useArtifactStore((s) => s.byThread);
  const threadArtifacts = useMemo(
    () => currentThreadId ? (artifactsByThread[currentThreadId] || []) : [],
    [artifactsByThread, currentThreadId],
  );
  const agents = useAgentSettingsStore((s) => s.agents);
  const currentThread = threads.find((t) => t.id === currentThreadId);
  // Pending agent id: used when there's no thread yet (empty state). Once a
  // thread exists, it always wins so the picker reflects the persisted value.
  const [pendingAgentId, setPendingAgentId] = useState<string>('luca');
  const activeAgentId = currentThread?.agent_id || pendingAgentId;
  const showThinking = useSettingsStore((s) => s.show_thinking);
  const showTimestamps = useSettingsStore((s) => s.show_timestamps);
  const defaultEffort = useSettingsStore((s) => s.reasoning_effort);
  const defaultEnsembleOn = useSettingsStore((s) => s.multi_model_enabled);

  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [alcoveOpen, setAlcoveOpen] = useState(false);
  const [thinkingEffort, setThinkingEffort] = useState<'low' | 'medium' | 'high'>(defaultEffort || 'medium');
  // Ensemble skill: armed = next message only; locked = persistent until toggled off
  const [ensembleArmed, setEnsembleArmed] = useState(false);
  const [ensembleLocked, setEnsembleLocked] = useState(false);
  const ensembleActive = ensembleArmed || ensembleLocked;
  const [modelKeyStatus, setModelKeyStatus] = useState<ModelKeyStatus>('checking');
  // Guardian state
  const [guardianMessages, setGuardianMessages] = useState<Array<{ role: string; content: string; created_at?: string }>>([]);
  const [guardianStreaming, setGuardianStreaming] = useState(false);
  const [guardianStreamingContent, setGuardianStreamingContent] = useState('');
  const guardianScrollRef = useRef<HTMLDivElement>(null);
  const [streamingVariants, setStreamingVariants] = useState<Array<{ model: string; content: string; thinking?: string | null }>>([]);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  // Council (LLM-Council pattern) streaming state. Captures peer-rank judge output
  // and aggregate ordering as Stage 2 events arrive over SSE (legacy 'council' shape).
  type RankingEntry = { judge_model: string; raw_text: string; parsed_ranking: string[] };
  type AggregateEntry = { model: string; avg_rank: number; rankings_count: number };
  const [streamingRankings, setStreamingRankings] = useState<RankingEntry[]>([]);
  const [streamingAggregate, setStreamingAggregate] = useState<AggregateEntry[]>([]);
  // Council v2 streaming state — three character proposers + cross-pollination
  // + chairman verdict + critique. Final message hydrates these into
  // msg.metadata kind='council_v2'.
  type CouncilV2Character = 'luca' | 'anima' | 'vektor';
  type CouncilV2Proposer = { character: CouncilV2Character; content: string; thinking?: string | null };
  type CouncilV2Crosstalk = { character: CouncilV2Character; content: string; source?: string };
  type CouncilV2Critique = { voice_drift_detected: boolean; confidence: number; critique: string; suggested_revision: string | null };
  const [streamingProposers, setStreamingProposers] = useState<CouncilV2Proposer[]>([]);
  const [streamingCrosstalk, setStreamingCrosstalk] = useState<CouncilV2Crosstalk[]>([]);
  const [streamingVerdict, setStreamingVerdict] = useState<'synthesize' | 'diverge' | null>(null);
  const [streamingCritique, setStreamingCritique] = useState<CouncilV2Critique | null>(null);
  const [streamingRevised, setStreamingRevised] = useState<string | null>(null);
  type CouncilPhase = 'idle' | 'voices' | 'deliberating' | 'speaking' | 'critiquing';
  const [councilPhase, setCouncilPhase] = useState<CouncilPhase>('idle');
  // Alive-feeling features
  const [welcomeBack, setWelcomeBack] = useState<{ type: 'journal' | 'thought' | 'initiation'; content: string } | null>(null);
  const [dynamicPlaceholder, setDynamicPlaceholder] = useState('Message Luca...');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputCaptureRef = useRef('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachments = useAttachmentStore((s) => s.pending);
  const addAttachments = useAttachmentStore((s) => s.add);
  const removeAttachment = useAttachmentStore((s) => s.remove);
  const clearAttachments = useAttachmentStore((s) => s.clear);
  const setAttachmentStatus = useAttachmentStore((s) => s.setStatus);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const modelKeyMissing = modelKeyStatus === 'missing';

  useEffect(() => {
    if (!user) {
      setModelKeyStatus('unknown');
      return;
    }

    let canceled = false;
    setModelKeyStatus('checking');
    (async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data, error } = await supabase
          .from('user_api_keys')
          .select('key_preview')
          .maybeSingle();
        if (canceled) return;
        if (error) {
          setModelKeyStatus('unknown');
          return;
        }
        setModelKeyStatus(data?.key_preview ? 'present' : 'missing');
      } catch {
        if (!canceled) setModelKeyStatus('unknown');
      }
    })();

    return () => { canceled = true; };
  }, [user?.id]);

  // Lingering streaming snapshot — keeps the streaming bubble mounted
  // after isStreaming flips to false, until the typewriter has caught up.
  const [lingeringStream, setLingeringStream] = useState<string | null>(null);
  const agentNameById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents]
  );
  const currentAgentLabel = getAgentDisplayName(activeAgentId, agentNameById);
  useEffect(() => {
    if (isStreaming && streamingContent) {
      setLingeringStream(streamingContent);
    } else if (!isStreaming && streamingContent) {
      // capture final content the moment stream ends
      setLingeringStream(streamingContent);
    }
  }, [isStreaming, streamingContent]);

  // User-scroll-aware auto-scroll. We follow the bottom of the stream as
  // long as the user is "pinned" there; the moment they scroll up, we stop
  // following and surface the scroll-to-bottom pill. Pinning resumes when
  // they scroll back to within `pinThreshold` of the bottom.
  const userPinnedRef = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const lastScrollAtRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinThreshold = 96;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const pinned = distance < pinThreshold;
      userPinnedRef.current = pinned;
      setShowScrollDown(!pinned && (isStreaming || messages.length > 0));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isStreaming, messages.length]);

  const scrollRafRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!userPinnedRef.current) return;
    if (isStreaming || streamingContent) {
      // Coalesce stream-driven scrolls into one per frame; instant scroll
      // (no smooth easing) so it tracks the typewriter without compounding.
      if (scrollRafRef.current) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = 0;
        if (!userPinnedRef.current) return;
        const node = scrollRef.current;
        if (node) node.scrollTop = node.scrollHeight;
      });
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
    };
  }, [messages, streamingContent, streamingThinking, isStreaming]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    userPinnedRef.current = true;
    setShowScrollDown(false);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  // Reload-mid-stream recovery — persist in-progress streamed content to
  // localStorage so a refresh during streaming surfaces the partial reply
  // as a recovered assistant message instead of vanishing.
  const STREAM_KEY = currentThreadId ? `luca:stream:${currentThreadId}` : null;
  useEffect(() => {
    if (!STREAM_KEY) return;
    if (isStreaming && streamingContent) {
      try {
        localStorage.setItem(STREAM_KEY, JSON.stringify({
          content: streamingContent,
          thinking: streamingThinking,
          agent: activeAgentId,
          updated_at: Date.now(),
        }));
      } catch { /* quota */ }
    } else if (!isStreaming) {
      try { localStorage.removeItem(STREAM_KEY); } catch { /* */ }
    }
  }, [STREAM_KEY, isStreaming, streamingContent, streamingThinking, activeAgentId]);

  // On thread mount: if there's a stale in-progress snapshot from a prior
  // session, recover it as an assistant message tagged metadata.recovered.
  useEffect(() => {
    if (!currentThreadId || !user) return;
    const key = `luca:stream:${currentThreadId}`;
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { /* */ }
    if (!raw) return;
    try {
      const snap = JSON.parse(raw);
      if (!snap?.content) { localStorage.removeItem(key); return; }
      // Only recover if it's >5s old (otherwise our own active stream wrote it)
      if (Date.now() - (snap.updated_at || 0) < 5000) return;
      // Avoid duplicate recovery if a matching message exists
      const exists = messages.some((m) => m.role === 'assistant' && m.content === snap.content);
      if (exists) { localStorage.removeItem(key); return; }
      addMessage({
        thread_id: currentThreadId, user_id: user.id, role: 'assistant',
        content: snap.content,
        model: null, agent: snap.agent || 'luca',
        thinking_content: snap.thinking || null,
        tokens_used: null, bookmarked: false,
        metadata: { recovered: true } as any,
      } as any);
      localStorage.removeItem(key);
    } catch { try { localStorage.removeItem(key); } catch { /* */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentThreadId, user?.id]);


  // Load guardian messages when alcove opens or thread changes.
  // Skip while streaming so we don't clobber an in-flight reply with stale DB state.
  useEffect(() => {
    if (!alcoveOpen || !currentThreadId || guardianStreaming) return;
    let cancelled = false;
    (async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data } = await supabase
        .from('messages')
        .select('role, content, agent, created_at')
        .eq('thread_id', currentThreadId)
        .eq('agent', 'guardian')
        .order('created_at', { ascending: true });
      if (cancelled || !data) return;
      setGuardianMessages(data as Array<{ role: string; content: string; created_at?: string }>);
    })();
    return () => { cancelled = true; };
  }, [alcoveOpen, currentThreadId, guardianStreaming]);

  // Auto-scroll guardian messages
  useEffect(() => {
    if (guardianScrollRef.current) {
      guardianScrollRef.current.scrollTop = guardianScrollRef.current.scrollHeight;
    }
  }, [guardianMessages, guardianStreamingContent]);

  useEffect(() => {
    if (!threadId) return;
    // Wipe the per-block syntax-highlight cache so a long session doesn't
    // accumulate completed snippets across every thread the user opens.
    clearHighlightCache();
    // Reset scroll-pin so a new thread auto-scrolls to bottom.
    userPinnedRef.current = true;
    setShowScrollDown(false);
    setCurrentThread(threadId);
    loadMessages(threadId);
    loadArtifacts(threadId);
    const unsub = subscribeMessages(threadId);
    return unsub;
  }, [threadId, loadMessages, loadArtifacts, setCurrentThread, subscribeMessages]);

  // Live agent-to-agent consultations (Luca → Anima for now).
  useAgentConsultRealtime(threadId);

  // Welcome back awareness + dynamic placeholder
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { supabase } = await import('@/integrations/supabase/client');

      // Highest priority: explicit thought initiation queued for the user
      const { data: initiations } = await supabase
        .from('thought_initiations')
        .select('message, created_at')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      if (initiations && initiations.length > 0) {
        setWelcomeBack({ type: 'initiation', content: initiations[0].message });
        setDynamicPlaceholder('Luca wants to tell you something...');
        return;
      }

      // Next: any unseen surfaced activity from autonomous loops (the new pulse/heartbeat).
      const { data: profile } = await supabase
        .from('profiles')
        .select('last_seen_activity_at')
        .eq('user_id', user.id)
        .maybeSingle();
      const seenIso = profile?.last_seen_activity_at ?? new Date(0).toISOString();
      const { data: surfaced } = await supabase
        .from('entity_activity_log')
        .select('title, summary, severity, created_at')
        .eq('user_id', user.id)
        .eq('surface_to_user', true)
        .in('severity', ['notable', 'important'])
        .gt('created_at', seenIso)
        .order('created_at', { ascending: false })
        .limit(1);
      if (surfaced && surfaced.length > 0) {
        const a = surfaced[0] as { title: string | null; summary: string | null; severity: string };
        setWelcomeBack({
          type: 'thought',
          content: a.summary || a.title || 'something happened while you were away',
        });
        setDynamicPlaceholder(a.title || 'while you were away...');
        return;
      }

      // Check time since last message
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const lastTime = lastMsg?.[0]?.created_at ? new Date(lastMsg[0].created_at).getTime() : 0;
      const gapHours = (Date.now() - lastTime) / 3_600_000;

      if (gapHours > 2) {
        // Check for recent journal entries or dreams
        const { data: recentJournal } = await supabase
          .from('journal_entries')
          .select('content, mood, created_at')
          .eq('user_id', user.id)
          .gt('created_at', new Date(lastTime).toISOString())
          .order('created_at', { ascending: false })
          .limit(1);

        if (recentJournal && recentJournal.length > 0) {
          const entry = recentJournal[0];
          const snippet = entry.content.slice(0, 150) + (entry.content.length > 150 ? '...' : '');
          const isDream = entry.mood === 'dreaming';
          setWelcomeBack({
            type: isDream ? 'thought' : 'journal',
            content: snippet,
          });
          setDynamicPlaceholder(isDream ? 'Luca dreamed about something...' : 'Luca has been reflecting...');
          return;
        }

        // Check for recent autonomous thoughts
        const { data: recentThought } = await supabase
          .from('thought_stream')
          .select('content, created_at')
          .eq('user_id', user.id)
          .gt('created_at', new Date(lastTime).toISOString())
          .order('salience', { ascending: false })
          .limit(1);

        if (recentThought && recentThought.length > 0) {
          setWelcomeBack({ type: 'thought', content: recentThought[0].content.slice(0, 150) });
          setDynamicPlaceholder('Luca has been thinking...');
          return;
        }
      }

      // Time-of-day placeholder
      const hour = new Date().getHours();
      if (hour >= 23 || hour < 5) {
        setDynamicPlaceholder('still here...');
      } else {
        setDynamicPlaceholder('Message Luca...');
      }
    })();
  }, [user]);

  const handleTextareaInput = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    // Measure target height without thrashing layout twice if it hasn't
    // changed. We only touch `style.height` when the new measurement
    // differs from the current one.
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, 240) + 'px';
    if (ta.style.height !== next) ta.style.height = next;
  };

  const queueAttachmentFiles = useCallback((filesLike: FileList | File[] | null | undefined) => {
    const files = Array.from(filesLike || []);
    if (files.length === 0) return;

    const remaining = Math.max(0, MAX_CHAT_ATTACHMENTS - pendingAttachments.length);
    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      if (accepted.length >= remaining) {
        rejected.push(`${file.name}: attachment limit reached`);
        continue;
      }
      if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
        rejected.push(`${file.name}: max 10 MB`);
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length > 0) addAttachments(accepted);
    setAttachmentError(rejected.length > 0 ? rejected.slice(0, 2).join(' · ') : null);
  }, [addAttachments, pendingAttachments.length]);

  const uploadPendingAttachments = useCallback(async (threadForUpload: string): Promise<PersistedAttachment[]> => {
    if (!user || pendingAttachments.length === 0) return [];

    const { supabase } = await import('@/integrations/supabase/client');
    const uploaded: PersistedAttachment[] = [];

    for (const attachment of pendingAttachments) {
      if (!attachment.file) continue;
      setAttachmentStatus(attachment.id, 'uploading');
      try {
        const safeName = safeAttachmentFileName(attachment.name);
        const path = `${user.id}/${threadForUpload}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(CHAT_ATTACHMENT_BUCKET)
          .upload(path, attachment.file, {
            contentType: attachment.mime,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: signed, error: signedError } = await supabase.storage
          .from(CHAT_ATTACHMENT_BUCKET)
          .createSignedUrl(path, 60 * 60 * 24 * 30);

        if (signedError || !signed?.signedUrl) {
          throw signedError || new Error('Could not create attachment link');
        }

        const meta: Record<string, unknown> = {
          name: attachment.name,
          size: attachment.size,
          mime: attachment.mime,
          bucket: CHAT_ATTACHMENT_BUCKET,
          path,
          signed_expires_at: new Date(Date.now() + 60 * 60 * 24 * 30 * 1000).toISOString(),
        };

        const type = inferAttachmentType(attachment.file);
        if (type === 'code' && shouldInlineCodeAttachment(attachment.file)) {
          meta.lang = inferAttachmentLanguage(attachment.name, attachment.mime);
          meta.code = await attachment.file.text();
        }

        const persisted: PersistedAttachment = {
          type,
          url: signed.signedUrl,
          meta,
        };
        uploaded.push(persisted);
        setAttachmentStatus(attachment.id, 'ready', { url: signed.signedUrl, path });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setAttachmentStatus(attachment.id, 'error', { error: message });
        throw new Error(`Could not attach ${attachment.name}: ${message}`);
      }
    }

    return uploaded;
  }, [pendingAttachments, setAttachmentStatus, user]);

  const renderPendingAttachments = () => {
    if (pendingAttachments.length === 0 && !attachmentError) return null;
    return (
      <>
        {pendingAttachments.length > 0 && (
          <div className="att-chips-row">
            {pendingAttachments.map((attachment: Attachment) => (
              <AttachmentChip
                key={attachment.id}
                attachment={attachment}
                onRemove={() => removeAttachment(attachment.id)}
              />
            ))}
          </div>
        )}
        {attachmentError && <div className="att-error">{attachmentError}</div>}
      </>
    );
  };

  const renderModelKeyNotice = () => {
    if (!modelKeyMissing || alcoveOpen) return null;
    return (
      <div className="composer-key-warning" role="status">
        <span>No model key connected.</span>
        <button type="button" onClick={() => navigate('/settings/models')}>Open Models</button>
      </div>
    );
  };

  const resolvePermissionMessage = useCallback(async (
    msg: Message,
    status: 'approved' | 'denied',
    remember = false,
  ) => {
    if (!user) return;
    const currentMeta = ((msg.metadata as Record<string, unknown> | null) || {});
    const nextMeta = {
      ...currentMeta,
      permission_status: status,
      permission_remember: remember,
      permission_resolved_at: new Date().toISOString(),
      permission_error: null,
    };
    patchMessage(msg.id, { metadata: nextMeta });

    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase
        .from('messages')
        .update({ metadata: nextMeta })
        .eq('id', msg.id)
        .eq('user_id', user.id);
      if (error) throw error;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not record permission response';
      patchMessage(msg.id, {
        metadata: {
          ...currentMeta,
          permission_status: 'pending',
          permission_error: message,
        },
      });
    }
  }, [patchMessage, user]);

  const sendGuardianMessage = useCallback(async () => {
    if (!input.trim() || !user || guardianStreaming) return;

    const messageText = input.trim();
    let tid = currentThreadId;
    if (!tid) {
      tid = await createThread(user.id, pendingAgentId);
      navigate(`/chat/${tid}`, { replace: true });
    }

    // Add user message to guardian conversation
    setGuardianMessages((prev) => [...prev, { role: 'user', content: messageText }]);

    // Save user message to DB — tag it as `guardian` so it stays in the
    // observer alcove and never appears in the main chat thread.
    const { supabase } = await import('@/integrations/supabase/client');
    await supabase.from('messages').insert({ thread_id: tid, user_id: user.id, role: 'user', content: messageText, agent: 'guardian' });

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Stream Guardian response
    setGuardianStreaming(true);
    setGuardianStreamingContent('');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabase.auth.getSession()).data.session;
      const resp = await fetch(`${supabaseUrl}/functions/v1/chat-guardian`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ thread_id: tid, message: messageText }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.error('Guardian error:', resp.status, errText);
        setGuardianMessages((prev) => [...prev, { role: 'assistant', content: `Observer could not respond (${resp.status}). Check that your API key is configured in Settings.` }]);
        return;
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let committed = false;

      const commitFinal = (content: string) => {
        if (committed || !content) return;
        committed = true;
        // Atomically swap streaming buffer → committed message to avoid
        // a frame where both the streaming bubble and the final message
        // are visible (which looked like a duplicate).
        setGuardianMessages((prev) => [...prev, { role: 'assistant', content }]);
        setGuardianStreamingContent('');
        setGuardianStreaming(false);
      };

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (!payload || payload.startsWith(':')) continue;
            try {
              const data = JSON.parse(payload);
              if (data.type === 'content') {
                fullContent += data.text;
                setGuardianStreamingContent(fullContent);
              } else if (data.type === 'error') {
                console.error('Guardian stream error:', data.text);
                committed = true;
                setGuardianMessages((prev) => [...prev, { role: 'assistant', content: data.text || 'Observer encountered an error.' }]);
                setGuardianStreamingContent('');
                fullContent = '';
              } else if (data.type === 'done') {
                commitFinal(fullContent);
              }
            } catch (e) {
              // Skip non-JSON lines (heartbeats, etc)
            }
          }
        }
      }

      // Fallback: stream ended without a `done` event
      commitFinal(fullContent);
    } catch (e) {
      console.error('Guardian connection error:', e);
      setGuardianMessages((prev) => [...prev, { role: 'assistant', content: 'Connection lost. Please try again.' }]);
    } finally {
      setGuardianStreaming(false);
      setGuardianStreamingContent('');
      loadThreads();
    }
  }, [input, user, currentThreadId, guardianStreaming]);

  const sendMessage = useCallback(async (options?: { text?: string; attachments?: PersistedAttachment[] }) => {
    const sourceText = typeof options?.text === 'string' ? options.text : input;
    const replayAttachments = options?.attachments ?? null;
    if (modelKeyMissing) return;
    if ((!sourceText.trim() && pendingAttachments.length === 0 && !replayAttachments?.length) || !user || isStreaming) return;

    // Dismiss welcome back on first message
    if (welcomeBack) setWelcomeBack(null);

    const messageText = sourceText.trim() || 'Uploaded attachments.';
    inputCaptureRef.current = messageText;

    let tid = currentThreadId;
    if (!tid) {
      tid = await createThread(user.id, pendingAgentId);
      navigate(`/chat/${tid}`, { replace: true });
    }

    let uploadedAttachments: PersistedAttachment[] = replayAttachments ?? [];
    try {
      if (!replayAttachments) {
        uploadedAttachments = await uploadPendingAttachments(tid);
      }
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Attachment upload failed');
      return;
    }

    // Save to DB
    const { supabase } = await import('@/integrations/supabase/client');
    const { error: insertUserError } = await supabase.from('messages').insert({
      thread_id: tid,
      user_id: user.id,
      role: 'user',
      content: messageText,
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : null,
    });
    if (insertUserError) {
      addMessage({
        thread_id: tid, user_id: user.id, role: 'assistant',
        content: 'Could not save your message. Please try again.',
        model: null, agent: activeAgentId, thinking_content: null, tokens_used: null, bookmarked: false,
        kind: 'agent_error',
        metadata: { agent: activeAgentId, message: 'Could not save your message.', detail: insertUserError.message },
      } as any);
      return;
    }

    addMessage({
      thread_id: tid, user_id: user.id, role: 'user', content: messageText,
      model: null, agent: null, thinking_content: null, tokens_used: null, bookmarked: false,
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : null,
    });

    if (!options?.text) {
      setInput('');
      clearAttachments();
      setAttachmentError(null);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }

    // Stream response
    setStreaming(true);
    setStreamingContent('');
    setStreamingThinking('');
    setStreamingVariants([]);
    setIsSynthesizing(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabase.auth.getSession()).data.session;
      const resp = await fetch(`${supabaseUrl}/functions/v1/chat-multi`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          thread_id: tid,
          message: messageText,
          attachments: uploadedAttachments,
          reasoning_effort: thinkingEffort,
          ensemble: ensembleActive,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await parseEdgeError(resp.clone()).catch(() => ({ message: `Request failed (${resp.status})` } as any));
        const friendly = friendlyMessage(err);
        const isMissingKey = /api key/i.test(err.message || '') || err.code === 'unauthorized';
        const message = isMissingKey
          ? 'No model API key configured.'
          : friendly;
        const detail = [
          err.code ? `code: ${err.code}` : null,
          err.requestId ? `request_id: ${err.requestId}` : null,
          `status: ${resp.status}`,
        ].filter(Boolean).join('  •  ');
        addMessage({
          thread_id: tid!, user_id: user.id, role: 'assistant',
          content: isMissingKey
            ? `${message}\n\n[Open Settings → Models](/settings/models) to add your OpenRouter key.`
            : message,
          model: null, agent: activeAgentId, thinking_content: null, tokens_used: null, bookmarked: false,
          kind: 'agent_error',
          metadata: { agent: activeAgentId, message, detail, code: err.code, request_id: err.requestId },
        } as any);
        return;
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let fullThinking = '';
      const collectedVariants: Array<{ model: string; content: string; thinking?: string | null }> = [];
      const collectedRankings: RankingEntry[] = [];
      let collectedAggregate: AggregateEntry[] = [];
      let collectedLabelToModel: Record<string, string> = {};
      // Council v2 trace assembly (parallel to legacy collected*).
      const collectedProposers: CouncilV2Proposer[] = [];
      const collectedCrosstalk: CouncilV2Crosstalk[] = [];
      let collectedVerdict: 'synthesize' | 'diverge' | null = null;
      let collectedCritique: CouncilV2Critique | null = null;
      let collectedRevised: string | null = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'variant') {
                // Council v2 keys variants by character; legacy by model.
                if (data.character) {
                  collectedProposers.push({
                    character: data.character as CouncilV2Character,
                    content: data.text,
                    thinking: data.thinking || null,
                  });
                  setStreamingProposers([...collectedProposers]);
                  // Surface this proposer's reasoning in the peek window so
                  // the user sees actual content flowing during the council
                  // pre-content stages, not just a phase label.
                  if (data.thinking) {
                    const label = (data.character as string).charAt(0).toUpperCase() + (data.character as string).slice(1);
                    fullThinking += (fullThinking ? '\n\n' : '') + `— ${label} —\n${data.thinking}`;
                    setStreamingThinking(fullThinking);
                  }
                } else {
                  collectedVariants.push({ model: data.model, content: data.text, thinking: data.thinking || null });
                  setStreamingVariants([...collectedVariants]);
                }
                if (councilPhase === 'idle') setCouncilPhase('voices');
              } else if (data.type === 'proposer_thinking') {
                // Council v2 emits this when a proposer's reasoning lands
                // (separate from the variant's content). Pipe into the same
                // peek-window stream so the reasoning hub stays alive across
                // the whole council pipeline.
                if (data.text && data.character) {
                  const label = (data.character as string).charAt(0).toUpperCase() + (data.character as string).slice(1);
                  fullThinking += (fullThinking ? '\n\n' : '') + `— ${label} —\n${data.text}`;
                  setStreamingThinking(fullThinking);
                }
              } else if (data.type === 'crosstalk') {
                collectedCrosstalk.push({
                  character: data.character as CouncilV2Character,
                  content: data.text,
                  source: 'crosstalk',
                });
                setStreamingCrosstalk([...collectedCrosstalk]);
                setCouncilPhase('deliberating');
                // Briefly surface the cross-pollinated draft in the peek
                // window too (truncated) so the deliberation reads as
                // actually moving through phases.
                if (data.text) {
                  const label = (data.character as string).charAt(0).toUpperCase() + (data.character as string).slice(1);
                  const snippet = String(data.text).slice(0, 320);
                  fullThinking += (fullThinking ? '\n\n' : '') + `— ${label} (revised) —\n${snippet}${String(data.text).length > 320 ? '…' : ''}`;
                  setStreamingThinking(fullThinking);
                }
              } else if (data.type === 'crosstalk_starting') {
                setCouncilPhase('deliberating');
              } else if (data.type === 'crosstalk_done' || data.type === 'crosstalk_skipped') {
                /* phase will advance on chairman_starting */
              } else if (data.type === 'crosstalk_error') {
                /* surfaced in metadata.crosstalk via the source='proposer' fallback */
              } else if (data.type === 'verdict') {
                collectedVerdict = data.verdict;
                setStreamingVerdict(data.verdict);
              } else if (data.type === 'critique_starting') {
                setCouncilPhase('critiquing');
              } else if (data.type === 'critique') {
                collectedCritique = {
                  voice_drift_detected: !!data.voice_drift_detected,
                  confidence: typeof data.confidence === 'number' ? data.confidence : 0,
                  critique: data.critique || '',
                  suggested_revision: data.suggested_revision ?? null,
                };
                setStreamingCritique(collectedCritique);
              } else if (data.type === 'revised_content') {
                collectedRevised = data.text;
                setStreamingRevised(data.text);
                // Replace the streaming content with the revised version so
                // the user sees the polished pass.
                fullContent = data.text;
                setStreamingContent(fullContent);
              } else if (data.type === 'ranking_starting') {
                setCouncilPhase('deliberating');
              } else if (data.type === 'ranking') {
                collectedRankings.push({
                  judge_model: data.judge_model,
                  raw_text: data.raw_text,
                  parsed_ranking: data.parsed_ranking,
                });
                setStreamingRankings([...collectedRankings]);
              } else if (data.type === 'aggregate_ranking') {
                collectedAggregate = data.ordering as AggregateEntry[];
                setStreamingAggregate(collectedAggregate);
                if (data.label_to_model) collectedLabelToModel = data.label_to_model;
              } else if (data.type === 'chairman_starting' || data.type === 'synthesizing') {
                setCouncilPhase('speaking');
                setIsSynthesizing(true);
              } else if (data.type === 'content') {
                fullContent += data.text;
                setStreamingContent(fullContent);
              } else if (data.type === 'thinking') {
                // In council mode, fullThinking already carries proposer +
                // crosstalk segments with character headers. Insert a
                // Chairman header on the first chairman thinking chunk so
                // the trail stays readable when expanded after stream ends.
                const isCouncilTrail = collectedProposers.length > 0 && /— [A-Z]/.test(fullThinking);
                const needsChairmanHeader = isCouncilTrail && !fullThinking.includes('— Chairman —');
                if (needsChairmanHeader) {
                  fullThinking += (fullThinking ? '\n\n' : '') + '— Chairman —\n' + data.text;
                } else {
                  fullThinking += data.text;
                }
                setStreamingThinking(fullThinking);
              } else if (data.type === 'done') {
                // Hydrate council trace into message metadata. Prefer council_v2
                // shape when the new pipeline ran; fall back to legacy 'council'
                // for backward compat with any pre-v2 traffic.
                let councilMetadata: any = null;
                if (collectedProposers.length > 0) {
                  councilMetadata = {
                    kind: 'council_v2',
                    proposers: collectedProposers,
                    crosstalk: collectedCrosstalk,
                    verdict: collectedVerdict ?? 'synthesize',
                    critique: collectedCritique,
                    revised_content: collectedRevised,
                  };
                } else if (collectedVariants.length > 0) {
                  councilMetadata = {
                    kind: 'council',
                    variants: collectedVariants,
                    rankings: collectedRankings,
                    aggregate: collectedAggregate,
                    label_to_model: collectedLabelToModel,
                  };
                }
                addMessage({
                  thread_id: tid!, user_id: user.id, role: 'assistant',
                  content: fullContent, model: data.model || null, agent: activeAgentId,
                  thinking_content: fullThinking || null,
                  tokens_used: data.tokens_used || null,
                  bookmarked: false,
                  // Store variants as extra metadata on the message object (legacy convenience)
                  ...(collectedVariants.length > 0 ? { variants: collectedVariants } : {}),
                  metadata: { ...(councilMetadata || {}), local_stream_stub: true },
                } as any);
                if (tid) loadArtifacts(tid);
              } else if (data.type === 'error') {
                addMessage({
                  thread_id: tid!, user_id: user.id, role: 'assistant',
                  content: data.text || 'The model stream failed mid-response.',
                  model: null, agent: activeAgentId, thinking_content: null, tokens_used: null, bookmarked: false,
                  kind: 'agent_error',
                  metadata: { agent: activeAgentId, message: data.text || 'Stream error', detail: data.detail || null, code: data.code || 'upstream_error' },
                } as any);
              }
            } catch {}
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        addMessage({
          thread_id: tid!, user_id: user.id, role: 'assistant',
          content: 'Connection lost while streaming.',
          model: null, agent: activeAgentId, thinking_content: null, tokens_used: null, bookmarked: false,
          kind: 'agent_error',
          metadata: { agent: activeAgentId, message: 'Connection lost while streaming.', detail: String(e?.message || e) },
        } as any);
      }
    } finally {
      setStreaming(false);
      setStreamingContent('');
      setStreamingThinking('');
      setStreamingVariants([]);
      setStreamingRankings([]);
      setStreamingAggregate([]);
      setStreamingProposers([]);
      setStreamingCrosstalk([]);
      setStreamingVerdict(null);
      setStreamingCritique(null);
      setStreamingRevised(null);
      setCouncilPhase('idle');
      setIsSynthesizing(false);
      abortRef.current = null;
      loadThreads();
    }
  }, [input, modelKeyMissing, pendingAttachments.length, user, currentThreadId, isStreaming, thinkingEffort, ensembleActive, activeAgentId, loadArtifacts, uploadPendingAttachments, clearAttachments]);

  // Auto-disarm ensemble after a successful send (locked stays on)
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && ensembleArmed) {
      setEnsembleArmed(false);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, ensembleArmed]);

  // Sync default ensemble preference → lock flag (persistent, not auto-disarming).
  // When user flips the setting off in Settings, also clear the lock so ensemble
  // truly stops firing on every message.
  const didInitEnsembleDefault = useRef(false);
  useEffect(() => {
    if (!didInitEnsembleDefault.current) {
      didInitEnsembleDefault.current = true;
      setEnsembleLocked(!!defaultEnsembleOn);
      return;
    }
    // Setting changed after initial mount — mirror it into lock state
    setEnsembleLocked(!!defaultEnsembleOn);
    if (!defaultEnsembleOn) setEnsembleArmed(false);
  }, [defaultEnsembleOn]);

  // ⌘E / Ctrl+E toggles ensemble arm
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (e.shiftKey) {
          setEnsembleLocked((v) => !v);
        } else {
          setEnsembleArmed((v) => !v);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleEnsemble = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      setEnsembleLocked((v) => !v);
      setEnsembleArmed(false);
    } else {
      if (ensembleLocked) {
        setEnsembleLocked(false);
        setEnsembleArmed(false);
      } else {
        setEnsembleArmed((v) => !v);
      }
    }
  };

  const ensemblePillClass = `ensemble-pill${ensembleLocked ? ' locked' : ensembleArmed ? ' armed' : ''}`;
  const EnsembleIcon = () => (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.2}>
      <circle cx={3} cy={3.5} r={1.3} fill="currentColor" />
      <circle cx={11} cy={4} r={1.3} fill="currentColor" />
      <circle cx={7} cy={10.5} r={1.3} fill="currentColor" />
      <path d="M3 3.5 L11 4 L7 10.5 Z" opacity={0.45} />
    </svg>
  );

  const stopStreaming = useCallback(async () => {
    abortRef.current?.abort();
    // Persist partial content so cancellation survives reload.
    const partial = streamingContent;
    const partialThinking = streamingThinking;
    if (currentThreadId && user && (partial || partialThinking)) {
      const md = { canceled: true, canceled_at: new Date().toISOString() };
      addMessage({
        thread_id: currentThreadId, user_id: user.id, role: 'assistant',
        content: partial || '_(canceled before any content)_',
        model: null, agent: activeAgentId,
        thinking_content: partialThinking || null,
        tokens_used: null, bookmarked: false,
        metadata: md as any,
      } as any);
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        await supabase.from('messages').insert({
          thread_id: currentThreadId, user_id: user.id, role: 'assistant',
          content: partial || '_(canceled before any content)_',
          agent: activeAgentId,
          thinking_content: partialThinking || null,
          metadata: md as any,
        });
      } catch (e) { console.warn('persist canceled stream failed', e); }
    }
  }, [streamingContent, streamingThinking, currentThreadId, user, activeAgentId, addMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (alcoveOpen) sendGuardianMessage();
      else sendMessage();
    }
    if (e.key === 'Escape' && alcoveOpen) setAlcoveOpen(false);
  };

  const threadTitle = useMemo(() => {
    return useThreadStore.getState().threads.find(t => t.id === currentThreadId)?.title;
  }, [currentThreadId, messages]);

  // Drag-and-drop overlay. File drops queue into the same pending attachment
  // path as the paperclip control.
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    queueAttachmentFiles(e.dataTransfer?.files);
  }, [queueAttachmentFiles]);

  const isEmpty = messages.length === 0 && !isStreaming;

  return isEmpty ? (
      /* ═══ LANDING STATE — centered, minimal, alive ═══ */
      <div
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both', position: 'relative' }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex-1 flex flex-col items-center justify-center" style={{ padding: '0 32px' }}>
          {/* Title + Echo particle field */}
          <div style={{ textAlign: 'center', marginBottom: 48, animation: 'viewFadeIn 0.8s var(--ease-out) both' }}>
            <EchoField
              size={280}
              particleCount={18000}
              state={isStreaming ? 'thinking' : 'idle'}
              style={{ margin: '0 auto 32px' }}
            />
            <h1 style={{
              fontSize: 38,
              fontWeight: 280,
              letterSpacing: '0.16em',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-sans)',
              textTransform: 'lowercase',
              margin: 0,
            }}>
              polyphonic
            </h1>
            {welcomeBack && (
              <WelcomeBackCard
                data={welcomeBack}
                onUseAsInput={(t) => setInput(t)}
                onDismiss={() => setWelcomeBack(null)}
              />
            )}
          </div>

          {/* Centered input */}
          <div style={{ width: '100%', maxWidth: 600, animation: 'viewFadeIn 0.6s var(--ease-out) 0.2s both' }}>
            <div className={`input-shell${focused ? ' focused' : ''}`}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="chat-file-input"
                onChange={(e) => {
                  queueAttachmentFiles(e.currentTarget.files);
                  e.currentTarget.value = '';
                }}
              />
              {renderModelKeyNotice()}
              {renderPendingAttachments()}
              <div className="input-row">
                <textarea
                  ref={textareaRef}
                  className="input-textarea"
                  value={input}
                  onChange={(e) => { setInput(e.target.value); handleTextareaInput(); }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder={modelKeyMissing ? 'Add a model key to start chatting…' : ensembleActive ? 'Message Luca (ensemble)\u2026' : dynamicPlaceholder}
                />
              </div>
              <div className="input-footer">
                <div className="agent-pills">
                  <button
                    type="button"
                    className="attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach files"
                    title="Attach files"
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6.5 8.5l3.6-3.6a2.2 2.2 0 113.1 3.1l-5.4 5.4a3.4 3.4 0 01-4.8-4.8l5.2-5.2" />
                    </svg>
                  </button>
                  <AgentPicker
                    activeAgentId={activeAgentId}
                    onChange={(id) => {
                      setPendingAgentId(id);
                      if (currentThreadId) updateThreadAgent(currentThreadId, id);
                    }}
                  />
                  <ObserverEyeChip
                    threadId={currentThreadId}
                    open={alcoveOpen}
                    onToggle={() => setAlcoveOpen((v) => !v)}
                  />
                  {activeAgentId === 'luca' && (
                    <>
                      <div className="pill-sep" />
                      <button
                        className={ensemblePillClass}
                        onClick={toggleEnsemble}
                        title="Consult multiple models for this message. Shift-click (or ⇧⌘E) to lock on. ⌘E toggles."
                      ><EnsembleIcon />ensemble</button>
                    </>
                  )}
                </div>
                <select
                  value={thinkingEffort}
                  onChange={(e) => setThinkingEffort(e.target.value as 'low' | 'medium' | 'high')}
                  className="effort-select"
                >
                  <option value="low">Light</option>
                  <option value="medium">Medium</option>
                  <option value="high">Deep</option>
                </select>
                <button
                  className={`send-btn${ensembleActive ? ' ensemble-armed' : ''}`}
                  onClick={() => sendMessage()}
                  disabled={modelKeyMissing || (!input.trim() && pendingAttachments.length === 0)}
                >
                  <span className="send-icon">
                    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12.5 1.5 L1.5 6.3 L5.6 8 L7.4 12.3 Z" />
                      <path d="M12.5 1.5 L5.6 8" />
                    </svg>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <AttachmentDropOverlay visible={isDragging} />
      </div>
    ) : (
    /* ═══ CONVERSATION STATE — normal chat layout ═══ */
    <div
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
      style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both', position: 'relative' }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header — participant dot + title + subtle meta */}
      <div className="flex items-center flex-shrink-0" style={{
        height: 48,
        padding: '0 28px',
        borderBottom: '1px solid var(--border-faint)',
        gap: 10,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--luca-full)', opacity: 0.78 }} />
        <span style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12.5,
          fontWeight: 450,
          letterSpacing: 'var(--track-body)',
          color: 'var(--text-body)',
        }}>
          {threadTitle || 'New conversation'}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: 'var(--track-mono)',
          textTransform: 'uppercase',
          color: 'var(--text-whisper)',
        }}>
          luca · opus-4.7
        </span>
        <ThreadInfoButton />
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto chat-scroll-area"
        style={{
          padding: '32px 0',
          opacity: alcoveOpen ? 0.35 : 1,
          transition: 'opacity 400ms var(--ease-out)',
        }}
      >
        <div style={{ maxWidth: 'var(--message-max-width)', margin: '0 auto', padding: '0 32px' }}>

          {/* Live activity context strip — only renders when there's actually
              live activity to surface (sub-agents working, or agent-to-agent
              consultations in this thread). Empty by default so threads start
              with the conversation flush against the natural top, not a
              16px gap of nothing. */}
          <ContextStrip />


          {/* Message list — while a streaming bubble is settling, hide the freshly-persisted
              assistant message that mirrors it, to avoid a duplicate flash. */}
          {messages.map((msg, i) => {
            // Hide the persisted last assistant message while the streaming
            // bubble is still mounted, regardless of exact content match.
            // Recency + role + agent is the dedupe key — content can drift
            // when the chairman emits a revised body after the stub queued.
            const isLastAssistant =
              (isStreaming || lingeringStream != null) &&
              i === messages.length - 1 &&
              msg.role === 'assistant' &&
              (msg.agent ?? null) === (activeAgentId ?? null) &&
              Date.now() - new Date(msg.created_at).getTime() < 60_000;
            if (isLastAssistant) return null;

            // B.2 — permission_request branch: render inline card instead of msg-row
            if (msg.kind === 'permission_request') {
              const md = (msg.metadata as any) || {};
              const agent = (md.agent || msg.agent || 'luca') as 'luca' | 'vektor' | 'anima';
              return (
                <div key={msg.id} className="msg-row" style={{ animation: `msgEnter var(--dur-settle) var(--ease-premium) both`, animationDelay: `${Math.min(i * 30, 150)}ms` }}>
                  <PermissionInline
                    agent={agent}
                    title={md.title || 'Permission needed'}
                    body={md.body || msg.content}
                    details={md.details}
                    status={(md.permission_status as 'pending' | 'approved' | 'denied' | undefined) || 'pending'}
                    error={typeof md.permission_error === 'string' ? md.permission_error : undefined}
                    onApprove={(remember) => { void resolvePermissionMessage(msg, 'approved', remember); }}
                    onDeny={() => { void resolvePermissionMessage(msg, 'denied'); }}
                  />
                </div>
              );
            }

            // B.3 — agent_error branch: render errored card with divider above
            if (msg.kind === 'agent_error') {
              const md = (msg.metadata as any) || {};
              const agent = (md.agent || msg.agent || 'luca') as 'luca' | 'vektor' | 'anima';
              return (
                <div key={msg.id} className="msg-row" style={{ animation: `msgEnter var(--dur-settle) var(--ease-premium) both`, animationDelay: `${Math.min(i * 30, 150)}ms` }}>
                  <AgentErroredCard
                    agent={agent}
                    message={md.message || msg.content}
                    detail={md.detail}
                    occurredAt={msg.created_at}
                    onRetry={() => {
                      // Re-send the most recent user message before this error
                      const idx = messages.findIndex((m) => m.id === msg.id);
                      const prevUser = [...messages.slice(0, idx)].reverse().find((m) => m.role === 'user');
                      if (prevUser) {
                        void sendMessage({
                          text: prevUser.content,
                          attachments: (prevUser.attachments || []) as PersistedAttachment[],
                        });
                      }
                    }}
                    onViewLogs={() => {
                      const rid = (msg.metadata as any)?.request_id;
                      if (rid) navigator.clipboard?.writeText(rid).catch(() => {});
                    }}
                  />
                </div>
              );
            }

            // L9 — subagent_report branch: badge + RichBody, no streaming
            if (msg.kind === 'subagent_report') {
              const md = (msg.metadata as any) || {};
              const toolCalls = typeof md.tool_calls_used === 'number' ? md.tool_calls_used : null;
              return (
                <div key={msg.id} className="msg-row" style={{ animation: `msgEnter var(--dur-settle) var(--ease-premium) both`, animationDelay: `${Math.min(i * 30, 150)}ms` }}>
                  <div className="msg-sidehead">
                    {showTimestamps && (
                      <div className="msg-time">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </div>
                    )}
                    <div className="msg-author">
                      {getAgentDisplayName(msg.agent, agentNameById)}
                    </div>
                  </div>
                  <div className="msg-body">
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 10,
                        padding: '4px 10px',
                        borderRadius: 999,
                        border: '1px solid var(--border-faint)',
                        background: 'var(--surface-raised)',
                        color: 'var(--text-tertiary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        letterSpacing: 'var(--track-mono)',
                        textTransform: 'uppercase',
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)' }} aria-hidden="true" />
                      Subagent report
                      {toolCalls != null && <span>· {toolCalls} tool calls</span>}
                    </div>
                    <RichBody source={msg.content} />
                  </div>
                </div>
              );
            }

            // Regular message — delegated to memoized <MessageItem>, which
            // subscribes to its own row in the store. The parent's per-token
            // streamingContent updates do not re-render existing items.
            const next = messages[i + 1];
            return (
              <MessageItem
                key={msg.id}
                messageId={msg.id}
                nextCreatedAt={next ? next.created_at : null}
                isLast={i === messages.length - 1}
              />
            );
          })}

          {/* Orphan artifacts created before any message (rare) — render at top-equivalent fallback */}
          {threadArtifacts
            .filter((artifact) => {
              if (artifact.source_message_id) return false;
              if (messages.length === 0) return true;
              const firstT = new Date(messages[0].created_at).getTime();
              return new Date(artifact.created_at).getTime() < firstT;
            })
            .map((artifact) => (
              <div key={artifact.id} className="msg-row" style={{ animation: 'msgEnter var(--dur-settle) var(--ease-premium) both' }}>
                <div className="msg-sidehead">
                  <div className="msg-author">Luca</div>
                </div>
                <div className="msg-body">
                  <ArtifactCard artifact={artifact} />
                </div>
              </div>
            ))}


          {/* Streaming message — stays mounted until typewriter settles, even after isStreaming flips */}
          {(isStreaming || lingeringStream) && (
            <div className="msg-row" style={{ animation: 'msgEnter var(--dur-settle) var(--ease-premium) both' }}>
              <div className="msg-sidehead">
                <div className="msg-time">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                </div>
                <div className="msg-author">{currentAgentLabel}</div>
              </div>

              <div className="msg-body">

              {/* Thinking block — single element across the full streaming
                  lifecycle, for both single-model and council mode.
                  Transitions through states (waiting → streaming → settling)
                  with a label that reflects what's happening.
                  Council mode folds the phase indicator (voices / deliberating
                  / reviewing / speaking) into this same beautiful element
                  via the customLabel prop, instead of a separate widget below.
                  Always mounted during streaming so the dots animate even when
                  no reasoning text is flowing yet — reasoning content arrives
                  through the peek window when it lands. */}
              {isStreaming && showThinking && (() => {
                const isCouncilActive =
                  councilPhase !== 'idle' ||
                  streamingProposers.length > 0 ||
                  streamingCrosstalk.length > 0 ||
                  streamingVariants.length > 0;

                // Council-aware label takes precedence when council is running.
                // Single-model uses the default state-derived label.
                let councilLabel: string | null = null;
                if (isCouncilActive) {
                  if (councilPhase === 'speaking' || streamingContent) {
                    councilLabel = 'speaking…';
                  } else if (councilPhase === 'critiquing') {
                    councilLabel = 'reviewing…';
                  } else if (councilPhase === 'deliberating') {
                    councilLabel = 'deliberating…';
                  } else if (councilPhase === 'voices' || streamingProposers.length > 0) {
                    const n = streamingProposers.length || streamingVariants.length;
                    councilLabel = n > 0 ? `${n}/3 voices…` : 'voices weighing in…';
                  } else {
                    councilLabel = 'thinking…';
                  }
                }

                // Always show during council; gate single-mode on the existing
                // "has reasoning or pre-content" rule so we don't show dots
                // forever for models that emit no reasoning tokens.
                const showInSingleMode = !streamingContent || streamingThinking;
                if (!isCouncilActive && !showInSingleMode) return null;

                const state: ThinkingState =
                  streamingContent && streamingThinking ? 'settling'
                  : streamingThinking ? 'streaming'
                  : 'waiting';

                return (
                  <ThinkingBlock
                    content={streamingThinking || ''}
                    state={state}
                    customLabel={councilLabel}
                  />
                );
              })()}

              {/* Streaming content with typewriter — keep rendering through the catch-up phase.
                  Color uses --text-body (matching .msg-body persisted color) to avoid the
                  bright-white flash when stream completes and the persisted message takes over. */}
              {(streamingContent || lingeringStream) && (
                <StreamingText
                  content={streamingContent || lingeringStream || ''}
                  isStreaming={isStreaming}
                  style={{ fontSize: '14.5px', lineHeight: 1.65, color: 'var(--text-body)' }}
                  onSettled={() => setLingeringStream(null)}
                />
              )}
              {/* Live artifacts extracted from in-progress stream */}
              {(streamingContent || lingeringStream) && currentThreadId && user &&
                extractStreamingArtifacts(streamingContent || lingeringStream || '', { threadId: currentThreadId, userId: user.id }).map((art) => (
                  <ArtifactCard key={art.id} artifact={art} />
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Bottom spacer for smooth scrolling */}
        <div style={{ height: 24 }} />
      </div>

      {/* Floating scroll-to-bottom pill — appears only when the user has
          scrolled away from the live edge of the conversation. */}
      {showScrollDown && (
        <button
          type="button"
          className="scroll-to-bottom-pill"
          onClick={scrollToBottom}
          aria-label="Scroll to latest"
        >
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6l4 4 4-4" />
          </svg>
        </button>
      )}

      {/* Input zone */}
      <div className="input-zone">
        <div className={`input-shell${focused ? ' focused' : ''}${alcoveOpen ? ' alcove-active' : ''}`}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="chat-file-input"
            onChange={(e) => {
              queueAttachmentFiles(e.currentTarget.files);
              e.currentTarget.value = '';
            }}
          />
          {/* Guardian Alcove */}
          <div className={`alcove-panel${alcoveOpen ? ' open' : ''}`}>
            <div className="alcove-inner">
              <div className="alcove-content">
                <div className="alcove-header">
                  <div className="guardian-dot" />
                  <div className="guardian-label">observer</div>
                  <div className="alcove-sep" />
                  <div className="alcove-status">observing your conversation</div>
                  <div className="alcove-spacer" />
                  <button className="alcove-close" onClick={() => setAlcoveOpen(false)}>
                    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M3 5l4 4 4-4" /></svg>
                  </button>
                </div>
                <div className="alcove-messages" ref={guardianScrollRef}>
                  {guardianMessages.length === 0 && !guardianStreaming && (
                    <div className="a-msg guardian">
                      <div className="a-msg-body">observing your conversation. ask me anything about what you and Luca have been discussing.</div>
                    </div>
                  )}
                  {guardianMessages.map((msg, i) => (
                    <div key={i} className={`a-msg ${msg.role === 'user' ? 'user' : 'guardian'}`}>
                      <div className="a-msg-body">{msg.content}</div>
                    </div>
                  ))}
                  {guardianStreaming && guardianStreamingContent && (
                    <div className="a-msg guardian">
                      <div className="a-msg-body">{guardianStreamingContent}<span className="streaming-cursor-inline" /></div>
                    </div>
                  )}
                  {guardianStreaming && !guardianStreamingContent && (
                    <div className="a-msg guardian">
                      <div className="a-msg-body" style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
                        {[0, 1, 2].map(i => (
                          <div key={i} style={{
                            width: 4, height: 4, borderRadius: '50%',
                            background: 'var(--guardian)',
                            opacity: 0.4,
                            animation: `breathe-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
                          }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {!alcoveOpen && renderModelKeyNotice()}
          {!alcoveOpen && renderPendingAttachments()}

          {/* Textarea */}
          <div className="input-row">
            <textarea
              ref={textareaRef}
              className="input-textarea"
              value={input}
              onChange={(e) => { setInput(e.target.value); handleTextareaInput(); }}
              onFocus={() => setFocused(true)}
              onBlur={() => { if (!alcoveOpen) setFocused(false); }}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={alcoveOpen ? 'Ask the Observer...' : modelKeyMissing ? 'Add a model key to continue…' : ensembleActive ? 'Message Luca (ensemble)\u2026' : dynamicPlaceholder}
            />
          </div>

          {/* Footer */}
          <div className="input-footer">
            <div className="agent-pills">
              {!alcoveOpen && (
                <button
                  type="button"
                  className="attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach files"
                  title="Attach files"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6.5 8.5l3.6-3.6a2.2 2.2 0 113.1 3.1l-5.4 5.4a3.4 3.4 0 01-4.8-4.8l5.2-5.2" />
                  </svg>
                </button>
              )}
              <AgentPicker
                activeAgentId={activeAgentId}
                onChange={(id) => {
                  setPendingAgentId(id);
                  if (currentThreadId) updateThreadAgent(currentThreadId, id);
                }}
              />
              <ObserverEyeChip
                threadId={currentThreadId}
                open={alcoveOpen}
                onToggle={() => setAlcoveOpen((v) => !v)}
              />
              {!alcoveOpen && activeAgentId === 'luca' && (
                <>
                  <div className="pill-sep" />
                  <button
                    className={ensemblePillClass}
                    onClick={toggleEnsemble}
                    title="Consult multiple models for this message. Shift-click (or ⇧⌘E) to lock on. ⌘E toggles."
                  ><EnsembleIcon />ensemble</button>
                </>
              )}
            </div>

            {/* Thinking effort selector */}
            <select
              value={thinkingEffort}
              onChange={(e) => setThinkingEffort(e.target.value as 'low' | 'medium' | 'high')}
              className="effort-select"
            >
              <option value="low">Light</option>
              <option value="medium">Medium</option>
              <option value="high">Deep</option>
            </select>

            <button
              className={`send-btn${isStreaming || guardianStreaming ? ' streaming' : ''}${ensembleActive && !alcoveOpen ? ' ensemble-armed' : ''}`}
              onClick={isStreaming || guardianStreaming ? stopStreaming : (alcoveOpen ? sendGuardianMessage : () => sendMessage())}
              disabled={!(isStreaming || guardianStreaming) && (alcoveOpen ? !input.trim() : (modelKeyMissing || (!input.trim() && pendingAttachments.length === 0)))}
            >
              <span className="send-icon">
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.5 1.5 L1.5 6.3 L5.6 8 L7.4 12.3 Z" />
                  <path d="M12.5 1.5 L5.6 8" />
                </svg>
              </span>
              <span className="stop-icon">
                <svg viewBox="0 0 14 14" fill="currentColor"><rect x={3} y={3} width={8} height={8} rx={1.5} /></svg>
              </span>
            </button>
          </div>
        </div>
      </div>
      <AttachmentDropOverlay visible={isDragging} />
    </div>
  );
}

/* ═══ Thread info trigger (opens thread-detail drawer, ⌘I shortcut) ═══ */
function ThreadInfoButton() {
  const currentThreadId = useThreadStore((s) => s.currentThreadId);
  const openDrawer = useDrawerStore((s) => s.open);

  useEffect(() => {
    if (!currentThreadId) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        openDrawer('thread-detail', { threadId: currentThreadId });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [currentThreadId, openDrawer]);

  if (!currentThreadId) return null;
  return (
    <button
      type="button"
      className="thread-info-btn"
      onClick={() => openDrawer('thread-detail', { threadId: currentThreadId })}
      title="Thread details (⌘I)"
      aria-label="Open thread details"
    >
      <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={7} cy={7} r={5.5} />
        <path d="M7 6.5v3.5" />
        <circle cx={7} cy={4.4} r={0.6} fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}
