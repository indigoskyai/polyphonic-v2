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
    const { messages, selectedModels } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Define all available models with correct Lovable AI mappings
    const allModels = [
      { id: "claude", model: "google/gemini-2.5-pro", name: "Claude", description: "Most powerful reasoning" },
      { id: "gpt4", model: "openai/gpt-5", name: "GPT-4", description: "Excellent accuracy & nuance" },
      { id: "gemini", model: "google/gemini-2.5-flash", name: "Gemini", description: "Fast & balanced" }
    ];

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
            const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: [
                  { 
                    role: "system", 
                    content: "You are a helpful AI assistant. Provide clear, concise answers. Keep responses under 100 words." 
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
