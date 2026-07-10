// anima-image-create
// Routes image generation through the user's configured provider.
// Default: OpenRouter (Nano Banana) using the user's OpenRouter key,
// falling back to the system OPENROUTER_API_KEY. Users can opt into
// their personal OpenAI key via Settings → Models.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { checkAndIncrement } from "../_shared/dailyQuota.ts";
import {
  generateViaOpenAI,
  generateViaOpenRouter,
  ImageProviderError,
  resolveImageModel,
} from "../_shared/imageModel.ts";

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
    const body = await req.json();
    if (token === serviceRoleKey) {
      userId = typeof body?.user_id === "string" && body.user_id ? body.user_id : "system";
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

    const prompt: string = (body?.prompt ?? "").toString();
    const aspect: string | undefined = body?.aspect_ratio;
    const transparent: boolean = body?.transparent === true;

    if (!prompt || prompt.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), { status: 400, headers: jsonHeaders });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { config, error: cfgErr } = await resolveImageModel(supabase, userId);
    if (!config) {
      return new Response(JSON.stringify({ error: cfgErr || "Image generation not configured" }), {
        status: 500,
        headers: jsonHeaders,
      });
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

    console.log("[anima-image-create] requesting", {
      provider: config.provider,
      model: config.model,
      keySource: config.keySource,
    });
    const t0 = Date.now();
    let image;
    try {
      image = config.provider === "openai"
        ? await generateViaOpenAI(config, prompt.trim(), aspect, transparent)
        : await generateViaOpenRouter(config, prompt.trim());
    } catch (e) {
      const status = e instanceof ImageProviderError ? e.status : 500;
      const message = e instanceof Error ? e.message : "Image generation failed";
      console.error("[anima-image-create] provider error", status, message);
      return new Response(JSON.stringify({ error: "Image generation failed", detail: message }), {
        status: status === 429 || status === 402 || status === 422 ? status : 500,
        headers: jsonHeaders,
      });
    }
    console.log("[anima-image-create] provider responded", { ms: Date.now() - t0 });

    const ext = (image.mimeType.split("/")[1] || "png").toLowerCase();
    const fileName = `${userId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("generated-images")
      .upload(fileName, image.bytes, { contentType: image.mimeType, upsert: false });
    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to save generated image" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const { data: signed, error: signedErr } = await supabase.storage
      .from("generated-images")
      .createSignedUrl(fileName, 60 * 60 * 24 * 7);
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
        revised_prompt: image.revisedPrompt || prompt.trim(),
        model: config.model,
        provider: config.provider,
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
