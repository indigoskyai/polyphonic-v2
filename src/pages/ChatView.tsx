import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useThreadStore } from '@/stores/threadStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import ReactMarkdown from 'react-markdown';

export default function ChatView() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const {
    messages, currentThreadId, isStreaming, streamingContent, streamingThinking,
    loadMessages, setCurrentThread, createThread, addMessage,
    setStreaming, setStreamingContent, setStreamingThinking, loadThreads, updateThreadTitle,
  } = useThreadStore();
  const showThinking = useSettingsStore((s) => s.show_thinking);
  const showTimestamps = useSettingsStore((s) => s.show_timestamps);

  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [alcoveOpen, setAlcoveOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (threadId) {
      setCurrentThread(threadId);
      loadMessages(threadId);
    }
  }, [threadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleTextareaInput = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
    }
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !user || isStreaming) return;

    let tid = currentThreadId;
    if (!tid) {
      tid = await createThread(user.id);
      navigate(`/chat/${tid}`, { replace: true });
    }

    const userMsg = { thread_id: tid, user_id: user.id, role: 'user', content: input.trim(), model: null, agent: null, thinking_content: null, tokens_used: null, bookmarked: false };
    addMessage(userMsg);

    // Save user message to DB
    await (await import('@/integrations/supabase/client')).supabase
      .from('messages').insert({ thread_id: tid, user_id: user.id, role: 'user', content: input.trim() });

    setInput('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }

    // Stream AI response
    setStreaming(true);
    setStreamingContent('');
    setStreamingThinking('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const resp = await fetch(`${supabaseUrl}/functions/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await (await import('@/integrations/supabase/client')).supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ thread_id: tid, message: input.trim() }),
        signal: controller.signal,
      });

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let fullThinking = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'content') {
                  fullContent += data.text;
                  setStreamingContent(fullContent);
                } else if (data.type === 'thinking') {
                  fullThinking += data.text;
                  setStreamingThinking(fullThinking);
                } else if (data.type === 'done') {
                  // Add completed message
                  addMessage({
                    thread_id: tid!,
                    user_id: user.id,
                    role: 'assistant',
                    content: fullContent,
                    model: data.model || null,
                    agent: 'luca',
                    thinking_content: fullThinking || null,
                    tokens_used: data.tokens_used || null,
                    bookmarked: false,
                  });
                }
              } catch {}
            }
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
      abortRef.current = null;
      loadThreads();
    }
  }, [input, user, currentThreadId, isStreaming]);

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (alcoveOpen) {
        // Guardian mode - for now just close alcove
        setAlcoveOpen(false);
      } else {
        sendMessage();
      }
    }
  };

  const toggleGuardianAlcove = () => {
    setAlcoveOpen(!alcoveOpen);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ animation: 'viewFadeIn var(--dur-normal) var(--ease-out) both' }}>
      {/* Header */}
      <div className="flex items-center flex-shrink-0" style={{ height: 44, padding: '0 24px 0 24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
          {useThreadStore.getState().threads.find(t => t.id === currentThreadId)?.title || 'New conversation'}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '32px 0', opacity: alcoveOpen ? 0.35 : 1, transition: 'opacity 300ms var(--ease-out)' }}>
        <div style={{ maxWidth: 'var(--message-max-width)', margin: '0 auto', padding: '0 32px' }}>
          {messages.map((msg, i) => (
            <div key={msg.id} className="relative" style={{ marginBottom: 32, animation: `msgEnter var(--dur-settle) var(--ease-premium) both`, animationDelay: `${Math.min(i * 40, 200)}ms` }}>
              <div className="text-xs font-medium uppercase mb-2" style={{
                letterSpacing: '0.06em',
                color: msg.role === 'user' ? 'var(--text-secondary)' : msg.agent === 'guardian' ? 'var(--guardian)' : 'var(--luca)',
              }}>
                {msg.role === 'user' ? 'You' : msg.agent === 'guardian' ? 'Guardian' : 'Luca'}
              </div>

              {/* Thinking block */}
              {msg.thinking_content && showThinking && (
                <ThinkingBlock content={msg.thinking_content} state="complete" />
              )}

              <div style={{ fontSize: '14.5px', lineHeight: 1.65, color: 'var(--text-primary)' }}>
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p style={{ marginBottom: 16 }}>{children}</p>,
                    strong: ({ children }) => <strong style={{ fontWeight: 550 }}>{children}</strong>,
                    em: ({ children }) => <em style={{ color: 'var(--text-secondary)' }}>{children}</em>,
                    code: ({ children, className }) => {
                      if (className) {
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
                  {msg.content}
                </ReactMarkdown>
              </div>

              {showTimestamps && (
                <div className="text-xs mt-2" style={{ color: 'var(--text-ghost)' }}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </div>
              )}
            </div>
          ))}

          {/* Streaming message */}
          {isStreaming && (
            <div className="relative" style={{ marginBottom: 32, animation: 'msgEnter var(--dur-settle) var(--ease-premium) both' }}>
              <div className="text-xs font-medium uppercase mb-2" style={{ letterSpacing: '0.06em', color: 'var(--luca)' }}>Luca</div>
              {streamingThinking && showThinking && (
                <ThinkingBlock content={streamingThinking} state="streaming" />
              )}
              <div className="streaming-cursor" style={{ fontSize: '14.5px', lineHeight: 1.65, color: 'var(--text-primary)' }}>
                <ReactMarkdown>{streamingContent || ''}</ReactMarkdown>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
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
                    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M3 5l4 4 4-4"/></svg>
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

          {/* Input footer */}
          <div className="input-footer">
            <div className="agent-pills">
              <button
                className={`agent-pill${!alcoveOpen ? ' targeted luca' : ''}`}
                onClick={() => { if (alcoveOpen) setAlcoveOpen(false); }}
              >
                luca
              </button>
              <div className="pill-sep" />
              <button
                className={`agent-pill${alcoveOpen ? ' targeted guardian' : ''}`}
                onClick={toggleGuardianAlcove}
              >
                guardian
              </button>
            </div>
            <button
              className={`send-btn${isStreaming ? ' streaming' : ''}`}
              onClick={isStreaming ? stopStreaming : sendMessage}
            >
              <span className="send-icon">
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M2 7h10M8 3l4 4-4 4"/></svg>
              </span>
              <span className="stop-icon">
                <svg viewBox="0 0 14 14" fill="currentColor"><rect x={3} y={3} width={8} height={8} rx={1.5}/></svg>
              </span>
            </button>
          </div>
        </div>
      </div>
  );
}

function ThinkingBlock({ content, state }: { content: string; state: 'streaming' | 'complete' }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = state === 'streaming';

  return (
    <div
      className={expanded ? 'expanded' : ''}
      style={{
        borderRadius: 'var(--radius-sm)',
        background: 'linear-gradient(135deg, rgba(220, 219, 216, 0.015) 0%, rgba(220, 219, 216, 0.005) 100%)',
        border: `1px solid ${isActive ? 'rgba(220, 219, 216, 0.06)' : 'var(--border-subtle)'}`,
        overflow: 'hidden',
        marginTop: 12,
        marginBottom: 8,
      }}
    >
      <div
        className="flex items-center gap-2.5 cursor-pointer select-none"
        style={{ padding: '11px 16px' }}
        onClick={() => state === 'complete' && setExpanded(!expanded)}
      >
        {/* Murmur dots */}
        <div className="grid shrink-0" style={{ gridTemplateColumns: 'repeat(3, 3.5px)', gridTemplateRows: 'repeat(3, 3.5px)', gap: 2 }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="rounded-full" style={{
              width: 3.5, height: 3.5,
              background: isActive ? undefined : 'rgba(220, 219, 216, 0.06)',
              animation: isActive ? `murmur-slow ${3.5 + i * 0.3}s ease-in-out infinite, murmur-fast ${1.1 + i * 0.2}s ease-in-out infinite` : 'none',
              animationDelay: isActive ? `${i * 0.15}s` : undefined,
            }} />
          ))}
        </div>

        <span className="text-xs" style={{
          fontWeight: 420,
          letterSpacing: '0.02em',
          color: 'var(--text-ghost)',
          ...(isActive ? {
            background: 'linear-gradient(90deg, rgba(220,219,216,0.20) 0%, rgba(220,219,216,0.20) 35%, rgba(220,219,216,0.55) 50%, rgba(220,219,216,0.20) 65%, rgba(220,219,216,0.20) 100%)',
            backgroundSize: '200% 100%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'shimmer 2.4s ease-in-out infinite',
          } : {}),
        }}>
          thinking
        </span>

        <span className="ml-auto text-[10px]" style={{ color: 'var(--text-whisper)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform var(--dur-normal) var(--ease-premium)' }}>
          ›
        </span>
      </div>

      {/* Peek window (during streaming) */}
      {isActive && !expanded && (
        <div style={{ padding: '0 14px 10px', fontFamily: 'var(--font-mono)', fontSize: '11.5px', lineHeight: 1.5, color: 'var(--text-ghost)', maxHeight: 42, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,1) 100%)' }}>
          {content.slice(-120)}
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', maxHeight: 'min(55vh, 400px)', overflowY: 'auto', padding: '12px 14px 14px' }}>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', lineHeight: 1.55, color: 'var(--text-tertiary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
