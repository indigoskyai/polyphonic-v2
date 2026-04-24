import React, { useState } from 'react';
import { Pill, Textarea, Select } from '@/components/ui/luca';
import type { MemoryCandidate } from '@/stores/memoryCandidatesStore';

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

function agentFromSource(source: Record<string, unknown> | null): string {
  const a = (source?.agent as string | undefined)?.toLowerCase();
  if (a === 'vektor' || a === 'anima' || a === 'mnemos') return a;
  return 'luca';
}

export default function CandidateCard({ candidate, onPin, onCommit, onEdit, onReject }: Props) {
  const [editing, setEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(candidate.content);
  const [draftType, setDraftType] = useState(candidate.memory_type);

  const agent = agentFromSource(candidate.source);
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
        <span className="cand-agent-dot" data-agent={agent} aria-hidden="true" />
        <span className="cand-agent">{agent}</span>
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
