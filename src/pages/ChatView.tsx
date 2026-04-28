import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useThreadStore } from '@/stores/threadStore';
import { AgentPicker } from '@/components/composer/AgentPicker';
import { ObserverEyeChip } from '@/components/composer/ObserverEyeChip';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useDrawerStore } from '@/stores/drawerStore';
import ReactMarkdown from 'react-markdown';
import EchoField from '@/components/EchoField';
import RichBody from '@/components/rich/RichBody';
import AttachmentDropOverlay from '@/components/attachments/AttachmentDropOverlay';
import CouncilPanel from '@/components/messages/CouncilPanel';
import PermissionInline from '@/components/permissions/PermissionInline';
import WelcomeBackCard from '@/components/chat/WelcomeBackCard';
import AgentErroredCard from '@/components/states/AgentErroredCard';
import MessageAttachment from '@/components/attachments/MessageAttachment';
import ImagePreview from '@/components/attachments/ImagePreview';
import CodePreviewCard from '@/components/attachments/CodePreviewCard';

/* ─── Smooth, rate-limited typewriter hook ───
 * Decouples reveal speed from network chunk delivery. Maintains a steady
 * cadence (~60 chars/sec) that ramps up gracefully if the buffer falls behind.
 */
function useSmoothTypewriter(target: string, active = true) {
  const [displayed, setDisplayed] = useState(active ? '' : target);
  const displayedRef = useRef(displayed);
  const targetRef = useRef(target);
  const lastTickRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const prevTargetRef = useRef('');

  // keep refs current
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    if (!active) {
      displayedRef.current = target;
      setDisplayed(target);
      return;
    }

    // If target is a fresh stream (not a continuation), reset
    if (!target.startsWith(prevTargetRef.current) || prevTargetRef.current === '') {
      if (!target.startsWith(prevTargetRef.current)) {
        displayedRef.current = '';
        setDisplayed('');
      }
    }
    prevTargetRef.current = target;

    const tick = (now: number) => {
      if (!lastTickRef.current) lastTickRef.current = now;
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;

      const tgt = targetRef.current;
      const curLen = displayedRef.current.length;
      const gap = tgt.length - curLen;

      if (gap > 0) {
        // Base 60 chars/sec; ramp toward 250 chars/sec when buffer grows
        let charsPerMs = 0.06;
        if (gap > 200) charsPerMs = 0.12;
        if (gap > 400) charsPerMs = 0.25;
        if (gap > 1200) charsPerMs = 0.6;

        const advance = Math.max(1, Math.round(elapsed * charsPerMs));
        const nextLen = Math.min(tgt.length, curLen + advance);
        const next = tgt.slice(0, nextLen);
        displayedRef.current = next;
        setDisplayed(next);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTickRef.current = 0;
    };
  }, [active, target]);

  return displayed;
}

/* ─── Markdown components (shared between streaming & static) ─── */
const markdownComponents = {
  p: ({ children }: any) => <p style={{ marginBottom: 16 }}>{children}</p>,
  strong: ({ children }: any) => <strong style={{ fontWeight: 550 }}>{children}</strong>,
  em: ({ children }: any) => <em style={{ color: 'var(--text-secondary)' }}>{children}</em>,
  code: ({ children, className: cn }: any) => {
    if (cn) {
      return (
        <pre style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px 20px', margin: '16px 0', overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          <code>{children}</code>
        </pre>
      );
    }
    return <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-primary)' }}>{children}</code>;
  },
  a: ({ href, children }: any) => <a href={href} style={{ color: 'var(--text-secondary)', textDecoration: 'underline', textUnderlineOffset: 2 }}>{children}</a>,
};

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

  // Memoize the parsed markdown tree so it doesn't reparse on every keystroke unnecessarily
  const tree = useMemo(
    () => <ReactMarkdown components={markdownComponents}>{displayed}</ReactMarkdown>,
    [displayed]
  );

  return (
    <div className={className} style={style}>
      {tree}
      <span className={`streaming-cursor-inline${cursorFading ? ' fading' : ''}`} />
    </div>
  );
}

