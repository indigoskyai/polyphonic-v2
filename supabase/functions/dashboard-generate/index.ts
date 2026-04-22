// Dashboard generator: designs widget specs, writes daily Pulse, narrates data.
// Three modes: "design" | "pulse" | "narrate"
// Default model: openai/gpt-5 (design), google/gemini-3-flash-preview (pulse/narrate)
// Override: if user has OpenRouter key + override_model in body, route via OpenRouter.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const OPENROUTER_GATEWAY = 'https://openrouter.ai/api/v1/chat/completions';

// ─────────────────────────────────────────────────────────────────────
// Allowed query vocabulary — strict whitelist. AI may only emit these.
// ─────────────────────────────────────────────────────────────────────
const ALLOWED_TABLES = [
  'engrams',
  'beliefs',
  'mnemos_emotional_state',
  'thought_stream',
  'messages',
  'curiosity_questions',
  'connections',
  'memories',
] as const;

const ALLOWED_KINDS = [
  'metric',
  'timeline',
  'heatmap',
  'list',
  'scatter',
  'narrative',
  'comparison',
  'radial',
  'quote_stream',
] as const;

// ─────────────────────────────────────────────────────────────────────
// Tool schema for widget design (strict structured output)
// ─────────────────────────────────────────────────────────────────────
const designTool = {
  type: 'function',
  function: {
    name: 'design_widget',
    description: 'Design a dashboard widget spec from the user prompt.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ALLOWED_KINDS as unknown as string[] },
        title: { type: 'string', description: 'Short title, 2–6 words.' },
        subtitle: { type: 'string', description: 'Optional one-line caption.' },
        query: {
          type: 'object',
          properties: {
            table: { type: 'string', enum: ALLOWED_TABLES as unknown as string[] },
            select: {
              type: 'array',
              items: { type: 'string' },
              description: 'Column names to select.',
            },
            time_column: {
              type: 'string',
              description: 'Column to filter by date (e.g. created_at, recorded_at).',
            },
            time_range_days: {
              type: 'number',
              description: 'Number of days back from now. 0 means no time filter.',
            },
            order_by: { type: 'string', description: 'Column to sort by (with direction, e.g. "created_at desc").' },
            limit: { type: 'number', description: 'Row cap. Max 500.' },
            group_by: { type: 'string', description: 'Optional client-side group key (e.g. tag, day, hour, weekday).' },
            aggregate: {
              type: 'string',
              enum: ['count', 'avg', 'sum', 'min', 'max', 'none'],
              description: 'Aggregation across grouped rows.',
            },
            aggregate_column: { type: 'string', description: 'Column to aggregate (omit for count).' },
            tag_filter: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional tag whitelist applied client-side after fetch.',
            },
          },
          required: ['table'],
          additionalProperties: false,
        },
        render_hints: {
          type: 'object',
          properties: {
            palette: { type: 'string', enum: ['neutral', 'warm', 'cool', 'luca'] },
            density: { type: 'string', enum: ['quiet', 'normal', 'dense'] },
            sparkline: { type: 'boolean' },
            unit: { type: 'string', description: 'Optional unit suffix for metric/comparison values.' },
            text: { type: 'string', description: 'For narrative: the actual paragraph (string).' },
          },
        },
      },
      required: ['kind', 'title', 'query'],
      additionalProperties: false,
    },
  },
};

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function sanitizeSpec(spec: any): any {
  if (!spec || typeof spec !== 'object') throw new Error('Invalid spec');
  if (!ALLOWED_KINDS.includes(spec.kind)) throw new Error(`Invalid kind: ${spec.kind}`);
  if (!spec.query?.table || !ALLOWED_TABLES.includes(spec.query.table)) {
    throw new Error(`Invalid table: ${spec.query?.table}`);
  }
  if (typeof spec.query.limit === 'number') spec.query.limit = Math.min(500, Math.max(1, spec.query.limit));
  if (typeof spec.query.time_range_days === 'number') {
    spec.query.time_range_days = Math.max(0, Math.min(3650, spec.query.time_range_days));
  }
  return spec;
}

