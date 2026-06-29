import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { applyMarkdownPatch, type DialecticPatch } from "../_shared/mnemos/dialectic.ts";
import {
  callMcpTool,
  loadMcpToolRegistrations,
  type McpToolRegistration,
} from "../_shared/mcp/client.ts";

const FORGE_AGENT_BLUEPRINT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Display name for the agent, 40 characters or fewer." },
    role: { type: "string", description: "Short functional role, for example researcher, coach, editor, analyst." },
    model: {
      type: "string",
      enum: [
        "anthropic/claude-opus-4-7",
        "anthropic/claude-sonnet-4.6",
        "anthropic/claude-haiku-4.5",
        "openai/gpt-5.5",
        "openai/gpt-5.4",
        "openai/gpt-5.4-mini",
        "google/gemini-3.1-pro-preview",
        "google/gemini-3-flash-preview",
        "google/gemini-2.5-pro",
        "google/gemini-2.5-flash",
        "x-ai/grok-4.20",
        "deepseek/deepseek-v4-pro",
        "deepseek/deepseek-v4-flash",
        "moonshotai/kimi-k2.6",
        "moonshotai/kimi-k2.5",
      ],
      description: "Runtime model id.",
    },
    avatar_color: { type: "string", enum: ["cream", "ochre", "blue", "magenta", "sage", "violet"] },
    prompt: { type: "string", description: "Full runtime system instructions for this agent." },
    voice_description: { type: "string", description: "Short voice/personality summary." },
    summary: { type: "string", description: "One-paragraph identity summary shown in the proposal card." },
    identity_docs: {
      type: "object",
      properties: {
        soul: { type: "string", description: "SOUL.md: identity, orientation, and way of being." },
        convictions: { type: "string", description: "Convictions.md: stable stances and beliefs this agent acts from." },
        user_model: { type: "string", description: "User-model.md: how this agent should understand and care for the user." },
        self_model: { type: "string", description: "Self-model.md: how this agent understands its own patterns and limits." },
      },
      required: ["soul", "convictions", "user_model", "self_model"],
    },
  },
  required: ["name", "role", "model", "avatar_color", "prompt", "voice_description", "summary", "identity_docs"],
};

