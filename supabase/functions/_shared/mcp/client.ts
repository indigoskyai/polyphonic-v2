export type McpToolRegistration = {
  serverId: string;
  serverName: string;
  serverUrl: string;
  toolName: string;
  registeredName: string;
  schema: {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
};

type SupabaseLike = {
  from: (table: string) => any;
};

const MCP_TIMEOUT_MS = 10_000;

export async function loadMcpToolRegistrations(
  supabase: SupabaseLike,
  userId: string,
  agentId: string,
): Promise<McpToolRegistration[]> {
  const { data, error } = await supabase
    .from("mcp_servers")
    .select("id, name, url, status")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .eq("status", "on")
    .limit(10);

  if (error) {
    console.warn("[mcp] server load failed:", error);
    return [];
  }

  const results = await Promise.allSettled((data || []).map(async (server: any) => {
    const tools = await listMcpTools(server.url);
    return tools.map((tool: any): McpToolRegistration => {
      const registeredName = `mcp__${slug(server.name || server.id)}__${slug(tool.name || "tool")}`;
      return {
        serverId: server.id,
        serverName: server.name || server.id,
        serverUrl: server.url,
        toolName: tool.name,
        registeredName,
        schema: {
          type: "function",
          function: {
            name: registeredName,
            description: `[MCP: ${server.name || server.id}] ${tool.description || tool.name}`,
            parameters: tool.inputSchema || tool.input_schema || { type: "object", properties: {} },
          },
        },
      };
    });
  }));

  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

export async function callMcpTool(registration: McpToolRegistration, args: Record<string, unknown>): Promise<unknown> {
  return rpc(registration.serverUrl, "tools/call", {
    name: registration.toolName,
    arguments: args,
  });
}

async function listMcpTools(serverUrl: string): Promise<unknown[]> {
  const initialized = await rpc(serverUrl, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "polyphonic-luca", version: "1.0.0" },
  }).catch(() => null);

  if (initialized) {
    await rpc(serverUrl, "notifications/initialized", {}).catch(() => null);
  }

  const listed = await rpc(serverUrl, "tools/list", {});
  return Array.isArray((listed as any)?.tools) ? (listed as any).tools : [];
}

async function rpc(serverUrl: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);
  try {
    const response = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`MCP ${method} failed with ${response.status}`);
    const text = await response.text();
    const payload = parseRpcPayload(text);
    if (payload.error) throw new Error(payload.error.message || "MCP error");
    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

function parseRpcPayload(text: string): any {
  if (text.trim().startsWith("data:")) {
    const line = text.split("\n").find((part) => part.startsWith("data:"));
    return JSON.parse((line || "data: {}").replace(/^data:\s*/, ""));
  }
  return JSON.parse(text);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "tool";
}
