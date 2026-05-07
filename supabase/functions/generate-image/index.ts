import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";

serve(async (req) => {
  const preflightResponse = handleCorsPreflightIfNeeded(req);
  if (preflightResponse) return preflightResponse;

  try {
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const user_id = userData.user.id;
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Enforce daily limit for free users (same as chat)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: decryptedKeyData } = await supabase.rpc("decrypt_user_api_key", { p_user_id: user_id });
    const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
    const usingOwnKey = !!userApiKey;

    // Use user's OpenRouter key if available, fall back to system key
    const apiKey = usingOwnKey ? userApiKey : userApiKey;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Image generation not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (!usingOwnKey) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const { count, error: countError } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("role", "user")
        .gte("created_at", today.toISOString());

      if (!countError && (count ?? 0) >= 25) {
        return new Response(
          JSON.stringify({
            error: "daily_limit_reached",
            message: "You've reached your daily message limit. Add your own API key in Settings to continue.",
          }),
          { status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
    }

    console.log("Generating image with prompt:", prompt.slice(0, 100));

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://polyphonic.chat",
        "X-Title": "Polyphonic",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:image-generation",
        messages: [
          {
            role: "user",
            content: prompt.trim(),
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "Insufficient credits for image generation." }),
          { status: 402, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("Image generation error:", status, text);
      return new Response(JSON.stringify({ error: "Image generation failed" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const choice = data.choices?.[0]?.message;
    const base64Url = choice?.images?.[0]?.image_url?.url;
    const textContent = choice?.content || "";

    if (!base64Url) {
      return new Response(
        JSON.stringify({ error: "No image was generated. Try a different prompt.", text: textContent }),
        { status: 422, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Upload base64 image to storage
    const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, "");
    const mimeMatch = base64Url.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
    const ext = mimeType.split("/")[1] || "png";
    const fileName = `${user_id}/${crypto.randomUUID()}.${ext}`;

    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from("generated-images")
      .upload(fileName, imageBytes, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to save generated image" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Generate a signed URL (1 hour expiry) since bucket is private
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("generated-images")
      .createSignedUrl(fileName, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("Signed URL error:", signedUrlError);
      return new Response(JSON.stringify({ error: "Failed to generate image URL" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Return both the signed URL for immediate display and the storage path for later resolution
    return new Response(
      JSON.stringify({ image_url: signedUrlData.signedUrl, storage_path: fileName, text: textContent }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-image error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred." }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
