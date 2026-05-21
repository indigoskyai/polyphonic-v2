import React, { useEffect, useMemo } from 'react';
import { Pill, EmptyState } from '@/components/ui/luca';
import { useMemoryCandidatesStore } from '@/stores/memoryCandidatesStore';
import { useAuthStore } from '@/stores/authStore';
import { useAgentScopeStore } from '@/stores/agentScopeStore';
import CandidateCard from './CandidateCard';

function digestTitle(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Morning digest';
  if (h < 18) return 'Afternoon digest';
  return 'Evening digest';
}

export default function DigestView() {
  const user = useAuthStore((s) => s.user);
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const items = useMemoryCandidatesStore((s) => s.items);
  const loading = useMemoryCandidatesStore((s) => s.loading);
  const load = useMemoryCandidatesStore((s) => s.load);
  const subscribe = useMemoryCandidatesStore((s) => s.subscribe);
  const pin = useMemoryCandidatesStore((s) => s.pin);
  const commit = useMemoryCandidatesStore((s) => s.commit);
  const edit = useMemoryCandidatesStore((s) => s.edit);
  const reject = useMemoryCandidatesStore((s) => s.reject);

  useEffect(() => {
    if (!user) return;
    load(user.id, activeAgentId);
    const unsub = subscribe(user.id, activeAgentId);
    return unsub;
  }, [user, activeAgentId, load, subscribe]);

  const { pinGroup, standardGroup } = useMemo(() => {
    const pinGroup = items.filter((i) => i.candidate_type === 'pin');
    const standardGroup = items.filter((i) => i.candidate_type === 'standard');
    return { pinGroup, standardGroup };
  }, [items]);

  const approveAllStandard = async () => {
    for (const item of standardGroup) {
      // Fire in parallel-ish; store handles optimistic removal
      commit(item.id);
    }
  };

  return (
    <div className="digest-wrap">
      <h1 className="digest-title">{digestTitle()}</h1>
      <p className="digest-sub">
        {items.length === 0
          ? 'No candidates pending review.'
          : `${items.length} memory candidate${items.length === 1 ? '' : 's'} from today. Approve, reject, or edit each. Unreviewed after 48h will auto-commit as low-confidence.`}
      </p>

      {items.length === 0 && !loading && (
        <EmptyState
          text="Inbox zero."
          hint="Mnemos will surface new candidates as they form."
        />
      )}

      {pinGroup.length > 0 && (
        <section className="digest-section">
          <div className="digest-section-title">Pin candidates — worth keeping across all agents</div>
          {pinGroup.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              onPin={() => pin(c.id)}
              onCommit={() => commit(c.id)}
              onEdit={(patch) => edit(c.id, patch)}
              onReject={() => reject(c.id)}
            />
          ))}
        </section>
      )}

      {standardGroup.length > 0 && (
        <section className="digest-section">
          <div className="digest-section-title">New memories — standard commit</div>
          {standardGroup.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              onPin={() => pin(c.id)}
              onCommit={() => commit(c.id)}
              onEdit={(patch) => edit(c.id, patch)}
              onReject={() => reject(c.id)}
            />
          ))}
        </section>
      )}

      {standardGroup.length > 0 && (
        <div className="digest-footer">
          <Pill variant="ghost" size="sm" onClick={approveAllStandard}>
            Approve all standard
          </Pill>
        </div>
      )}
    </div>
  );
}
