import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, selectedModels, conversationId, openRouterKey } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    // Determine which provider to use
    const useOpenRouter = !!openRouterKey;
    const apiKey = useOpenRouter ? openRouterKey : LOVABLE_API_KEY;
    const apiUrl = useOpenRouter 
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    
    if (!apiKey) {
      throw new Error(useOpenRouter ? "OpenRouter API key not provided" : "LOVABLE_API_KEY is not configured");
    }

    console.log(`[Multi-Model Chat] Provider: ${useOpenRouter ? 'OpenRouter' : 'Lovable AI'}`);
    console.log(`[Multi-Model Chat] Processing with ${messages.length} messages in context`);
    console.log(`[Multi-Model Chat] Conversation ID: ${conversationId || 'none'}`);

    // Define models based on provider
    const lovableModels = [
      { id: "gemini-pro", model: "google/gemini-2.5-pro", name: "Gemini Pro", description: "Top-tier reasoning & vision" },
      { id: "gemini-flash", model: "google/gemini-2.5-flash", name: "Gemini Flash", description: "Fast & balanced" },
      { id: "gemini-flash-lite", model: "google/gemini-2.5-flash-lite", name: "Gemini Flash Lite", description: "Fastest & cheapest" },
      { id: "gpt5", model: "openai/gpt-5", name: "GPT-5", description: "Powerful all-rounder" },
      { id: "gpt5-mini", model: "openai/gpt-5-mini", name: "GPT-5 Mini", description: "Strong & efficient" },
      { id: "gpt5-nano", model: "openai/gpt-5-nano", name: "GPT-5 Nano", description: "Speed & cost optimized" },
    ];

    const openRouterModels = [
      { id: "gemini-pro", model: "google/gemini-2.5-pro", name: "Gemini Pro" },
      { id: "gemini-flash", model: "google/gemini-2.5-flash", name: "Gemini Flash" },
      { id: "gemini-flash-lite", model: "google/gemini-2.5-flash-lite", name: "Gemini Flash Lite" },
      { id: "gpt5", model: "openai/gpt-5", name: "GPT-5" },
      { id: "gpt5-mini", model: "openai/gpt-5-mini", name: "GPT-5 Mini" },
      { id: "gpt5-nano", model: "openai/gpt-5-nano", name: "GPT-5 Nano" },
      { id: "claude-opus", model: "anthropic/claude-opus-4.1-20250805", name: "Claude Opus 4.1" },
      { id: "claude-sonnet", model: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
      { id: "gpt4o", model: "openai/gpt-4o", name: "GPT-4o" },
    ];

    const allModels = useOpenRouter ? openRouterModels : lovableModels;

    // Filter models based on selection (default to all if not specified)
    const models = selectedModels 
      ? allModels.filter(m => selectedModels.includes(m.id))
      : allModels;

    // Create a readable stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        // Start all model requests in parallel
        const modelPromises = models.map(async ({ id, model, name }) => {
          try {
            const headers: Record<string, string> = {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            };
            
            // OpenRouter optional headers for rankings
            if (useOpenRouter) {
              headers["HTTP-Referer"] = "https://polyphonic.app";
              headers["X-Title"] = "Polyphonic";
            }

            const response = await fetch(apiUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({
                model,
                messages: [
                  { 
                    role: "system", 
                    content: messages.length > 2 
                      ? "You are a helpful AI assistant in a multi-model conversation system. You can see the conversation history. Build upon previous responses and maintain context. If other AI models have already provided answers, you can reference or expand on their insights. Provide clear, concise answers. Keep responses under 100 words unless the question requires more detail."
                      : "You are a helpful AI assistant. Provide clear, concise answers. Keep responses under 100 words."
                  },
                  ...messages,
                ],
                stream: true,
                // Note: temperature removed as it's not supported by newer models (gpt-5, gemini-2.5-pro)
              }),
            });

            if (!response.ok) {
              if (response.status === 429) {
                throw new Error("Rate limit exceeded");
              }
              if (response.status === 402) {
                throw new Error("Payment required");
              }
              const errorText = await response.text();
              console.error(`${name} error:`, response.status, errorText);
              throw new Error(`${name} API error`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            let buffer = "";
            let fullContent = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.trim() || line.startsWith(":")) continue;
                if (!line.startsWith("data: ")) continue;

                const data = line.slice(6).trim();
                if (data === "[DONE]") continue;

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  
                  if (content) {
                    fullContent += content;
                    // Send delta update
                    const event = {
                      type: "delta",
                      model: id,
                      name,
                      content: fullContent,
                      delta: content
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                  }
                } catch (e) {
                  console.error(`Error parsing ${name} response:`, e);
                }
              }
            }

            // Calculate simple resonance based on response length and coherence
            const resonance = Math.min(0.95, 0.7 + (fullContent.length / 1000) * 0.2);
            
            // Send completion event
            const doneEvent = {
              type: "done",
              model: id,
              name,
              content: fullContent,
              resonance
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`));
            
          } catch (error) {
            console.error(`${name} error:`, error);
            const errorEvent = {
              type: "error",
              model: id,
              name,
              error: error instanceof Error ? error.message : "Unknown error"
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          }
        });

        // Wait for all models to complete
        await Promise.all(modelPromises);
        
        // Send final done signal
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Multi-model chat error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
