import React, { useMemo, useState } from 'react';
import { useThreadStore } from '@/stores/threadStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { useArtifactStore } from '@/stores/artifactStore';
import RichBody from '@/components/rich/RichBody';
import CouncilPanel from '@/components/messages/CouncilPanel';
import MessageAttachment from '@/components/attachments/MessageAttachment';
import ImagePreview from '@/components/attachments/ImagePreview';
import ImageCard from '@/components/messages/ImageCard';
import SearchCitationsCard, { type Citation } from '@/components/messages/SearchCitationsCard';
import CodePreviewCard from '@/components/attachments/CodePreviewCard';
import ArtifactCard from '@/components/canvas/ArtifactCard';
import { useFirstMount } from '@/lib/useFirstMount';
import { getChatModelLabel, normalizeThreadRuntimeMode } from '@/lib/chatRuntime';

/* ─── Multi-model thinking helpers (kept here so MessageItem stays self-contained) ─── */
function isMultiModelThinking(thinkingContent: string): boolean {
  try {
    const parsed = JSON.parse(thinkingContent);
    return parsed?.type === 'multi_model' && Array.isArray(parsed?.variants);
  } catch { return false; }
}
function parseMultiModelVariants(thinkingContent: string): Array<{ model: string; content: string }> {
  try {
    const parsed = JSON.parse(thinkingContent);
    if (parsed?.type === 'multi_model' && Array.isArray(parsed?.variants)) return parsed.variants;
  } catch {}
  return [];
}

function getAgentDisplayName(agentId: string | null | undefined, names: Map<string, string>) {
  if (!agentId) return 'Luca';
  const fromStore = names.get(agentId);
  if (fromStore) return fromStore;
  if (agentId === 'guardian' || agentId === 'observer') return 'Observer';
  return agentId.charAt(0).toUpperCase() + agentId.slice(1);
}

interface ThinkingBlockProps { content: string; state: 'complete' }
// Local minimal ThinkingBlock for "complete" state only — the live streaming
// variant lives in ChatView and is only used inside the streaming bubble.
function ThinkingBlockComplete({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!content) return null;
  return (
    <div className={`thinking-block${expanded ? ' expanded' : ''}`} data-state="complete">
      <div
        className="thinking-header"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        <div className="thinking-dots" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => <span key={i} className="td" />)}
        </div>
        <span className="thinking-label">thought</span>
        <span className="thinking-timer">{Math.ceil(content.length / 4)} tokens</span>
        <span className="thinking-chevron" aria-hidden="true">›</span>
      </div>
      <div className="thinking-body">
        <div className="thinking-body-content">
          <div className="thinking-body-text">{content}</div>
        </div>
      </div>
    </div>
  );
}

// Stable empty array reference so the artifact selector returns the same
// value across renders when there are no artifacts for this thread —
// keeps React.memo on MessageItem effective.
const EMPTY_ARTIFACTS: import('@/stores/artifactStore').Artifact[] = [];

interface Props {
  messageId: string;
  /** Created-at of the next message, or null if this is the last. Used to
   *  decide whether an artifact created between this and the next message
   *  should attach here. Primitive string keeps React.memo effective. */
  nextCreatedAt: string | null;
  /** Whether this is the last message in the thread (for orphan-artifact
   *  attachment fallback). */
  isLast: boolean;
}

/**
 * Memoized per-message renderer for the regular "text + thinking + council
 * panel + attachments + inline artifacts" branch.
 *
 * Subscribes to its own message via a narrow `messages.find(id)` selector,
 * so when only the streaming buffer in the parent updates, this component's
 * Zustand subscription is a no-op and React.memo blocks the re-render.
 *
 * Special branches (permission_request, agent_error, subagent_report) stay
 * in the parent — they're rare and don't need memoization.
 */