async function callGateway(opts: {
  apiKey: string;
  url: string;
  model: string;
  messages: any[];
  tools?: any[];
  tool_choice?: any;
}) {
  const body: any = { model: opts.model, messages: opts.messages };
  if (opts.tools) body.tools = opts.tools;
  if (opts.tool_choice) body.tool_choice = opts.tool_choice;
  const res = await fetch(opts.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 300)}`);
  }
  return await res.json();
}

// Minimal context summary so the model knows what's actually in the user's data.
async function buildUserContext(supa: any, userId: string): Promise<string> {
  try {
    const [{ count: engramCount }, { count: beliefCount }, { count: msgCount }] = await Promise.all([
      supa.from('engrams').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supa.from('beliefs').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supa.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    return `User has ~${engramCount ?? 0} engrams, ~${beliefCount ?? 0} beliefs, ~${msgCount ?? 0} messages.`;
  } catch {
    return '';
  }
}

const DESIGN_SYSTEM = `You are a dashboard widget designer for a personal psychology / introspection app.

You design data-bound widgets from a user's natural-language prompt. You DO NOT write code.
You emit a single tool call to design_widget with a strict spec.

Available tables (all scoped to the current user automatically):
- engrams(content, tags, emotional_valence, emotional_arousal, surprise_score, strength, stability, engram_type, created_at, last_accessed_at)
- beliefs(content, confidence, domain, tags, active, stagnant, created_at, last_revised, last_challenged)
- mnemos_emotional_state(valence, arousal, dominance, certainty, social, temporal, recorded_at)
- thought_stream(content, type, source, salience, trigger, created_at)
- messages(content, role, agent, model, created_at, tokens_used)
- curiosity_questions(question, context, status, curiosity_score, created_at)
- connections(source_id, target_id, connection_type, weight, created_at)
- memories(content, memory_type, confidence, tags, emotional_valence, emotional_intensity, created_at)

Widget kinds:
- metric        → single big number (use aggregate: count/avg/sum, optional sparkline)
- timeline      → x = time bucket, y = count or avg of a column (group_by: day/week/hour)
- heatmap       → x = day-of-week or hour, y = week or day, intensity = count
- list          → top-N items (e.g. tags, beliefs, questions)
- narrative     → AI writes a short paragraph FROM the data (put paragraph in render_hints.text? NO — narrate mode handles that. Just specify the query.)
- comparison    → small number of grouped values to compare bars
- radial        → 24-spoke or N-spoke radial of group_by counts
- quote_stream  → vertical list of memorable text snippets (engrams, messages, thoughts)

Rules:
- Pick the right kind for the prompt. Prefer simpler over fancier.
- Always set time_column when filtering by recency (created_at, recorded_at, etc).
- Default time_range_days: 30 if not specified. Set 0 for "all time".
- Set limit ≤ 500, typically 50–200.
- Title is 2–6 words, sentence case, no quotes.
- subtitle is optional, ≤ 80 chars.
- For "metric" kind: set aggregate (count/avg/sum) and aggregate_column if needed.
- For "narrative" kind: just specify the query — the system will run it and AI will narrate from results.
- render_hints.palette default is "luca".`;

const PULSE_SYSTEM = `You write the daily "Pulse" for a personal introspection app.

Given the user's recent emotional states, recent memories (engrams), and growth edges, write:
1. ONE short paragraph (max 60 words) reading their inner state right now in second person ("you have…").
2. ONE specific suggested thing to notice today (max 25 words, imperative voice).

Return JSON: { "paragraph": "...", "action": "..." }
Do NOT use markdown, emojis, or generic platitudes. Be specific to the data.`;

const NARRATE_SYSTEM = `You are summarizing a user's personal data into a short reflective paragraph.

