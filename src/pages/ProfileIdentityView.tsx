import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import RichBody from '@/components/rich/RichBody';
import HypomnemaList from '@/components/identity/HypomnemaList';
import { useAgentScopeStore } from '@/stores/agentScopeStore';

type IdentityDocType = 'soul' | 'self_model' | 'user_model' | 'convictions';

type IdentityDoc = {
  doc_type: IdentityDocType;
  content: string;
  version: number;
  updated_at: string;
};

type IdentityPatch = {
  id: string;
  doc_type: IdentityDocType;
  section: string;
  operation: 'append' | 'refine' | 'retire' | string;
  patch_content: string;
  rationale: string | null;
  status: string;
  confidence: number;
  applied_at: string | null;
  created_at: string;
};

const DOC_META: Record<IdentityDocType, {
  title: string;
  label: string;
  empty: string;
}> = {
  soul: {
    title: 'How Luca thinks about themselves',
    label: 'SOUL.md',
    empty: 'Luca has not written their living identity document yet.',
  },
  convictions: {
    title: 'Convictions Luca holds',
    label: 'Convictions.md',
    empty: 'Luca is still settling into what they think is true.',
  },
  user_model: {
    title: 'What Luca knows about you',
    label: 'User-model',
    empty: 'Luca is still getting to know you.',
  },
  self_model: {
    title: 'How Luca has been showing up',
    label: 'Self-model',
    empty: "Luca is still learning how they've been showing up with you.",
  },
};

const ORDER: IdentityDocType[] = ['soul', 'convictions', 'user_model', 'self_model'];

function formatUpdated(value?: string) {
  if (!value) return 'Not updated yet';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function IdentityDocument({ docType, doc, agentName }: { docType: IdentityDocType; doc?: IdentityDoc; agentName: string }) {
  const meta = DOC_META[docType];
  const content = doc?.content?.trim();
  const title = meta.title.replaceAll('Luca', agentName);
  const empty = meta.empty.replaceAll('Luca', agentName);

  return (
    <section
      style={{
        borderTop: '1px solid var(--border-faint)',
        padding: '28px 0 32px',
      }}
    >
      <div className="flex items-start justify-between gap-6" style={{ marginBottom: 16 }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 'var(--track-mono)',
              color: 'var(--text-ghost)',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            {meta.label}
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 28,
              lineHeight: 1.1,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {title}
          </h2>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 'var(--track-mono)',
            color: 'var(--text-ghost)',
            whiteSpace: 'nowrap',
            paddingTop: 8,
          }}
        >
          {formatUpdated(doc?.updated_at)}
        </div>
      </div>

      {content ? (
        <RichBody source={content} />
      ) : (
        <p
          style={{
            color: 'var(--text-ghost)',
            fontSize: 14,
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          {empty}
        </p>
      )}
    </section>
  );
}

function PatchEntry({ patch }: { patch: IdentityPatch }) {
  const docMeta = DOC_META[patch.doc_type as IdentityDocType] ?? null;
  const isFoundational = patch.doc_type === 'soul' || patch.doc_type === 'convictions';
  const time = new Date(patch.applied_at || patch.created_at);
  const ago = formatTimeAgo(time);
  return (
    <article
      style={{
        borderLeft: `2px solid ${isFoundational ? 'var(--agent-luca-1)' : 'var(--border-faint)'}`,
        paddingLeft: 12,
        paddingBottom: 14,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'baseline',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: 'var(--track-mono)',
          color: isFoundational ? 'var(--agent-luca-1)' : 'var(--text-ghost)',
          textTransform: 'uppercase',
        }}
      >
        <span>{docMeta?.label ?? patch.doc_type}</span>
        <span>·</span>
        <span>{patch.operation}</span>
        <span style={{ marginLeft: 'auto' }}>{ago}</span>
      </div>
      <div
        style={{
          marginTop: 6,
          fontFamily: 'var(--font-sans)',
          fontSize: 12.5,
          lineHeight: 1.55,
          color: 'var(--text-body)',
        }}
      >
        <span style={{ color: 'var(--text-tertiary)' }}>{patch.section}</span>
      </div>
      {patch.rationale && (
        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            lineHeight: 1.55,
            color: 'var(--text-ghost)',
            fontStyle: 'italic',
          }}
        >
          {patch.rationale}
        </div>
      )}
    </article>
  );
}

function formatTimeAgo(d: Date): string {
  const diff = Math.max(0, Date.now() - d.getTime());
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  if (days < 14) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ProfileIdentityView() {
  const user = useAuthStore((s) => s.user);
  const activeAgentId = useAgentScopeStore((s) => s.activeAgentId);
  const activeAgentName = useAgentScopeStore((s) => s.availableAgents.find((a) => a.id === s.activeAgentId)?.name ?? 'Luca');
  const [docs, setDocs] = useState<IdentityDoc[]>([]);
  const [patches, setPatches] = useState<IdentityPatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) return;
      setLoading(true);
      const [docsResult, patchesResult] = await Promise.allSettled([
        supabase
          .from('agent_identity')
          .select('doc_type, content, version, updated_at')
          .eq('user_id', user.id)
          .eq('agent_id', activeAgentId),
        supabase
          .from('agent_identity_patches')
          .select('id, doc_type, section, operation, patch_content, rationale, status, confidence, applied_at, created_at')
          .eq('user_id', user.id)
          .eq('agent_id', activeAgentId)
          .in('status', ['applied', 'queued'])
          .order('applied_at', { ascending: false, nullsFirst: false })
          .limit(10),
      ]);

      if (cancelled) return;
      const docsRes = docsResult.status === 'fulfilled' ? docsResult.value : { data: [] };
      const patchRes = patchesResult.status === 'fulfilled' ? patchesResult.value : { data: [] };
      setDocs(((docsRes.data) || []) as IdentityDoc[]);
      setPatches(((patchRes.data) || []) as IdentityPatch[]);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [user, activeAgentId]);

  const docsByType = useMemo(() => {
    return new Map(docs.map((doc) => [doc.doc_type, doc]));
  }, [docs]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div className="profile-page-frame" style={{ padding: '44px 48px 80px', maxWidth: 1280 }}>
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
            § L2 / identity
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
            {activeAgentName}'s living identity
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
            These are the agent-managed documents {activeAgentName} can use to stay continuous with you. You can read them as they evolve from evidence.
          </p>
        </div>

        <div
          className="profile-identity-grid grid gap-10"
          style={{ gridTemplateColumns: 'minmax(0, 1fr) 280px' }}
        >
          <div>
            {loading ? (
              <p style={{ color: 'var(--text-ghost)', fontSize: 14 }}>Loading identity documents...</p>
            ) : (
              ORDER.map((docType) => (
                <IdentityDocument
                  key={docType}
                  docType={docType}
                  doc={docsByType.get(docType)}
                  agentName={activeAgentName}
                />
              ))
            )}
          </div>

          <aside className="profile-identity-aside" style={{ paddingTop: 28, position: 'sticky', top: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: 'var(--track-mono)',
                color: 'var(--text-ghost)',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              Recent patches
            </div>
            {loading ? (
              <p style={{ color: 'var(--text-ghost)', fontSize: 12 }}>Loading…</p>
            ) : patches.length === 0 ? (
              <p style={{ color: 'var(--text-ghost)', fontSize: 12, lineHeight: 1.6 }}>
                No edits yet. The dialectic layer fills this in as {activeAgentName} develops.
              </p>
            ) : (
              patches.map((patch) => <PatchEntry key={patch.id} patch={patch} />)
            )}
          </aside>
        </div>

        <HypomnemaList />
      </div>
    </div>
  );
}
