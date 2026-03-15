import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePageNavigate } from "@/hooks/usePageNavigate";
import PageTransition from "@/components/PageTransition";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useCuriosityQuestions } from "@/hooks/useCuriosityQuestions";
import { SettingsDialog } from "@/components/SettingsDialog";
import { ImportBanner } from "@/components/ImportBanner";
import { useImportStatus } from "@/hooks/useImportStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { getBackgroundStyle } from "@/lib/backgrounds";
import { GLASS_STYLE, GLASS_DROPDOWN_STYLE, GLASS_HOVER, GLASS_ACTIVE, GLASS_BORDER, GLASS_ICON, GLASS_ICON_HOVER, GLASS_LABEL, GLASS_MUTED, GLASS_TEXT, GLASS_INPUT_BG, GLASS_INPUT_BORDER, GLASS_DIVIDER, GLASS_BUTTON_INACTIVE, GLASS_BUTTON_IMAGE_GEN, GLASS_BUTTON_WEB_SEARCH, GLASS_BUTTON_IMAGE_GEN_HOVER, GLASS_BUTTON_WEB_SEARCH_HOVER, GLASS_INPUT_FOCUS_BORDER, GLASS_INPUT_FOCUS_SHADOW } from "@/lib/glassmorphism";
import {
  Plus, Send, Trash2, LogOut, MessageSquare, Search, Settings, Archive,
  Paperclip, ArrowUp, User, PanelLeftOpen, X, Loader2, Square, Mic, MicOff, ImageIcon,
  Sparkles, ChevronDown, ChevronLeft, ChevronRight, BookOpen, Image, FileText, Pencil, Menu, Copy, Check, HelpCircle,
  Globe, RefreshCw, GitBranch
} from "lucide-react";
import { ModelSelector, AVAILABLE_MODELS } from "@/components/ModelSelector";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ReactMarkdown from "react-markdown";
import { CodeBlock, InlineCode } from "@/components/CodeBlock";
import { preprocessAsciiArt } from "@/lib/asciiArt";
import { cn } from "@/lib/utils";
import ImageLightbox from "@/components/ImageLightbox";
import { EmotionalStateCompact } from "@/components/EmotionalStateDisplay";
import { ThoughtInitiation } from "@/components/ThoughtInitiation";
import { Brain } from "lucide-react";

interface Conversation {
  id: string;
  title: string | null;
  updated_at: string;
  parent_conversation_id?: string | null;
}

interface Attachment {
  url: string;
  path?: string;
  name: string;
  type: string;
  size: number;
}

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
  attachments?: Attachment[] | null;
  model?: string | null;
  edited_at?: string | null;
}

interface Variant {
  id: string;
  content: string;
  model: string | null;
  created_at: string;
}

