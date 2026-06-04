import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Copy,
  LocateFixed,
  Navigation,
  PencilLine,
  RotateCcw,
  Send,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import PolyphonicMark from '@/components/PolyphonicMark';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import { useDrawerStore, type DrawerKey } from '@/stores/drawerStore';
import { useInterfaceModeStore } from '@/stores/interfaceModeStore';
import { useLucaGuideStore } from '@/stores/lucaGuideStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useThreadStore } from '@/stores/threadStore';
import { getInterfaceModePolicy, shouldDefaultSidebarVisible, type InterfaceMode } from '@/lib/interfaceMode';
import {
  GUIDE_DRAWER_TARGETS,
  GUIDE_NAV_TARGETS,
  routeInfo,
  targetsForPath,
  type LucaGuideAction,
  type LucaGuideContext,
} from '@/lib/lucaGuide';

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

function findGuideTarget(targetId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-guide-id="${cssEscape(targetId)}"]`);
}

function actionIcon(type: LucaGuideAction['type']) {
  if (type === 'navigate') return <Navigation size={13} strokeWidth={1.7} />;
  if (type === 'open_drawer') return <ChevronRight size={13} strokeWidth={1.7} />;
  if (type === 'set_interface_mode') return <SlidersHorizontal size={13} strokeWidth={1.7} />;
  return <LocateFixed size={13} strokeWidth={1.7} />;
}

function isChatRoute(pathname: string): boolean {
  return pathname === '/chat' || pathname.startsWith('/chat/');
}

function guideAllowedOnChat(search: string): boolean {
  return new URLSearchParams(search).get('guide') === '1';
}

export default function LucaGuideOverlay() {
  const location = useLocation();
  const navigate = useNavigate();
  const openDrawer = useDrawerStore((s) => s.open);
  const activeDrawer = useDrawerStore((s) => s.active);
  const currentThreadId = useThreadStore((s) => s.currentThreadId);
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const availableAgents = useAgentScopeStore((s) => s.availableAgents);
  const interfaceMode = useInterfaceModeStore((s) => s.mode);
  const setInterfaceMode = useInterfaceModeStore((s) => s.setMode);
  const setSidebarVisible = useSidebarStore((s) => s.setVisible);
  const open = useLucaGuideStore((s) => s.open);
  const messages = useLucaGuideStore((s) => s.messages);
  const sending = useLucaGuideStore((s) => s.sending);
  const activeTargetId = useLucaGuideStore((s) => s.activeTargetId);
  const toggleOpen = useLucaGuideStore((s) => s.toggleOpen);
  const setOpen = useLucaGuideStore((s) => s.setOpen);
  const send = useLucaGuideStore((s) => s.send);
  const clear = useLucaGuideStore((s) => s.clear);
  const highlight = useLucaGuideStore((s) => s.highlight);
  const clearHighlight = useLucaGuideStore((s) => s.clearHighlight);
  const [input, setInput] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hiddenOnChatRoute = isChatRoute(location.pathname) && !guideAllowedOnChat(location.search);

  const activeAgentName = useMemo(() => {
    return availableAgents.find((agent) => agent.id === activeAgentId)?.name || 'Luca';
  }, [activeAgentId, availableAgents]);
  const modePolicy = useMemo(() => getInterfaceModePolicy(interfaceMode), [interfaceMode]);

  const context: LucaGuideContext = useMemo(() => {
    const info = routeInfo(location.pathname);
    return {
      path: location.pathname,
      search: location.search,
      pageTitle: info.pageTitle,
      routeFamily: info.routeFamily,
      summary: info.summary,
      activeAgentId,
      activeAgentName,
      interfaceMode,
      interfaceModeSummary: modePolicy.summary,
      interfaceModeInstruction: modePolicy.guideInstruction,
      currentThreadId,
      availableTargets: targetsForPath(location.pathname),
    };
  }, [activeAgentId, activeAgentName, currentThreadId, interfaceMode, location.pathname, location.search, modePolicy.guideInstruction, modePolicy.summary]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  useEffect(() => {
    if (guideAllowedOnChat(location.search)) setOpen(true);
  }, [location.search, setOpen]);

  useEffect(() => {
    if (!hiddenOnChatRoute) return;
    if (open) setOpen(false);
    if (activeTargetId) clearHighlight();
  }, [activeTargetId, clearHighlight, hiddenOnChatRoute, open, setOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, sending, open]);

  useEffect(() => {
    document.querySelectorAll('.luca-guide-target-active').forEach((node) => {
      node.classList.remove('luca-guide-target-active');
    });
    if (!activeTargetId) return;

    const target = findGuideTarget(activeTargetId);
    if (!target) return;
    target.classList.add('luca-guide-target-active');
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

    const timeout = window.setTimeout(() => {
      target.classList.remove('luca-guide-target-active');
      clearHighlight();
    }, 4200);
    return () => {
      window.clearTimeout(timeout);
      target.classList.remove('luca-guide-target-active');
    };
  }, [activeTargetId, clearHighlight, location.pathname]);

  const submit = async (text = input) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput('');
    await send(trimmed, context);
  };

  const runAction = (action: LucaGuideAction) => {
    if (action.type === 'navigate') {
      navigate(action.target);
      return;
    }
    if (action.type === 'open_drawer') {
      openDrawer(action.target as Exclude<DrawerKey, null>);
      return;
    }
    if (action.type === 'set_interface_mode') {
      const mode = action.target as InterfaceMode;
      setInterfaceMode(mode);
      setSidebarVisible(shouldDefaultSidebarVisible(mode));
      return;
    }
    const target = findGuideTarget(action.target);
    if (target && action.type === 'scroll_to') {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
    highlight(action.target);
  };

  const copyTranscript = async () => {
    const transcript = messages
      .map((message) => `${message.role === 'user' ? 'You' : 'Polyphonic Guide'}: ${message.content}`)
      .join('\n\n');
    if (!transcript.trim()) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const quickPrompts = [
    `What should I know about ${context.pageTitle}?`,
    'Show me where setup starts.',
    interfaceMode === 'studio' ? 'How do agents and memory fit together?' : 'When should I open the full studio?',
  ];

  if (hiddenOnChatRoute) return null;

  return (
    <>
      <button
        type="button"
        className="luca-guide-launcher"
        data-guide-id="luca-guide-launcher"
        data-open={open ? 'true' : undefined}
        onClick={toggleOpen}
        aria-label={open ? 'Close Polyphonic Guide' : 'Open Polyphonic Guide'}
      >
        <span className="luca-guide-mark" aria-hidden="true">P</span>
        <span className="luca-guide-launcher-text">Guide</span>
      </button>

      {open && (
        <section className="luca-guide-panel" aria-label="Polyphonic Guide">
          <div className="luca-guide-head">
            <div className="luca-guide-head-main">
              <span className="luca-guide-mark large" aria-hidden="true">P</span>
              <div>
                <div className="luca-guide-kicker">Polyphonic Guide</div>
                <div className="luca-guide-title">Ask about the app</div>
                <div className="luca-guide-subtitle">{context.pageTitle} · {modePolicy.label}</div>
              </div>
            </div>
            <div className="luca-guide-head-actions">
              <button type="button" onClick={copyTranscript} aria-label="Copy Polyphonic Guide chat" title="Copy transcript">
                <Copy size={15} strokeWidth={1.7} />
              </button>
              <button type="button" onClick={clear} aria-label="Start a fresh Polyphonic Guide chat" title="Start fresh">
                <PencilLine size={15} strokeWidth={1.7} />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close Polyphonic Guide">
                <X size={15} strokeWidth={1.7} />
              </button>
            </div>
          </div>

          <div className="luca-guide-context">
            <PolyphonicMark size={14} strokeWidth={8} />
            <span>{context.summary}</span>
          </div>

          <div className="luca-guide-messages" ref={scrollRef}>
            {messages.map((message) => (
              <div key={message.id} className={`luca-guide-message ${message.role}`}>
                <div className="luca-guide-message-label">{message.role === 'user' ? 'you' : 'guide'}</div>
                <div className="luca-guide-message-body">{message.content}</div>
                {!!message.actions?.length && (
                  <div className="luca-guide-actions">
                    {message.actions.map((action, index) => (
                      <button
                        key={`${action.type}-${action.target}-${index}`}
                        type="button"
                        onClick={() => runAction(action)}
                      >
                        {actionIcon(action.type)}
                        <span>{action.label || action.target}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="luca-guide-message assistant pending">
                <div className="luca-guide-message-label">guide</div>
                <div className="luca-guide-message-body">looking at this screen...</div>
              </div>
            )}
          </div>

          {copied && <div className="luca-guide-copy-note">Copied transcript</div>}

          <div className="luca-guide-shortcuts" data-open={shortcutsOpen ? 'true' : undefined}>
            <button
              type="button"
              className="luca-guide-shortcuts-trigger"
              onClick={() => setShortcutsOpen((value) => !value)}
              aria-expanded={shortcutsOpen}
            >
              <ChevronRight size={13} strokeWidth={1.7} aria-hidden="true" />
              <span>Helpful prompts and places</span>
              <small>Optional</small>
            </button>

            {shortcutsOpen && (
              <div className="luca-guide-shortcuts-panel">
                <div className="luca-guide-quick" aria-label="Suggested Polyphonic Guide questions">
                  {quickPrompts.map((prompt) => (
                    <button key={prompt} type="button" onClick={() => void submit(prompt)} disabled={sending}>
                      {prompt}
                    </button>
                  ))}
                </div>

                <div className="luca-guide-targets" aria-label="Available guide actions">
                  <span>Can open</span>
                  {[...GUIDE_NAV_TARGETS.slice(0, 5), ...GUIDE_DRAWER_TARGETS.slice(0, 1)].map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => {
                        if (target.id.startsWith('/')) navigate(target.id);
                        else openDrawer(target.id as Exclude<DrawerKey, null>);
                      }}
                      data-active={
                        target.id.startsWith('/')
                          ? location.pathname.startsWith(target.id)
                            ? 'true'
                            : undefined
                          : activeDrawer === target.id
                          ? 'true'
                          : undefined
                      }
                    >
                      {target.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <form
            className="luca-guide-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="Ask anything"
              rows={2}
              disabled={sending}
            />
            <button type="submit" disabled={!input.trim() || sending} aria-label="Send to Polyphonic Guide">
              {sending ? <RotateCcw size={15} strokeWidth={1.7} /> : <Send size={15} strokeWidth={1.7} />}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
