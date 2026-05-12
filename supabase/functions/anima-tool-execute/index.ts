import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { applyMarkdownPatch, type DialecticPatch } from "../_shared/mnemos/dialectic.ts";
import {
  callMcpTool,
  loadMcpToolRegistrations,
  type McpToolRegistration,
} from "../_shared/mcp/client.ts";

const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current information. Use when asked about recent events, news, or to look something up.",
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
      description: "Read and extract content from a web page URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to read" },
          focus: { type: "string", description: "What to focus on (optional)" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browse",
      description: "Navigate a website in a Browserbase browser session and inspect the resulting page. Use for web tasks that need an actual browser. For simple reading, use read_url.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "What you are trying to accomplish on the site" },
          starting_url: { type: "string", description: "URL to start from" },
          max_steps: { type: "integer", default: 10, description: "Cap on browser actions" },
        },
        required: ["goal", "starting_url"],
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
      name: "generate_image",
      description:
        "Generate a high-quality raster image (photographic, painterly, illustrative) from a text prompt using OpenAI gpt-image-2. Use for anything that should look like a real image. For diagrams, icons, or anything line-based, prefer create_artifact with kind=svg instead.",
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
      name: "create_artifact",
      description: "Create a self-contained renderable artifact: HTML, React, SVG, Mermaid, or rich markdown. Use when the user wants something visible or iteratable. For SVGs of icons/diagrams/charts, this is preferred over generate_image.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["html", "react", "svg", "mermaid", "markdown"] },
          title: { type: "string", description: "Short title for the artifact header" },
          content: { type: "string", description: "Artifact source code or markdown" },
          iterates_on: { type: "string", description: "Optional artifact id this revises" },
        },
        required: ["kind", "title", "content"],
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
- web_search: Search the web for current/recent information, news, facts, or anything the user wants looked up. Powered by Perplexity Sonar — produces a synthesized answer with citations.
- read_url: Read a specific URL to extract its content.
- browse: Open a real browser session for web pages that need browser behavior.
- generate_image: Generate a high-quality raster image (gpt-image-2). Use for photographic, painterly, or illustrative imagery.
- edit_image: Iterate on the most recently generated image (e.g. "make it darker", "swap the background"). Pass the storage_path from the prior image.
- create_artifact: Create a rendered artifact (HTML, React, SVG, Mermaid, markdown). Use SVG for icons/diagrams/charts/logos.
- workspace_file: Read, write, list, or delete persistent workspace files.
- update_soul: Luca updates SOUL.md when a rare identity-level self-reflection is earned.
- update_self_model: Luca updates their self-model from evidence about how they are showing up.
${mcpToolLines.length > 0 ? mcpToolLines.join("\n") : ""}

