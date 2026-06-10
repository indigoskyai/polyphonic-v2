// anima-image-create
// Direct OpenAI gpt-image-2 (with gpt-image-1 fallback). Generates a high-quality
// image, uploads it to the `generated-images` bucket, and returns a signed URL.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withModelRetry } from "../_shared/modelRetry.ts";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { checkAndIncrement } from "../_shared/dailyQuota.ts";

type Size = "1024x1024" | "1536x1024" | "1024x1536" | "auto";

function pickSize(aspect?: string): Size {
  switch ((aspect || "").toLowerCase()) {
    case "wide":
    case "landscape":
    case "16:9":
    case "3:2":
      return "1536x1024";
    case "tall":
    case "portrait":
    case "9:16":
    case "2:3":
      return "1024x1536";
    case "square":
    case "1:1":
      return "1024x1024";
    default:
      return "auto";
  }
}

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
    const prompt: string = (body?.prompt ?? "").toString();
    const aspect: string | undefined = body?.aspect_ratio;
    const transparent: boolean = body?.transparent === true;

    if (!prompt || prompt.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), { status: 400, headers: jsonHeaders });
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "Image generation not configured (OPENAI_API_KEY missing)" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    if (userId !== "system") {
      try {
        await checkAndIncrement(userId, "image-generation");
      } catch (e) {
        return new Response(JSON.stringify({ error: "Daily image generation limit reached" }), {
          status: 429,
          headers: jsonHeaders,
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Use gpt-image-1 at medium quality: ~10–15s, well within edge timeout.
    // gpt-image-2 high-quality routinely exceeds 60s and trips client-side
    // timeouts in the chat-multi -> tool-execute -> image-create chain.
    const requestBody: Record<string, unknown> = {
      model: "gpt-image-1",
      prompt: prompt.trim(),
      n: 1,
      size: pickSize(aspect),
      quality: "medium",
      output_format: "png",
    };
    if (transparent) requestBody.background = "transparent";

    console.log("[anima-image-create] requesting", { model: requestBody.model, size: requestBody.size, transparent });
    const t0 = Date.now();
    const response = await withModelRetry(() => fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60000),
    }));
    console.log("[anima-image-create] openai responded", { ms: Date.now() - t0, status: response.status });

    if (!response.ok) {
      const text = await response.text();
      console.error("OpenAI image generation failed:", response.status, text);
      const status = response.status === 429 ? 429 : response.status === 402 ? 402 : 500;
      return new Response(JSON.stringify({ error: "Image generation failed", detail: text.slice(0, 300) }), {
        status,
        headers: jsonHeaders,
      });
    }

    const data = await response.json();
    const item = data?.data?.[0];
    const b64 = item?.b64_json as string | undefined;
    const revisedPrompt = (item?.revised_prompt as string | undefined) || prompt.trim();
    if (!b64) {
      return new Response(JSON.stringify({ error: "No image returned" }), { status: 422, headers: jsonHeaders });
    }

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const fileName = `${userId}/${crypto.randomUUID()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("generated-images")
      .upload(fileName, bytes, { contentType: "image/png", upsert: false });
    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to save generated image" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const { data: signed, error: signedErr } = await supabase.storage
      .from("generated-images")
      .createSignedUrl(fileName, 60 * 60 * 24 * 7); // 7 days
    if (signedErr || !signed?.signedUrl) {
      console.error("Signed URL error:", signedErr);
      return new Response(JSON.stringify({ error: "Failed to generate image URL" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    if (userId !== "system") {
      await logActivity(supabase, userId, {
        type: "image",
        title: `Generated: ${prompt.slice(0, 60)}`,
      });
    }

    return new Response(
      JSON.stringify({
        image_url: signed.signedUrl,
        storage_path: fileName,
        revised_prompt: revisedPrompt,
        model: requestBody.model,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (e) {
    console.error("anima-image-create error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred." }), {
      status: 500,
      headers: getCorsHeaders(req) as any,
    });
  }
});
