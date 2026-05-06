// Side drawer showing the back-and-forth between Luca and the agent she's
// consulting (currently Anima; later Vektor + others). Each consultation
// renders as a question card from Luca paired with the response card from
// the consulted agent. Live as the consultation streams in via realtime.

import { useMemo } from 'react';
import {
  DrawerHeader,
  DrawerCrumb,
  DrawerTitle,
  DrawerEscChip,
  DrawerCloseBtn,
  DrawerBody,
  DrawerSection,
  DrawerSectionLabel,
} from '@/components/ui/luca';
import { useDrawerStore } from '@/stores/drawerStore';
import { useThreadStore } from '@/stores/threadStore';
import {
  useAgentConsultStore,
  selectByThread,
  type AgentConsultation,
} from '@/stores/agentConsultStore';
import RichBody from '@/components/rich/RichBody';

const AGENT_LABEL: Record<string, string> = {
  luca: 'Luca',
  anima: 'Anima',
  vektor: 'Vektor',
};

// Monochrome treatment matches the council panel and the wider chat
// aesthetic. Per-character chrome color is reserved for higher-order
// surfaces (sub-agent visualization, agent profile cards) where identity
// is the topic, not an observability detail.
const NEUTRAL_TINT = 'var(--text-tertiary)';

function agentLabel(agent: string): string {
  return AGENT_LABEL[agent.toLowerCase()] ?? agent.charAt(0).toUpperCase() + agent.slice(1);
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function StatusPill({ status }: { status: AgentConsultation['status'] }) {
  const text =
    status === 'pending' ? 'asking…' :
    status === 'completed' ? 'replied' :
    status === 'failed' ? 'failed' :
    status;
  const colour =
    status === 'pending' ? 'var(--text-ghost)' :
    status === 'failed' ? 'var(--danger, #c87575)' :
    'var(--text-tertiary)';
  return (
    <span
      className="agent-dialogue-status"
      style={{ color: colour }}
    >
      {text}
    </span>
  );
}

function ConsultationItem({ consult }: { consult: AgentConsultation }) {
  return (
    <article className="agent-dialogue-item">
      <div
        className="flex items-baseline justify-between"
        style={{ gap: 10 }}
      >
        <span className="agent-dialogue-meta">
          <span style={{ color: NEUTRAL_TINT }}>{agentLabel(consult.from_agent)}</span>
          {' → '}
          <span style={{ color: NEUTRAL_TINT }}>{agentLabel(consult.to_agent)}</span>
          {' · '}
          {formatTime(consult.created_at)}
        </span>
        <StatusPill status={consult.status} />
      </div>

      <div className="agent-dialogue-stack">
        <div className="agent-dialogue-quote">
          <div className="agent-dialogue-label">
            {agentLabel(consult.from_agent)} asked
          </div>
          <p className="drawer-copy">
            {consult.question}
          </p>
        </div>

        <div className="agent-dialogue-quote">
          <div className="agent-dialogue-label">
            {agentLabel(consult.to_agent)} {consult.status === 'pending' ? 'is thinking' : 'said'}
          </div>
          {consult.response ? (
            <RichBody source={consult.response} className="rich-body--compact" />
          ) : consult.status === 'failed' ? (
            <p className="drawer-copy drawer-copy--muted">
              {consult.error || 'No response captured.'}
            </p>
          ) : (
            <p className="drawer-copy drawer-copy--muted drawer-copy--italic">
              waiting for {agentLabel(consult.to_agent)}…
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export default function AgentDialogueDrawer() {
  const close = useDrawerStore((s) => s.close);
  const payload = useDrawerStore((s) => s.payload) as { threadId?: string } | null;
  const currentThreadId = useThreadStore((s) => s.currentThreadId);
  const threadId = payload?.threadId || currentThreadId;
  const consultations = useAgentConsultStore(selectByThread(threadId));

  const counts = useMemo(() => {
    const total = consultations.length;
    const pending = consultations.filter((c) => c.status === 'pending').length;
    return { total, pending };
  }, [consultations]);

  return (
    <>
      <DrawerHeader>
        <div className="drawer-header-col">
          <DrawerCrumb num={counts.pending || counts.total || '—'} label={counts.pending ? 'asking now' : counts.total ? 'consultations' : 'no consultations yet'} />
          <DrawerTitle>Agent dialogue</DrawerTitle>
        </div>
        <DrawerEscChip />
        <DrawerCloseBtn onClick={close} />
      </DrawerHeader>
      <DrawerBody>
        {consultations.length === 0 ? (
          <DrawerSection>
            <p className="drawer-copy drawer-copy--muted">
              When Luca reaches out to Anima or Vektor for a perspective during this conversation, the back-and-forth shows up here.
            </p>
          </DrawerSection>
        ) : (
          <DrawerSection>
            <DrawerSectionLabel>This thread</DrawerSectionLabel>
            {consultations.map((c) => (
              <ConsultationItem key={c.id} consult={c} />
            ))}
          </DrawerSection>
        )}
      </DrawerBody>
    </>
  );
}