Given the widget title, the user's prompt, and the raw data rows, write 2–4 sentences (max 80 words)
that answer the prompt directly using the data. Be specific. Reference actual counts/values when relevant.
No markdown, no emojis, no preamble. Return only the paragraph text.`;

// ─────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Missing auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supa = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const mode: 'design' | 'pulse' | 'narrate' = body.mode ?? 'design';
    const overrideModel: string | undefined = body.model;
    const useOpenRouter: boolean = !!body.use_openrouter;

    // Resolve API key + endpoint
    let apiKey = Deno.env.get('LOVABLE_API_KEY') ?? '';
    let endpoint = LOVABLE_GATEWAY;
    if (useOpenRouter) {
      const { data: keyData } = await supa.rpc('decrypt_user_api_key', { p_user_id: userId });
      if (keyData) {
        apiKey = String(keyData);
        endpoint = OPENROUTER_GATEWAY;
      }
    }
    if (!apiKey) return new Response(JSON.stringify({ error: 'No AI key configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // ───── PULSE MODE ─────
    if (mode === 'pulse') {
      const force = !!body.refresh;
      const today = new Date().toISOString().slice(0, 10);
      if (!force) {
        const { data: cached } = await supa
          .from('profile_daily_pulse')
          .select('payload, updated_at')
          .eq('user_id', userId).eq('day', today).maybeSingle();
        if (cached?.payload) {
          return new Response(JSON.stringify({ cached: true, ...cached.payload, updated_at: cached.updated_at }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      const [emoRes, engRes, profRes] = await Promise.all([
        supa.from('mnemos_emotional_state').select('valence, arousal, certainty, recorded_at').eq('user_id', userId).order('recorded_at', { ascending: false }).limit(20),
        supa.from('engrams').select('content, tags, emotional_valence, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(15),
        supa.from('psychological_profile').select('growth_edges, identity_narrative').eq('user_id', userId).maybeSingle(),
      ]);

      const ctx = {
        recent_emotion: emoRes.data ?? [],
        recent_engrams: (engRes.data ?? []).map((e: any) => ({ content: String(e.content ?? '').slice(0, 220), tags: e.tags, valence: e.emotional_valence })),
        identity: (profRes.data as any)?.identity_narrative?.slice(0, 400) ?? null,
        growth_edges: (profRes.data as any)?.growth_edges ?? null,
      };

      const model = overrideModel ?? 'google/gemini-3-flash-preview';
      const aiRes = await callGateway({
        apiKey, url: endpoint, model,
        messages: [
          { role: 'system', content: PULSE_SYSTEM },
          { role: 'user', content: `Context (JSON):\n${JSON.stringify(ctx).slice(0, 6000)}\n\nReturn ONLY valid JSON: { "paragraph": "...", "action": "..." }` },
        ],
      });

      const text = aiRes.choices?.[0]?.message?.content ?? '';
      let parsed: { paragraph: string; action: string };
      try {
        const cleaned = text.replace(/```json\s*|\s*```/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { paragraph: text.slice(0, 400), action: 'Notice what you avoid today.' };
      }

      const payload = { ...parsed, generated_at: new Date().toISOString() };
      await supa.from('profile_daily_pulse').upsert({ user_id: userId, day: today, payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' });
      return new Response(JSON.stringify({ cached: false, ...payload }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ───── DESIGN MODE ─────
    if (mode === 'design') {
      const prompt: string = String(body.prompt ?? '').slice(0, 1000);
      if (!prompt.trim()) return new Response(JSON.stringify({ error: 'Empty prompt' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const ctxLine = await buildUserContext(supa, userId);
      const model = overrideModel ?? 'openai/gpt-5';

      const aiRes = await callGateway({
        apiKey, url: endpoint, model,
        messages: [
          { role: 'system', content: DESIGN_SYSTEM },
          { role: 'user', content: `${ctxLine}\n\nUser prompt: ${prompt}\n\nDesign one widget. Call the tool.` },
        ],
        tools: [designTool],
        tool_choice: { type: 'function', function: { name: 'design_widget' } },
      });

      const toolCall = aiRes.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error('Model did not return a widget spec');
      const rawSpec = JSON.parse(toolCall.function.arguments);
      const spec = sanitizeSpec(rawSpec);

      return new Response(JSON.stringify({ spec, model }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ───── NARRATE MODE ─────
    if (mode === 'narrate') {
      const widgetTitle: string = String(body.title ?? '').slice(0, 200);
      const widgetPrompt: string = String(body.prompt ?? '').slice(0, 500);
      const rows: any[] = Array.isArray(body.rows) ? body.rows.slice(0, 50) : [];
      const model = overrideModel ?? 'google/gemini-3-flash-preview';

      const aiRes = await callGateway({
        apiKey, url: endpoint, model,
        messages: [
          { role: 'system', content: NARRATE_SYSTEM },
          { role: 'user', content: `Widget: ${widgetTitle}\nUser prompt: ${widgetPrompt}\n\nData (JSON):\n${JSON.stringify(rows).slice(0, 6000)}` },
        ],
      });
      const text = aiRes.choices?.[0]?.message?.content ?? '';
      return new Response(JSON.stringify({ text: text.trim() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown mode' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('dashboard-generate error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