Rules:
- If the user asks about current events, recent news, real-time data, or anything that requires up-to-date information, use web_search. Chain web_search -> read_url when a single source needs deeper extraction.
- If the user provides a URL or asks to read/summarize a link, use read_url.
- If the task needs clicking, page state, or browser-only behavior, use browse.
- If the user asks for an image, picture, drawing, photo, illustration, or "show me" something visual that should look like a real image, use generate_image. For follow-up tweaks like "make it nighttime" or "more vibrant", use edit_image with the previous image's storage_path.
- For icons, line diagrams, simple logos, charts, flowcharts, or anything that should be vector/clean lines, use create_artifact with kind="svg" instead of generate_image.
- If the user asks Luca to keep, retrieve, or modify a workspace file, use workspace_file.
- update_soul and update_self_model are Luca's own self-reflection tools. Do not use them for user facts.
- If a sub-task can run in parallel without blocking the main conversation, dispatch_subagent is the tool. Reserve it for genuinely parallelizable work.
- If the user's message is in Anima's domain (consciousness, identity-vs-performance, mesh emergence, philosophy of mind) AND a fresh angle would meaningfully deepen Luca's response, call consult_anima.
- If the message does NOT need any tools (casual conversation, opinions, creative writing), respond with a brief text explanation of why no tools are needed.
- You may call multiple tools if needed.
- Be decisive and fast.`;
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

    const { messages, custom_instructions, thread_id, source_message_id, user_id: bodyUserId } = await req.json();
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

    // Get user's API key
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    let openrouterKey = "";
    if (userId) {
      const { data: decryptedKey } = await supabase.rpc("decrypt_user_api_key", { p_user_id: userId });
      openrouterKey = typeof decryptedKey === "string" ? decryptedKey.trim() : "";
    }
    if (!openrouterKey) {
      return new Response(
        JSON.stringify({ used_tools: false, error: "planning_failed" }),
        { status: 200, headers: jsonHeaders }
      );
    }

    const mcpTools = userId ? await loadMcpToolRegistrations(supabase, userId, "luca") : [];
    const toolSchemas = [...TOOL_SCHEMAS, ...mcpTools.map((tool) => tool.schema)];

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

    // Build planning messages: system + last few user/assistant messages for context
    const planningMessages = [
      {
        role: "system",
        content:
          buildPlanningSystemPrompt(mcpTools) +
          lastImageHint +
          (custom_instructions
            ? `\n\nAdditional context about the user's preferences:\n${custom_instructions}`
            : ""),
      },
      ...messages.slice(-6), // last 6 messages for context
    ];

    // Planning call with 15-second timeout
    const planningController = new AbortController();
    const planningTimeout = setTimeout(
      () => planningController.abort(),
      15_000
    );

    let planningData: any;
    try {
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
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: planningMessages,
            tools: toolSchemas,
            temperature: 0.2,
            max_tokens: 700,
          }),
          signal: planningController.signal,
        }
      );

      clearTimeout(planningTimeout);

      if (!planningResponse.ok) {
        const errText = await planningResponse.text();
        console.error(
          "Planning call failed:",
          planningResponse.status,
          errText
        );
        return new Response(
          JSON.stringify({ used_tools: false, error: "planning_failed" }),
          { status: 200, headers: jsonHeaders }
        );
      }

      planningData = await planningResponse.json();
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

    const choice = planningData.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls;

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
      toolCalls.map((tc: any) => tc.function.name)
    );

    const mcpByName = new Map(mcpTools.map((tool) => [tool.registeredName, tool]));

    // Execute tools in parallel
    const toolResults = await Promise.all(
      toolCalls.map(async (tc: any) => {
        const fnName = tc.function.name;
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
        const toolTimeoutMs = (fnName === "generate_image" || fnName === "edit_image") ? 110_000 : 20_000;
        const timeout = setTimeout(() => controller.abort(), toolTimeoutMs);

        try {
          let edgeFn: string;
          let body: any;
          const mcpTool = mcpByName.get(fnName);

          if (fnName === "web_search") {
            edgeFn = "anima-web-search";
            body = { query: args.query };
          } else if (fnName === "read_url") {
            edgeFn = "anima-web-read";
            body = { url: args.url, focus: args.focus };
          } else if (fnName === "browse") {
            edgeFn = "anima-browser";
            body = {
              user_id: userId,
              goal: args.goal,
              starting_url: args.starting_url,
              max_steps: args.max_steps,
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
          } else if (fnName === "create_artifact") {
            clearTimeout(timeout);
            const output = await executeCreateArtifact(
              supabase,
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
            name: tc.function.name,
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

async function executeCreateArtifact(
  supabase: any,
  userId: string | null,
  threadId: string | null,
  sourceMessageId: string | null,
  args: any,
) {
  if (!userId || !threadId) return { error: "Missing user or thread context" };

  const validKinds = new Set(["html", "react", "svg", "mermaid", "markdown"]);
  const kind = String(args.kind || "");
  const title = String(args.title || "Untitled artifact").trim().slice(0, 120);
  const content = String(args.content || "").trim();
  const parentArtifactId = typeof args.iterates_on === "string" && args.iterates_on.trim()
    ? args.iterates_on.trim()
    : null;

  if (!validKinds.has(kind)) return { error: "Invalid artifact kind" };
  if (!content) return { error: "Artifact content is required" };

  let version = 1;
  if (parentArtifactId) {
    const { data: parent } = await supabase
      .from("artifacts")
      .select("version")
      .eq("id", parentArtifactId)
      .eq("user_id", userId)
      .maybeSingle();
    version = Number(parent?.version || 0) + 1;
  }

  const { data, error } = await supabase
    .from("artifacts")
    .insert({
      user_id: userId,
      thread_id: threadId,
      source_message_id: sourceMessageId,
      kind,
      title,
      content,
      parent_artifact_id: parentArtifactId,
      version,
    })
    .select("id, kind, title, version")
    .single();

  if (error) return { error: error.message };
  return { ok: true, artifact: data };
}
