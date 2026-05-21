import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Hammer, Settings, Shuffle, X } from 'lucide-react';
import { Pill } from '@/components/ui/luca';
import { FORGE_DOC_ORDER, type ForgeProposalMetadata } from '@/lib/agentForge';

interface Props {
  proposal: ForgeProposalMetadata;
  busy?: boolean;
  error?: string | null;
  onCommit: () => void;
  onCancel: () => void;
  onRevise: () => void;
  onSwitch?: (agentId: string) => void;
  onOpenSettings?: (agentId: string) => void;
}

function statusLabel(status: ForgeProposalMetadata['forge_status']): string {
  if (status === 'approved') return 'Approved';
  if (status === 'canceled') return 'Canceled';
  if (status === 'failed') return 'Failed';
  if (status === 'committing') return 'Saving';
  return 'Pending approval';
}

export default function AgentForgeCard({
  proposal,
  busy = false,
  error,
  onCommit,
  onCancel,
  onRevise,
  onSwitch,
  onOpenSettings,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const { blueprint } = proposal;
  const actionLabel = proposal.forge_action === 'update' ? 'Update agent' : 'Create agent';
  const approvedAgentId = proposal.created_agent_id || proposal.target_agent_id || null;
  const docsPreview = useMemo(
    () => FORGE_DOC_ORDER.filter((doc) => blueprint.identity_docs?.[doc.id]),
    [blueprint.identity_docs],
  );

  return (
    <section className="forge-card" data-status={proposal.forge_status} aria-label={`${blueprint.name} Forge proposal`}>
      <header className="forge-card-header">
        <span className="forge-card-mark" aria-hidden="true">
          <Hammer size={14} />
        </span>
        <div className="forge-card-title-wrap">
          <div className="forge-card-kicker">Forge proposal</div>
          <h3 className="forge-card-title">{blueprint.name}</h3>
        </div>
        <span className="forge-card-status">{statusLabel(proposal.forge_status)}</span>
      </header>

      <div className="forge-card-grid">
        <div>
          <div className="forge-card-label">Role</div>
          <div className="forge-card-value">{blueprint.role}</div>
        </div>
        <div>
          <div className="forge-card-label">Model</div>
          <div className="forge-card-value">{blueprint.model}</div>
        </div>
        <div>
          <div className="forge-card-label">Voice</div>
          <div className="forge-card-value">{blueprint.voice_description || 'Quiet, direct, agent-specific.'}</div>
        </div>
        <div>
          <div className="forge-card-label">Continuity</div>
          <div className="forge-card-value">Standard Polyphonic substrate</div>
        </div>
      </div>

      <p className="forge-card-summary">{blueprint.summary}</p>

      <button className="forge-card-disclosure" type="button" onClick={() => setExpanded((value) => !value)}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{expanded ? 'Hide full blueprint' : 'Review full blueprint'}</span>
      </button>

      {expanded && (
        <div className="forge-card-docs">
          <div className="forge-card-doc">
            <div className="forge-card-doc-title">Runtime instructions</div>
            <pre>{blueprint.prompt}</pre>
          </div>
          {docsPreview.map((doc) => (
            <div className="forge-card-doc" key={doc.id}>
              <div className="forge-card-doc-title">{doc.label}</div>
              <pre>{blueprint.identity_docs[doc.id]}</pre>
            </div>
          ))}
        </div>
      )}

      {(error || proposal.error) && (
        <div className="forge-card-error">{error || proposal.error}</div>
      )}

      <footer className="forge-card-actions">
        {proposal.forge_status === 'pending' || proposal.forge_status === 'committing' ? (
          <>
            <Pill variant="primary" size="sm" icon={<Check size={13} />} onClick={onCommit} disabled={busy}>
              {busy ? 'Saving' : actionLabel}
            </Pill>
            <Pill variant="ghost" size="sm" icon={<Shuffle size={13} />} onClick={onRevise} disabled={busy}>
              Revise
            </Pill>
            <Pill variant="ghost" size="sm" icon={<X size={13} />} onClick={onCancel} disabled={busy}>
              Cancel
            </Pill>
          </>
        ) : null}

        {proposal.forge_status === 'approved' && approvedAgentId ? (
          <>
            {onSwitch && (
              <Pill variant="primary" size="sm" onClick={() => onSwitch(approvedAgentId)}>
                Switch to agent
              </Pill>
            )}
            {onOpenSettings && (
              <Pill variant="ghost" size="sm" icon={<Settings size={13} />} onClick={() => onOpenSettings(approvedAgentId)}>
                Open settings
              </Pill>
            )}
          </>
        ) : null}
      </footer>
    </section>
  );
}
