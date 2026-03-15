import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightIfNeeded } from "../_shared/cors.ts";
import { logActivity } from "../_shared/activity-log.ts";

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

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Accept service_role key for internal calls
    let user_id: string;
    if (token === serviceRoleKey) {
      user_id = "system";
    } else {
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
      if (authError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      user_id = claimsData.claims.sub;
    }

    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get API key: try user's encrypted key first, fall back to system key
    let apiKey: string | undefined;
    let usingOwnKey = false;

    if (user_id !== "system") {
      const { data: decryptedKeyData } = await supabase.rpc("decrypt_user_api_key", {
        p_user_id: user_id,
      });
      const userApiKey = typeof decryptedKeyData === "string" ? decryptedKeyData.trim() : "";
      if (userApiKey) {
        apiKey = userApiKey;
        usingOwnKey = true;
      }
    }

    if (!apiKey) {
      apiKey = Deno.env.get("OPENROUTER_API_KEY");
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Image generation not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
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

    // Log activity
    await logActivity(supabase, user_id, {
      type: "image",
      title: `Generated: ${prompt.slice(0, 60)}`,
    });

    return new Response(
      JSON.stringify({ image_url: signedUrlData.signedUrl, storage_path: fileName, text: textContent }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("anima-image-create error:", e);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred." }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
