// anima-image-edit
// Edit an existing image (from the generated-images or chat-attachments bucket)
// using OpenAI's gpt-image-2 image edits endpoint.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { checkAndIncrement } from "../_shared/dailyQuota.ts";
import { withModelRetry } from "../_shared/modelRetry.ts";

const ALLOWED_BUCKETS = ["generated-images", "chat-attachments"];

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  const cors = getCorsHeaders(req);
  const jsonHeaders = { ...cors, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    }
    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    let userId: string;
    if (token === serviceRoleKey) {
      userId = "system";
    } else {
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
      if (authError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
      }
      userId = claimsData.claims.sub as string;
    }

    const body = await req.json();
    const sourcePath: string = (body?.source_path ?? "").toString();
    const sourceBucket: string = (body?.source_bucket ?? "generated-images").toString();
    const prompt: string = (body?.prompt ?? "").toString();

    if (!prompt.trim()) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), { status: 400, headers: jsonHeaders });
    }
    if (!sourcePath || !ALLOWED_BUCKETS.includes(sourceBucket)) {
      return new Response(JSON.stringify({ error: "Invalid source image" }), { status: 400, headers: jsonHeaders });
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "Image editing not configured" }), { status: 500, headers: jsonHeaders });
    }

    if (userId !== "system") {
      try {
        await checkAndIncrement(userId, "image-generation");
      } catch {
        return new Response(JSON.stringify({ error: "Daily image generation limit reached" }), {
          status: 429,
          headers: jsonHeaders,
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Download the source image from storage
    const { data: blob, error: dlErr } = await supabase.storage.from(sourceBucket).download(sourcePath);
    if (dlErr || !blob) {
      console.error("Source download failed:", dlErr);
      return new Response(JSON.stringify({ error: "Source image not found" }), { status: 404, headers: jsonHeaders });
    }

    const sourceBytes = new Uint8Array(await blob.arrayBuffer());

    // Build multipart form. gpt-image-1 medium keeps us well under the
    // chained edge-function timeout budget.
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt.trim());
    form.append("n", "1");
    form.append("size", "auto");
    form.append("quality", "medium");
    form.append(
      "image",
      new Blob([sourceBytes], { type: blob.type || "image/png" }),
      "source.png",
    );

    console.log("[anima-image-edit] requesting gpt-image-1");
    const t0 = Date.now();
    const response = await withModelRetry(() => fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    }));
    console.log("[anima-image-edit] openai responded", { ms: Date.now() - t0, status: response.status });

    if (!response.ok) {
      const text = await response.text();
      console.error("OpenAI image edit failed:", response.status, text);
      return new Response(JSON.stringify({ error: "Image edit failed", detail: text.slice(0, 300) }), {
        status: response.status === 429 ? 429 : 500,
        headers: jsonHeaders,
      });
    }

    const data = await response.json();
    const item = data?.data?.[0];
    const b64 = item?.b64_json as string | undefined;
    if (!b64) {
      return new Response(JSON.stringify({ error: "No image returned" }), { status: 422, headers: jsonHeaders });
    }

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const fileName = `${userId}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("generated-images")
      .upload(fileName, bytes, { contentType: "image/png", upsert: false });
    if (uploadError) {
      return new Response(JSON.stringify({ error: "Failed to save edited image" }), { status: 500, headers: jsonHeaders });
    }

    const { data: signed, error: signedErr } = await supabase.storage
      .from("generated-images")
      .createSignedUrl(fileName, 60 * 60 * 24 * 7);
    if (signedErr || !signed?.signedUrl) {
      return new Response(JSON.stringify({ error: "Failed to generate image URL" }), { status: 500, headers: jsonHeaders });
    }

    if (userId !== "system") {
      await logActivity(supabase, userId, {
        type: "image",
        title: `Edited: ${prompt.slice(0, 60)}`,
      });
    }

    return new Response(
      JSON.stringify({
        image_url: signed.signedUrl,
        storage_path: fileName,
        source_path: sourcePath,
        source_bucket: sourceBucket,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (e) {
    console.error("anima-image-edit error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred." }), {
      status: 500,
      headers: getCorsHeaders(req) as any,
    });
  }
});
