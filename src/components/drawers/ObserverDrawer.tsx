import { useEffect, useRef, useState } from 'react';
import { useDrawerStore } from '@/stores/drawerStore';
import { useObserverStore, type ObserverNote } from '@/stores/observerStore';
import { useAuthStore } from '@/stores/authStore';
import { DrawerHeader, DrawerTitle, DrawerEscChip, DrawerCloseBtn, DrawerBody, DrawerSection } from '@/components/ui/luca';

const KIND_COLOR: Record<ObserverNote['kind'], string> = {
  concern: 'rgba(192, 132, 65, 0.85)',   // ochre
  welfare: 'rgba(140, 168, 128, 0.85)',  // sage
  pattern: 'rgba(120, 144, 192, 0.85)',  // blue
  summary: 'rgba(180, 180, 175, 0.65)',  // ghost
  note:    'rgba(220, 215, 200, 0.85)',  // cream
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function ObserverDrawer() {
  const user = useAuthStore((s) => s.user);
  const close = useDrawerStore((s) => s.close);
  const payload = useDrawerStore((s) => s.payload) as { threadId?: string } | null;
  const threadId = payload?.threadId || '';

  const notes = useObserverStore((s) => (threadId ? s.notesByThread[threadId] : undefined)) || [];
  const chat = useObserverStore((s) => (threadId ? s.chatByThread[threadId] : undefined)) || [];
  const loadThread = useObserverStore((s) => s.loadThread);
  const subscribeThread = useObserverStore((s) => s.subscribeThread);
  const askObserver = useObserverStore((s) => s.askObserver);
  const asking = useObserverStore((s) => s.asking);
  const togglePin = useObserverStore((s) => s.togglePin);

  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user || !threadId) return;
    loadThread(user.id, threadId);
    const unsub = subscribeThread(user.id, threadId);
    return unsub;
  }, [user?.id, threadId, loadThread, subscribeThread]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !threadId || asking) return;
    setInput('');
    const res = await askObserver(threadId, text);
    if (!res.ok && user) {
      // Reload to make sure we have current state
      loadThread(user.id, threadId);
    }
  };

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>Observer</DrawerTitle>
        <span style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
          letterSpacing: 'var(--track-meta)', color: 'var(--text-ghost)',
          padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 999,
          marginLeft: 8,
        }}>
          resident · locked
        </span>
        <DrawerEscChip />
        <DrawerCloseBtn onClick={close} />
      </DrawerHeader>
      <DrawerBody>
        <DrawerSection title="Notes">
          {notes.length === 0 ? (
            <p style={{ color: 'var(--text-ghost)', fontSize: 12, lineHeight: 1.6 }}>
              No observations yet. The Observer is watching this conversation. Notes will appear here as patterns and signals emerge.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notes.map((n) => (
                <div key={n.id} style={{
                  padding: '8px 10px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-faint)',
                  borderLeft: `2px solid ${KIND_COLOR[n.kind]}`,
                  borderRadius: 6,
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                    letterSpacing: 'var(--track-meta)', color: 'var(--text-whisper)', marginBottom: 4,
                  }}>
                    <span>{n.kind} · {timeAgo(n.created_at)}</span>
                    <button
                      onClick={() => togglePin(n.id)}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: n.pinned ? 'var(--text-body)' : 'var(--text-whisper)',
                        fontSize: 10, padding: 0,
                      }}
                      title={n.pinned ? 'Unpin' : 'Pin'}
                    >
                      {n.pinned ? '● pinned' : '○ pin'}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--text-body)' }}>
                    {n.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DrawerSection>

        <DrawerSection title="Ask Observer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', marginBottom: 8 }}>
            {chat.length === 0 && (
              <p style={{ color: 'var(--text-ghost)', fontSize: 12 }}>
                Ask the Observer anything about this thread.
              </p>
            )}
            {chat.map((m) => (
              <div key={m.id} style={{
                padding: '8px 10px',
                background: m.role === 'user' ? 'transparent' : 'var(--bg-surface)',
                border: m.role === 'user' ? '1px dashed var(--border-faint)' : '1px solid var(--border-faint)',
                borderRadius: 6,
                fontSize: 12, lineHeight: 1.55, color: 'var(--text-body)',
                whiteSpace: 'pre-wrap',
              }}>
                <div style={{
                  fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                  letterSpacing: 'var(--track-meta)', color: 'var(--text-whisper)', marginBottom: 4,
                }}>
                  {m.role === 'user' ? 'you' : 'observer'} · {timeAgo(m.created_at)}
                </div>
                {m.content}
              </div>
            ))}
            {asking && (
              <div style={{ fontSize: 11, color: 'var(--text-ghost)', fontStyle: 'italic' }}>
                Observer is thinking…
              </div>
            )}
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 6 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              placeholder="What do you see here?"
              rows={2}
              style={{
                flex: 1, resize: 'none',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-faint)',
                borderRadius: 6, padding: '6px 8px',
                color: 'var(--text-body)', fontSize: 12,
                fontFamily: 'var(--font-sans)', outline: 'none',
              }}
              disabled={asking || !threadId}
            />
            <button
              type="submit"
              disabled={asking || !input.trim() || !threadId}
              style={{
                padding: '6px 12px', borderRadius: 999,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-body)', fontSize: 11, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 'var(--track-meta)',
                opacity: (asking || !input.trim()) ? 0.5 : 1,
              }}
            >
              Ask
            </button>
          </form>
        </DrawerSection>
      </DrawerBody>
    </>
  );
}
