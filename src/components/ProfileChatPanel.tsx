import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type Citation =
  | {
      kind: 'memory';
      id: number;
      memory_id: string;
      content: string;
      memory_type: string;
      estimated_date: string | null;
      created_at: string;
      tags: string[] | null;
      confidence: number;
      similarity: number;
    }
  | {
      kind: 'pass';
      pass_name: string;
      topic: string;
      excerpt: string;
    };

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
};

interface Props {
  onClose: () => void;
  starterPrompts: string[];
  agentId: string;
}

export default function ProfileChatPanel({ onClose, starterPrompts, agentId }: Props) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedCitation, setExpandedCitation] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/profile-chat`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          agent_id: agentId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Failed (${res.status})`);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.content || '(no response)', citations: data.citations || [] },
      ]);
    } catch (e: any) {
      toast({ title: 'Chat failed', description: e.message, variant: 'destructive' });
      setMessages((prev) => prev.slice(0, -1));
      setInput(trimmed);
    } finally {
      setLoading(false);
    }
  }

  function renderContentWithCitations(content: string, citations: Citation[] = []) {
    const parts = content.split(/(\[memory:\d+\]|\[pass:\w+\])/g);
    return parts.map((part, i) => {
      const memoryMatch = part.match(/^\[memory:(\d+)\]$/);
      const passMatch = part.match(/^\[pass:(\w+)\]$/);
      if (memoryMatch) {
        const num = Number(memoryMatch[1]);
        const cite = citations.find((c) => c.kind === 'memory' && (c as any).id === num);
        const key = `m-${i}-${num}`;
        return (
          <button
            key={key}
            onClick={() => setExpandedCitation(expandedCitation === key ? null : key)}
            className="inline-flex items-center mx-0.5 align-baseline cursor-pointer"
            style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
              background: 'rgba(91,138,173,0.15)',
              color: '#7ba8d8',
              border: '1px solid rgba(91,138,173,0.3)',
              fontFamily: 'var(--font-mono)',
              verticalAlign: 'baseline',
            }}
            title={cite && cite.kind === 'memory' ? cite.content.slice(0, 100) : 'Memory citation'}
          >
            m{num}
          </button>
        );
      }
      if (passMatch) {
        const passName = passMatch[1];
        const key = `p-${i}-${passName}`;
        return (
          <button
            key={key}
            onClick={() => setExpandedCitation(expandedCitation === key ? null : key)}
            className="inline-flex items-center mx-0.5 align-baseline cursor-pointer"
            style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
              background: 'rgba(201,168,124,0.15)',
              color: '#c9a87c',
              border: '1px solid rgba(201,168,124,0.3)',
              fontFamily: 'var(--font-mono)',
              verticalAlign: 'baseline',
            }}
            title={`Pass: ${passName}`}
          >
            {passName}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  function renderExpandedCitation(msg: ChatMessage, msgIdx: number) {
    if (!expandedCitation) return null;
    const citations = msg.citations || [];
    const memMatch = expandedCitation.match(/^m-\d+-(\d+)$/);
    const passMatch = expandedCitation.match(/^p-\d+-(\w+)$/);

    if (memMatch) {
      const num = Number(memMatch[1]);
      const cite = citations.find((c) => c.kind === 'memory' && (c as any).id === num);
      if (!cite || cite.kind !== 'memory') return null;
      return (
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            background: 'var(--bg-deep)',
            border: '1px solid rgba(91,138,173,0.3)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 11,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: '#7ba8d8', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
              memory #{cite.id} · {cite.memory_type}
            </span>
            <span style={{ color: 'var(--text-ghost)', fontSize: 9 }}>
              {cite.estimated_date || new Date(cite.created_at).toLocaleDateString()}
            </span>
          </div>
          <div style={{ color: 'var(--text-soft)', lineHeight: 1.5 }}>{cite.content}</div>
        </div>
      );
    }
    if (passMatch) {
      const passName = passMatch[1];
      const cite = citations.find((c) => c.kind === 'pass' && (c as any).pass_name === passName);
      if (!cite || cite.kind !== 'pass') return null;
      return (
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            background: 'var(--bg-deep)',
            border: '1px solid rgba(201,168,124,0.3)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 11,
          }}
        >
          <div style={{ marginBottom: 6, color: '#c9a87c', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
            pass: {cite.pass_name} · topic: {cite.topic}
          </div>
          <div style={{ color: 'var(--text-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{cite.excerpt}</div>
        </div>
      );
    }
    return null;
  }

  return (
    <div
      style={{
        width: 440,
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        animation: 'viewFadeIn 0.2s var(--ease-out) both',
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div>
          <div className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
            Ask about your profile
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-ghost)', marginTop: 2 }}>
            Grounded in your memories + analysis passes
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-ghost)', cursor: 'pointer', fontSize: 16 }}
        >
          ×
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ padding: '14px 18px' }}>
        {messages.length === 0 && (
          <div>
            <div
              className="text-[11px] mb-3"
              style={{ color: 'var(--text-ghost)', lineHeight: 1.6 }}
            >
              Ask anything about your psychological profile. The AI can search your actual memories and quote
              the analysis passes that informed each insight. Try:
            </div>
            <div className="flex flex-col gap-2">
              {starterPrompts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => send(p)}
                  className="text-left text-[11px] px-3 py-2 rounded cursor-pointer"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-soft)',
                    lineHeight: 1.5,
                    transition: 'all 150ms ease',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div
              className="text-[9px] uppercase font-medium mb-1"
              style={{ color: 'var(--text-ghost)', letterSpacing: '0.08em' }}
            >
              {m.role === 'user' ? 'you' : 'guide'}
            </div>
            <div
              style={{
                fontSize: 12,
                color: m.role === 'user' ? 'var(--text-primary)' : 'var(--text-soft)',
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.role === 'assistant' ? renderContentWithCitations(m.content, m.citations) : m.content}
            </div>
            {m.role === 'assistant' && renderExpandedCitation(m, i)}
          </div>
        ))}

        {loading && (
          <div style={{ fontSize: 11, color: 'var(--text-ghost)', fontStyle: 'italic' }}>
            <span>thinking and pulling evidence</span>
            <span style={{ display: 'inline-block', marginLeft: 4, animation: 'pulse-thread 1.5s ease-in-out infinite' }}>
              ···
            </span>
          </div>
        )}
      </div>

      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-subtle)' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Why did you say I'm…?"
            style={{
              flex: 1,
              height: 34,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0 12px',
              fontSize: 12,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="text-[11px] px-3 rounded cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: loading || !input.trim() ? 'var(--text-ghost)' : 'var(--text-primary)',
              opacity: loading || !input.trim() ? 0.5 : 1,
            }}
          >
            ask
          </button>
        </form>
      </div>
    </div>
  );
}
