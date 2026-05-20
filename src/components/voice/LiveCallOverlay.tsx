import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  agentIdOverride?: string | null;
  onClose: () => void;
}

interface TranscriptLine {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
}

function LiveCallInner({ agentIdOverride, onClose }: { agentIdOverride?: string | null; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const startedRef = useRef(false);

  const conversation = useConversation();

  const handleStart = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { data, error: invokeErr } = await supabase.functions.invoke(
        'voice-conversation-token',
        { body: { agentId: agentIdOverride ?? undefined } },
      );
      if (invokeErr) throw invokeErr;
      if (!data?.token) {
        throw new Error(data?.message || data?.error || 'Failed to get conversation token');
      }
      await conversation.startSession({
        conversationToken: data.token,
        connectionType: 'webrtc',
      });
      setConnecting(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setConnecting(false);
    }
  }, [agentIdOverride, conversation]);

  const handleEnd = useCallback(async () => {
    try { await conversation.endSession(); } catch { /* noop */ }
    onClose();
  }, [conversation, onClose]);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      void handleStart();
    }
    return () => { try { void conversation.endSession(); } catch { /* noop */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = conversation.status;
  const isSpeaking = conversation.isSpeaking;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live voice call"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'hsl(var(--background) / 0.92)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 32,
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') void handleEnd(); }}
      tabIndex={-1}
    >
      <div style={{ position: 'absolute', top: 24, left: 32, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'hsl(var(--muted-foreground))' }}>
        § live voice · elevenlabs conversational
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, maxWidth: 720 }}>
        <div
          style={{
            width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.5), hsl(var(--primary) / 0.1) 60%, transparent 80%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 200ms ease, box-shadow 200ms ease',
            transform: isSpeaking ? 'scale(1.08)' : 'scale(1)',
            boxShadow: isSpeaking
              ? '0 0 80px hsl(var(--primary) / 0.5)'
              : '0 0 30px hsl(var(--primary) / 0.2)',
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'hsl(var(--foreground))' }}>
            {error
              ? 'error'
              : connecting
                ? 'connecting'
                : status === 'connected'
                  ? (isSpeaking ? 'speaking' : 'listening')
                  : 'idle'}
          </div>
        </div>

        {error ? (
          <div style={{ color: 'hsl(0 70% 70%)', fontSize: 13, textAlign: 'center', maxWidth: 480 }}>
            {error}
          </div>
        ) : null}

        <div style={{
          width: 'min(720px, 90vw)', maxHeight: '40vh', overflowY: 'auto',
          fontSize: 13, lineHeight: 1.6, color: 'hsl(var(--foreground))',
          display: 'flex', flexDirection: 'column', gap: 8, padding: 8,
        }}>
          {transcript.map((line, i) => (
            <div key={i} style={{
              opacity: line.role === 'user' ? 0.7 : 1,
              fontStyle: line.role === 'user' ? 'italic' : 'normal',
            }}>
              <span style={{
                fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'hsl(var(--muted-foreground))', marginRight: 8,
              }}>{line.role === 'user' ? 'you' : 'luca'}</span>
              {line.text}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void handleEnd()}
          style={{
            marginTop: 12,
            padding: '12px 32px', borderRadius: 999,
            background: 'hsl(0 70% 50%)', color: 'white',
            border: 'none', cursor: 'pointer',
            fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase',
            fontWeight: 500,
          }}
        >
          End call
        </button>
      </div>
      {/* Hidden hook to capture transcript via onMessage callbacks */}
      <TranscriptCapture
        onLine={(line) => {
          transcriptRef.current = [...transcriptRef.current, line];
          setTranscript(transcriptRef.current);
        }}
      />
    </div>
  );
}

function TranscriptCapture({ onLine }: { onLine: (line: TranscriptLine) => void }) {
  // Re-subscribe via useConversation with onMessage callback
  useConversation({
    onMessage: (msg: { source?: string; message?: string }) => {
      if (msg?.source === 'user' && typeof msg?.message === 'string') {
        onLine({ role: 'user', text: msg.message, ts: Date.now() });
      } else if (msg?.source === 'ai' && typeof msg?.message === 'string') {
        onLine({ role: 'assistant', text: msg.message, ts: Date.now() });
      }
    },
  });
  return null;
}

export function LiveCallOverlay({ open, agentIdOverride, onClose }: Props) {
  if (!open) return null;
  return (
    <ConversationProvider>
      <LiveCallInner agentIdOverride={agentIdOverride} onClose={onClose} />
    </ConversationProvider>
  );
}
