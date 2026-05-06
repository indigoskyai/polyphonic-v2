import { useEffect, useRef, useState } from 'react';
import { useDrawerStore } from '@/stores/drawerStore';
import { useObserverStore, type ObserverNote } from '@/stores/observerStore';
import { useAuthStore } from '@/stores/authStore';
import { DrawerHeader, DrawerTitle, DrawerEscChip, DrawerCloseBtn, DrawerBody, DrawerSection, DrawerSectionLabel } from '@/components/ui/luca';

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
        <span className="observer-lock-chip">resident · locked</span>
        <DrawerEscChip />
        <DrawerCloseBtn onClick={close} />
      </DrawerHeader>
      <DrawerBody>
        <DrawerSection>
          <DrawerSectionLabel>Notes</DrawerSectionLabel>
          {notes.length === 0 ? (
            <p className="drawer-copy drawer-copy--muted">
              No observations yet. The Observer is watching this conversation. Notes will appear here as patterns and signals emerge.
            </p>
          ) : (
            <div className="observer-note-list">
              {notes.map((n) => (
                <div key={n.id} className="observer-note-card" style={{ borderLeftColor: KIND_COLOR[n.kind] }}>
                  <div className="observer-note-meta">
                    <span>{n.kind} · {timeAgo(n.created_at)}</span>
                    <button
                      type="button"
                      className="observer-pin-btn"
                      onClick={() => togglePin(n.id)}
                      data-pinned={n.pinned ? 'true' : undefined}
                      title={n.pinned ? 'Unpin' : 'Pin'}
                    >
                      {n.pinned ? '● pinned' : '○ pin'}
                    </button>
                  </div>
                  <div className="observer-note-body">
                    {n.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DrawerSection>

        <DrawerSection>
          <DrawerSectionLabel>Ask Observer</DrawerSectionLabel>
          <div className="observer-chat-list">
            {chat.length === 0 && (
              <p className="drawer-copy drawer-copy--muted">
                Ask the Observer anything about this thread.
              </p>
            )}
            {chat.map((m) => (
              <div key={m.id} className="observer-chat-card" data-role={m.role === 'user' ? 'user' : 'observer'}>
                <div className="observer-note-meta">
                  {m.role === 'user' ? 'you' : 'observer'} · {timeAgo(m.created_at)}
                </div>
                <div className="observer-chat-body">{m.content}</div>
              </div>
            ))}
            {asking && (
              <div className="observer-thinking-state">
                Observer is thinking…
              </div>
            )}
          </div>
          <form onSubmit={handleSubmit} className="observer-ask-form">
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
              className="observer-ask-input"
              disabled={asking || !threadId}
            />
            <button
              type="submit"
              disabled={asking || !input.trim() || !threadId}
              className="observer-ask-button"
            >
              Ask
            </button>
          </form>
        </DrawerSection>
      </DrawerBody>
    </>
  );
}
