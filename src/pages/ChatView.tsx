import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useThreadStore } from '@/stores/threadStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import ReactMarkdown from 'react-markdown';

/* ─── Typewriter hook: reveals text character by character ─── */
function useTypewriter(text: string, speed = 12, active = true) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);
  const prevTextRef = useRef('');

  useEffect(() => {
    if (!active) {
      setDisplayed(text);
      return;
    }

    // If text grew (streaming), only animate the new chars
    if (text.startsWith(prevTextRef.current)) {
      // keep what we already displayed
    } else {
      indexRef.current = 0;
      setDisplayed('');
    }

    const animate = () => {
      if (indexRef.current < text.length) {
        // Reveal in small bursts for smoothness
        const burst = Math.min(speed, text.length - indexRef.current);
        indexRef.current += burst;
        setDisplayed(text.slice(0, indexRef.current));
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    let rafRef = { current: 0 as number };
    rafRef.current = requestAnimationFrame(animate);
    prevTextRef.current = text;

    return () => cancelAnimationFrame(rafRef.current);
  }, [text, active, speed]);

  return displayed;
}

/* ─── Smooth streaming text component ─── */
function StreamingText({ content, className, style }: { content: string; className?: string; style?: React.CSSProperties }) {
  const displayed = useTypewriter(content, 3, true);

  return (
    <div className={className} style={style}>
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
        {displayed}
      </ReactMarkdown>
      <span className="streaming-cursor-inline" />
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

/* ─── Model Variants Panel (expandable per-message) ─── */
function VariantsPanel({ variants }: { variants: Array<{ model: string; content: string; thinking?: string | null }> }) {
  const [expanded, setExpanded] = useState(false);

  if (!variants || variants.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px]"
        style={{
          color: 'var(--text-ghost)',
          letterSpacing: '0.04em',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 0',
        }}
      >
        <span style={{
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform var(--dur-normal) var(--ease-premium)',
          display: 'inline-block',
        }}>›</span>
        {variants.length} model responses
      </button>

      <div style={{
        display: 'grid',
        gridTemplateRows: expanded ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.4s var(--ease-premium)',
      }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
            {variants.map((v, i) => (
              <div key={i} style={{
                background: 'var(--bg-deep)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
              }}>
                <div className="text-[10px] font-medium uppercase mb-1.5" style={{
                  color: 'var(--text-ghost)',
                  letterSpacing: '0.06em',
                }}>
                  {v.model}
                </div>
                {v.thinking && (
                  <ThinkingBlock content={v.thinking} state="complete" />
                )}
                <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-tertiary)' }}>
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p style={{ marginBottom: 8 }}>{children}</p>,
                      code: ({ children, className: cn }) => {
                        if (cn) return <pre style={{ background: 'var(--bg-void)', padding: '8px 12px', borderRadius: 4, fontSize: 12, overflow: 'auto', margin: '8px 0' }}><code>{children}</code></pre>;
                        return <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--bg-surface)', padding: '1px 4px', borderRadius: 3 }}>{children}</code>;
                      },
                    }}
                  >
                    {v.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ChatView ─── */
export default function ChatView() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const {
    messages, currentThreadId, isStreaming, streamingContent, streamingThinking,
    loadMessages, setCurrentThread, createThread, addMessage,
    setStreaming, setStreamingContent, setStreamingThinking, loadThreads,
  } = useThreadStore();
  const showThinking = useSettingsStore((s) => s.show_thinking);
  const showTimestamps = useSettingsStore((s) => s.show_timestamps);
  const defaultEffort = useSettingsStore((s) => s.reasoning_effort);

  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [alcoveOpen, setAlcoveOpen] = useState(false);
  const [thinkingEffort, setThinkingEffort] = useState<'low' | 'medium' | 'high'>(defaultEffort || 'medium');
  const [streamingVariants, setStreamingVariants] = useState<Array<{ model: string; content: string; thinking?: string | null }>>([]);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputCaptureRef = useRef('');

  // Smooth auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Only auto-scroll if user is near the bottom
    const threshold = 120;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, streamingContent, streamingThinking]);

  useEffect(() => {
    if (threadId) {
      setCurrentThread(threadId);
      loadMessages(threadId);
    }
  }, [threadId]);

  const handleTextareaInput = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
    }
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !user || isStreaming) return;

    const messageText = input.trim();
    inputCaptureRef.current = messageText;

    let tid = currentThreadId;
    if (!tid) {
      tid = await createThread(user.id);
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
        body: JSON.stringify({ thread_id: tid, message: messageText, reasoning_effort: thinkingEffort }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('Chat function error:', resp.status, errText);
        addMessage({
          thread_id: tid!, user_id: user.id, role: 'assistant',
          content: resp.status === 401 ? 'Session expired — please refresh.' : 'Something went wrong. Please try again.',
          model: null, agent: 'luca', thinking_content: null, tokens_used: null, bookmarked: false,
        });
        return;
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let fullThinking = '';
      const collectedVariants: Array<{ model: string; content: string; thinking?: string | null }> = [];

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
              } else if (data.type === 'synthesizing') {
                setIsSynthesizing(true);
              } else if (data.type === 'content') {
                fullContent += data.text;
                setStreamingContent(fullContent);
              } else if (data.type === 'thinking') {
                fullThinking += data.text;
                setStreamingThinking(fullThinking);
              } else if (data.type === 'done') {
                addMessage({
                  thread_id: tid!, user_id: user.id, role: 'assistant',
                  content: fullContent, model: data.model || null, agent: 'luca',
                  thinking_content: fullThinking || null,
                  tokens_used: data.tokens_used || null,
                  bookmarked: false,
                  // Store variants as extra metadata on the message object
                  ...(collectedVariants.length > 0 ? { variants: collectedVariants } : {}),
                } as any);
              } else if (data.type === 'error') {
                addMessage({
                  thread_id: tid!, user_id: user.id, role: 'assistant',
                  content: data.text || 'Something went wrong.',
                  model: null, agent: 'luca', thinking_content: null, tokens_used: null, bookmarked: false,
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
          model: null, agent: 'luca', thinking_content: null, tokens_used: null, bookmarked: false,
        });
      }
    } finally {
      setStreaming(false);
      setStreamingContent('');
      setStreamingThinking('');
      setStreamingVariants([]);
      setIsSynthesizing(false);
      abortRef.current = null;
      loadThreads();
    }
  }, [input, user, currentThreadId, isStreaming]);

  const stopStreaming = () => abortRef.current?.abort();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (alcoveOpen) setAlcoveOpen(false);
      else sendMessage();
    }
    if (e.key === 'Escape' && alcoveOpen) setAlcoveOpen(false);
  };

  const threadTitle = useMemo(() => {
    return useThreadStore.getState().threads.find(t => t.id === currentThreadId)?.title;
  }, [currentThreadId, messages]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      {/* Header */}
      <div className="flex items-center flex-shrink-0" style={{
        height: 44,
        padding: '0 24px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
          {threadTitle || 'New conversation'}
        </span>
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
          {/* Empty state */}
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center" style={{ paddingTop: '20vh', animation: 'viewFadeIn 0.6s var(--ease-out) both' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                border: '1px solid var(--border-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 20,
                animation: 'breathe 4s ease-in-out infinite',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(220,219,216,0.15)' }} />
              </div>
              <span className="text-xs" style={{ color: 'var(--text-ghost)', letterSpacing: '0.04em' }}>
                begin a conversation
              </span>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg, i) => (
            <div
              key={msg.id}
              className="chat-message"
              style={{
                marginBottom: 28,
                animation: `msgEnter var(--dur-settle) var(--ease-premium) both`,
                animationDelay: `${Math.min(i * 30, 150)}ms`,
              }}
            >
              {/* Role label */}
              <div className="text-[11px] font-medium uppercase mb-1.5" style={{
                letterSpacing: '0.06em',
                color: msg.role === 'user' ? 'var(--text-soft)' : 'var(--text-secondary)',
              }}>
                {msg.role === 'user' ? 'You' : msg.agent === 'guardian' ? 'Guardian' : 'Luca'}
              </div>

              {/* Thinking block — always show if thinking_content is a real string */}
              {msg.thinking_content && showThinking && !isMultiModelThinking(msg.thinking_content) && (
                <ThinkingBlock content={msg.thinking_content} state="complete" />
              )}

              {/* Message content */}
              <MessageContent content={msg.content} />

              {/* Model variants (expandable) — from variants field or legacy JSON thinking_content */}
              {(msg as any).variants && (
                <VariantsPanel variants={(msg as any).variants} />
              )}
              {msg.thinking_content && isMultiModelThinking(msg.thinking_content) && (
                <VariantsPanel variants={parseMultiModelVariants(msg.thinking_content)} />
              )}

              {/* Timestamp */}
              {showTimestamps && (
                <div className="text-[10px] mt-2" style={{ color: 'var(--text-whisper)' }}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </div>
              )}
            </div>
          ))}

          {/* Streaming message */}
          {isStreaming && (
            <div className="chat-message" style={{ marginBottom: 28, animation: 'msgEnter var(--dur-settle) var(--ease-premium) both' }}>
              <div className="text-[11px] font-medium uppercase mb-1.5" style={{
                letterSpacing: '0.06em',
                color: 'var(--text-secondary)',
              }}>
                Luca
              </div>

              {/* Thinking block — always visible during streaming, 4-state lifecycle */}
              {showThinking && !streamingContent && (
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
              {showThinking && streamingContent && streamingThinking && (
                <ThinkingBlock
                  content={streamingThinking}
                  state="settling"
                />
              )}

              {/* Model variant collection indicator (below thinking block) */}
              {streamingVariants.length > 0 && !streamingContent && !isSynthesizing && (
                <div className="flex items-center gap-2" style={{ padding: '4px 0', marginBottom: 4 }}>
                  <span className="text-[10px]" style={{ color: 'var(--text-ghost)', letterSpacing: '0.03em' }}>
                    {streamingVariants.length}/3 models responded
                  </span>
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: i < streamingVariants.length ? 'var(--accent-luca)' : 'rgba(220,219,216,0.08)',
                        transition: 'background 0.3s var(--ease-out)',
                      }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Synthesizing indicator */}
              {isSynthesizing && !streamingContent && (
                <div className="flex items-center gap-2" style={{ padding: '4px 0', marginBottom: 4 }}>
                  <span className="text-[10px]" style={{ color: 'var(--text-ghost)', letterSpacing: '0.03em' }}>
                    synthesizing
                  </span>
                </div>
              )}

              {/* Streaming content with typewriter */}
              {streamingContent && (
                <StreamingText
                  content={streamingContent}
                  style={{ fontSize: '14.5px', lineHeight: 1.65, color: 'var(--text-primary)' }}
                />
              )}
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
                  <div className="guardian-label">guardian</div>
                  <div className="alcove-sep" />
                  <div className="alcove-status">observing your conversation</div>
                  <div className="alcove-spacer" />
                  <button className="alcove-close" onClick={() => setAlcoveOpen(false)}>
                    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M3 5l4 4 4-4" /></svg>
                  </button>
                </div>
                <div className="alcove-messages">
                  <div className="a-msg guardian">
                    <div className="a-msg-body">Guardian is watching this conversation. Click the guardian pill or press Escape to close.</div>
                  </div>
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
              placeholder={alcoveOpen ? 'Ask the Guardian...' : 'Message Luca...'}
            />
          </div>

          {/* Footer */}
          <div className="input-footer">
            <div className="agent-pills">
              <button
                className={`agent-pill${!alcoveOpen ? ' targeted luca' : ''}`}
                onClick={() => { if (alcoveOpen) setAlcoveOpen(false); }}
              >luca</button>
              <div className="pill-sep" />
              <button
                className={`agent-pill${alcoveOpen ? ' targeted guardian' : ''}`}
                onClick={() => setAlcoveOpen(!alcoveOpen)}
              >guardian</button>
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
              className={`send-btn${isStreaming ? ' streaming' : ''}`}
              onClick={isStreaming ? stopStreaming : sendMessage}
            >
              <span className="send-icon">
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M2 7h10M8 3l4 4-4 4" /></svg>
              </span>
              <span className="stop-icon">
                <svg viewBox="0 0 14 14" fill="currentColor"><rect x={3} y={3} width={8} height={8} rx={1.5} /></svg>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
