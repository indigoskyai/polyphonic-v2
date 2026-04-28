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
      name: "create_artifact",
      description: "Create a self-contained renderable artifact: HTML, React, SVG, Mermaid, or rich markdown. Use when the user wants something visible or iteratable.",
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
];

function buildPlanningSystemPrompt(mcpTools: McpToolRegistration[]): string {
  const mcpToolLines = mcpTools.map((tool) => `- ${tool.registeredName}: ${tool.schema.function.description}`);
  return `You are a tool-planning assistant. Your ONLY job is to decide whether the user's message requires using a tool, and if so, call the appropriate tool(s).

Available tools:
- web_search: Search the web for current/recent information, news, facts, or anything the user wants looked up.
- read_url: Read a specific URL to extract its content.
- browse: Open a real browser session for web pages that need browser behavior.
- workspace_file: Read, write, list, or delete persistent workspace files.
- update_soul: Luca updates SOUL.md when a rare identity-level self-reflection is earned.
- update_self_model: Luca updates their self-model from evidence about how they are showing up.
- create_artifact: Create a rendered artifact when the user wants something visual, interactive, diagrammatic, or iteratable.
${mcpToolLines.length > 0 ? mcpToolLines.join("\n") : ""}

Rules:
- If the user asks about current events, recent news, real-time data, or anything that requires up-to-date information, use web_search.
- If the user provides a URL or asks to read/summarize a link, use read_url.
- If the task needs clicking, page state, or browser-only behavior, use browse.
- If the user asks Luca to keep, retrieve, or modify a workspace file, use workspace_file.
- update_soul and update_self_model are Luca's own self-reflection tools. Do not use them for user facts.
- If the user wants a webpage, component, diagram, visualization, or polished document they can inspect, use create_artifact.
- If the message does NOT need any tools (casual conversation, opinions, creative writing, etc.), respond with a brief text explanation of why no tools are needed.
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

    const { messages, custom_instructions, thread_id, source_message_id } = await req.json();

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

    // Build planning messages: system + last few user/assistant messages for context
    const planningMessages = [
      {
        role: "system",
        content:
          buildPlanningSystemPrompt(mcpTools) +
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
        const timeout = setTimeout(() => controller.abort(), 12_000);

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