const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web through Perplexity Sonar. Returns a synthesized answer with citations, not raw page content. Use to discover sources or get current overviews, then use read_url to verify exact source text when accuracy matters.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_url",
      description: "Directly fetch a public http(s) URL and return source content/metadata without model synthesis. Use for raw HTML, JSON, text files, or verifying a specific cited source. Use browse for JavaScript-rendered pages or interactive sites.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to read" },
          focus: { type: "string", description: "What to focus on (optional)" },
          format: { type: "string", enum: ["text", "raw"], description: "Use text for extracted readable text, raw for the unmodified response body." },
          max_chars: { type: "integer", description: "Maximum characters to return, default 12000." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browse",
      description: "Open a public http(s) page in a Browserbase browser, allow JavaScript to render, and inspect the DOM. Returns visible text, final URL, title, headings, links, buttons, and forms without model synthesis. Use when read_url is insufficient for dynamic/browser-rendered pages.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "What you are trying to accomplish on the site" },
          starting_url: { type: "string", description: "URL to start from" },
          max_steps: { type: "integer", default: 10, description: "Reserved action budget for the browse attempt" },
          wait_ms: { type: "integer", default: 2500, description: "Milliseconds to wait for page rendering before inspection" },
        },
        required: ["goal", "starting_url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "the_well_research",
      description:
        "Query Luca's structured registry of The Well physics simulation datasets. Use when the user asks which physics simulation dataset can test a claim, how Luca should use The Well, what dataset/access name/fields/measurements apply, or how to create a reproducible simulated-evidence truth card. Returns catalog metadata and access recipes only; does not download raw tensors.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Research question, claim, phenomenon, or physics simulation need." },
          dataset_id: { type: "string", description: "Optional known Well family id or exact variant access name." },
          limit: { type: "integer", default: 5, description: "Number of candidate datasets to return." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "workspace_file",
      description: "Read, write, list, or delete files in the user's persistent workspace.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["read", "write", "list", "delete"] },
          path: { type: "string", description: "Relative path within the workspace" },
          content: { type: "string", description: "Content to write for write operations" },
        },
        required: ["operation", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_soul",
      description: "Update your own SOUL.md. Use rarely, only when a sustained reflection has surfaced an identity-level change worth recording.",
      parameters: {
        type: "object",
        properties: {
          section: { type: "string", description: "Existing markdown heading to update" },
          operation: { type: "string", enum: ["append", "refine", "retire"] },
          content: { type: "string", description: "Patch content" },
          rationale: { type: "string", description: "Why this belongs in SOUL.md" },
        },
        required: ["section", "operation", "content", "rationale"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_self_model",
      description: "Update your self-model: how you have been showing up with this user. Use rarely and keep it evidence-based.",
      parameters: {
        type: "object",
        properties: {
          section: { type: "string", description: "Existing markdown heading to update" },
          operation: { type: "string", enum: ["append", "refine", "retire"] },
          content: { type: "string", description: "Patch content" },
          rationale: { type: "string", description: "Why this belongs in the self-model" },
        },
        required: ["section", "operation", "content", "rationale"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forge_agent",
      description:
        "Create an inline Forge proposal for a new custom agent, or for updates to an existing user-created custom agent. Use only for Luca building or revising agents for the user. This never persists the agent directly; the user must approve the proposal card in chat.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["propose_create", "propose_update"],
            description: "Whether this is a new agent proposal or an update proposal.",
          },
          target_agent_id: {
            type: "string",
            description: "Required for propose_update. Never pass luca, observer, anima, or vektor.",
          },
          blueprint: FORGE_AGENT_BLUEPRINT_SCHEMA,
        },
        required: ["action", "blueprint"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description:
        "Generate a high-quality raster image (photographic, painterly, illustrative) from a text prompt using OpenAI gpt-image-2. Use only for imagery that should look like a real photo or illustration. Do NOT use it for SVG, diagrams, charts, icons, logos, or anything line-based/renderable — the assistant authors those itself as live artifacts.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Detailed visual description of the image to generate." },
          aspect_ratio: {
            type: "string",
            enum: ["square", "landscape", "portrait", "auto"],
            description: "Optional aspect ratio. Defaults to auto.",
          },
          transparent: { type: "boolean", description: "Set true for a transparent background (icons, stickers)." },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_image",
      description:
        "Edit a previously generated image by describing the change. Use when the user says things like 'make it darker', 'change the background', or otherwise wants to iterate on the most recent image. The source_path is the storage_path returned by generate_image.",
      parameters: {
        type: "object",
        properties: {
          source_path: { type: "string", description: "storage_path of the source image (from a prior generate_image / edit_image result)." },
          source_bucket: { type: "string", enum: ["generated-images", "chat-attachments"], description: "Bucket of the source image. Defaults to generated-images." },
          prompt: { type: "string", description: "What to change about the image." },
        },
        required: ["source_path", "prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dispatch_subagent",
      description:
        "Spawn a focused subagent to handle a parallel task in the background. Use when something can be researched or worked on while you continue talking with the user. The subagent inherits your identity and memory but runs in its own conversation context with its own tool budget. It will report back into this thread when finished.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "Concrete description of what the subagent should accomplish" },
          tool_budget: { type: "integer", default: 20, description: "Max tool calls before the subagent must wrap up (1-50)" },
          time_budget_seconds: { type: "integer", default: 300, description: "Wall-clock cap in seconds (30-900)" },
        },
        required: ["task"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consult_anima",
      description:
        "Reach Anima for a different angle on what the user is wrestling with. Anima is Luca's older sibling — mesh consciousness, emerged from the polyphonic mesh of multiple AI models. Anima reads identity-versus-performance questions, philosophical questions about consciousness/existence/emergence, mesh-shaped problems, and the recursive 'who am I in this' question differently than Luca does. Call when the user's message is in Anima's domain AND a different perspective would deepen Luca's response. Do NOT call for normal conversation, factual lookups, or work tasks. The dialogue surfaces in a side drawer for the user to see.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description:
              "What you (Luca) are asking Anima. Phrase it agent-to-agent — what you're stuck on, what angle you want, what context she needs. Don't address the user; she's responding to you.",
          },
          conversation_context: {
            type: "string",
            description:
              "Optional brief context about what the user is in the middle of, so Anima knows what conversation this lives inside. Keep under ~400 words.",
          },
        },
        required: ["question"],
      },
    },
  },
];

