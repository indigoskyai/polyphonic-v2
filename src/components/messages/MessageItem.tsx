import React, { useMemo } from 'react';
import { useThreadStore } from '@/stores/threadStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { useArtifactStore } from '@/stores/artifactStore';
import RichBody from '@/components/rich/RichBody';
import CouncilPanel from '@/components/messages/CouncilPanel';
import MessageAttachment from '@/components/attachments/MessageAttachment';
import ImagePreview from '@/components/attachments/ImagePreview';
import CodePreviewCard from '@/components/attachments/CodePreviewCard';
import ArtifactCard from '@/components/canvas/ArtifactCard';
import { useFirstMount } from '@/lib/useFirstMount';
import ThinkingBlock from '@/components/messages/ThinkingBlock';

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
  /** Only messages appended in the current session should animate on mount. */
  animateOnMount?: boolean;
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
function MessageItemImpl({ messageId, nextCreatedAt, isLast, animateOnMount = false }: Props) {
  const msg = useThreadStore((s) => s.messages.find((m) => m.id === messageId));
  const showThinking = useSettingsStore((s) => s.show_thinking);
  const showTimestamps = useSettingsStore((s) => s.show_timestamps);
  const agents = useAgentSettingsStore((s) => s.agents);
  const currentThreadId = useThreadStore((s) => s.currentThreadId);
  const threadArtifacts = useArtifactStore(
    (s) => (currentThreadId ? s.byThread[currentThreadId] ?? EMPTY_ARTIFACTS : EMPTY_ARTIFACTS),
  );

  const isFirstMount = useFirstMount();

  const agentNameById = useMemo(
    () => new Map(agents.map((a) => [a.id, a.name])),
    [agents],
  );

  if (!msg) return null;

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
      className="msg-row"
      data-fresh={animateOnMount && isFirstMount ? 'true' : undefined}
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
          <ThinkingBlock content={msg.thinking_content} state="complete" />
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
              if (att.type === 'image') return <ImagePreview key={idx} src={att.url} alt={meta.alt} agent={meta.agent} />;
              if (att.type === 'code') return <CodePreviewCard key={idx} code={meta.code || ''} lang={meta.lang} label={meta.label} />;
              return <MessageAttachment key={idx} name={meta.name || 'file'} size={meta.size} mime={meta.mime} url={att.url} />;
            })}
          </div>
        )}

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
