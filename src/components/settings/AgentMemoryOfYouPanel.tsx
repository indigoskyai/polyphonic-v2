/**
 * AgentMemoryOfYouPanel — read-only view of what this agent knows about you.
 *
 * Surfaces the `user_model` doc from agent_identity (the same source the
 * IdentityEditor edits when an agent is user-created). This panel is for the
 * "I'm managing Luca" flow — the user wants to see, on Luca's page, what
 * picture of them she's working from, without diving into a 4-tab editor.
 *
 * For locked resident agents (Luca, Observer) where the editor is hidden,
 * this is the only place the user can read the user_model.
 *
 * Pulls directly via supabase under the user's JWT (RLS lets users read
 * their own identity docs). No mutation here — editing lives in
 * IdentityEditor on editable agents.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  agentId: string;
  userId: string;
}

interface UserModelDoc {
  content: string;
  version: number;
  updated_at: string;
}

export default function AgentMemoryOfYouPanel({ agentId, userId }: Props) {
  const [doc, setDoc] = useState<UserModelDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const { data, error: queryErr } = await supabase
        .from('agent_identity')
        .select('content, version, updated_at')
        .eq('agent_id', agentId)
        .eq('user_id', userId)
        .eq('doc_type', 'user_model')
        .maybeSingle();

      if (cancelled) return;

      if (queryErr) {
        // Stale schemas (table absent) — fail quietly, treat as empty.
        if (queryErr.code !== '42P01' && !/agent_identity/i.test(queryErr.message ?? '')) {
          setError(queryErr.message);
        }
        setDoc(null);
      } else if (data) {
        setDoc(data as UserModelDoc);
      } else {
        setDoc(null);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [agentId, userId]);

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontSize: 12, color: 'var(--red-accent)', fontFamily: 'var(--font-mono)' }}>
        Could not load: {error}
      </div>
    );
  }

  if (!doc || !doc.content.trim()) {
    return (
      <div
        style={{
          fontSize: 13,
          color: 'var(--text-ghost)',
          fontStyle: 'italic',
          lineHeight: 1.6,
          padding: '8px 0',
        }}
      >
        No user-model written yet. As you talk, this agent will form an evolving picture of you —
        what you care about, how you tend to think, what to remember between sessions.
        The picture lives here once it exists.
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.7,
          color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap',
          fontFamily: 'var(--font-sans)',
          paddingLeft: 12,
          borderLeft: '1px solid var(--border-faint)',
        }}
      >
        {doc.content}
      </div>
      <div
        style={{
          marginTop: 16,
          display: 'flex',
          gap: 18,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--settings-mono-size)',
          color: 'var(--text-whisper)',
          letterSpacing: 'var(--track-folio)',
          textTransform: 'uppercase',
        }}
      >
        <span>v{doc.version}</span>
        <span>updated {new Date(doc.updated_at).toLocaleString()}</span>
      </div>
    </div>
  );
}
