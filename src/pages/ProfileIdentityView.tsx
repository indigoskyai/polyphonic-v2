import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import RichBody from '@/components/rich/RichBody';

type IdentityDocType = 'soul' | 'self_model' | 'user_model';

type IdentityDoc = {
  doc_type: IdentityDocType;
  content: string;
  version: number;
  updated_at: string;
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

const ORDER: IdentityDocType[] = ['soul', 'user_model', 'self_model'];

function formatUpdated(value?: string) {
  if (!value) return 'Not updated yet';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function IdentityDocument({ docType, doc }: { docType: IdentityDocType; doc?: IdentityDoc }) {
  const meta = DOC_META[docType];
  const content = doc?.content?.trim();

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
              fontFamily: 'var(--font-serif)',
              fontSize: 28,
              lineHeight: 1.1,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {meta.title}
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
          {meta.empty}
        </p>
      )}
    </section>
  );
}

export default function ProfileIdentityView() {
  const user = useAuthStore((s) => s.user);
  const [docs, setDocs] = useState<IdentityDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) return;
      setLoading(true);
      const { data } = await supabase
        .from('agent_identity')
        .select('doc_type, content, version, updated_at')
        .eq('user_id', user.id)
        .eq('agent_id', 'luca');

      if (!cancelled) {
        setDocs((data || []) as IdentityDoc[]);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user]);

  const docsByType = useMemo(() => {
    return new Map(docs.map((doc) => [doc.doc_type, doc]));
  }, [docs]);

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
            § L2 / identity
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 42,
              lineHeight: 1,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Luca's living identity
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
            These are the agent-managed documents Luca can use to stay continuous with you. You can read them. Luca writes them slowly, from evidence.
          </p>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-ghost)', fontSize: 14 }}>Loading identity documents...</p>
        ) : (
          ORDER.map((docType) => (
            <IdentityDocument
              key={docType}
              docType={docType}
              doc={docsByType.get(docType)}
            />
          ))
        )}
      </div>
    </div>
  );
}
