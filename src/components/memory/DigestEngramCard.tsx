/**
 * DigestEngramCard — single reviewable engram in the daily digest.
 * Mirrors `.mn-cand` markup from the round-2 mockup.
 */
import { useState } from 'react';
import type { DigestEngram } from '@/stores/digestStore';
import { useAgentScopeStore, type AgentScope } from '@/stores/agentScopeStore';

interface Props {
  engram: DigestEngram;
  onConfirm: () => void;
  onReject: () => void;
  onEdit: (patch: { content?: string; tags?: string[] }) => void;
}

function rationaleFor(e: DigestEngram): string {
  const ctx = e.source_context ?? {};
  const reasons: string[] = [];
  if (typeof ctx.label === 'string') reasons.push(String(ctx.label));
  if (e.surprise_score >= 0.6) reasons.push(`high surprise (${e.surprise_score.toFixed(2)})`);
  if (Math.abs(e.emotional_valence) >= 0.5 || e.emotional_arousal >= 0.5) {
    const mood = e.emotional_valence < 0 ? 'difficult' : 'positive';
    reasons.push(`emotionally salient (${mood})`);
  }
  if (e.tags?.length) reasons.push(`tagged ${e.tags.slice(0, 3).join(', ')}`);
  if (reasons.length === 0) {
    reasons.push(`Surfaced because it crossed the salience threshold (s ${e.strength.toFixed(2)}).`);
  }
  return reasons.join(' · ');
}

const BUILT_IN_AGENT_LABELS: Record<string, string> = {
  luca: 'Luca',
  vektor: 'Vektor',
  anima: 'Anima',
  mnemos: 'Mnemos',
};

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function agentBadgeFor(e: DigestEngram, availableAgents: AgentScope[]): { id: string; label: string; tone: string } {
  const ctx = e.source_context ?? {};
  const id = cleanString(e.agent_id) ?? cleanString(ctx.agent_id) ?? cleanString(ctx.agent) ?? 'luca';
  const configured = availableAgents.find((agent) => agent.id === id);
  const label = configured?.name
    ?? cleanString(ctx.agent_name)
    ?? cleanString(ctx.agent_label)
    ?? BUILT_IN_AGENT_LABELS[id]
    ?? id;
  const tone = id === 'luca' || id === 'vektor' || id === 'anima' ? id : '';
  return { id, label, tone };
}

export default function DigestEngramCard({ engram, onConfirm, onReject, onEdit }: Props) {
  const availableAgents = useAgentScopeStore((s) => s.availableAgents);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(engram.content);
  const reviewed = !!engram.reviewed_at;
  const decision = engram.review_decision;
  const agent = agentBadgeFor(engram, availableAgents);

  const save = () => {
    const next = draft.trim();
    if (next && next !== engram.content) onEdit({ content: next });
    setEditing(false);
  };

  return (
    <div className="mn-cand" data-reviewed={reviewed ? decision : undefined}>
      <div className="mn-cand-head">
        <span className={`mn-cand-agent ${agent.tone}`} data-agent-id={agent.id} title={`Agent: ${agent.label}`}>
          {agent.label}
        </span>
        <span className="mn-cand-type">{engram.engram_type}</span>
        <span className="mn-cand-conf">{engram.strength.toFixed(2)}</span>
      </div>

      {editing ? (
        <textarea
          className="mn-cand-edit"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          autoFocus
        />
      ) : (
        <p className="mn-cand-content">{engram.content}</p>
      )}

      <p className="mn-cand-reason">{rationaleFor(engram)}</p>

      <div className="mn-cand-actions">
        {reviewed ? (
          <span className="mn-cand-decision" data-decision={decision}>
            {decision === 'confirmed' && '✓ confirmed'}
            {decision === 'rejected' && '× discarded'}
            {decision === 'edited' && '✎ edited'}
          </span>
        ) : editing ? (
          <>
            <button type="button" className="mn-action primary" onClick={save}>Save</button>
            <button type="button" className="mn-action ghost" onClick={() => { setDraft(engram.content); setEditing(false); }}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="mn-action primary" onClick={onConfirm}>Confirm</button>
            <button type="button" className="mn-action" onClick={() => setEditing(true)}>Modify</button>
            <button type="button" className="mn-action ghost" onClick={onReject}>Discard</button>
          </>
        )}
      </div>
    </div>
  );
}
