// Composes "today's edge / question / pattern" for the Compass band.
// Cached per-user per-day in profile_daily_pulse.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function todayISO() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function pickRotating<T>(arr: T[], dayKey: string): T | null {
  if (!arr?.length) return null;
  // Stable hash from yyyy-mm-dd → index, so the same item shows for the whole day.
  let h = 0;
  for (let i = 0; i < dayKey.length; i++) h = ((h << 5) - h + dayKey.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;
    const day = todayISO();
    const force = new URL(req.url).searchParams.get('refresh') === '1';

    // 1. Cache hit unless ?refresh=1
    if (!force) {
      const { data: cached } = await supabase
        .from('profile_daily_pulse')
        .select('payload, updated_at')
        .eq('user_id', userId)
        .eq('day', day)
        .maybeSingle();
      if (cached?.payload) {
        return new Response(
          JSON.stringify({ cached: true, ...cached.payload, updated_at: cached.updated_at }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // 2. Compose fresh pulse from existing tables
    const [profileRes, engramRes, emoRes, questionRes] = await Promise.all([
      supabase
        .from('psychological_profile')
        .select('growth_edges, shadow_patterns, identity_narrative')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('engrams')
        .select('content, tags, emotional_valence, created_at')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('mnemos_emotional_state')
        .select('valence, arousal, certainty, recorded_at')
        .eq('user_id', userId)
        .gte('recorded_at', new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString())
        .order('recorded_at', { ascending: false }),
      supabase
        .from('curiosity_questions')
        .select('question, context')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .limit(20),
    ]);

    const profile = profileRes.data ?? {};
    const recentEngrams = engramRes.data ?? [];
    const emoStates = emoRes.data ?? [];
    const questions = questionRes.data ?? [];

    // ── Today's edge: choose a growth edge informed by recent emotional drift
    const edges: any[] = Array.isArray((profile as any).growth_edges)
      ? (profile as any).growth_edges
      : (profile as any).growth_edges?.edges ?? [];
    const edge = pickRotating(edges, day);

    let edgeText = 'Notice what you avoid today. The avoidance is the data.';
    let edgeSubtext: string | null = null;
    if (edge) {
      edgeText = edge.title || edge.label || edge.content || edge.description || edgeText;
      edgeSubtext = edge.description && edge.description !== edgeText ? edge.description : null;
    }

    // Emotional context modifier
    const avgArousal =
      emoStates.length > 0
        ? emoStates.reduce((s, e) => s + (e.arousal ?? 0), 0) / emoStates.length
        : 0;
    const avgValence =
      emoStates.length > 0
        ? emoStates.reduce((s, e) => s + (e.valence ?? 0), 0) / emoStates.length
        : 0;
    let context: string | null = null;
    if (avgArousal > 0.45) context = 'Your arousal has been elevated for several days.';
    else if (avgValence < -0.2) context = 'Valence has trended low this week.';
    else if (avgValence > 0.3) context = 'You have been on a warm-valence stretch.';

    // ── Question to sit with
    const unaskedFromShadow: string[] = Array.isArray(
      (profile as any).shadow_patterns?.unasked_questions,
    )
      ? (profile as any).shadow_patterns.unasked_questions
      : [];
    const allQuestions = [
      ...unaskedFromShadow,
      ...questions.map((q: any) => q.question).filter(Boolean),
    ];
    const question =
      pickRotating(allQuestions, day) ??
      'What did you flinch away from this week?';

    // ── Pattern just noticed
    let pattern: string | null = null;
    if (recentEngrams.length >= 3) {
      const tagCounts: Record<string, number> = {};
      for (const e of recentEngrams) {
        for (const t of (e.tags ?? []) as string[]) {
          tagCounts[t] = (tagCounts[t] ?? 0) + 1;
        }
      }
      const top = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 2) {
        pattern = `"${top[0]}" surfaced ${top[1]} times in the last day — it is sitting close to the surface.`;
      } else {
        pattern = `${recentEngrams.length} new memories formed in the last 24h.`;
      }
    } else {
      pattern = 'Quiet day — few new memories. Stillness is also a pattern.';
    }

    const payload = {
      edge: { text: edgeText, subtext: edgeSubtext, context },
      question,
      pattern,
      generated_at: new Date().toISOString(),
    };

    // 3. Upsert cache
    await supabase
      .from('profile_daily_pulse')
      .upsert(
        { user_id: userId, day, payload, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,day' },
      );

    return new Response(JSON.stringify({ cached: false, ...payload }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
