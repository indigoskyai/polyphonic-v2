import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

const BUCKET = "workspace-files";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 1000;

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const body = await req.json().catch(() => ({}));

    const userId = await resolveUserId(supabaseUrl, anonKey, serviceKey, authHeader, body.user_id);
    if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

    const operation = String(body.operation || "");
    const path = sanitizePath(String(body.path || ""));
    if (!["read", "write", "list", "delete"].includes(operation)) {
      return json({ error: "Invalid workspace operation" }, 400, corsHeaders);
    }
    if (operation !== "list" && !path) {
      return json({ error: "Path required" }, 400, corsHeaders);
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const storage = supabase.storage.from(BUCKET);

    if (operation === "list") {
      const prefix = objectPath(userId, path);
      const { data, error } = await storage.list(prefix, {
        limit: MAX_FILES,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) return json({ error: error.message }, 500, corsHeaders);
      return json({
        ok: true,
        files: (data || []).map((entry: any) => ({
          name: entry.name,
          path: path ? `${path}/${entry.name}` : entry.name,
          size: entry.metadata?.size ?? null,
          updated_at: entry.updated_at ?? entry.created_at ?? null,
          is_folder: !entry.id,
        })),
      }, 200, corsHeaders);
    }

    const fullPath = objectPath(userId, path);

    if (operation === "read") {
      const { data, error } = await storage.download(fullPath);
      if (error) return json({ error: error.message }, 404, corsHeaders);
      const content = await data.text();
      return json({ ok: true, path, content, bytes: new TextEncoder().encode(content).length }, 200, corsHeaders);
    }

    if (operation === "delete") {
      const { error } = await storage.remove([fullPath]);
      if (error) return json({ error: error.message }, 500, corsHeaders);
      return json({ ok: true, path }, 200, corsHeaders);
    }

    const content = String(body.content ?? "");
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > MAX_FILE_BYTES) {
      return json({ error: "File exceeds 10MB limit" }, 413, corsHeaders);
    }

    const usage = await workspaceUsage(supabase, userId);
    if (usage.files >= MAX_FILES) return json({ error: "Workspace file limit reached" }, 400, corsHeaders);
    if (usage.bytes + bytes > MAX_TOTAL_BYTES) return json({ error: "Workspace storage limit reached" }, 400, corsHeaders);

    const { error } = await storage.upload(fullPath, new Blob([content], { type: "text/plain;charset=utf-8" }), {
      upsert: true,
      contentType: "text/plain;charset=utf-8",
    });
    if (error) return json({ error: error.message }, 500, corsHeaders);

    return json({ ok: true, path, bytes }, 200, corsHeaders);
  } catch (err) {
    console.error("anima-workspace-file error:", err);
    return json({ error: "Internal error" }, 500, getCorsHeaders(req));
  }
});

async function resolveUserId(
  supabaseUrl: string,
  anonKey: string,
  serviceKey: string,
  authHeader: string,
  bodyUserId?: string,
): Promise<string | null> {
  const token = authHeader.replace("Bearer ", "");
  if (token && token === serviceKey) return typeof bodyUserId === "string" ? bodyUserId : null;
  if (!authHeader.startsWith("Bearer ")) return null;
  const supabaseAuth = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user?.id || null;
}

function sanitizePath(path: string): string {
  return path
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/")
    .slice(0, 240);
}

function objectPath(userId: string, path: string): string {
  return ["workspaces", userId, path].filter(Boolean).join("/");
}

async function workspaceUsage(supabase: any, userId: string): Promise<{ bytes: number; files: number }> {
  try {
    const { data } = await supabase
      .schema("storage")
      .from("objects")
      .select("metadata")
      .eq("bucket_id", BUCKET)
      .like("name", `workspaces/${userId}/%`)
      .limit(MAX_FILES + 1);

    const files = data?.length || 0;
    const bytes = (data || []).reduce((sum: number, row: any) => sum + Number(row.metadata?.size || 0), 0);
    return { bytes, files };
  } catch {
    return { bytes: 0, files: 0 };
  }
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