function MessageItemImpl({ messageId, nextCreatedAt, isLast }: Props) {
  const msg = useThreadStore((s) => s.messages.find((m) => m.id === messageId));
  const showThinking = useSettingsStore((s) => s.show_thinking);
  const showTimestamps = useSettingsStore((s) => s.show_timestamps);
  const agents = useAgentSettingsStore((s) => s.agents);
  const currentThreadId = useThreadStore((s) => s.currentThreadId);
  const currentThread = useThreadStore((s) =>
    s.currentThreadId ? s.threads.find((t) => t.id === s.currentThreadId) : null,
  );
  const threadArtifacts = useArtifactStore(
    (s) => (currentThreadId ? s.byThread[currentThreadId] ?? EMPTY_ARTIFACTS : EMPTY_ARTIFACTS),
  );

  const isFirstMount = useFirstMount();

  const agentNameById = useMemo(
    () => new Map(agents.map((a) => [a.id, a.name])),
    [agents],
  );

  if (!msg) return null;

  const threadRuntimeMode = normalizeThreadRuntimeMode(currentThread?.runtime_mode, 'agent');
  const isClassicAssistant =
    msg.role === 'assistant' && threadRuntimeMode === 'classic' && !msg.agent;
  const assistantLabel = isClassicAssistant
    ? getChatModelLabel((msg.model as string | null) || currentThread?.selected_model || null)
    : msg.agent === 'guardian'
      ? 'Observer'
      : getAgentDisplayName(msg.agent, agentNameById);

  const attachedArtifacts = threadArtifacts.filter((artifact) => {
    if (artifact.source_message_id === msg.id) return true;
    if (artifact.source_message_id) return false;
    const aT = new Date(artifact.created_at).getTime();
    const mT = new Date(msg.created_at).getTime();
    if (mT > aT) return false;
    if (nextCreatedAt && new Date(nextCreatedAt).getTime() <= aT) return false;
    return true;
  });

  return (
    <div
      className={`msg-row${msg.role === 'user' ? ' msg-row--user' : ''}`}
      data-fresh={isFirstMount ? 'true' : undefined}
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
        {msg.thinking_content && showThinking && !isMultiModelThinking(msg.thinking_content) && (
          <ThinkingBlockComplete content={msg.thinking_content} />
        )}

        <RichBody source={msg.content} />

        {(() => {
          const md = (msg as any).metadata;
          if (md && md.kind === 'council_v2'
              && ((Array.isArray(md.proposers) && md.proposers.length > 0)
                  || (Array.isArray(md.crosstalk) && md.crosstalk.length > 0))) {
            return <CouncilPanel trace={md} />;
          }
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

        {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
          <div className="msg-attachments" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {msg.attachments.map((att, idx) => {
              const meta = (att.meta || {}) as any;
              if (att.type === 'image') {
                if (meta.kind === 'generate_image' || meta.kind === 'edit_image') {
                  return (
                    <ImageCard
                      key={idx}
                      src={att.url}
                      alt={meta.revised_prompt || meta.alt}
                      agent={meta.agent}
                      storagePath={meta.storage_path}
                      revisedPrompt={meta.revised_prompt}
                    />
                  );
                }
                return <ImagePreview key={idx} src={att.url} alt={meta.alt} agent={meta.agent} />;
              }
              if (att.type === 'code') return <CodePreviewCard key={idx} code={meta.code || ''} lang={meta.lang} label={meta.label} />;
              return <MessageAttachment key={idx} name={meta.name || 'file'} size={meta.size} mime={meta.mime} url={att.url} />;
            })}
          </div>
        )}

        {(() => {
          const md = (msg as any).metadata;
          const cites: Citation[] | undefined = md?.citations;
          if (Array.isArray(cites) && cites.length > 0) {
            return <SearchCitationsCard citations={cites} query={md?.search_query} />;
          }
          return null;
        })()}

        {attachedArtifacts.map((artifact) => (
          <ArtifactCard key={artifact.id} artifact={artifact} />
        ))}
      </div>
    </div>
  );
}

// Bare memo() — props are all primitives so default shallow compare is correct.
const MessageItem = React.memo(MessageItemImpl);
export default MessageItem;
