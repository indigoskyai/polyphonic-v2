// Phase L11.b — pending revisions inspector.
//
// Lists pending revisions Luca has been thinking about but hasn't surfaced
// yet. Power-user surface — most users won't open it, but seeing the queue
// is part of the trust positioning. Users can dismiss revisions (mark
// expired) or jump to the originating thread to let Luca surface them.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAgentScopeStore } from '@/stores/agentScopeStore';

type RevisionType = 'correction' | 'reconsideration' | 'new_thought' | 'disagreement' | string;

type PendingRevision = {
  id: string;
  thread_id: string;
  source_message_id: string | null;
  revision_type: RevisionType;
  what_was_said: string;
  what_to_say_now: string;
  rationale: string | null;
  status: string;
  created_at: string;
  surfaced_at: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  correction: 'Correction',
  reconsideration: 'Reconsideration',
  new_thought: 'New thought',
  disagreement: 'Disagreement',
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function ProfileRevisionsView() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { toast } = useToast();
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const activeAgentName = useAgentScopeStore((s) => s.availableAgents.find((a) => a.id === s.activeAgentId)?.name ?? 'Luca');
  const [revisions, setRevisions] = useState<PendingRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('pending_revisions')
      .select('id, thread_id, source_message_id, revision_type, what_was_said, what_to_say_now, rationale, status, created_at, surfaced_at')
      .eq('user_id', user.id)
      .eq('agent_id', activeAgentId)
      .in('status', ['pending', 'surfaced'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      if (!error.message.toLowerCase().includes('pending_revisions')) {
        toast({ title: 'Could not load revisions', description: error.message, variant: 'destructive' });
      }
      setRevisions([]);
    } else {
      setRevisions((data || []) as PendingRevision[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeAgentId]);

  async function dismissRevision(id: string) {
    setBusyId(id);
    const { error } = await supabase
      .from('pending_revisions')
      .update({ status: 'expired' })
      .eq('id', id);
    setBusyId(null);
    if (error) {
      toast({ title: 'Could not dismiss revision', description: error.message, variant: 'destructive' });
      return;
    }
    setRevisions((prev) => prev.filter((r) => r.id !== id));
  }

  const grouped = useMemo(() => {
    const buckets: Record<'pending' | 'surfaced', PendingRevision[]> = {
      pending: [],
      surfaced: [],
    };
    for (const r of revisions) {
      if (r.status === 'pending') buckets.pending.push(r);
      else if (r.status === 'surfaced') buckets.surfaced.push(r);
    }
    return buckets;
  }, [revisions]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div style={{ padding: '44px 48px 80px', maxWidth: 980 }}>
        <div style={{ marginBottom: 36 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 'var(--track-mono)',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            § L4 / revisions
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 42,
              lineHeight: 1,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            What {activeAgentName}'s been reconsidering
          </h1>
          <p
            style={{
              color: 'var(--text-body)',
              fontSize: 14,
              lineHeight: 1.7,
              maxWidth: 660,
              margin: '16px 0 0',
            }}
          >
            Sometimes {activeAgentName} will re-read what they said earlier and want to change something. Those reconsiderations live here until they&apos;re surfaced or expire.
          </p>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-ghost)', fontSize: 14 }}>Loading revisions...</p>
        ) : revisions.length === 0 ? (
          <section style={{ borderTop: '1px solid var(--border-faint)', padding: '28px 0' }}>
            <p style={{ color: 'var(--text-ghost)', fontSize: 14, lineHeight: 1.7, margin: 0 }}>
              Nothing pending. {activeAgentName} isn&apos;t sitting with second thoughts right now.
            </p>
          </section>
        ) : (
          <>
            {grouped.pending.length > 0 && (
              <section>
                <div style={sectionLabelStyle}>Pending</div>
                {grouped.pending.map((rev) => (
                  <RevisionCard
                    key={rev.id}
                    revision={rev}
                    busy={busyId === rev.id}
                    onDismiss={() => dismissRevision(rev.id)}
                    onOpenThread={() => navigate(`/chat/${rev.thread_id}`)}
                  />
                ))}
              </section>
            )}
            {grouped.surfaced.length > 0 && (
              <section style={{ marginTop: 36 }}>
                <div style={sectionLabelStyle}>Already surfaced</div>
                {grouped.surfaced.map((rev) => (
                  <RevisionCard
                    key={rev.id}
                    revision={rev}
                    busy={busyId === rev.id}
                    onDismiss={() => dismissRevision(rev.id)}
                    onOpenThread={() => navigate(`/chat/${rev.thread_id}`)}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RevisionCard({
  revision,
  busy,
  onDismiss,
  onOpenThread,
}: {
  revision: PendingRevision;
  busy: boolean;
  onDismiss: () => void;
  onOpenThread: () => void;
}) {
  const typeLabel = TYPE_LABEL[revision.revision_type] || revision.revision_type;
  return (
    <article
      style={{
        borderTop: '1px solid var(--border-faint)',
        padding: '24px 0 28px',
      }}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: 'var(--track-mono)',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            {typeLabel} · {formatTime(revision.created_at)}
            {revision.status === 'surfaced' && revision.surfaced_at && ` · surfaced ${formatTime(revision.surfaced_at)}`}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>What they said</div>
            <p style={quoteStyle}>{revision.what_was_said}</p>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>What they would say now</div>
            <p style={{ ...quoteStyle, color: 'var(--text-primary)' }}>{revision.what_to_say_now}</p>
          </div>
          {revision.rationale && (
            <div style={{ marginBottom: 4 }}>
              <div style={labelStyle}>Reason</div>
              <p style={{ ...quoteStyle, fontStyle: 'italic' }}>{revision.rationale}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2" style={{ minWidth: 140 }}>
          <button type="button" onClick={onOpenThread} style={primaryButtonStyle} disabled={busy}>
            Open thread
          </button>
          <button type="button" onClick={onDismiss} style={ghostButtonStyle} disabled={busy}>
            {busy ? 'Dismissing…' : 'Dismiss'}
          </button>
        </div>
      </div>
    </article>
  );
}

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 'var(--track-mono)',
  color: 'var(--text-ghost)',
  textTransform: 'uppercase',
  marginBottom: 4,
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  letterSpacing: 'var(--track-mono)',
  color: 'var(--text-ghost)',
  textTransform: 'uppercase',
  marginBottom: 4,
};

const quoteStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--text-body)',
  fontSize: 14,
  lineHeight: 1.65,
  maxWidth: 720,
};

const primaryButtonStyle: React.CSSProperties = {
  border: '1px solid var(--border-faint)',
  borderRadius: 8,
  background: 'var(--surface-raised)',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: 12.5,
};

const ghostButtonStyle: React.CSSProperties = {
  border: '1px solid var(--border-faint)',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--text-tertiary)',
  padding: '8px 12px',
  fontSize: 12.5,
};