/* ─── Markdown renderer (static messages) ─── */
function MessageContent({ content }: { content: string }) {
  return (
    <div style={{ fontSize: '14.5px', lineHeight: 1.65, color: 'var(--text-primary)' }}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p style={{ marginBottom: 16 }}>{children}</p>,
          strong: ({ children }) => <strong style={{ fontWeight: 550 }}>{children}</strong>,
          em: ({ children }) => <em style={{ color: 'var(--text-secondary)' }}>{children}</em>,
          code: ({ children, className: cn }) => {
            if (cn) {
              return (
                <pre style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px 20px', margin: '16px 0', overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                  <code>{children}</code>
                </pre>
              );
            }
            return <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-primary)' }}>{children}</code>;
          },
          a: ({ href, children }) => <a href={href} style={{ color: 'var(--text-secondary)', textDecoration: 'underline', textUnderlineOffset: 2 }}>{children}</a>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
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

function ThinkingBlock({ content, state, duration }: { content: string; state: ThinkingState; duration?: number }) {
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
        <span className="thinking-label">{thinkingLabel(state)}</span>

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

/* ─── Main ChatView ─── */
export default function ChatView() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const {
    messages, currentThreadId, isStreaming, streamingContent, streamingThinking, threads,
    loadMessages, setCurrentThread, createThread, addMessage,
    setStreaming, setStreamingContent, setStreamingThinking, loadThreads, updateThreadAgent,
  } = useThreadStore();
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
  // Guardian state
  const [guardianMessages, setGuardianMessages] = useState<Array<{ role: string; content: string; created_at?: string }>>([]);
  const [guardianStreaming, setGuardianStreaming] = useState(false);
  const [guardianStreamingContent, setGuardianStreamingContent] = useState('');
  const guardianScrollRef = useRef<HTMLDivElement>(null);
  const [streamingVariants, setStreamingVariants] = useState<Array<{ model: string; content: string; thinking?: string | null }>>([]);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  // Council (LLM-Council pattern) streaming state. Captures peer-rank judge output
  // and aggregate ordering as Stage 2 events arrive over SSE. Final message hydrates
  // these into msg.metadata for CouncilPanel.
  type RankingEntry = { judge_model: string; raw_text: string; parsed_ranking: string[] };
  type AggregateEntry = { model: string; avg_rank: number; rankings_count: number };
  const [streamingRankings, setStreamingRankings] = useState<RankingEntry[]>([]);
  const [streamingAggregate, setStreamingAggregate] = useState<AggregateEntry[]>([]);
  type CouncilPhase = 'idle' | 'voices' | 'deliberating' | 'speaking';
  const [councilPhase, setCouncilPhase] = useState<CouncilPhase>('idle');
  // Alive-feeling features
  const [welcomeBack, setWelcomeBack] = useState<{ type: 'journal' | 'thought' | 'initiation'; content: string } | null>(null);
  const [dynamicPlaceholder, setDynamicPlaceholder] = useState('Message Luca...');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputCaptureRef = useRef('');

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

  // Throttled, calmer auto-scroll. Uses instant scrollTop during streams to
  // avoid fighting smooth-scroll easing curves; smooth-scrolls only for
  // discrete message changes.
  const lastScrollAtRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 140;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (!isNearBottom) return;
    const now = performance.now();
    if (isStreaming || streamingContent) {
      // throttle to ~10fps
      if (now - lastScrollAtRef.current < 100) return;
      lastScrollAtRef.current = now;
      el.scrollTop = el.scrollHeight;
    } else {
      lastScrollAtRef.current = now;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, streamingContent, streamingThinking, isStreaming]);


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
    if (threadId) {
      setCurrentThread(threadId);
      loadMessages(threadId);
    }
  }, [threadId]);

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
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
    }
  };

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

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !user || isStreaming) return;

    // Dismiss welcome back on first message
    if (welcomeBack) setWelcomeBack(null);

    const messageText = input.trim();
    inputCaptureRef.current = messageText;

    let tid = currentThreadId;
    if (!tid) {
      tid = await createThread(user.id, pendingAgentId);
      navigate(`/chat/${tid}`, { replace: true });
    }

    addMessage({
      thread_id: tid, user_id: user.id, role: 'user', content: messageText,
      model: null, agent: null, thinking_content: null, tokens_used: null, bookmarked: false,
    });

    // Save to DB
    const { supabase } = await import('@/integrations/supabase/client');
    await supabase.from('messages').insert({ thread_id: tid, user_id: user.id, role: 'user', content: messageText });

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

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
        body: JSON.stringify({ thread_id: tid, message: messageText, reasoning_effort: thinkingEffort, ensemble: ensembleActive }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('Chat function error:', resp.status, errText);
        addMessage({
          thread_id: tid!, user_id: user.id, role: 'assistant',
          content: resp.status === 401 ? 'Session expired — please refresh.' : 'Something went wrong. Please try again.',
          model: null, agent: activeAgentId, thinking_content: null, tokens_used: null, bookmarked: false,
        });
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
                collectedVariants.push({ model: data.model, content: data.text, thinking: data.thinking || null });
                setStreamingVariants([...collectedVariants]);
                if (councilPhase === 'idle') setCouncilPhase('voices');
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
                fullThinking += data.text;
                setStreamingThinking(fullThinking);
              } else if (data.type === 'done') {
                // Hydrate full council trace into the message metadata so
                // CouncilPanel can render after stream ends without a reload.
                const councilMetadata = collectedVariants.length > 0
                  ? {
                      kind: 'council',
                      variants: collectedVariants,
                      rankings: collectedRankings,
                      aggregate: collectedAggregate,
                      label_to_model: collectedLabelToModel,
                    }
                  : null;
                addMessage({
                  thread_id: tid!, user_id: user.id, role: 'assistant',
                  content: fullContent, model: data.model || null, agent: activeAgentId,
                  thinking_content: fullThinking || null,
                  tokens_used: data.tokens_used || null,
                  bookmarked: false,
                  // Store variants as extra metadata on the message object (legacy convenience)
                  ...(collectedVariants.length > 0 ? { variants: collectedVariants } : {}),
                  ...(councilMetadata ? { metadata: councilMetadata } : {}),
                } as any);
              } else if (data.type === 'error') {
                addMessage({
                  thread_id: tid!, user_id: user.id, role: 'assistant',
                  content: data.text || 'Something went wrong.',
                  model: null, agent: activeAgentId, thinking_content: null, tokens_used: null, bookmarked: false,
                });
              }
            } catch {}
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        addMessage({
          thread_id: tid!, user_id: user.id, role: 'assistant',
          content: 'Something went wrong. Please try again.',
          model: null, agent: activeAgentId, thinking_content: null, tokens_used: null, bookmarked: false,
        });
      }
    } finally {
      setStreaming(false);
      setStreamingContent('');
      setStreamingThinking('');
      setStreamingVariants([]);
      setStreamingRankings([]);
      setStreamingAggregate([]);
      setCouncilPhase('idle');
      setIsSynthesizing(false);
      abortRef.current = null;
      loadThreads();
    }
  }, [input, user, currentThreadId, isStreaming, thinkingEffort, ensembleActive, activeAgentId]);

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

  const stopStreaming = () => abortRef.current?.abort();

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

  // B.6 — drag-and-drop overlay. Overlay is visible while user drags a file
  // over the ChatView. Actual upload handler is a TODO — attachments schema
  // not yet on the Message model (see AUDIT_PASS.md Open questions).
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
    // TODO: wire file upload + attachments pipeline once Message model
    // has an `attachments` field (B.7 blocker).
  }, []);

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
                  placeholder={ensembleActive ? 'Message Luca (ensemble)\u2026' : dynamicPlaceholder}
                />
              </div>
              <div className="input-footer">
                <div className="agent-pills">
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
                  onClick={sendMessage}
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

          {/* Message list — while a streaming bubble is settling, hide the freshly-persisted
              assistant message that mirrors it, to avoid a duplicate flash. */}
          {messages.map((msg, i) => {
            const isLastAssistant =
              lingeringStream != null &&
              i === messages.length - 1 &&
              msg.role === 'assistant' &&
              msg.content === lingeringStream;
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
                    onApprove={(remember) => {
                      // TODO: wire to edge function once permission-action exists
                      console.log('permission approved', { messageId: msg.id, remember });
                    }}
                    onDeny={() => {
                      console.log('permission denied', { messageId: msg.id });
                    }}
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
                      // TODO: re-invoke originating edge function with same payload
                      console.log('agent error retry', { messageId: msg.id });
                    }}
                    onViewLogs={() => {
                      console.log('view logs', { messageId: msg.id });
                    }}
                  />
                </div>
              );
            }

            return (
            <div
              key={msg.id}
              className="msg-row"
              style={{
                animation: `msgEnter var(--dur-settle) var(--ease-premium) both`,
                animationDelay: `${Math.min(i * 30, 150)}ms`,
              }}
            >
              <div className="msg-sidehead">
                {showTimestamps && (
                  <div className="msg-time">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </div>
                )}
                <div className={`msg-author${msg.role === 'user' ? ' user' : ''}`}>
                  {msg.role === 'user'
                    ? 'You'
                    : msg.agent === 'guardian'
                      ? 'Observer'
                      : getAgentDisplayName(msg.agent, agentNameById)}
                </div>
              </div>

              <div className="msg-body">
                {/* Thinking block — always show if thinking_content is a real string */}
                {msg.thinking_content && showThinking && !isMultiModelThinking(msg.thinking_content) && (
                  <ThinkingBlock content={msg.thinking_content} state="complete" />
                )}

                {/* Message content — RichBody for agents (tables, code blocks with syntax highlight, kbd pills), plain markdown for user */}
                {msg.role === 'user'
                  ? <MessageContent content={msg.content} />
                  : <RichBody source={msg.content} />}

                {/* Council deliberation viewer (variants + rankings + aggregate).
                    Hydrates from msg.metadata.kind === "council" (post-reload) or
                    msg.variants (live from streaming). Falls back to legacy
                    multi-model thinking_content payload from older messages. */}
                {(() => {
                  const md = (msg as any).metadata;
                  if (md && md.kind === 'council' && Array.isArray(md.variants) && md.variants.length > 0) {
                    return <CouncilPanel trace={md} />;
                  }
                  if ((msg as any).variants && (msg as any).variants.length > 0) {
                    return <CouncilPanel trace={{ variants: (msg as any).variants }} />;
                  }
                  if (msg.thinking_content && isMultiModelThinking(msg.thinking_content)) {
                    return <CouncilPanel trace={{ variants: parseMultiModelVariants(msg.thinking_content) }} />;
                  }
                  return null;
                })()}

                {/* B.7 — attachments rendered below message body; dispatch on type */}
                {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                  <div className="msg-attachments" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {msg.attachments.map((att, idx) => {
                      const meta = (att.meta || {}) as any;
                      if (att.type === 'image') {
                        return <ImagePreview key={idx} src={att.url} alt={meta.alt} agent={meta.agent} />;
                      }
                      if (att.type === 'code') {
                        return <CodePreviewCard key={idx} code={meta.code || ''} lang={meta.lang} label={meta.label} />;
                      }
                      return <MessageAttachment key={idx} name={meta.name || 'file'} size={meta.size} mime={meta.mime} url={att.url} />;
                    })}
                  </div>
                )}
              </div>
            </div>
            );
          })}


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

              {/* Thinking block — always visible during streaming, 4-state lifecycle */}
              {isStreaming && showThinking && !streamingContent && (
                <ThinkingBlock
                  content={streamingThinking || ''}
                  state={
                    streamingThinking ? 'streaming'
                    : isSynthesizing ? 'waiting'
                    : 'waiting'
                  }
                />
              )}

              {/* Thinking block settling — visible when content starts but thinking existed */}
              {isStreaming && showThinking && streamingContent && streamingThinking && (
                <ThinkingBlock
                  content={streamingThinking}
                  state="settling"
                />
              )}

              {/* Council phase indicator: 3 dots representing voices →
                  deliberating → speaking. Shown during ensemble/council runs
                  before content streaming begins. Each dot brightens as its
                  phase becomes active and stays lit afterwards. */}
              {isStreaming && (streamingVariants.length > 0 || councilPhase !== 'idle') && !streamingContent && (
                <div className="flex items-center gap-2" style={{ padding: '4px 0', marginBottom: 4 }}>
                  <span className="text-[10px]" style={{ color: 'var(--text-ghost)', letterSpacing: '0.03em' }}>
                    {councilPhase === 'speaking' ? 'speaking'
                      : councilPhase === 'deliberating' ? 'deliberating'
                      : `${streamingVariants.length}/3 voices`}
                  </span>
                  <div className="flex items-center gap-1">
                    {(['voices', 'deliberating', 'speaking'] as const).map((phase) => {
                      const phaseOrder = ['voices', 'deliberating', 'speaking'] as const;
                      const currentIdx = phaseOrder.indexOf(councilPhase as typeof phaseOrder[number]);
                      const myIdx = phaseOrder.indexOf(phase);
                      // Dot is "lit" if its phase has been reached or passed.
                      // For voices, also progressively brighten by variant count.
                      const lit = councilPhase !== 'idle' && currentIdx >= myIdx;
                      let opacity = 0.08;
                      if (lit) {
                        if (phase === 'voices') {
                          opacity = Math.min(1, 0.25 + streamingVariants.length * 0.25);
                        } else if (phase === 'deliberating') {
                          opacity = streamingAggregate.length > 0 ? 1 : 0.6;
                        } else {
                          opacity = 1;
                        }
                      }
                      return (
                        <div
                          key={phase}
                          aria-label={phase}
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: lit
                              ? `rgba(220,219,216,${opacity})`
                              : 'rgba(220,219,216,0.08)',
                            transition: 'background 0.3s var(--ease-out)',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Streaming content with typewriter — keep rendering through the catch-up phase */}
              {(streamingContent || lingeringStream) && (
                <StreamingText
                  content={streamingContent || lingeringStream || ''}
                  isStreaming={isStreaming}
                  style={{ fontSize: '14.5px', lineHeight: 1.65, color: 'var(--text-primary)' }}
                  onSettled={() => setLingeringStream(null)}
                />
              )}
              </div>
            </div>
          )}

        </div>

        {/* Bottom spacer for smooth scrolling */}
        <div style={{ height: 24 }} />
      </div>

      {/* Input zone */}
      <div className="input-zone">
        <div className={`input-shell${focused ? ' focused' : ''}${alcoveOpen ? ' alcove-active' : ''}`}>
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
              placeholder={alcoveOpen ? 'Ask the Observer...' : ensembleActive ? 'Message Luca (ensemble)\u2026' : dynamicPlaceholder}
            />
          </div>

          {/* Footer */}
          <div className="input-footer">
            <div className="agent-pills">
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
              onClick={isStreaming || guardianStreaming ? stopStreaming : (alcoveOpen ? sendGuardianMessage : sendMessage)}
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
