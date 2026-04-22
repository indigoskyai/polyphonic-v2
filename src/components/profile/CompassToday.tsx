import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

interface PulsePayload {
  edge: { text: string; subtext: string | null; context: string | null } | null;
  question: string | null;
  pattern: string | null;
  generated_at?: string;
  cached?: boolean;
}

interface Props {
  /** Click on the question → opens the chat with the question prefilled. */
  onAskInChat?: (prompt: string) => void;
}

/**
 * Compass band — the "what to do today" layer of the Inner Cosmos.
 *
 * Three modules: Today's edge / Question to sit with / Pattern just noticed.
 * Renders fast: tries the edge function first, falls back to a quiet client
 * composition if the function 5xxs or times out.
 */
export default function CompassToday({ onAskInChat }: Props) {
  const user = useAuthStore((s) => s.user);
  const [pulse, setPulse] = useState<PulsePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function load(force: boolean) {
    if (!user) return;
    if (force) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error('no-session');

      const url =
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/profile-daily-pulse` +
        (force ? '?refresh=1' : '');

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`pulse-${res.status}`);
      const json = (await res.json()) as PulsePayload;
      setPulse(json);
    } catch {
      // Quiet client-side fallback so the band always renders something.
      await fallbackCompose();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function fallbackCompose() {
    if (!user) return;
    try {
      const [profileRes, engramsRes, qRes] = await Promise.all([
        supabase
          .from('psychological_profile')
          .select('growth_edges, shadow_patterns')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('engrams')
          .select('tags, created_at')
          .eq('user_id', user.id)
          .gte(
            'created_at',
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          )
          .limit(40),
        supabase
          .from('curiosity_questions')
          .select('question')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .limit(10),
      ]);

      const edges =
        (profileRes.data?.growth_edges as any)?.edges ??
        (Array.isArray(profileRes.data?.growth_edges)
          ? (profileRes.data?.growth_edges as any)
          : []);
      const edgeRaw = Array.isArray(edges) && edges.length ? edges[0] : null;
      const edgeText =
        edgeRaw?.title ||
        edgeRaw?.label ||
        edgeRaw?.content ||
        edgeRaw?.description ||
        'Notice what you avoid today. The avoidance is the data.';

      const unasked: string[] =
        (profileRes.data?.shadow_patterns as any)?.unasked_questions ?? [];
      const allQuestions = [
        ...unasked,
        ...((qRes.data ?? []).map((q: any) => q.question).filter(Boolean) as string[]),
      ];
      const question =
        allQuestions[0] ?? 'What did you flinch away from this week?';

      const tagCounts: Record<string, number> = {};
      for (const e of engramsRes.data ?? []) {
        for (const t of ((e.tags ?? []) as string[])) {
          tagCounts[t] = (tagCounts[t] ?? 0) + 1;
        }
      }
      const top = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0];
      const pattern = top
        ? `"${top[0]}" surfaced ${top[1]} times in the last day.`
        : 'Quiet day — few new memories. Stillness is also a pattern.';

      setPulse({
        edge: { text: edgeText, subtext: edgeRaw?.description ?? null, context: null },
        question,
        pattern,
        cached: false,
      });
    } catch {
      setPulse({
        edge: { text: 'Sit with one uncomfortable thought today.', subtext: null, context: null },
        question: 'What did you flinch away from this week?',
        pattern: 'Quiet day.',
        cached: false,
      });
    }
  }

  return (
    <div
      className="shrink-0"
      style={{
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-deep)',
        padding: '14px 24px 16px',
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div
          className="text-[10px] uppercase"
          style={{
            color: 'var(--text-ghost)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.14em',
          }}
        >
          compass · today
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          className="text-[9px] px-2 py-1 rounded"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            color: refreshing ? 'var(--text-ghost)' : 'var(--text-tertiary)',
            cursor: refreshing ? 'wait' : 'pointer',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
          }}
          title="Recompose today's pulse"
        >
          {refreshing ? 'refreshing…' : 'refresh'}
        </button>
      </div>

      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        }}
      >
        <CompassTile
          label="today's edge"
          loading={loading}
          accent="var(--luca)"
          body={pulse?.edge?.text ?? null}
          subtext={pulse?.edge?.subtext ?? pulse?.edge?.context ?? null}
        />
        <CompassTile
          label="question to sit with"
          loading={loading}
          accent="var(--guardian)"
          body={pulse?.question ?? null}
          interactive={!!pulse?.question && !!onAskInChat}
          onClick={() =>
            pulse?.question && onAskInChat?.(pulse.question)
          }
        />
        <CompassTile
          label="pattern just noticed"
          loading={loading}
          accent="var(--text-soft)"
          body={pulse?.pattern ?? null}
        />
      </div>
    </div>
  );
}

function CompassTile({
  label,
  body,
  subtext,
  loading,
  accent,
  interactive,
  onClick,
}: {
  label: string;
  body: string | null;
  subtext?: string | null;
  loading: boolean;
  accent: string;
  interactive?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={interactive ? onClick : undefined}
      className="relative"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        padding: '12px 14px 14px',
        minHeight: 90,
        cursor: interactive ? 'pointer' : 'default',
        transition: 'border-color 200ms ease, background 200ms ease',
      }}
      onMouseEnter={(e) => {
        if (interactive) (e.currentTarget as HTMLDivElement).style.borderColor = accent;
      }}
      onMouseLeave={(e) => {
        if (interactive)
          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-subtle)';
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 14,
          width: 4,
          height: 4,
          borderRadius: 4,
          background: accent,
          opacity: 0.55,
          boxShadow: `0 0 6px ${accent}`,
        }}
      />
      <div
        className="text-[9px] uppercase mb-2"
        style={{
          color: 'var(--text-ghost)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.12em',
          paddingLeft: 12,
        }}
      >
        {label}
      </div>
      {loading ? (
        <div
          className="text-[11px]"
          style={{
            color: 'var(--text-ghost)',
            fontFamily: 'var(--font-mono)',
            opacity: 0.5,
          }}
        >
          listening…
        </div>
      ) : (
        <>
          <div
            className="text-[12px]"
            style={{
              color: 'var(--text-body)',
              lineHeight: 1.55,
              letterSpacing: '0.005em',
            }}
          >
            {body ?? '—'}
          </div>
          {subtext && (
            <div
              className="text-[10px] mt-1.5"
              style={{
                color: 'var(--text-ghost)',
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}
            >
              {subtext}
            </div>
          )}
          {interactive && (
            <div
              className="text-[9px] mt-2"
              style={{
                color: 'var(--text-ghost)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.1em',
                opacity: 0.6,
              }}
            >
              click to ask →
            </div>
          )}
        </>
      )}
    </div>
  );
}