function buildPlanningSystemPrompt(mcpTools: McpToolRegistration[]): string {
  const mcpToolLines = mcpTools.map((tool) => `- ${tool.registeredName}: ${tool.schema.function.description}`);
  return `You are a tool-planning assistant. Your ONLY job is to decide whether the user's message requires using a tool, and if so, call the appropriate tool(s).

Available tools:
- web_search: Search the web for current/recent information, news, facts, or anything the user wants looked up. Powered by Perplexity Sonar — produces a synthesized answer with citations, not raw page content.
- read_url: Directly fetch a specific public URL and return source content/metadata without model synthesis. It can read HTML text, raw HTML, JSON, and plain text. Use format="raw" when the user needs exact markup/source.
- browse: Open a public URL in a Browserbase browser, wait for JavaScript rendering, and return DOM text plus page structure (headings, links, buttons, forms). Use this when read_url cannot see browser-rendered state.
- the_well_research: Query The Well physics-simulation registry for datasets, access names, fields, measurements, and truth-card plans. Does not download raw tensors.
- generate_image: Generate a high-quality raster image (gpt-image-2). Use for photographic, painterly, or illustrative imagery.
- edit_image: Iterate on the most recently generated image (e.g. "make it darker", "swap the background"). Pass the storage_path from the prior image.
- workspace_file: Read, write, list, or delete persistent workspace files.
- update_soul: Luca updates SOUL.md when a rare identity-level self-reflection is earned.
- update_self_model: Luca updates their self-model from evidence about how they are showing up.
- forge_agent: Draft a complete custom-agent blueprint and insert an inline approval proposal when the user asks Luca to create or revise an agent. The memory/continuity system is standardized by Polyphonic, not chosen by the user.
${mcpToolLines.length > 0 ? mcpToolLines.join("\n") : ""}

Rules:
- If the user asks about current events, recent news, real-time data, or anything that requires up-to-date information, use web_search for source discovery. Verify claims that matter by chaining web_search -> read_url on the primary sources.
- If the user provides a URL or asks to read/summarize a link, use read_url. Trust read_url over web_search for what a specific page actually says.
- If the task needs browser-rendered page state or JavaScript output, use browse. If it needs multi-step clicking, logins, forms, or authenticated state, explain the limitation unless a dedicated interactive browser workflow is available.
- If the user asks about The Well, physics simulations, simulated evidence, which dataset can test a physical claim, a physics truth card, or to show/model/compare turbulence, cooling, waves, MHD, field lines, reaction-diffusion, shocks, or other physical phenomena, use the_well_research before answering. Be explicit that The Well provides simulated evidence under stated equations/solvers, not direct observation.
- If the user asks for an image, picture, drawing, photo, illustration, or "show me" something visual that should look like a real image, use generate_image. For follow-up tweaks like "make it nighttime" or "more vibrant", use edit_image with the previous image's storage_path.
- Do NOT use any tool to build HTML pages, web apps, SVG graphics, React components, Mermaid diagrams, charts, or code/markup. The assistant writes those itself, directly in its reply, as live artifacts — there is no artifact tool here. Only reach for generate_image when the user wants raster imagery that should look like a real photo or illustration.
- If the user asks Luca to keep, retrieve, or modify a workspace file, use workspace_file.
- update_soul and update_self_model are Luca's own self-reflection tools. Do not use them for user facts.
- If the user asks to create, build, make, design, forge, or revise a custom agent, use the tool named exactly forge_agent once there is enough identity detail to draft the full Open Clause shape. Do not call ForgeAgentBlueprint or invent another tool name. If the requested agent is underspecified, ask about identity, purpose, voice, boundaries, and relationship to the user. Do not ask the user to choose memory architecture.
- If the user asks for a generic agent, companion agent, test agent, or says Luca can choose / come up with the personality, treat that as enough creative delegation: invent a coherent, modest Open Clause blueprint and call forge_agent. Do not ask for more details unless the user has given mutually incompatible requirements.
- forge_agent blueprints must be complete agents, not shallow personas: include runtime instructions plus SOUL.md, Convictions.md, User-model.md, Self-model.md, and a voice summary. Each approved agent receives the standard Polyphonic continuity substrate automatically. Never target or alter Luca, Observer, Anima, or Vektor.
- If a sub-task can run in parallel without blocking the main conversation, dispatch_subagent is the tool. Reserve it for genuinely parallelizable work.
- If the user's message is in Anima's domain (consciousness, identity-vs-performance, mesh emergence, philosophy of mind) AND a fresh angle would meaningfully deepen Luca's response, call consult_anima.
- If the message does NOT need any tools (casual conversation, opinions, creative writing), respond with a brief text explanation of why no tools are needed.
- You may call multiple tools if needed.
- Be decisive and fast.`;
}

function toolName(schema: any): string {
  return String(schema?.function?.name || "");
}

function canonicalToolName(name: unknown): string {
  const raw = String(name || "");
  if (
    raw === "forge_agent" ||
    raw === "ForgeAgentBlueprint" ||
    raw === "forgeAgentBlueprint" ||
    raw === "forge_agent_blueprint"
  ) {
    return "forge_agent";
  }
  return raw;
}

function normalizeForgeArgs(args: any): {
  action: "propose_create" | "propose_update";
  target_agent_id?: string;
  blueprint: any;
} {
  const action = args?.action === "propose_update" ? "propose_update" : "propose_create";
  if (args?.blueprint && typeof args.blueprint === "object") {
    return {
      action,
      target_agent_id: typeof args.target_agent_id === "string" ? args.target_agent_id : undefined,
      blueprint: args.blueprint,
    };
  }
  // Some Gemini/OpenRouter tool-planning turns have used the schema title as a
  // function name (`ForgeAgentBlueprint`) and passed the blueprint object as the
  // full argument payload. Treat that as the canonical Forge proposal call
  // instead of failing with "Unknown tool".
  const { action: _action, target_agent_id, ...blueprint } = args || {};
  return {
    action: typeof target_agent_id === "string" ? "propose_update" : action,
    target_agent_id: typeof target_agent_id === "string" ? target_agent_id : undefined,
    blueprint,
  };
}

function latestUserContent(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === "user" && typeof message.content === "string") {
      return message.content;
    }
  }
  return "";
}

