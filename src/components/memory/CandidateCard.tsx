import React, { useState } from 'react';
import { Pill, Textarea, Select } from '@/components/ui/luca';
import type { MemoryCandidate } from '@/stores/memoryCandidatesStore';
import { useAgentScopeStore, type AgentScope } from '@/stores/agentScopeStore';

interface Props {
  candidate: MemoryCandidate;
  onPin: () => void;
  onCommit: () => void;
  onEdit: (patch: { content?: string; memory_type?: string }) => void;
  onReject: () => void;
}

const MEMORY_TYPES = [
  { value: 'fact', label: 'fact' },
  { value: 'preference', label: 'preference' },
  { value: 'pattern', label: 'pattern' },
  { value: 'context', label: 'context' },
  { value: 'goal', label: 'goal' },
  { value: 'relationship', label: 'relationship' },
  { value: 'principle', label: 'principle' },
];

const BUILT_IN_AGENT_LABELS: Record<string, string> = {
  luca: 'Luca',
  vektor: 'Vektor',
  anima: 'Anima',
  mnemos: 'Mnemos',
};

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function agentBadgeFor(candidate: MemoryCandidate, availableAgents: AgentScope[]): { id: string; label: string; tone: string } {
  const source = candidate.source ?? {};
  const id = cleanString(candidate.agent_id) ?? cleanString(source.agent_id) ?? cleanString(source.agent) ?? 'luca';
  const configured = availableAgents.find((agent) => agent.id === id);
  const label = configured?.name
    ?? cleanString(source.agent_name)
    ?? cleanString(source.agent_label)
    ?? BUILT_IN_AGENT_LABELS[id]
    ?? id;
  const tone = id === 'luca' || id === 'vektor' || id === 'anima' || id === 'mnemos' ? id : '';
  return { id, label, tone };
}

export default function CandidateCard({ candidate, onPin, onCommit, onEdit, onReject }: Props) {
  const availableAgents = useAgentScopeStore((s) => s.availableAgents);
  const [editing, setEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(candidate.content);
  const [draftType, setDraftType] = useState(candidate.memory_type);

  const agent = agentBadgeFor(candidate, availableAgents);
  const isPin = candidate.candidate_type === 'pin';

  const startEdit = () => {
    setDraftContent(candidate.content);
    setDraftType(candidate.memory_type);
    setEditing(true);
  };

  const saveEdit = () => {
    const patch: { content?: string; memory_type?: string } = {};
    if (draftContent.trim() && draftContent !== candidate.content) patch.content = draftContent.trim();
    if (draftType && draftType !== candidate.memory_type) patch.memory_type = draftType;
    if (Object.keys(patch).length > 0) onEdit(patch);
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraftContent(candidate.content);
    setDraftType(candidate.memory_type);
    setEditing(false);
  };

  return (
    <article className="candidate">
      <header className="cand-header">
        <span className="cand-agent-dot" data-agent={agent.tone || agent.id} aria-hidden="true" />
        <span className="cand-agent" title={`Agent: ${agent.label}`}>{agent.label}</span>
        <span className="cand-type">{candidate.memory_type}</span>
        <span className="cand-conf">{candidate.confidence.toFixed(2)}</span>
      </header>

      {editing ? (
        <div className="cand-edit">
          <Textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            rows={3}
          />
          <div className="cand-edit__type">
            <span className="cand-edit__type-label">type</span>
            <Select
              value={draftType}
              onChange={setDraftType}
              options={MEMORY_TYPES}
            />
          </div>
        </div>
      ) : (
        <div className="cand-content">{candidate.content}</div>
      )}

      <div className="cand-reason">{candidate.rationale}</div>

      <div className="cand-actions">
        {editing ? (
          <>
            <Pill variant="primary" size="sm" onClick={saveEdit}>Save</Pill>
            <Pill variant="ghost" size="sm" onClick={cancelEdit}>Cancel</Pill>
          </>
        ) : (
          <>
            <Pill variant="primary" size="sm" onClick={isPin ? onPin : onCommit}>
              {isPin ? 'Pin' : 'Commit'}
            </Pill>
            <Pill variant="secondary" size="sm" onClick={startEdit}>Edit</Pill>
            <Pill variant="ghost" size="sm" onClick={onReject}>Reject</Pill>
          </>
        )}
      </div>
    </article>
  );
}