const Chat = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { exiting, navigateTo } = usePageNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { settings, updateSettings } = useUserSettings();
  const { questions: curiosityQuestions, dismissAll: dismissCuriosity, markShown, markAnswered, refetch: refetchCuriosity } = useCuriosityQuestions(user?.id);
  const [unreadJournalCount, setUnreadJournalCount] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [reflectionsOpen, setReflectionsOpen] = useState(false);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [imageGenMode, setImageGenMode] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  const [messageVariants, setMessageVariants] = useState<Record<string, Variant[]>>({});
  const [activeVariantIndex, setActiveVariantIndex] = useState<Record<string, number>>({});
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const { activeImport, isActive: isImportActive, startTracking: startImportTracking, dismiss: dismissImport } = useImportStatus();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const prevConversationIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedModel = settings?.voice_model || settings?.selected_model || "anthropic/claude-opus-4.6";

  const handleModelChange = async (modelId: string) => {
    try {
      await updateSettings({ voice_model: modelId, selected_model: modelId });
    } catch (e) {
      console.error("Failed to update model:", e);
    }
  };

  const toggleSpeechToText = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Speech recognition not supported", description: "Try Chrome, Edge, or Safari.", variant: "destructive" });
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // Collapse sidebar on initial mobile load
  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  }, [isMobile]);

  useEffect(() => {
    if (user) {
      loadConversations();
      supabase
        .from("journal_entries")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false)
        .eq("user_id", user.id)
        .then(({ count }) => setUnreadJournalCount(count || 0));

      // Handle ?conversation= query param (e.g. from Gallery)
      const convParam = searchParams.get("conversation");
      if (convParam) {
        setActiveConversationId(convParam);
        searchParams.delete("conversation");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [user]);

  useEffect(() => {
    if (prevConversationIdRef.current && prevConversationIdRef.current !== activeConversationId && user) {
      const prevId = prevConversationIdRef.current;
      supabase.auth.getSession().then(({ data: { session } }) => {
        const accessToken = session?.access_token;
        if (!accessToken) return;
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/memory-extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ conversation_id: prevId }),
        }).catch((e) => console.error("Memory extraction failed:", e));
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/journal-write`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ conversation_id: prevId, trigger_type: "post_conversation" }),
        })
          .then(() => {
            supabase
              .from("journal_entries")
              .select("id", { count: "exact", head: true })
              .eq("is_read", false)
              .eq("user_id", user.id)
              .then(({ count }) => setUnreadJournalCount(count || 0));
          })
          .catch((e) => console.error("Journal write failed:", e));
      });
    }
    prevConversationIdRef.current = activeConversationId;

    if (activeConversationId) {
      loadMessages(activeConversationId);
      if (isMobile) setSidebarCollapsed(true);
    } else {
      setMessages([]);
      refetchCuriosity();
    }
  }, [activeConversationId]);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const handleChatScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const threshold = 150;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + "px";
    }
  }, [input]);

  // Resolve signed URLs for attachments that store paths
  useEffect(() => {
    const pathsToResolve: string[] = [];
    for (const msg of messages) {
      if (msg.attachments) {
        for (const att of msg.attachments as Attachment[]) {
          const storagePath = att.path;
          if (storagePath && !resolvedUrls[storagePath]) {
            pathsToResolve.push(storagePath);
          }
        }
      }
    }
    if (pathsToResolve.length === 0) return;
    Promise.all(
      pathsToResolve.map(async (p) => {
        const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(p, 3600);
        return { path: p, url: data?.signedUrl || "" };
      })
    ).then((results) => {
      setResolvedUrls((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.url) next[r.path] = r.url;
        }
        return next;
      });
    });
  }, [messages]);

  const getAttachmentUrl = (att: Attachment): string => {
    if (att.path && resolvedUrls[att.path]) return resolvedUrls[att.path];
    return att.url;
  };

  const loadConversations = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("conversations")
      .select("id, title, updated_at, parent_conversation_id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (data) setConversations(data as Conversation[]);
  };

  const loadMessages = async (conversationId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("id, role, content, created_at, attachments, model, edited_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (data) {
      setMessages(data as unknown as Message[]);
      // Load variants for assistant messages
      const assistantIds = (data as any[]).filter((m) => m.role === "assistant").map((m) => m.id);
      if (assistantIds.length > 0) {
        const { data: variantsData } = await supabase
          .from("message_variants")
          .select("id, message_id, content, model, created_at")
          .in("message_id", assistantIds)
          .order("created_at", { ascending: true });
        if (variantsData && variantsData.length > 0) {
          const variantMap: Record<string, Variant[]> = {};
          const indexMap: Record<string, number> = {};
          for (const v of variantsData as any[]) {
            if (!variantMap[v.message_id]) variantMap[v.message_id] = [];
            variantMap[v.message_id].push({ id: v.id, content: v.content, model: v.model, created_at: v.created_at });
          }
          // Set active index to whichever variant matches the current message content
          for (const msgId of Object.keys(variantMap)) {
            const msg = (data as any[]).find((m) => m.id === msgId);
            if (msg) {
              const matchIdx = variantMap[msgId].findIndex((v) => v.content === msg.content);
              indexMap[msgId] = matchIdx >= 0 ? matchIdx : variantMap[msgId].length - 1;
            }
          }
          setMessageVariants(variantMap);
          setActiveVariantIndex(indexMap);
        } else {
          setMessageVariants({});
          setActiveVariantIndex({});
        }
      } else {
        setMessageVariants({});
        setActiveVariantIndex({});
      }
    }
  };

  const ALLOWED_TYPES = [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf", "text/plain", "text/csv",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.txt', '.csv', '.doc', '.docx'];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) => {
      if (!ALLOWED_TYPES.includes(f.type)) {
        toast({ title: "Unsupported file type", description: `${f.name} is not supported.`, variant: "destructive" });
        return false;
      }
      const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0];
      if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
        toast({ title: "Invalid file extension", description: `${f.name} has an unsupported extension.`, variant: "destructive" });
        return false;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast({ title: "File too large", description: `${f.name} exceeds 10MB limit.`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setPendingFiles((prev) => [...prev, ...valid].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadFiles = async (convId: string): Promise<Attachment[]> => {
    if (pendingFiles.length === 0) return [];
    setIsUploading(true);
    const uploaded: Attachment[] = [];
    try {
      for (const file of pendingFiles) {
        const ext = file.name.split(".").pop();
        const path = `${user!.id}/${convId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("chat-attachments")
          .upload(path, file);
        if (error) {
          console.error("Upload error:", error);
          continue;
        }
        // Store the path instead of signed URL for persistence
        uploaded.push({
          url: "", // legacy field, kept for compat
          path,
          name: file.name,
          type: file.type,
          size: file.size,
        });
      }
    } finally {
      setIsUploading(false);
      setPendingFiles([]);
    }
    return uploaded;
  };

  const createConversation = async () => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id })
      .select("id")
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return null;
    }
    setActiveConversationId(data.id);
    await loadConversations();
    return data.id;
  };

  const handleReflectionClick = async (question: { id: string; question: string }) => {
    if (!user) return;
    setReflectionsOpen(false);

    const title = question.question.slice(0, 60);
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (convError || !convData) {
      toast({ title: "Error", description: "Failed to create conversation", variant: "destructive" });
      return;
    }

    const { data: msgData } = await supabase
      .from("messages")
      .insert({
        conversation_id: convData.id,
        user_id: user.id,
        role: "assistant",
        content: question.question,
      })
      .select("id, role, content, created_at")
      .single();

    await markAnswered(question.id);

    setMessages(msgData ? [msgData as unknown as Message] : []);
    setActiveConversationId(convData.id);
    await loadConversations();
  };

  const deleteConversation = async (id: string) => {
    if (!user) return;
    await supabase.from("conversations").delete().eq("id", id).eq("user_id", user.id);
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setMessages([]);
    }
    await loadConversations();
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!user || !activeConversationId || !newContent.trim()) return;
    setEditingMessageId(null);
    setEditingMessageContent("");

    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    // Update the message content and set edited_at
    await supabase.from("messages").update({ content: newContent.trim(), edited_at: new Date().toISOString() } as any).eq("id", messageId);

    // Delete all messages after the edited one
    const subsequentMessages = messages.slice(msgIndex + 1);
    if (subsequentMessages.length > 0) {
      const idsToDelete = subsequentMessages.map((m) => m.id);
      await supabase.from("messages").delete().in("id", idsToDelete);
    }

    // Update local state
    const updatedMessages = messages.slice(0, msgIndex + 1).map((m) =>
      m.id === messageId ? { ...m, content: newContent.trim(), edited_at: new Date().toISOString() } : m
    );
    setMessages(updatedMessages);

    // Now trigger a new AI response (similar to handleSend but without creating a new user message)
    let rafPending = false;
    setIsStreaming(true);
    let assistantContent = "";
    const assistantTempId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantTempId, role: "assistant", content: "", created_at: new Date().toISOString() }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const allMessages = updatedMessages.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          messages: allMessages,
          model: webSearchEnabled ? "perplexity/sonar" : settings?.selected_model,
          temperature: settings?.temperature,
          max_tokens: settings?.max_tokens,
          custom_instructions: settings?.custom_instructions,
          memory_enabled: settings?.memory_enabled ?? true,
          chat_history_enabled: settings?.chat_history_enabled ?? true,
          persona: settings?.persona ?? "neutral",
          nickname: settings?.nickname || "",
          occupation: settings?.occupation || "",
          about_me: settings?.about_me || "",
        }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantTempId));
        setIsStreaming(false);
        toast({ title: "Error", description: "Failed to regenerate response", variant: "destructive" });
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(() => {
                  rafPending = false;
                  setMessages((prev) => prev.map((m) => (m.id === assistantTempId ? { ...m, content: assistantContent } : m)));
                });
              }
            }
          } catch {
            if (jsonStr.endsWith("}") || jsonStr.endsWith("]") || jsonStr.endsWith('"')) continue;
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Final flush to ensure last tokens are rendered
      setMessages((prev) => prev.map((m) => (m.id === assistantTempId ? { ...m, content: assistantContent } : m)));

      if (assistantContent) {
        const modelUsed = webSearchEnabled ? "perplexity/sonar" : (settings?.selected_model || selectedModel);
        const { data: savedMsg } = await supabase
          .from("messages")
          .insert({ conversation_id: activeConversationId, user_id: user.id, role: "assistant", content: assistantContent, model: modelUsed })
          .select("id, role, content, created_at, model")
          .single();
        if (savedMsg) setMessages((prev) => prev.map((m) => (m.id === assistantTempId ? (savedMsg as unknown as Message) : m)));
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        if (assistantContent && activeConversationId) {
          const modelUsed = webSearchEnabled ? "perplexity/sonar" : (settings?.selected_model || selectedModel);
          const { data: savedMsg } = await supabase
            .from("messages")
            .insert({ conversation_id: activeConversationId, user_id: user.id, role: "assistant", content: assistantContent, model: modelUsed })
            .select("id, role, content, created_at, model")
            .single();
          if (savedMsg) setMessages((prev) => prev.map((m) => (m.id === assistantTempId ? (savedMsg as unknown as Message) : m)));
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== assistantTempId));
        }
      } else {
        console.error(e);
        toast({ title: "Error", description: "Failed to get AI response", variant: "destructive" });
        setMessages((prev) => prev.filter((m) => m.id !== assistantTempId));
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleVariantNav = async (messageId: string, direction: 'prev' | 'next') => {
    const variants = messageVariants[messageId];
    if (!variants || variants.length <= 1) return;
    const currentIdx = activeVariantIndex[messageId] || 0;
    const newIdx = direction === 'next'
      ? (currentIdx + 1) % variants.length
      : (currentIdx - 1 + variants.length) % variants.length;
    const variant = variants[newIdx];
    // Update messages row to persist the selection
    await supabase.from("messages").update({ content: variant.content, model: variant.model } as any).eq("id", messageId);
    // Update local state
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: variant.content, model: variant.model } : m));
    setActiveVariantIndex(prev => ({ ...prev, [messageId]: newIdx }));
  };

  const handleRegenerate = async (messageId: string, modelOverride?: string) => {
    if (!user || !activeConversationId || isStreaming) return;

    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1 || messages[msgIndex].role !== "assistant") return;

    const currentMsg = messages[msgIndex];
    const contextMessages = messages.slice(0, msgIndex);

    // If no variants exist yet, save the current response as the first variant
    const existingVariants = messageVariants[messageId];
    if (!existingVariants || existingVariants.length === 0) {
      if (currentMsg.content) {
        await supabase.from("message_variants").insert({
          message_id: messageId,
          content: currentMsg.content,
          model: currentMsg.model || null,
          user_id: user.id,
        } as any);
      }
    }

    // Stream new response
    setIsStreaming(true);
    let rafPending = false;
    let assistantContent = "";

    // Show streaming in the existing message slot
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content: "", model: null } : m));

    const controller = new AbortController();
    abortRef.current = controller;

    const useModel = modelOverride || (webSearchEnabled ? "perplexity/sonar" : settings?.selected_model) || selectedModel;

    try {
      const allMessages = contextMessages.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          messages: allMessages,
          model: useModel,
          temperature: settings?.temperature,
          max_tokens: settings?.max_tokens,
          custom_instructions: settings?.custom_instructions,
          memory_enabled: settings?.memory_enabled ?? true,
          chat_history_enabled: settings?.chat_history_enabled ?? true,
          persona: settings?.persona ?? "neutral",
          nickname: settings?.nickname || "",
          occupation: settings?.occupation || "",
          about_me: settings?.about_me || "",
        }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        // Restore original content on failure
        setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content: currentMsg.content, model: currentMsg.model } : m));
        setIsStreaming(false);
        toast({ title: "Error", description: "Failed to regenerate response", variant: "destructive" });
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(() => {
                  rafPending = false;
                  setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: assistantContent } : m)));
                });
              }
            }
          } catch {
            if (jsonStr.endsWith("}") || jsonStr.endsWith("]") || jsonStr.endsWith('"')) continue;
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Final flush
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: assistantContent } : m)));

      if (assistantContent) {
        // Save new variant
        const { data: newVariant } = await supabase.from("message_variants").insert({
          message_id: messageId,
          content: assistantContent,
          model: useModel,
          user_id: user.id,
        } as any).select("id, content, model, created_at").single();

        // Update the messages row
        await supabase.from("messages").update({ content: assistantContent, model: useModel } as any).eq("id", messageId);
        setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content: assistantContent, model: useModel } : m));

        // Update variant state
        setMessageVariants((prev) => {
          const existing = prev[messageId] || [];
          // If this is the first regeneration, we inserted the original above, rebuild from scratch
          if (existing.length === 0 && currentMsg.content) {
            const originalVariant: Variant = { id: crypto.randomUUID(), content: currentMsg.content, model: currentMsg.model || null, created_at: currentMsg.created_at };
            const newV: Variant = newVariant ? { id: newVariant.id, content: newVariant.content, model: newVariant.model, created_at: newVariant.created_at } : { id: crypto.randomUUID(), content: assistantContent, model: useModel, created_at: new Date().toISOString() };
            return { ...prev, [messageId]: [originalVariant, newV] };
          }
          const newV: Variant = newVariant ? { id: newVariant.id, content: newVariant.content, model: newVariant.model, created_at: newVariant.created_at } : { id: crypto.randomUUID(), content: assistantContent, model: useModel, created_at: new Date().toISOString() };
          return { ...prev, [messageId]: [...existing, newV] };
        });
        setActiveVariantIndex((prev) => {
          const existing = messageVariants[messageId] || [];
          const newLength = existing.length === 0 ? 2 : existing.length + 1;
          return { ...prev, [messageId]: newLength - 1 };
        });
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        if (assistantContent) {
          await supabase.from("message_variants").insert({
            message_id: messageId,
            content: assistantContent,
            model: useModel,
            user_id: user.id,
          } as any);
          await supabase.from("messages").update({ content: assistantContent, model: useModel } as any).eq("id", messageId);
          setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content: assistantContent, model: useModel } : m));
        } else {
          // Restore original
          setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content: currentMsg.content, model: currentMsg.model } : m));
        }
      } else {
        console.error(e);
        toast({ title: "Error", description: "Failed to regenerate", variant: "destructive" });
        setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content: currentMsg.content, model: currentMsg.model } : m));
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleBranchConversation = async (messageId: string) => {
    if (!user || !activeConversationId) return;

    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const messagesToCopy = messages.slice(0, msgIndex + 1);
    const currentConv = conversations.find((c) => c.id === activeConversationId);
    const branchTitle = `Branch from ${currentConv?.title || "Untitled"}`;

    // Create new conversation with parent reference
    const { data: newConv, error: convError } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        title: branchTitle,
        parent_conversation_id: activeConversationId,
        branched_at_message_id: messageId,
      } as any)
      .select("id")
      .single();

    if (convError || !newConv) {
      toast({ title: "Error", description: "Failed to create branch", variant: "destructive" });
      return;
    }

    // Copy messages into the new conversation
    const messagesToInsert = messagesToCopy.map((m) => ({
      conversation_id: newConv.id,
      user_id: user.id,
      role: m.role,
      content: m.content,
      model: m.model || null,
      attachments: (m.attachments as any) || null,
    }));

    const { error: msgError } = await supabase.from("messages").insert(messagesToInsert);
    if (msgError) {
      toast({ title: "Error", description: "Failed to copy messages", variant: "destructive" });
      return;
    }

    await loadConversations();
    setActiveConversationId(newConv.id);
    toast({ title: "Branch created", description: branchTitle });
  };

  const renameConversation = async (id: string, newTitle: string) => {
    if (!user || !newTitle.trim()) return;
    await supabase.from("conversations").update({ title: newTitle.trim() }).eq("id", id).eq("user_id", user.id);
    setEditingConvId(null);
    await loadConversations();
  };

  const handleGenerateImage = async () => {
    if (!input.trim() || isStreaming || isGeneratingImage || !user) return;
    const prompt = input.trim();
    setInput("");

    let convId = activeConversationId;
    if (!convId) {
      convId = await createConversation();
      if (!convId) return;
    }

    // Save user message
    const { data: userMsg } = await supabase
      .from("messages")
      .insert({ conversation_id: convId, user_id: user.id, role: "user", content: prompt })
      .select("id, role, content, created_at")
      .single();
    if (userMsg) setMessages((prev) => [...prev, userMsg as unknown as Message]);

    if (messages.length === 0) {
      const title = `🎨 ${prompt.slice(0, 55)}`;
      await supabase.from("conversations").update({ title }).eq("id", convId);
      loadConversations();
    }

    setIsGeneratingImage(true);
    const assistantTempId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantTempId, role: "assistant", content: "🎨 Generating image...", created_at: new Date().toISOString() }]);

    try {
      const session = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({ prompt }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => null);
        const errorMsg = errData?.message || errData?.error || "Image generation failed";
        toast({ title: "Error", description: errorMsg, variant: "destructive" });
        setMessages((prev) => prev.filter((m) => m.id !== assistantTempId));
        return;
      }

      const data = await resp.json();
      const imageUrl = data.image_url;
      const textContent = data.text || "";

      // Build markdown content with embedded image
      let content = "";
      if (textContent) content += textContent + "\n\n";
      content += `![Generated image](${imageUrl})`;

      setMessages((prev) => prev.map((m) => m.id === assistantTempId ? { ...m, content } : m));

      // Save to DB
      const { data: savedMsg } = await supabase
        .from("messages")
        .insert({ conversation_id: convId, user_id: user.id, role: "assistant", content, model: "gemini-image" })
        .select("id, role, content, created_at, model")
        .single();
      if (savedMsg) {
        setMessages((prev) => prev.map((m) => m.id === assistantTempId ? (savedMsg as unknown as Message) : m));
      }
    } catch (e) {
      console.error("Image generation error:", e);
      toast({ title: "Error", description: "Failed to generate image", variant: "destructive" });
      setMessages((prev) => prev.filter((m) => m.id !== assistantTempId));
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSend = async () => {
    if (imageGenMode) return handleGenerateImage();
    if ((!input.trim() && pendingFiles.length === 0) || isStreaming || !user) return;
    const userContent = input.trim();
    setInput("");

    let convId = activeConversationId;
    if (!convId) {
      convId = await createConversation();
      if (!convId) return;
    }

    // Pre-fetch session in parallel with file uploads
    const sessionPromise = supabase.auth.getSession();
    const attachments = await uploadFiles(convId);

    // For multimodal, we need fresh signed URLs for the AI
    const attachmentsWithUrls: Attachment[] = [];
    for (const att of attachments) {
      if (att.path) {
        const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(att.path, 3600);
        attachmentsWithUrls.push({ ...att, url: data?.signedUrl || "" });
      } else {
        attachmentsWithUrls.push(att);
      }
    }

    const insertData: any = { conversation_id: convId, user_id: user.id, role: "user", content: userContent || "(attached files)" };
    if (attachments.length > 0) insertData.attachments = attachments;

    const { data: userMsg } = await supabase
      .from("messages")
      .insert(insertData)
      .select("id, role, content, created_at, attachments")
      .single();

    if (userMsg) setMessages((prev) => [...prev, userMsg as unknown as Message]);

    if (messages.length === 0) {
      const title = (userContent || attachments[0]?.name || "New chat").slice(0, 60);
      await supabase.from("conversations").update({ title }).eq("id", convId);
      loadConversations();
    }

    setIsStreaming(true);
    let rafPending = false;
    let assistantContent = "";
    const assistantTempId = crypto.randomUUID();

    setMessages((prev) => [...prev, { id: assistantTempId, role: "assistant", content: "", created_at: new Date().toISOString() }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const allMessages = [...messages, { role: "user", content: userContent, attachments: attachmentsWithUrls }].map((m: any) => {
        const imageAttachments = (m.attachments || []).filter((a: Attachment) => a.type.startsWith("image/"));
        if (imageAttachments.length > 0) {
          const contentParts: any[] = [];
          if (m.content) contentParts.push({ type: "text", text: m.content });
          for (const img of imageAttachments) {
            const imgUrl = img.path && resolvedUrls[img.path] ? resolvedUrls[img.path] : img.url;
            contentParts.push({ type: "image_url", image_url: { url: imgUrl } });
          }
          return { role: m.role as "user" | "assistant", content: contentParts };
        }
        return { role: m.role as "user" | "assistant", content: m.content };
      });

      const sessionData = await sessionPromise;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.data.session?.access_token}`,
        },
        body: JSON.stringify({
          messages: allMessages,
          model: webSearchEnabled ? "perplexity/sonar" : settings?.selected_model,
          temperature: settings?.temperature,
          max_tokens: settings?.max_tokens,
          custom_instructions: settings?.custom_instructions,
          memory_enabled: settings?.memory_enabled ?? true,
          chat_history_enabled: settings?.chat_history_enabled ?? true,
          persona: settings?.persona ?? "neutral",
          nickname: settings?.nickname || "",
          occupation: settings?.occupation || "",
          about_me: settings?.about_me || "",
        }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        const errData = await resp.json().catch(() => null);
        const cleanup = () => {
          setMessages((prev) => prev.filter((m) => m.id !== assistantTempId));
          setIsStreaming(false);
        };

        if (resp.status === 402) {
          toast({ title: "Insufficient credits", description: errData?.message || "Add funds to your OpenRouter account or update your API key in Settings.", variant: "destructive" });
          cleanup();
          return;
        }

        if (resp.status === 429) {
          if (errData?.error === "daily_limit_reached") {
            toast({ title: "Daily limit reached", description: errData.message || "Add your own API key in Settings to continue chatting.", variant: "destructive" });
          } else {
            toast({ title: "Rate limit exceeded", description: errData?.message || "Please wait a moment and try again.", variant: "destructive" });
          }
          cleanup();
          return;
        }

        const errorMsg = errData?.message || errData?.error || `Request failed (${resp.status})`;
        toast({ title: "Error", description: errorMsg, variant: "destructive" });
        cleanup();
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(() => {
                  rafPending = false;
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantTempId ? { ...m, content: assistantContent } : m))
                  );
                });
              }
            }
          } catch {
            // Only buffer incomplete JSON (likely split across chunks)
            // If the line looks complete but isn't valid JSON, skip it
            if (jsonStr.endsWith("}") || jsonStr.endsWith("]") || jsonStr.endsWith('"')) {
              // Looks complete but failed to parse — skip this malformed line
              console.warn("Skipping malformed SSE line:", jsonStr.slice(0, 100));
              continue;
            }
            // Likely an incomplete chunk — put back and wait for more data
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Final flush
      setMessages((prev) => prev.map((m) => (m.id === assistantTempId ? { ...m, content: assistantContent } : m)));

      if (assistantContent) {
        const { data: savedMsg } = await supabase
          .from("messages")
          .insert({ conversation_id: convId, user_id: user.id, role: "assistant", content: assistantContent, model: webSearchEnabled ? "perplexity/sonar" : (settings?.selected_model || selectedModel) })
          .select("id, role, content, created_at, model")
          .single();

        if (savedMsg) {
          setMessages((prev) => prev.map((m) => (m.id === assistantTempId ? savedMsg : m)));
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        // Save partial content on abort
        if (assistantContent && convId) {
          const { data: savedMsg } = await supabase
          .from("messages")
          .insert({ conversation_id: convId, user_id: user.id, role: "assistant", content: assistantContent, model: webSearchEnabled ? "perplexity/sonar" : (settings?.selected_model || selectedModel) })
          .select("id, role, content, created_at, model")
            .single();
          if (savedMsg) {
            setMessages((prev) => prev.map((m) => (m.id === assistantTempId ? savedMsg : m)));
          }
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== assistantTempId));
        }
      } else {
        console.error(e);
        toast({ title: "Error", description: "Failed to get AI response", variant: "destructive" });
        setMessages((prev) => prev.filter((m) => m.id !== assistantTempId));
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (isMobile) return; // On mobile, Enter inserts a new line; use send button
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedBlock(code);
    setTimeout(() => setCopiedBlock(null), 2000);
  };

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const canSend = (input.trim().length > 0 || pendingFiles.length > 0) && !isStreaming && !isUploading && !isGeneratingImage;

  const filteredChats = searchQuery
    ? conversations.filter((c) => c.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

  const isEmptyState = messages.length === 0 && !activeConversationId;

  const renderInputArea = (frosted = false) => (
    <div className="relative max-w-3xl mx-auto w-full">
      <div
        className="rounded-2xl"
        style={frosted ? {
          background: "rgba(255, 255, 255, 0.06)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          border: `1px solid ${inputFocused ? GLASS_INPUT_FOCUS_BORDER : "rgba(255, 255, 255, 0.12)"}`,
          boxShadow: inputFocused
            ? GLASS_INPUT_FOCUS_SHADOW
            : "0 20px 60px rgba(0, 0, 0, 0.4), 0 8px 40px rgba(0, 0, 0, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.08)",
          padding: "14px 14px 14px 18px",
          transition: "border-color 200ms ease, box-shadow 200ms ease",
        } : {
          background: "#2f2f2f",
          border: `1px solid ${inputFocused ? "#4a4a4a" : "#3a3a3a"}`,
          boxShadow: inputFocused
            ? "0 8px 24px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.04)"
            : "0 8px 24px rgba(0, 0, 0, 0.2)",
          padding: "14px 14px 14px 18px",
          transition: "border-color 200ms ease, box-shadow 200ms ease",
        }}
      >
        {pendingFiles.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap px-1">
            {pendingFiles.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
                style={{ background: frosted ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", color: frosted ? "rgba(236,236,236,0.85)" : "#d4d4d4" }}
              >
                {file.type.startsWith("image/") ? <Image className="w-3.5 h-3.5 shrink-0" /> : <FileText className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate max-w-[120px]">{file.name}</span>
                <button
                  onClick={() => removePendingFile(idx)}
                  className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-white/10"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,.doc,.docx"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl"
            style={{ color: frosted ? GLASS_MUTED : "#9b9b9b", transition: "background 200ms ease, color 200ms ease" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = frosted ? GLASS_ICON_HOVER : "#ececec"; e.currentTarget.style.background = frosted ? GLASS_HOVER : "rgba(255,255,255,0.05)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = frosted ? GLASS_MUTED : "#9b9b9b"; e.currentTarget.style.background = "transparent"; }}
            title="Attach files"
          >
            <Paperclip className="w-[18px] h-[18px]" />
          </button>

          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              enterKeyHint={isMobile ? "enter" : "send"}
              placeholder={isUploading ? "Uploading..." : isGeneratingImage ? "Generating image..." : imageGenMode ? "Describe the image you want to create..." : "Send a message..."}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              className="w-full min-h-[44px] max-h-[140px] px-2 bg-transparent border-none outline-none resize-none focus:ring-0 focus:outline-none"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "15px",
                fontWeight: 400,
                letterSpacing: "-0.01em",
                lineHeight: "1.55",
                paddingTop: "11px",
                paddingBottom: "11px",
                color: frosted ? "rgba(236, 236, 236, 0.95)" : "#ececec",
              }}
              rows={1}
            />
          </div>

          <button
            onClick={() => { setImageGenMode(!imageGenMode); if (!imageGenMode) setWebSearchEnabled(false); }}
            className="shrink-0 h-9 w-9 flex items-center justify-center rounded-full"
            style={{
              ...(imageGenMode ? GLASS_BUTTON_IMAGE_GEN : GLASS_BUTTON_INACTIVE),
              color: imageGenMode ? "rgba(255, 255, 255, 0.95)" : frosted ? GLASS_MUTED : "#9b9b9b",
            }}
            onMouseEnter={(e) => {
              if (imageGenMode) {
                Object.assign(e.currentTarget.style, GLASS_BUTTON_IMAGE_GEN_HOVER);
              } else {
                e.currentTarget.style.color = frosted ? GLASS_ICON_HOVER : "#ececec";
                e.currentTarget.style.background = frosted ? GLASS_HOVER : "rgba(255,255,255,0.05)";
                e.currentTarget.style.transform = "scale(1.05)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "";
              if (imageGenMode) {
                Object.assign(e.currentTarget.style, { background: GLASS_BUTTON_IMAGE_GEN.background, boxShadow: GLASS_BUTTON_IMAGE_GEN.boxShadow, border: GLASS_BUTTON_IMAGE_GEN.border });
              } else {
                e.currentTarget.style.color = frosted ? GLASS_MUTED : "#9b9b9b";
                Object.assign(e.currentTarget.style, { background: GLASS_BUTTON_INACTIVE.background, boxShadow: GLASS_BUTTON_INACTIVE.boxShadow as string, border: GLASS_BUTTON_INACTIVE.border as string });
              }
            }}
            title={imageGenMode ? "Image generation on" : "Generate image"}
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          <button
            onClick={() => { setWebSearchEnabled(!webSearchEnabled); if (!webSearchEnabled) setImageGenMode(false); }}
            className="shrink-0 h-9 w-9 flex items-center justify-center rounded-full"
            style={{
              ...(webSearchEnabled ? GLASS_BUTTON_WEB_SEARCH : GLASS_BUTTON_INACTIVE),
              color: webSearchEnabled ? "rgba(255, 255, 255, 0.95)" : frosted ? GLASS_MUTED : "#9b9b9b",
            }}
            onMouseEnter={(e) => {
              if (webSearchEnabled) {
                Object.assign(e.currentTarget.style, GLASS_BUTTON_WEB_SEARCH_HOVER);
              } else {
                e.currentTarget.style.color = frosted ? GLASS_ICON_HOVER : "#ececec";
                e.currentTarget.style.background = frosted ? GLASS_HOVER : "rgba(255,255,255,0.05)";
                e.currentTarget.style.transform = "scale(1.05)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "";
              if (webSearchEnabled) {
                Object.assign(e.currentTarget.style, { background: GLASS_BUTTON_WEB_SEARCH.background, boxShadow: GLASS_BUTTON_WEB_SEARCH.boxShadow, border: GLASS_BUTTON_WEB_SEARCH.border });
              } else {
                e.currentTarget.style.color = frosted ? GLASS_MUTED : "#9b9b9b";
                Object.assign(e.currentTarget.style, { background: GLASS_BUTTON_INACTIVE.background, boxShadow: GLASS_BUTTON_INACTIVE.boxShadow as string, border: GLASS_BUTTON_INACTIVE.border as string });
              }
            }}
            title={webSearchEnabled ? "Web search on" : "Web search off"}
          >
            <Globe className="w-4 h-4" />
          </button>

          <button
            onClick={toggleSpeechToText}
            className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl"
            style={{
              background: isListening ? "hsl(0 65% 50%)" : "transparent",
              color: isListening ? "white" : frosted ? GLASS_MUTED : "#9b9b9b",
              transition: "background 200ms ease, color 200ms ease",
            }}
            onMouseEnter={(e) => { if (!isListening) { e.currentTarget.style.color = frosted ? GLASS_ICON_HOVER : "#ececec"; e.currentTarget.style.background = frosted ? GLASS_HOVER : "rgba(255,255,255,0.05)"; } }}
            onMouseLeave={(e) => { if (!isListening) { e.currentTarget.style.color = frosted ? GLASS_MUTED : "#9b9b9b"; e.currentTarget.style.background = isListening ? "hsl(0 65% 50%)" : "transparent"; } }}
            title={isListening ? "Stop listening" : "Voice input"}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {isStreaming || isGeneratingImage ? (
            <button
              onClick={() => { if (isStreaming) abortRef.current?.abort(); }}
              className="shrink-0 h-9 w-9 flex items-center justify-center rounded-full transition-all duration-150"
              style={{ background: isGeneratingImage ? "hsl(280 70% 50%)" : "hsl(0 65% 50%)", color: "white" }}
            >
              {isGeneratingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                "shrink-0 h-9 w-9 flex items-center justify-center rounded-full transition-all duration-150",
                canSend ? "active:scale-95 cursor-pointer" : "cursor-not-allowed"
              )}
              style={canSend
                ? {
                    background: frosted ? "rgba(255,255,255,0.16)" : "white",
                    color: frosted ? "rgba(255,255,255,0.95)" : "black",
                    boxShadow: frosted ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
                  }
                : {
                    background: frosted ? "rgba(255,255,255,0.06)" : "#424242",
                    color: frosted ? "rgba(200,200,220,0.25)" : "#6b6b6b",
                    opacity: 0.6,
                  }
              }
            >
              <ArrowUp className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const hasCustomBg = !!getBackgroundStyle(settings?.background_style);
  const inputArea = renderInputArea(hasCustomBg);

  // Sidebar content (shared between mobile overlay and desktop)
  const sidebarContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-0.5">
        <div className="flex items-center gap-2 px-2">
          <span style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "0.08em", color: hasCustomBg ? GLASS_LABEL : "var(--text-secondary)", textTransform: "uppercase" as const }}>
            Polyphonic
          </span>
        </div>
        <button
          onClick={() => setSidebarCollapsed(true)}
          className="h-7 w-7 flex items-center justify-center rounded-md transition-colors"
          style={{ color: hasCustomBg ? GLASS_ICON : "var(--gray-400)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_BORDER : "var(--gray-800)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav Items */}
      <div className="px-2 pt-3 pb-1 space-y-0">
        <button
          onClick={() => { setActiveConversationId(null); setMessages([]); if (isMobile) setSidebarCollapsed(true); }}
          className="w-full flex items-center gap-3 px-3 py-[6px] rounded-lg transition-colors min-h-[36px]"
          style={{ fontSize: "14px", fontWeight: 400, color: "#d4d4d4" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-850)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <Plus className="h-4 w-4" style={{ color: hasCustomBg ? GLASS_ICON : "var(--gray-400)" }} />
          <span>New chat</span>
        </button>
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="w-full flex items-center gap-3 px-3 py-[6px] rounded-lg transition-colors min-h-[36px]"
          style={{ fontSize: "14px", fontWeight: 400, color: "#d4d4d4" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-850)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <Search className="h-4 w-4" style={{ color: hasCustomBg ? GLASS_ICON : "var(--gray-400)" }} />
          <span>Search chats</span>
        </button>

        <Popover open={reflectionsOpen} onOpenChange={setReflectionsOpen}>
          <PopoverTrigger asChild>
            <button
              className="w-full flex items-center gap-3 px-3 py-[6px] rounded-lg transition-colors relative min-h-[36px]"
              style={{ fontSize: "14px", fontWeight: 400, color: "#d4d4d4" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-850)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Sparkles className="h-4 w-4" style={{ color: hasCustomBg ? GLASS_ICON : "var(--gray-400)" }} />
              <span>Reflections</span>
              {curiosityQuestions.length > 0 && (
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: hasCustomBg ? GLASS_MUTED : "var(--gray-400)",
                    marginLeft: "auto",
                  }}
                >
                  {curiosityQuestions.length}
                </span>
              )}
            </button>
          </PopoverTrigger>
           <PopoverContent
            side="right"
            align="start"
            className="w-80 p-0"
            style={hasCustomBg ? {
              ...GLASS_DROPDOWN_STYLE,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            } : {
              background: "var(--bg-card)",
              border: "1px solid hsl(var(--border-subtle))",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--gray-400)" }} />
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>
                    Thoughts while you were away
                  </span>
                </div>
                {curiosityQuestions.length > 0 && (
                  <button
                    onClick={() => dismissCuriosity()}
                    className="text-xs px-2 py-0.5 rounded transition-colors"
                    style={{ color: "var(--gray-500)", fontSize: "11px" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--gray-500)"; }}
                  >
                    Dismiss all
                  </button>
                )}
              </div>
              {curiosityQuestions.length === 0 ? (
                <p style={{ fontSize: "13px", color: "var(--gray-500)", padding: "8px 0" }}>
                  No new reflections right now.
                </p>
              ) : (
                <div className="space-y-1">
                  {curiosityQuestions.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => handleReflectionClick(q)}
                      className="w-full text-left px-3 py-2 rounded-lg transition-colors min-h-[44px]"
                      style={{
                        fontSize: "13px",
                        color: "var(--text-primary)",
                        background: "transparent",
                        lineHeight: 1.5,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-850)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {q.question}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <button
          onClick={() => { navigateTo("/gallery"); if (isMobile) setSidebarCollapsed(true); }}
          className="w-full flex items-center gap-3 px-3 py-[6px] rounded-lg transition-colors min-h-[36px]"
          style={{ fontSize: "14px", fontWeight: 400, color: "#d4d4d4" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-850)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <ImageIcon className="h-4 w-4" style={{ color: hasCustomBg ? GLASS_ICON : "var(--gray-400)" }} />
          <span>Gallery</span>
        </button>

        <button
          onClick={() => { navigateTo("/journal"); if (isMobile) setSidebarCollapsed(true); }}
          className="w-full flex items-center gap-3 px-3 py-[6px] rounded-lg transition-colors relative min-h-[36px]"
          style={{ fontSize: "14px", fontWeight: 400, color: "#d4d4d4" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-850)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <BookOpen className="h-4 w-4" style={{ color: hasCustomBg ? GLASS_ICON : "var(--gray-400)" }} />
          <span>Journal</span>
          {unreadJournalCount > 0 && (
            <span
              style={{
                fontSize: "12px",
                fontWeight: 500,
                color: hasCustomBg ? GLASS_MUTED : "var(--gray-400)",
                marginLeft: "auto",
              }}
            >
              {unreadJournalCount}
            </span>
          )}
        </button>

        <button
          onClick={() => { navigateTo("/guide"); if (isMobile) setSidebarCollapsed(true); }}
          className="w-full flex items-center gap-3 px-3 py-[6px] rounded-lg transition-colors min-h-[36px]"
          style={{ fontSize: "14px", fontWeight: 400, color: "#d4d4d4" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-850)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <HelpCircle className="h-4 w-4" style={{ color: hasCustomBg ? GLASS_ICON : "var(--gray-400)" }} />
          <span>Guide</span>
        </button>

        <button
          onClick={() => { navigateTo("/inner-life"); if (isMobile) setSidebarCollapsed(true); }}
          className="w-full flex items-center gap-3 px-3 py-[6px] rounded-lg transition-colors min-h-[36px]"
          style={{ fontSize: "14px", fontWeight: 400, color: "#d4d4d4" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-850)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <Brain className="h-4 w-4" style={{ color: hasCustomBg ? GLASS_ICON : "var(--gray-400)" }} />
          <span>Inner Life</span>
        </button>
      </div>

      {/* Inline search */}
      {searchOpen && (
        <div className="px-2 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }} />
            <input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full pl-9 h-8 text-[13px] rounded-lg outline-none"
              style={{ background: hasCustomBg ? GLASS_HOVER : "var(--bg-input)", border: hasCustomBg ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid hsl(var(--border-subtle))", color: "#d4d4d4" }}
              onBlur={(e) => { if (!e.target.value) { setSearchQuery(""); setSearchOpen(false); } }}
            />
          </div>
        </div>
      )}

      {/* Section Header */}
      <div className="px-2 pt-3 pb-0.5">
        <div className="px-3 pb-1">
          <span style={{ fontFamily: "var(--font-sans)", fontSize: "12px", fontWeight: 500, color: hasCustomBg ? GLASS_LABEL : "var(--gray-500)" }}>
            Your chats
          </span>
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-0">
        {filteredChats.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              "group w-full text-left py-1.5 px-3 rounded-lg flex items-center gap-2 transition-all duration-150 mb-0 cursor-pointer min-h-[36px]",
            )}
            style={{
              background: activeConversationId === conv.id ? (hasCustomBg ? "rgba(255, 255, 255, 0.1)" : "var(--gray-850)") : "transparent",
              fontSize: "14px",
              color: activeConversationId === conv.id ? "#ececec" : "#d4d4d4",
            }}
            onClick={() => {
              if (editingConvId !== conv.id) setActiveConversationId(conv.id);
            }}
            onMouseEnter={(e) => {
              if (activeConversationId !== conv.id) e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-850)";
            }}
            onMouseLeave={(e) => {
              if (activeConversationId !== conv.id) e.currentTarget.style.background = "transparent";
            }}
          >
            {editingConvId === conv.id ? (
              <input
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") renameConversation(conv.id, editingTitle);
                  if (e.key === "Escape") setEditingConvId(null);
                }}
                onBlur={() => renameConversation(conv.id, editingTitle)}
                autoFocus
                className="flex-1 min-w-0 bg-transparent outline-none text-[14px]"
                style={{ color: "#ececec" }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="truncate flex-1 flex items-center gap-1.5"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingConvId(conv.id);
                  setEditingTitle(conv.title || "");
                }}
              >
                {conv.parent_conversation_id && (
                  <GitBranch className="h-3 w-3 shrink-0" style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }} />
                )}
                <span className="truncate">{conv.title || "Untitled"}</span>
              </span>
            )}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingConvId(conv.id);
                  setEditingTitle(conv.title || "");
                }}
                className="p-1 rounded"
                style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = hasCustomBg ? GLASS_ICON_HOVER : "var(--text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = hasCustomBg ? GLASS_MUTED : "var(--gray-500)"; }}
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                className="p-1 rounded"
                style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = hasCustomBg ? GLASS_ICON_HOVER : "var(--text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = hasCustomBg ? GLASS_MUTED : "var(--gray-500)"; }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {filteredChats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <MessageSquare className="h-5 w-5" style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }} />
            <span style={{ fontSize: "13px", color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }}>
              {searchQuery ? "No conversations found" : "No conversations yet"}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto py-2.5 px-3 flex items-center gap-3" style={{ borderTop: hasCustomBg ? `1px solid ${GLASS_BORDER}` : "1px solid var(--gray-900)" }}>
        {user && (
          <>
            <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0" style={{ background: hasCustomBg ? GLASS_BORDER : "var(--gray-800)" }}>
              <User className="h-3.5 w-3.5" style={{ color: hasCustomBg ? GLASS_ICON : "var(--gray-400)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="truncate" style={{ fontSize: "14px", fontWeight: 400, color: hasCustomBg ? GLASS_TEXT : "var(--gray-200)" }}>
                {displayName}
              </div>
            </div>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-7 w-7 flex items-center justify-center rounded-md transition-colors"
              style={{ color: hasCustomBg ? GLASS_ICON : "var(--gray-400)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_BORDER : "var(--gray-800)"; e.currentTarget.style.color = hasCustomBg ? GLASS_ICON_HOVER : "var(--gray-200)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = hasCustomBg ? GLASS_ICON : "var(--gray-400)"; }}
            >
              <Settings className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-48 mb-2" style={hasCustomBg ? { ...GLASS_DROPDOWN_STYLE, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" } : { background: "var(--gray-900)", border: "1px solid var(--gray-800)" }}>
            <DropdownMenuItem
              onClick={() => setSettingsOpen(true)}
              className={`cursor-pointer gap-2 text-[13px]${hasCustomBg ? " focus:bg-transparent" : ""}`}
              style={{ color: hasCustomBg ? GLASS_ICON_HOVER : "var(--gray-200)" }}
              onMouseEnter={hasCustomBg ? (e) => { (e.currentTarget as HTMLElement).style.background = GLASS_HOVER; } : undefined}
              onMouseLeave={hasCustomBg ? (e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; } : undefined}
            >
              <Settings className="h-4 w-4" style={{ color: hasCustomBg ? GLASS_ICON : "var(--gray-400)" }} />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator style={{ background: hasCustomBg ? GLASS_BORDER : "var(--gray-800)" }} />
            <DropdownMenuItem
              onClick={signOut}
              className={`cursor-pointer gap-2 text-[13px]${hasCustomBg ? " focus:bg-transparent" : ""}`}
              style={{ color: "hsl(0 65% 50%)" }}
              onMouseEnter={hasCustomBg ? (e) => { (e.currentTarget as HTMLElement).style.background = GLASS_HOVER; } : undefined}
              onMouseLeave={hasCustomBg ? (e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; } : undefined}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  return (
    <PageTransition exiting={exiting}>
    <div className="flex h-screen h-dvh relative" data-custom-bg={hasCustomBg || undefined} style={{ background: hasCustomBg ? "transparent" : "var(--bg-content)", border: "none" }}>
      {/* Background layer - behind everything including sidebar */}
      {hasCustomBg && (() => {
        const bgStyle = getBackgroundStyle(settings?.background_style);
        if (!bgStyle) return null;
        return (
          <>
            <div className="absolute inset-0 z-0" style={bgStyle} />
            <div className="absolute inset-0 z-[1]" style={{ background: "rgba(0, 0, 0, 0.3)" }} />
          </>
        );
      })()}
      {/* ============ SIDEBAR ============ */}
      {isMobile ? (
        // Mobile: fixed overlay
        !sidebarCollapsed && (
          <div className="fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setSidebarCollapsed(true)}
            />
             <nav
              className="relative flex flex-col h-full w-72 max-w-[85vw] overflow-hidden"
              style={hasCustomBg ? { ...GLASS_STYLE, borderRadius: 0, clipPath: "inset(0)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" } : { background: "var(--bg-sidebar)" }}
            >
              {sidebarContent}
            </nav>
          </div>
        )
      ) : (
        // Desktop: standard sidebar
        <nav
          className={cn(
            "flex flex-col h-full min-h-0 max-h-screen overflow-hidden transition-all duration-200 relative z-10",
            sidebarCollapsed ? "w-0 overflow-hidden" : "w-60"
          )}
          style={hasCustomBg ? { ...GLASS_STYLE, borderRadius: 0, isolation: "isolate" as const, overflow: "hidden", borderRight: "none", boxShadow: "none", clipPath: "inset(0)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" } : { background: "var(--bg-sidebar)" }}
        >
          {sidebarContent}
        </nav>
      )}

      {/* ============ MAIN CHAT AREA ============ */}
      <div className="flex-1 flex flex-col min-w-0 relative z-[11]" style={{ background: "transparent", border: "none" }}>
        {/* Top bar with model selector */}
        <div className="flex items-center h-12 px-3 shrink-0 relative z-20" style={{ borderBottom: hasCustomBg ? "none" : "1px solid hsl(var(--border-subtle) / 0.3)", borderTop: "none" }}>
          {(sidebarCollapsed || isMobile) && (
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors mr-1"
              style={{ color: hasCustomBg ? GLASS_ICON : "var(--gray-400)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-800)"; e.currentTarget.style.color = hasCustomBg ? GLASS_ICON_HOVER : "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = hasCustomBg ? GLASS_ICON : "var(--gray-400)"; }}
            >
              {isMobile ? <Menu className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
          )}
          <ModelSelector selectedModel={selectedModel} onModelChange={handleModelChange} frosted={hasCustomBg} />
          <div className="ml-auto">
            <EmotionalStateCompact />
          </div>
        </div>

        {/* Import progress banner */}
        {activeImport && (
          <ImportBanner importProgress={activeImport} isActive={isImportActive} onDismiss={dismissImport} />
        )}

        {/* Background layer removed - now rendered at root level */}

        {isEmptyState ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 relative z-10 overflow-hidden">
            <div className="relative z-10 flex flex-col items-center w-full">
              <h1
                className="select-none mb-8"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "2.5rem",
                  fontWeight: 200,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase" as const,
                  color: "rgba(255, 255, 255, 0.95)",
                  textShadow: hasCustomBg ? "0 2px 30px rgba(255, 255, 255, 0.15), 0 4px 40px rgba(0, 0, 0, 0.6)" : "0 2px 20px rgba(0, 0, 0, 0.5)",
                }}
              >
                Polyphonic
              </h1>
              <div className="w-full max-w-3xl px-4">
                {renderInputArea(true)}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div ref={chatContainerRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto flex flex-col relative z-10">
              <div className="flex-1 min-h-0">
                <div className="max-w-3xl mx-auto px-6 py-6"
                     style={hasCustomBg ? {
                       background: "rgba(0, 0, 0, 0.35)",
                       backdropFilter: "blur(12px)",
                       WebkitBackdropFilter: "blur(12px)",
                       borderRadius: "20px",
                       marginTop: "8px",
                       marginBottom: "8px",
                       padding: "24px",
                     } : undefined}
                >
                  {messages.map((msg, idx) => {
                    // Detect model switch: show divider when an assistant message uses a different model than the previous assistant message
                    const prevAssistantModel = (() => {
                      for (let i = idx - 1; i >= 0; i--) {
                        if (messages[i].role === "assistant" && messages[i].model) return messages[i].model;
                      }
                      return null;
                    })();
                    const showModelSwitch = msg.role === "assistant" && msg.model && prevAssistantModel && msg.model !== prevAssistantModel;
                    const switchModelName = showModelSwitch ? (AVAILABLE_MODELS.find(m => m.id === msg.model)?.name || msg.model) : "";

                    return (
                    <div key={msg.id}>
                      {showModelSwitch && (
                        <div className="flex items-center gap-3 my-4" style={{ opacity: 0.5 }}>
                          <div className="flex-1 h-px" style={{ background: hasCustomBg ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)" }} />
                          <span style={{ fontSize: "11px", fontWeight: 500, letterSpacing: "0.05em", color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)", textTransform: "uppercase" as const, whiteSpace: "nowrap" }}>
                            switched to {switchModelName}
                          </span>
                          <div className="flex-1 h-px" style={{ background: hasCustomBg ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)" }} />
                        </div>
                      )}
                    <div
                      className="animate-fadeSlideIn group/msg relative"
                      style={{ marginBottom: msg.role === "user" ? "20px" : "16px" }}
                    >
                      {msg.role === "user" ? (
                        <div
                          className="rounded-2xl px-5 py-4 relative"
                          style={{
                            background: hasCustomBg ? "rgba(255, 255, 255, 0.08)" : "var(--bg-card)",
                            ...(hasCustomBg ? {
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              backdropFilter: "blur(12px)",
                              WebkitBackdropFilter: "blur(12px)",
                            } : {}),
                          }}
                        >
                          {/* Edit button on hover */}
                          {!isStreaming && editingMessageId !== msg.id && (
                            <div className="absolute top-2 right-2 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150 flex gap-1">
                              <button
                                onClick={() => { setEditingMessageId(msg.id); setEditingMessageContent(msg.content); }}
                                className="h-7 w-7 flex items-center justify-center rounded-md transition-colors"
                                style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-800)"; e.currentTarget.style.color = hasCustomBg ? GLASS_ICON_HOVER : "var(--text-primary)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = hasCustomBg ? GLASS_MUTED : "var(--gray-500)"; }}
                                title="Edit message"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mb-2">
                            <span style={{ fontSize: "14px", fontWeight: 500, color: hasCustomBg ? GLASS_TEXT : "var(--text-primary)" }}>{displayName}</span>
                            <span style={{ fontSize: "12px", color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }}>{formatTime(msg.created_at)}</span>
                            {msg.edited_at && (
                              <span style={{ fontSize: "11px", color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)", fontStyle: "italic" }}>(edited)</span>
                            )}
                          </div>
                          {editingMessageId === msg.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingMessageContent}
                                onChange={(e) => setEditingMessageContent(e.target.value)}
                                className="w-full rounded-lg px-3 py-2 text-[15px] outline-none resize-none"
                                style={{
                                  background: hasCustomBg ? "rgba(255,255,255,0.06)" : "var(--bg-input)",
                                  border: hasCustomBg ? "1px solid rgba(255,255,255,0.12)" : "1px solid hsl(var(--border-subtle))",
                                  color: hasCustomBg ? GLASS_TEXT : "var(--text-primary)",
                                  minHeight: "60px",
                                  lineHeight: 1.7,
                                }}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    if (isMobile) return; // On mobile, Enter inserts a new line
                                    e.preventDefault(); handleEditMessage(msg.id, editingMessageContent);
                                  }
                                  if (e.key === "Escape") { setEditingMessageId(null); setEditingMessageContent(""); }
                                }}
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => { setEditingMessageId(null); setEditingMessageContent(""); }}
                                  className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                                  style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-400)" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-800)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleEditMessage(msg.id, editingMessageContent)}
                                  className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                                  style={{ background: hasCustomBg ? "rgba(255,255,255,0.12)" : "var(--gray-700)", color: hasCustomBg ? GLASS_TEXT : "var(--text-primary)" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? "rgba(255,255,255,0.18)" : "var(--gray-600)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = hasCustomBg ? "rgba(255,255,255,0.12)" : "var(--gray-700)"; }}
                                >
                                  Save & Submit
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {msg.content && msg.content !== "(attached files)" && (
                                <div style={{ fontSize: "15px", lineHeight: 1.7, color: hasCustomBg ? GLASS_TEXT : "var(--text-primary)", fontWeight: 400, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                  {msg.content}
                                </div>
                              )}
                              {msg.attachments && (msg.attachments as Attachment[]).length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {(msg.attachments as Attachment[]).map((att, i) => {
                                    const url = getAttachmentUrl(att);
                                    return att.type.startsWith("image/") ? (
                                      <div key={i} className="block cursor-pointer" onClick={() => setLightboxSrc(url)}>
                                        <img
                                          src={url}
                                          alt={att.name}
                                          className="rounded-lg max-w-[280px] max-h-[200px] object-cover transition-opacity hover:opacity-90"
                                          style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                                        />
                                      </div>
                                    ) : (
                                      <a
                                        key={i}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors"
                                        style={{ background: "rgba(255,255,255,0.06)", color: "#d4d4d4" }}
                                      >
                                        <FileText className="w-4 h-4 shrink-0" />
                                        <span className="truncate max-w-[180px]">{att.name}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div
                            className="chat-prose"
                            style={{
                              fontSize: "15px",
                              lineHeight: 1.8,
                              color: "var(--text-primary)",
                              fontWeight: 400,
                              letterSpacing: "-0.003em",
                            }}
                          >
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => <p style={{ margin: "12px 0" }}>{children}</p>,
                                strong: ({ children }) => <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{children}</strong>,
                                em: ({ children }) => <em style={{ color: "var(--text-primary)" }}>{children}</em>,
                                code: ({ children, className }) => {
                                  const match = /language-(\w+)/.exec(className || "");
                                  const codeStr = String(children).replace(/\n$/, "");
                                  if (match) {
                                    return <CodeBlock language={match[1]} code={codeStr} />;
                                  }
                                  if (codeStr.includes("\n")) {
                                    return <CodeBlock language="text" code={codeStr} />;
                                  }
                                  return <InlineCode>{children}</InlineCode>;
                                },
                                pre: ({ children }) => <>{children}</>,
                                img: ({ src, alt }) => (
                                  <img
                                    src={src}
                                    alt={alt || "Generated image"}
                                    className="rounded-xl max-w-full my-3 cursor-pointer transition-opacity hover:opacity-90"
                                    style={{ maxHeight: "512px", border: "1px solid rgba(255,255,255,0.1)", imageRendering: "high-quality" as any }}
                                    onClick={() => src && setLightboxSrc(src)}
                                  />
                                ),
                                ul: ({ children }) => <ul style={{ paddingLeft: "20px", margin: "12px 0" }}>{children}</ul>,
                                ol: ({ children }) => <ol style={{ paddingLeft: "20px", margin: "12px 0" }}>{children}</ol>,
                                li: ({ children }) => <li style={{ marginBottom: "6px", lineHeight: 1.7 }}>{children}</li>,
                                h1: ({ children }) => <h1 style={{ fontSize: "22px", fontWeight: 600, margin: "24px 0 12px", color: "var(--text-primary)" }}>{children}</h1>,
                                h2: ({ children }) => <h2 style={{ fontSize: "18px", fontWeight: 600, margin: "20px 0 10px", color: "var(--text-primary)" }}>{children}</h2>,
                                h3: ({ children }) => <h3 style={{ fontSize: "16px", fontWeight: 600, margin: "16px 0 8px", color: "var(--text-primary)" }}>{children}</h3>,
                                blockquote: ({ children }) => (
                                  <blockquote style={{
                                    borderLeft: "3px solid var(--gray-600)",
                                    paddingLeft: "16px",
                                    margin: "16px 0",
                                    color: "var(--text-secondary)",
                                    fontStyle: "italic",
                                  }}>{children}</blockquote>
                                ),
                              }}
                            >
                              {preprocessAsciiArt(msg.content)}
                            </ReactMarkdown>
                            {isStreaming && idx === messages.length - 1 && msg.role === "assistant" && (
                              <span className="streaming-cursor" />
                            )}
                          </div>
                          {/* Model label + variant nav + hover actions for assistant messages */}
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {/* Variant navigation - always visible when variants exist */}
                            {messageVariants[msg.id] && messageVariants[msg.id].length > 1 && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleVariantNav(msg.id, 'prev')}
                                  className="h-6 w-6 flex items-center justify-center rounded-md transition-colors"
                                  style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-800)"; e.currentTarget.style.color = hasCustomBg ? GLASS_ICON_HOVER : "var(--text-primary)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = hasCustomBg ? GLASS_MUTED : "var(--gray-500)"; }}
                                  title="Previous variant"
                                >
                                  <ChevronLeft className="h-3.5 w-3.5" />
                                </button>
                                <span style={{ fontSize: "11px", color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)", fontWeight: 500, whiteSpace: "nowrap" }}>
                                  {(activeVariantIndex[msg.id] || 0) + 1}/{messageVariants[msg.id].length}
                                  {msg.model && ` · ${AVAILABLE_MODELS.find((m) => m.id === msg.model)?.name || msg.model?.split("/").pop()}`}
                                </span>
                                <button
                                  onClick={() => handleVariantNav(msg.id, 'next')}
                                  className="h-6 w-6 flex items-center justify-center rounded-md transition-colors"
                                  style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-800)"; e.currentTarget.style.color = hasCustomBg ? GLASS_ICON_HOVER : "var(--text-primary)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = hasCustomBg ? GLASS_MUTED : "var(--gray-500)"; }}
                                  title="Next variant"
                                >
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                            {/* Model label when no variants */}
                            {(!messageVariants[msg.id] || messageVariants[msg.id].length <= 1) && msg.model && (
                              <span style={{ fontSize: "11px", color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)", fontWeight: 400 }}>
                                {AVAILABLE_MODELS.find((m) => m.id === msg.model)?.name || msg.model?.split("/").pop()}
                              </span>
                            )}
                            {!isStreaming && (
                              <div className="opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150 flex items-center gap-0.5 ml-auto">
                                <button
                                  onClick={() => handleRegenerate(msg.id)}
                                  className="h-7 w-7 flex items-center justify-center rounded-md transition-colors"
                                  style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-800)"; e.currentTarget.style.color = hasCustomBg ? GLASS_ICON_HOVER : "var(--text-primary)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = hasCustomBg ? GLASS_MUTED : "var(--gray-500)"; }}
                                  title="Regenerate"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      className="h-7 px-1.5 flex items-center justify-center rounded-md transition-colors gap-1"
                                      style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)", fontSize: "11px" }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-800)"; e.currentTarget.style.color = hasCustomBg ? GLASS_ICON_HOVER : "var(--text-primary)"; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = hasCustomBg ? GLASS_MUTED : "var(--gray-500)"; }}
                                      title="Try other models"
                                    >
                                      <ChevronDown className="h-3 w-3" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="start"
                                    className="w-56"
                                    style={hasCustomBg ? { ...GLASS_DROPDOWN_STYLE, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" } : { background: "var(--bg-card)", border: "1px solid hsl(var(--border-subtle))" }}
                                  >
                                    {AVAILABLE_MODELS.filter((m) => m.featured).map((model) => (
                                      <DropdownMenuItem
                                        key={model.id}
                                        onClick={() => handleRegenerate(msg.id, model.id)}
                                        className="cursor-pointer text-[13px]"
                                        style={{ color: hasCustomBg ? GLASS_TEXT : "var(--text-primary)" }}
                                      >
                                        {model.name}
                                        <span className="ml-auto text-[11px]" style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }}>{model.provider}</span>
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <button
                                  onClick={() => handleBranchConversation(msg.id)}
                                  className="h-7 w-7 flex items-center justify-center rounded-md transition-colors"
                                  style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-800)"; e.currentTarget.style.color = hasCustomBg ? GLASS_ICON_HOVER : "var(--text-primary)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = hasCustomBg ? GLASS_MUTED : "var(--gray-500)"; }}
                                  title="Branch conversation"
                                >
                                  <GitBranch className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => { navigator.clipboard.writeText(msg.content); toast({ title: "Copied to clipboard" }); }}
                                  className="h-7 w-7 flex items-center justify-center rounded-md transition-colors"
                                  style={{ color: hasCustomBg ? GLASS_MUTED : "var(--gray-500)" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_HOVER : "var(--gray-800)"; e.currentTarget.style.color = hasCustomBg ? GLASS_ICON_HOVER : "var(--text-primary)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = hasCustomBg ? GLASS_MUTED : "var(--gray-500)"; }}
                                  title="Copy message"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </div>
            </div>

            {/* Thought initiation notification */}
            <ThoughtInitiation onEngage={(msg) => { setInput(msg); }} />

            {/* Bottom-pinned input when messages exist */}
            <div className="w-full px-4 pt-6 pb-6 relative z-10" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom, 24px))" }}>
              {inputArea}
            </div>
          </>
        )}
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onImportStarted={startImportTracking} settings={settings} onUpdateSettings={updateSettings} frosted={hasCustomBg} />
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
    </PageTransition>
  );
};

export default Chat;