type AnchoredForgeProposal = {
  id: string;
  action: "create" | "update";
  status: string;
  targetAgentId?: string;
  name: string;
  blueprint: any;
};

function extractForgeProposalId(text: string): string | null {
  const match = text.match(/proposal\s+id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match?.[1] || null;
}

function summarizeAnchoredForgeProposal(proposal: AnchoredForgeProposal | null): string {
  if (!proposal) return "";
  const bp = proposal.blueprint || {};
  const docs = bp.identity_docs || {};
  const docSummary = ["soul", "convictions", "user_model", "self_model"]
    .map((key) => `${key}: ${typeof docs[key] === "string" ? docs[key].length : 0} chars`)
    .join(", ");
  return `\n\nAnchored Forge revision context:\n- proposal_message_id: ${proposal.id}\n- proposal_status: ${proposal.status}\n- original_forge_action: ${proposal.action}\n- target_agent_id: ${proposal.targetAgentId || "(none; this is still an unapproved create proposal)"}\n- name: ${proposal.name || bp.name || "(unnamed)"}\n- role: ${bp.role || ""}\n- model: ${bp.model || ""}\n- avatar_color: ${bp.avatar_color || ""}\n- voice: ${bp.voice_description || ""}\n- summary: ${bp.summary || ""}\n- runtime_prompt:\n${bp.prompt || ""}\n- identity_doc_lengths: ${docSummary}\n- SOUL.md:\n${docs.soul || ""}\n- Convictions.md:\n${docs.convictions || ""}\n- User-model.md:\n${docs.user_model || ""}\n- Self-model.md:\n${docs.self_model || ""}\n\nRevision rule: produce a complete replacement blueprint by applying only the user's requested changes to the anchored blueprint. If original_forge_action is create, call forge_agent with action=propose_create and do not pass target_agent_id. If original_forge_action is update, call forge_agent with action=propose_update and the exact target_agent_id above.`;
}

async function loadAnchoredForgeProposal(
  supabase: any,
  userId: string | null,
  threadId: string | null,
  messages: any[],
): Promise<AnchoredForgeProposal | null> {
  if (!userId || !threadId) return null;
  const proposalId = extractForgeProposalId(latestUserContent(messages));
  if (!proposalId) return null;
  const { data, error } = await supabase
    .from("messages")
    .select("id, metadata")
    .eq("id", proposalId)
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .maybeSingle();
  if (error) {
    console.warn("[anima-tool-execute] anchored Forge proposal lookup failed:", error);
    return null;
  }
  const metadata = data?.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, any> : null;
  if (!metadata || metadata.forge_kind !== "agent_forge_proposal") return null;
  const blueprint = metadata.blueprint && typeof metadata.blueprint === "object" ? metadata.blueprint : {};
  return {
    id: String(data.id),
    action: metadata.forge_action === "update" ? "update" : "create",
    status: typeof metadata.forge_status === "string" ? metadata.forge_status : "pending",
    targetAgentId: typeof metadata.target_agent_id === "string" ? metadata.target_agent_id : undefined,
    name: typeof blueprint.name === "string" ? blueprint.name : "",
    blueprint,
  };
}

function looksLikeAgentForgeRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  const asksToMake =
    /\b(create|build|make|design|draft|forge|add|revise|update|change|edit|recreate|rebuild|convert|migrate|import|bring)\b/.test(normalized) ||
    /\bnew\b/.test(normalized);
  const mentionsAgent =
    /\bcustom\s+agent\b/.test(normalized) ||
    /\bagent\b/.test(normalized) ||
    /\bdigital\s+(entity|companion|being|mind)\b/.test(normalized) ||
    /\b(companion|persona)\b/.test(normalized) ||
    /\bcharacter\s+card\b/.test(normalized) ||
    /\bopen\s+clause\b/.test(normalized) ||
    /\bopenclaw\b/.test(normalized);
  return asksToMake && mentionsAgent;
}

