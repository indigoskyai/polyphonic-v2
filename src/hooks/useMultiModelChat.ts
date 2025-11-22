import { useState, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

interface Response {
  model: string;
  content: string;
  resonance: number;
}

interface Message {
  id: number;
  type: "human" | "ai";
  content?: string;
  responses?: Response[];
  timestamp?: string;
}

export const useMultiModelChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const messageIdRef = useRef(0);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: messageIdRef.current++,
      type: "human",
      content,
      timestamp: "Just now"
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Initialize AI response with empty content for each model
    const aiMessageId = messageIdRef.current++;
    const initialResponses: Response[] = [
      { model: "Claude", content: "", resonance: 0 },
      { model: "GPT-4", content: "", resonance: 0 },
      { model: "Gemini", content: "", resonance: 0 }
    ];

    setMessages(prev => [...prev, {
      id: aiMessageId,
      type: "ai",
      responses: initialResponses
    }]);

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/multi-model-chat`;
      
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content }]
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          toast({
            title: "Rate Limit Exceeded",
            description: "Please try again in a moment.",
            variant: "destructive",
          });
          throw new Error("Rate limit exceeded");
        }
        if (response.status === 402) {
          toast({
            title: "Payment Required",
            description: "Please add credits to your workspace.",
            variant: "destructive",
          });
          throw new Error("Payment required");
        }
        throw new Error("Failed to start stream");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

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
            const event = JSON.parse(data);

            if (event.type === "delta" || event.type === "done") {
              setMessages(prev => prev.map(msg => {
                if (msg.id === aiMessageId && msg.responses) {
                  return {
                    ...msg,
                    responses: msg.responses.map(resp =>
                      resp.model === event.name
                        ? {
                            ...resp,
                            content: event.content,
                            resonance: event.resonance || resp.resonance
                          }
                        : resp
                    )
                  };
                }
                return msg;
              }));
            } else if (event.type === "error") {
              console.error(`${event.name} error:`, event.error);
              toast({
                title: `${event.name} Error`,
                description: event.error,
                variant: "destructive",
              });
            }
          } catch (e) {
            console.error("Error parsing event:", e);
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Error",
        description: "Failed to get AI responses. Please try again.",
        variant: "destructive",
      });
      
      // Remove the failed AI message
      setMessages(prev => prev.filter(msg => msg.id !== aiMessageId));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, toast]);

  return { messages, isLoading, sendMessage };
};
