import { useState, useCallback, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Response {
  model: string;
  content: string;
  resonance: number;
}

interface Message {
  id: string;
  type: "human" | "ai";
  content?: string;
  responses?: Response[];
  timestamp?: string;
  conversation_id?: string;
}

interface ModelConfig {
  name: string;
  quantity: number;
}

const MODEL_NAME_TO_ID: Record<string, string> = {
  "Claude 3.5 Sonnet": "claude",
  "GPT-4": "gpt4",
  "Gemini Pro": "gemini"
};

const MODEL_ID_TO_NAME: Record<string, string> = {
  "claude": "Claude",
  "gpt4": "GPT-4",
  "gemini": "Gemini"
};

export const useMultiModelChat = (selectedModels: ModelConfig[] = []) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const { toast } = useToast();

  const initializeConversation = useCallback(async () => {
    setIsInitializing(true);
    
    try {
      const { data: conversations, error: fetchError } = await supabase
        .from('conversations')
        .select('id, title, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      let currentConvId: string;

      if (!conversations || conversations.length === 0) {
        const { data: newConv, error: createError } = await supabase
          .from('conversations')
          .insert({
            title: 'New Conversation',
            metadata: { created_via: 'web' }
          })
          .select()
          .single();

        if (createError) throw createError;
        currentConvId = newConv.id;
      } else {
        currentConvId = conversations[0].id;
      }

      setConversationId(currentConvId);

      const { data: dbMessages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', currentConvId)
        .order('created_at', { ascending: true });

      if (msgError) throw msgError;

      const uiMessages: Message[] = [];
      dbMessages?.forEach(msg => {
        if (msg.role === 'user') {
          uiMessages.push({
            id: msg.id,
            type: 'human',
            content: msg.content || '',
            timestamp: new Date(msg.created_at).toLocaleTimeString(),
            conversation_id: msg.conversation_id
          });
        } else if (msg.role === 'assistant' && msg.model_responses) {
          uiMessages.push({
            id: msg.id,
            type: 'ai',
            responses: msg.model_responses.map((resp: any) => ({
              model: resp.model,
              content: resp.content,
              resonance: msg.resonance_scores?.[resp.model] || 0
            })),
            timestamp: new Date(msg.created_at).toLocaleTimeString(),
            conversation_id: msg.conversation_id
          });
        }
      });

      setMessages(uiMessages);
    } catch (error) {
      console.error('Error initializing conversation:', error);
      toast({
        title: "Error",
        description: "Failed to load conversation history.",
        variant: "destructive",
      });
    } finally {
      setIsInitializing(false);
    }
  }, [toast]);

  const loadConversation = useCallback(async (convId: string) => {
    setIsInitializing(true);
    setMessages([]);
    
    try {
      setConversationId(convId);

      const { data: dbMessages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (msgError) throw msgError;

      const uiMessages: Message[] = [];
      dbMessages?.forEach(msg => {
        if (msg.role === 'user') {
          uiMessages.push({
            id: msg.id,
            type: 'human',
            content: msg.content || '',
            timestamp: new Date(msg.created_at).toLocaleTimeString(),
            conversation_id: msg.conversation_id
          });
        } else if (msg.role === 'assistant' && msg.model_responses) {
          uiMessages.push({
            id: msg.id,
            type: 'ai',
            responses: msg.model_responses.map((resp: any) => ({
              model: resp.model,
              content: resp.content,
              resonance: msg.resonance_scores?.[resp.model] || 0
            })),
            timestamp: new Date(msg.created_at).toLocaleTimeString(),
            conversation_id: msg.conversation_id
          });
        }
      });

      setMessages(uiMessages);
    } catch (error) {
      console.error('Error loading conversation:', error);
      toast({
        title: "Error",
        description: "Failed to load conversation.",
        variant: "destructive",
      });
    } finally {
      setIsInitializing(false);
    }
  }, [toast]);

  const startNewConversation = useCallback(async () => {
    setMessages([]);
    setIsLoading(false);
    
    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({
        title: 'New Conversation',
        metadata: { created_via: 'web' }
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      toast({
        title: "Error",
        description: "Failed to create new conversation.",
        variant: "destructive",
      });
      return;
    }

    setConversationId(newConv.id);
  }, [toast]);

  const generateConversationTitle = async (firstMessage: string, convId: string) => {
    try {
      const title = firstMessage.length > 50 
        ? firstMessage.substring(0, 47) + '...'
        : firstMessage;

      await supabase
        .from('conversations')
        .update({ title })
        .eq('id', convId);
    } catch (error) {
      console.error('Error updating conversation title:', error);
    }
  };

  useEffect(() => {
    initializeConversation();
  }, [initializeConversation]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading || !conversationId) return;

    const activeModelIds = selectedModels
      .filter(m => m.quantity > 0)
      .map(m => MODEL_NAME_TO_ID[m.name])
      .filter(Boolean);

    if (activeModelIds.length === 0) {
      toast({
        title: "No Models Selected",
        description: "Please enable at least one model to chat.",
        variant: "destructive",
      });
      return;
    }

    const aiMessageId = crypto.randomUUID();

    try {
      const { data: savedUserMsg, error: userMsgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'user',
          content: content
        })
        .select()
        .single();

      if (userMsgError) throw userMsgError;

      const userMessage: Message = {
        id: savedUserMsg.id,
        type: "human",
        content,
        timestamp: "Just now",
        conversation_id: conversationId
      };

      setMessages(prev => [...prev, userMessage]);
      setIsLoading(true);

      // Generate title from first message
      if (messages.filter(m => m.type === 'human').length === 0) {
        generateConversationTitle(content, conversationId);
      }

      // Build conversation history for context
      const conversationHistory = messages
        .slice(-10)
        .map(msg => {
          if (msg.type === 'human') {
            return { role: 'user', content: msg.content || '' };
          } else if (msg.type === 'ai' && msg.responses) {
            return msg.responses.map(resp => ({
              role: 'assistant',
              content: `${resp.content}`,
              model: resp.model
            }));
          }
          return null;
        })
        .flat()
        .filter(Boolean);

      const initialResponses: Response[] = activeModelIds.map(modelId => ({
        model: MODEL_ID_TO_NAME[modelId] || modelId,
        content: "",
        resonance: 0
      }));

      setMessages(prev => [...prev, {
        id: aiMessageId,
        type: "ai",
        responses: initialResponses
      }]);

      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/multi-model-chat`;
      
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [
            ...conversationHistory,
            { role: "user", content }
          ],
          selectedModels: activeModelIds,
          conversationId: conversationId
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

      // Save AI response to database
      const finalResponses = messages
        .find(m => m.id === aiMessageId)
        ?.responses || [];

      if (finalResponses.length > 0) {
        const modelResponsesData = finalResponses.map(resp => ({
          model: resp.model,
          content: resp.content
        }));

        const resonanceScores = finalResponses.reduce((acc, resp) => {
          acc[resp.model] = resp.resonance;
          return acc;
        }, {} as Record<string, number>);

        await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            role: 'assistant',
            model_responses: modelResponsesData,
            resonance_scores: resonanceScores
          });
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Error",
        description: "Failed to get AI responses. Please try again.",
        variant: "destructive",
      });
      
      setMessages(prev => prev.filter(msg => msg.id !== aiMessageId));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, selectedModels, toast, conversationId, messages]);

  return { 
    messages, 
    isLoading: isLoading || isInitializing, 
    sendMessage,
    startNewConversation,
    loadConversation,
    conversationId
  };
};