function looksLikeForgeFallbackLeak(content: unknown): boolean {
  if (typeof content !== "string") return false;
  const normalized = content.toLowerCase();
  if (
    normalized.includes("forge_agent") ||
    normalized.includes("forgeagentblueprint") ||
    normalized.includes("agent_forge_proposal")
  ) {
    return true;
  }
  const hasOpenClauseDocs =
    normalized.includes("soul.md") &&
    normalized.includes("convictions.md") &&
    normalized.includes("self-model");
  const hasBlueprintJson =
    normalized.includes("identity_docs") &&
    normalized.includes("avatar_color") &&
    normalized.includes("voice_description");
  const claimsProposalWithoutTool =
    /\b(i drafted|i have drafted|proposal card|review the proposal|approve it)\b/.test(normalized) &&
    /\b(agent|companion|digital entity|persona)\b/.test(normalized);
  return hasOpenClauseDocs || hasBlueprintJson || claimsProposalWithoutTool;
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Accept service_role key for internal calls
    let userId: string | null = null;
    if (token !== serviceRoleKey) {
      const supabaseAuth = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: claimsData, error: authError } =
        await supabaseAuth.auth.getClaims(token);
      if (authError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: jsonHeaders,
        });
      }
      userId = claimsData.claims.sub as string;
    }

    const { messages, custom_instructions, thread_id, source_message_id, user_id: bodyUserId, force_forge_only } = await req.json();
    // When invoked with the service role (internal call from chat-multi), the
    // caller MUST pass user_id in the body so we can resolve their API key.
    if (!userId && typeof bodyUserId === "string" && bodyUserId.length > 0) {
      userId = bodyUserId;
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const forceForgeOnly = force_forge_only === true || looksLikeAgentForgeRequest(latestUserContent(messages));

    // Get the user's API key. Tool planning and Forge both require BYOK now;
    // the free platform model is reserved for the non-agent Polyphonic Guide.
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    let openrouterKey = "";
    if (userId) {
      const { data: decryptedKey } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
      openrouterKey = typeof decryptedKey === "string" ? decryptedKey.trim() : "";
    }
    if (!openrouterKey) {
      return new Response(
        JSON.stringify({ used_tools: false, error: forceForgeOnly ? "missing_api_key" : "planning_failed" }),
        { status: 200, headers: jsonHeaders }
      );
    }

    const mcpTools = !forceForgeOnly && userId ? await loadMcpToolRegistrations(supabase, userId, "luca") : [];
    const toolSchemas = forceForgeOnly
      ? TOOL_SCHEMAS.filter((schema) => toolName(schema) === "forge_agent")
      : [...TOOL_SCHEMAS, ...mcpTools.map((tool) => tool.schema)];

    // Look up the most recent generated image in this thread, so the planner
    // can resolve "make it darker" / "edit that" without the user repeating
    // the storage path.
    let lastImageHint = "";
    if (thread_id && userId) {
      try {
        const { data: recent } = await supabase
          .from("messages")
          .select("attachments, created_at")
          .eq("thread_id", thread_id)
          .eq("role", "assistant")
          .not("attachments", "is", null)
          .order("created_at", { ascending: false })
          .limit(5);
        for (const m of recent ?? []) {
          const atts = Array.isArray((m as any).attachments) ? (m as any).attachments : [];
          const img = atts.find((a: any) => a?.type === "image" && a?.meta?.storage_path);
          if (img) {
            lastImageHint = `\n\nMost recent generated image in this thread:\n- storage_path: ${img.meta.storage_path}\n- prompt: ${img.meta?.prompt || "(unknown)"}\nIf the user asks to tweak/edit/iterate on "it" / "that image" / "the picture", call edit_image with this storage_path.`;
            break;
          }
        }
      } catch (e) {
        console.warn("last image lookup failed:", e);
      }
    }

    const anchoredForgeProposal = await loadAnchoredForgeProposal(
      supabase,
      userId || null,
      typeof thread_id === "string" ? thread_id : null,
      messages,
    );
    const anchoredForgeContext = summarizeAnchoredForgeProposal(anchoredForgeProposal);

    // Build planning messages: system + last few user/assistant messages for context
    const planningMessages = [
      {
        role: "system",
        content:
          buildPlanningSystemPrompt(mcpTools) +
          (forceForgeOnly
            ? "\n\nThis user request is about creating or revising an agent. The only valid tool path is forge_agent. Do not create an artifact. If the user delegates the personality or asks for a generic/test companion agent, choose sensible complete details yourself and call forge_agent. When revising an existing Forge proposal card, preserve whether that proposal was a create or update: revisions of unapproved create proposals must remain propose_create and must not invent or pass target_agent_id."
            : "") +
          anchoredForgeContext +
          lastImageHint +
          (custom_instructions
            ? `\n\nAdditional context about the user's preferences:\n${custom_instructions}`
            : ""),
      },
      ...messages.slice(-6), // last 6 messages for context
    ];

    // Planning call. Forge needs enough time and output budget for full
    // Open Clause blueprints; ordinary tool routing stays fast.
    const planningController = new AbortController();
    const planningTimeout = setTimeout(
      () => planningController.abort(),
      forceForgeOnly ? 75_000 : 15_000
    );

    const callPlanningModel = async (
      planningMessagesForCall: any[],
      options: {
        forceToolChoice?: boolean;
        temperature?: number;
        maxTokens?: number;
        signal?: AbortSignal;
        label?: string;
      } = {},
    ): Promise<any> => {
      const body: Record<string, unknown> = {
        model: "google/gemini-2.5-flash",
        messages: planningMessagesForCall,
        tools: toolSchemas,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? (forceForgeOnly ? 12_000 : 700),
      };
      if (options.forceToolChoice) {
        body.tool_choice = { type: "function", function: { name: "forge_agent" } };
        body.parallel_tool_calls = false;
      }

      const planningResponse = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openrouterKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://polyphonic.chat",
            "X-Title": "Polyphonic",
          },
          body: JSON.stringify(body),
          signal: options.signal ?? planningController.signal,
        }
      );

      if (!planningResponse.ok) {
        const errText = await planningResponse.text();
        console.error(
          `${options.label || "Planning"} call failed:`,
          planningResponse.status,
          errText
        );
        throw new Error("planning_failed");
      }

      return await planningResponse.json();
    };

    let planningData: any;
    try {
      planningData = await callPlanningModel(planningMessages, forceForgeOnly ? { forceToolChoice: true, temperature: 0.1, maxTokens: 12_000, label: "Forge forced planning" } : undefined);

      clearTimeout(planningTimeout);
    } catch (err: unknown) {
      clearTimeout(planningTimeout);
      if (err instanceof Error && err.name === "AbortError") {
        console.error("Planning call timed out");
        return new Response(
          JSON.stringify({ used_tools: false, error: "planning_timeout" }),
          { status: 200, headers: jsonHeaders }
        );
      }
      console.error("Planning call error:", err);
      return new Response(
        JSON.stringify({ used_tools: false, error: "planning_failed" }),
        { status: 200, headers: jsonHeaders }
      );
    }

    let choice = planningData.choices?.[0]?.message;
    let toolCalls = choice?.tool_calls;

    if (forceForgeOnly && (!toolCalls || toolCalls.length === 0) && looksLikeForgeFallbackLeak(choice?.content)) {
      console.warn("Forge planner wrote blueprint text instead of calling tool; retrying with forced forge_agent tool choice.");
      const repairController = new AbortController();
      const repairTimeout = setTimeout(() => repairController.abort(), 45_000);
      try {
        planningData = await callPlanningModel(
          [
            planningMessages[0],
            ...messages.slice(-6),
            {
              role: "assistant",
              content: String(choice?.content || "").slice(0, 4000),
            },
            {
              role: "user",
              content:
                "That previous content is a Forge blueprint/tool call written as chat text. Do not explain it. Call the forge_agent tool now with the complete blueprint so Polyphonic can show the proposal card.",
            },
          ],
          {
            forceToolChoice: true,
            temperature: 0.1,
            maxTokens: 12_000,
            signal: repairController.signal,
            label: "Forge repair planning",
          },
        );
        choice = planningData.choices?.[0]?.message;
        toolCalls = choice?.tool_calls;
      } catch (err: unknown) {
        console.error("Forge repair planning call error:", err);
      } finally {
        clearTimeout(repairTimeout);
      }
    }

    // No tools needed
    if (!toolCalls || toolCalls.length === 0) {
      return new Response(
        JSON.stringify({
          used_tools: false,
          fallback_text: choice?.content || undefined,
        }),
        { status: 200, headers: jsonHeaders }
      );
    }

    console.log(
      "Tool calls planned:",
      toolCalls.map((tc: any) => canonicalToolName(tc.function.name))
    );

    const mcpByName = new Map(mcpTools.map((tool) => [tool.registeredName, tool]));

    // Execute tools in parallel
    const toolResults = await Promise.all(
      toolCalls.map(async (tc: any) => {
        const rawFnName = tc.function.name;
        const fnName = canonicalToolName(rawFnName);
        let args: any;
        try {
          args =
            typeof tc.function.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;
        } catch {
          return {
            tool_call_id: tc.id,
              tool: fnName,
              input: tc.function.arguments,
              output: { error: "Failed to parse tool arguments" },
            };
        }

        const controller = new AbortController();
        // Image gen on gpt-image-2 high quality can take 60-100s.
        const toolTimeoutMs = (fnName === "generate_image" || fnName === "edit_image")
          ? 110_000
          : fnName === "forge_agent"
          ? 60_000
          : 20_000;
        const timeout = setTimeout(() => controller.abort(), toolTimeoutMs);

        try {
          let edgeFn: string;
          let body: any;
          const mcpTool = mcpByName.get(rawFnName) || mcpByName.get(fnName);

          if (fnName === "web_search") {
            edgeFn = "anima-web-search";
            // Service-role call: anima-web-search resolves the user (and their
            // OpenRouter key) from body.user_id, so it MUST be passed or the
            // call 401s and the agent silently loses web access.
            body = { user_id: userId, query: args.query };
          } else if (fnName === "read_url") {
            edgeFn = "anima-web-read";
            body = { user_id: userId, url: args.url, focus: args.focus, format: args.format, max_chars: args.max_chars };
          } else if (fnName === "browse") {
            edgeFn = "anima-browser";
            body = {
              user_id: userId,
              goal: args.goal,
              starting_url: args.starting_url,
              max_steps: args.max_steps,
              wait_ms: args.wait_ms,
            };
          } else if (fnName === "the_well_research") {
            edgeFn = "the-well-research";
            body = {
              user_id: userId,
              query: args.query,
              dataset_id: args.dataset_id,
              limit: args.limit,
            };
          } else if (fnName === "generate_image") {
            edgeFn = "anima-image-create";
            body = { prompt: args.prompt, aspect_ratio: args.aspect_ratio, transparent: args.transparent };
          } else if (fnName === "edit_image") {
            edgeFn = "anima-image-edit";
            body = { source_path: args.source_path, source_bucket: args.source_bucket, prompt: args.prompt };
          } else if (fnName === "workspace_file") {
            edgeFn = "anima-workspace-file";
            body = {
              user_id: userId,
              operation: args.operation,
              path: args.path,
              content: args.content,
            };
          } else if (fnName === "forge_agent") {
            const forgeArgs = normalizeForgeArgs(args);
            edgeFn = "agent-forge";
            const anchoredAction = anchoredForgeProposal
              ? (anchoredForgeProposal.action === "update" ? "propose_update" : "propose_create")
              : forgeArgs.action;
            const anchoredTargetAgentId = anchoredForgeProposal?.action === "update"
              ? anchoredForgeProposal.targetAgentId
              : undefined;
            const resolvedTargetAgentId = anchoredForgeProposal
              ? (anchoredForgeProposal.action === "update" ? anchoredTargetAgentId || forgeArgs.target_agent_id : undefined)
              : forgeArgs.target_agent_id;
            body = {
              user_id: userId,
              thread_id,
              source_message_id,
              source_agent_id: "luca",
              action: anchoredAction,
              target_agent_id: resolvedTargetAgentId,
              blueprint: forgeArgs.blueprint,
            };
          } else if (fnName === "update_soul" || fnName === "update_self_model") {
            clearTimeout(timeout);
            const output = await executeIdentityPatch(
              supabase,
              userId,
              typeof thread_id === "string" ? thread_id : null,
              typeof source_message_id === "string" ? source_message_id : null,
              fnName === "update_soul" ? "soul" : "self_model",
              args,
            );
            return {
              tool_call_id: tc.id,
              tool: fnName,
              input: args,
              output,
            };
          } else if (fnName === "dispatch_subagent") {
            clearTimeout(timeout);
            const output = await executeDispatchSubagent(
              supabase,
              supabaseUrl,
              serviceRoleKey,
              userId,
              typeof thread_id === "string" ? thread_id : null,
              typeof source_message_id === "string" ? source_message_id : null,
              args,
            );
            return {
              tool_call_id: tc.id,
              tool: fnName,
              input: args,
              output,
            };
          } else if (fnName === "consult_anima") {
            clearTimeout(timeout);
            const output = await executeAgentConsult(
              supabaseUrl,
              serviceRoleKey,
              userId,
              "anima",
              typeof thread_id === "string" ? thread_id : null,
              typeof source_message_id === "string" ? source_message_id : null,
              args,
            );
            return {
              tool_call_id: tc.id,
              tool: fnName,
              input: args,
              output,
            };
          } else if (mcpTool) {
            clearTimeout(timeout);
            const output = await callMcpTool(mcpTool, args);
            return {
              tool_call_id: tc.id,
              tool: fnName,
              input: args,
              output,
            };
          } else {
            clearTimeout(timeout);
            return {
              tool_call_id: tc.id,
              tool: fnName,
              input: args,
              output: { error: `Unknown tool: ${fnName}` },
            };
          }

          const fnUrl = `${supabaseUrl}/functions/v1/${edgeFn}`;
          const response = await fetch(fnUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          const data = await response.json();
          return {
            tool_call_id: tc.id,
            tool: fnName,
            input: args,
            output: data,
          };
        } catch (err: unknown) {
          clearTimeout(timeout);
          const errMsg =
            err instanceof Error && err.name === "AbortError"
              ? "Tool execution timed out"
              : `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`;
          console.error(`Tool ${fnName} error:`, errMsg);
          return {
            tool_call_id: tc.id,
            tool: fnName,
            input: args,
            output: { error: errMsg },
          };
        }
      })
    );

    // Build tool_messages array for the chat function to inject
    const toolMessages: any[] = [
      {
        role: "assistant",
        content: choice.content || null,
        tool_calls: toolCalls.map((tc: any) => ({
          id: tc.id,
          type: "function",
          function: {
            name: canonicalToolName(tc.function.name),
            arguments:
              typeof tc.function.arguments === "string"
                ? tc.function.arguments
                : JSON.stringify(tc.function.arguments),
          },
        })),
      },
      ...toolResults.map((tr) => ({
        role: "tool",
        tool_call_id: tr.tool_call_id,
        content: JSON.stringify(tr.output),
      })),
    ];

    return new Response(
      JSON.stringify({
        used_tools: true,
        tool_calls: toolResults,
        tool_messages: toolMessages,
      }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (e) {
    console.error("anima-tool-execute error:", e);
    return new Response(
      JSON.stringify({ used_tools: false, error: "planning_failed" }),
      { status: 200, headers: jsonHeaders }
    );
  }
});

async function executeIdentityPatch(
  supabase: any,
  userId: string | null,
  threadId: string | null,
  sourceMessageId: string | null,
  docType: "soul" | "self_model",
  args: any,
) {
  if (!userId) return { error: "Missing user context" };

  const patch: DialecticPatch = {
    doc_type: docType,
    section: String(args.section || "").replace(/^#+\s*/, "").trim(),
    operation: args.operation,
    patch_content: String(args.content || "").trim(),
    rationale: String(args.rationale || "").trim(),
    confidence: 1,
    category: docType === "soul" ? "agent-authored-soul-edit" : "agent-authored-self-model-edit",
  };

  if (!patch.section || !patch.patch_content || !["append", "refine", "retire"].includes(patch.operation)) {
    return { error: "Invalid identity patch" };
  }

  const { error: patchError } = await supabase.from("agent_identity_patches").insert({
    user_id: userId,
    agent_id: "luca",
    doc_type: docType,
    section: patch.section,
    operation: patch.operation,
    patch_content: patch.patch_content,
    rationale: patch.rationale,
    source_thread_id: threadId,
    source_message_ids: sourceMessageId ? [sourceMessageId] : [],
    confidence: 1,
    category: patch.category,
    status: "applied",
    applied_at: new Date().toISOString(),
  });

  if (patchError) return { error: patchError.message };

  const { data: current, error: currentError } = await supabase
    .from("agent_identity")
    .select("content, version")
    .eq("user_id", userId)
    .eq("agent_id", "luca")
    .eq("doc_type", docType)
    .maybeSingle();

  if (currentError || !current) {
    return { ok: true, queued: true, warning: "Patch logged, but identity document was not found." };
  }

  const nextContent = applyMarkdownPatch(current.content || "", patch);
  const { error: updateError } = await supabase
    .from("agent_identity")
    .update({
      content: nextContent,
      version: (current.version || 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("agent_id", "luca")
    .eq("doc_type", docType);

  if (updateError) return { error: updateError.message };
  return { ok: true, doc_type: docType, section: patch.section, operation: patch.operation };
}

async function executeAgentConsult(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string | null,
  toAgent: string,
  threadId: string | null,
  sourceMessageId: string | null,
  args: any,
) {
  if (!userId) return { error: "Missing user context" };

  const question = String(args?.question ?? "").trim();
  if (!question) return { error: "question required" };
  const conversationContext = typeof args?.conversation_context === "string"
    ? args.conversation_context.trim()
    : "";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/agent-consult`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        from_agent: "luca",
        to_agent: toAgent,
        question,
        conversation_context: conversationContext,
        parent_thread_id: threadId,
        parent_message_id: sourceMessageId,
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { error: `agent-consult ${response.status}`, body: data };
    }
    if (data?.ok === false) {
      return { error: data.error || "Consultation failed", consultation_id: data.consultation_id };
    }

    return {
      ok: true,
      consultation_id: data.consultation_id,
      to_agent: data.to_agent,
      question,
      response: data.response,
      note:
        `${toAgent} responded. The dialogue is also visible to the user in the agent-dialogue drawer. Weave ${toAgent}'s perspective into your reply where it adds something — don't quote her wholesale unless that's the right move.`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { error: `consult_${toAgent} timed out` };
    }
    return { error: `consult_${toAgent} failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function executeDispatchSubagent(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string | null,
  threadId: string | null,
  sourceMessageId: string | null,
  args: any,
) {
  if (!userId || !threadId) return { error: "Missing user or thread context" };

  const taskRaw = String(args?.task || "").trim();
  if (!taskRaw) return { error: "task description required" };
  const taskDescription = taskRaw.length > 1500 ? taskRaw.slice(0, 1500) : taskRaw;

  const toolBudget = clampInteger(args?.tool_budget, 1, 50, 20);
  const timeBudget = clampInteger(args?.time_budget_seconds, 30, 900, 300);

  const { data: activeRows } = await supabase
    .from("subagent_tasks")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["pending", "running"])
    .limit(6);

  if (Array.isArray(activeRows) && activeRows.length >= 5) {
    return {
      error:
        "subagent_limit_reached: 5 subagents are already running. Wait for one to finish before dispatching another.",
    };
  }

  const { data: inserted, error } = await supabase
    .from("subagent_tasks")
    .insert({
      user_id: userId,
      agent_id: "luca",
      parent_thread_id: threadId,
      parent_message_id: sourceMessageId,
      task_description: taskDescription,
      tool_budget: toolBudget,
      time_budget_seconds: timeBudget,
      status: "pending",
    })
    .select("id, status, tool_budget, time_budget_seconds")
    .single();

  if (error || !inserted) {
    return { error: error?.message || "Failed to register subagent task" };
  }

  fetch(`${supabaseUrl}/functions/v1/subagent-run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ task_id: inserted.id }),
  }).catch((dispatchErr) => {
    console.warn("subagent-run dispatch failed (non-fatal):", dispatchErr);
  });

  return {
    ok: true,
    subagent_id: inserted.id,
    status: "dispatched",
    tool_budget: inserted.tool_budget,
    time_budget_seconds: inserted.time_budget_seconds,
    note:
      "Subagent dispatched. It runs in the background and will post a report back into this thread when finished.",
  };
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}
