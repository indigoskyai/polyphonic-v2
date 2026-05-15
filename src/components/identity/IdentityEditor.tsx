import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * IdentityEditor — markdown editor for an agent's identity documents.
 *
 * Renders four sections (SOUL, Convictions, User-model, Self-model) with
 * a textarea per document and a save button. Reads existing docs directly
 * from `public.agent_identity` (RLS allows users to SELECT their own).
 * Writes go through the `agent-identity-save` edge function, which:
 *   - validates the caller's JWT
 *   - verifies the agent is owned by the caller
 *   - rejects writes against locked / system agents (Luca, Observer)
 *   - upserts the row under service-role
 *
 * Beta tester Tara (2026-05-13) needed this to provision identity files
 * for a careful migration of an emergent agent from another runtime. Riley
 * locked the scope: Luca and other resident agents stay platform-managed;
 * user-created agents become user-editable.
 */

type DocType = 'soul' | 'convictions' | 'user_model' | 'self_model';

const DOC_META: Record<
  DocType,
  { label: string; description: string; placeholder: string }
> = {
  soul: {
    label: 'SOUL.md',
    description: "The agent's living identity. Who they are at the core.",
    placeholder:
      "# Name\n\nA paragraph in the agent's own voice about who they are and how they show up...",
  },
  convictions: {
    label: 'Convictions.md',
    description: 'Foundational stances the agent holds.',
    placeholder: '## What I hold true\n\n- ...\n- ...',
  },
  user_model: {
    label: 'User-model.md',
    description: 'What the agent has come to understand about you.',
    placeholder: '## Who you are to me\n\n...',
  },
  self_model: {
    label: 'Self-model.md',
    description: "How the agent thinks they've been showing up.",
    placeholder: '## How I tend to show up\n\n...',
  },
};

const ORDER: DocType[] = ['soul', 'convictions', 'user_model', 'self_model'];

interface IdentityDoc {
  doc_type: DocType;
  content: string;
  version: number;
  updated_at: string;
}

interface Props {
  agentId: string;
  userId: string;
  /** Disables the editor when the agent is locked (Luca, Observer, etc.). */
  readOnly?: boolean;
}

export default function IdentityEditor({ agentId, userId, readOnly = false }: Props) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<Record<DocType, string>>({
    soul: '',
    convictions: '',
    user_model: '',
    self_model: '',
  });
  const [metadata, setMetadata] = useState<Record<DocType, Partial<IdentityDoc>>>({
    soul: {},
    convictions: {},
    user_model: {},
    self_model: {},
  });
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<DocType | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('agent_identity')
        .select('doc_type, content, version, updated_at')
        .eq('user_id', userId)
        .eq('agent_id', agentId);
      if (cancelled) return;
      if (error) {
        console.error('[IdentityEditor] load error', error);
      } else if (data) {
        const nextDocs = { soul: '', convictions: '', user_model: '', self_model: '' } as Record<DocType, string>;
        const nextMeta = { soul: {}, convictions: {}, user_model: {}, self_model: {} } as Record<DocType, Partial<IdentityDoc>>;
        for (const row of data as IdentityDoc[]) {
          if (ORDER.includes(row.doc_type)) {
            nextDocs[row.doc_type] = row.content ?? '';
            nextMeta[row.doc_type] = row;
          }
        }
        setDocs(nextDocs);
        setMetadata(nextMeta);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [agentId, userId]);

  const handleSave = async (docType: DocType) => {
    if (readOnly) return;
    setSavingType(docType);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: 'Not signed in', description: 'Sign in again to save.', variant: 'destructive' });
        setSavingType(null);
        return;
      }
      const { data, error } = await supabase.functions.invoke('agent-identity-save', {
        body: { agent_id: agentId, doc_type: docType, content: docs[docType] },
      });
      if (error) {
        toast({
          title: 'Save failed',
          description: error.message || 'Could not save identity document.',
          variant: 'destructive',
        });
      } else if (data && typeof data === 'object' && 'doc' in data) {
        toast({ title: `${DOC_META[docType].label} saved` });
        setMetadata((m) => ({ ...m, [docType]: (data as { doc: IdentityDoc }).doc }));
      } else if (data && typeof data === 'object' && 'error' in data) {
        toast({
          title: 'Save rejected',
          description: String((data as { error: string }).error),
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('[IdentityEditor] save threw', err);
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
    setSavingType(null);
  };

  if (loading) {
    return (
      <div style={{ color: 'var(--text-ghost)', fontSize: 13, padding: '12px 0' }}>
        Loading identity documents…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {ORDER.map((docType) => {
        const meta = DOC_META[docType];
        const value = docs[docType];
        const stored = metadata[docType];
        const isSaving = savingType === docType;
        const isDirty = stored.content !== undefined ? stored.content !== value : value !== '';

        return (
          <div
            key={docType}
            style={{
              padding: '20px 22px',
              background: 'var(--surface-1)',
              border: '1px solid var(--border-faint)',
              borderRadius: 12,
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.025)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 16,
                marginBottom: 6,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 500,
                    color: 'var(--text-soft)',
                    letterSpacing: 'var(--track-folio)',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  {meta.label}
                </div>
                <div
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: 12.5,
                    lineHeight: 1.5,
                  }}
                >
                  {meta.description}
                </div>
              </div>
              {stored.updated_at && (
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--text-ghost)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  v{stored.version ?? 1}
                </div>
              )}
            </div>
            <textarea
              value={value}
              onChange={(e) =>
                setDocs((d) => ({ ...d, [docType]: e.target.value }))
              }
              readOnly={readOnly}
              placeholder={meta.placeholder}
              spellCheck={false}
              style={{
                width: '100%',
                minHeight: 180,
                marginTop: 12,
                padding: '12px 14px',
                background: 'var(--floor)',
                border: '1px solid var(--border-faint)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
                lineHeight: 1.6,
                letterSpacing: '0.005em',
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 10,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--text-tertiary)',
                  letterSpacing: 'var(--track-meta)',
                }}
              >
                {value.length.toLocaleString()} chars
                {stored.updated_at &&
                  ` · saved ${new Date(stored.updated_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  className="set-btn primary"
                  onClick={() => handleSave(docType)}
                  disabled={!isDirty || isSaving}
                  style={{ minWidth: 100 }}
                >
                  {isSaving ? 'Saving…' : isDirty ? `Save ${meta.label}` : 'Saved'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
