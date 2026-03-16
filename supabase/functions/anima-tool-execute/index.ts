import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

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
];

const PLANNING_SYSTEM_PROMPT = `You are a tool-planning assistant. Your ONLY job is to decide whether the user's message requires using a tool, and if so, call the appropriate tool(s).

Available tools:
- web_search: Search the web for current/recent information, news, facts, or anything the user wants looked up.
- read_url: Read a specific URL to extract its content.

Rules:
- If the user asks about current events, recent news, real-time data, or anything that requires up-to-date information, use web_search.
- If the user provides a URL or asks to read/summarize a link, use read_url.
- If the message does NOT need any tools (casual conversation, opinions, creative writing, etc.), respond with a brief text explanation of why no tools are needed.
- You may call multiple tools if needed.
- Be decisive and fast.`;

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
    }

    const { messages, custom_instructions } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openrouterKey) {
      return new Response(
        JSON.stringify({ used_tools: false, error: "planning_failed" }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // Build planning messages: system + last few user/assistant messages for context
    const planningMessages = [
      {
        role: "system",
        content:
          PLANNING_SYSTEM_PROMPT +
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
            model: "anthropic/claude-sonnet-4.6",
            messages: planningMessages,
            tools: TOOL_SCHEMAS,
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
    } catch (err) {
      clearTimeout(planningTimeout);
      if (err.name === "AbortError") {
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

          if (fnName === "web_search") {
            edgeFn = "anima-web-search";
            body = { query: args.query };
          } else if (fnName === "read_url") {
            edgeFn = "anima-web-read";
            body = { url: args.url, focus: args.focus };
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
        } catch (err) {
          clearTimeout(timeout);
          const errMsg =
            err.name === "AbortError"
              ? "Tool execution timed out"
              : `Tool execution failed: ${err.message}`;
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
