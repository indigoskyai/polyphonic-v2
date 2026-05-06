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
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        letterSpacing: 'var(--track-mono)',
        textTransform: 'uppercase',
        color: colour,
      }}
    >
      {text}
    </span>
  );
}

function ConsultationItem({ consult }: { consult: AgentConsultation }) {
  return (
    <article
      style={{
        borderTop: '1px solid var(--border-faint)',
        padding: '20px 0 22px',
      }}
    >
      <div
        className="flex items-baseline justify-between"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: 'var(--track-mono)',
          color: 'var(--text-ghost)',
          textTransform: 'uppercase',
          marginBottom: 14,
          gap: 10,
        }}
      >
        <span>
          <span style={{ color: NEUTRAL_TINT }}>{agentLabel(consult.from_agent)}</span>
          {' → '}
          <span style={{ color: NEUTRAL_TINT }}>{agentLabel(consult.to_agent)}</span>
          {' · '}
          {formatTime(consult.created_at)}
        </span>
        <StatusPill status={consult.status} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            borderLeft: '2px solid var(--border-subtle)',
            paddingLeft: 12,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: 'var(--track-mono)',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {agentLabel(consult.from_agent)} asked
          </div>
          <p style={{ margin: 0, color: 'var(--text-body)', fontSize: 13.5, lineHeight: 1.6 }}>
            {consult.question}
          </p>
        </div>

        <div
          style={{
            borderLeft: '2px solid var(--border-subtle)',
            paddingLeft: 12,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: 'var(--track-mono)',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {agentLabel(consult.to_agent)} {consult.status === 'pending' ? 'is thinking' : 'said'}
          </div>
          {consult.response ? (
            <RichBody source={consult.response} className="rich-body--compact" />
          ) : consult.status === 'failed' ? (
            <p style={{ margin: 0, color: 'var(--text-ghost)', fontSize: 13.5, lineHeight: 1.6 }}>
              {consult.error || 'No response captured.'}
            </p>
          ) : (
            <p style={{ margin: 0, color: 'var(--text-ghost)', fontSize: 13.5, lineHeight: 1.6, fontStyle: 'italic' }}>
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
            <p style={{ color: 'var(--text-ghost)', fontSize: 13, lineHeight: 1.7 }}>
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
