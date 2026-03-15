import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Image as ImageIcon, Loader2, ExternalLink } from "lucide-react";
import { useUserSettings } from "@/hooks/useUserSettings";
import { usePageNavigate } from "@/hooks/usePageNavigate";
import PageTransition from "@/components/PageTransition";
import { getBackgroundStyle } from "@/lib/backgrounds";
import { GLASS_STYLE, GLASS_HOVER, GLASS_BORDER, GLASS_MUTED, GLASS_ICON, GLASS_TEXT } from "@/lib/glassmorphism";
import ImageLightbox from "@/components/ImageLightbox";

interface GalleryImage {
  url: string;
  prompt: string;
  created_at: string;
  conversation_id: string;
}

const IMAGE_REGEX = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/;

const Gallery = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { exiting, navigateTo } = usePageNavigate();
  const { settings } = useUserSettings();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const bgStyle = getBackgroundStyle(settings?.background_style);
  const hasCustomBg = !!bgStyle;

  useEffect(() => {
    if (user) loadImages();
  }, [user]);

  const loadImages = async () => {
    setLoading(true);

    // Fetch assistant messages with model=gemini-image
    const { data: assistantMsgs } = await supabase
      .from("messages")
      .select("content, created_at, conversation_id")
      .eq("user_id", user!.id)
      .eq("role", "assistant")
      .eq("model", "gemini-image")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!assistantMsgs || assistantMsgs.length === 0) {
      setImages([]);
      setLoading(false);
      return;
    }

    // Get conversation IDs to fetch user prompts
    const convIds = [...new Set(assistantMsgs.map((m) => m.conversation_id))];

    // Fetch all user messages from those conversations for prompt extraction
    const { data: userMsgs } = await supabase
      .from("messages")
      .select("content, created_at, conversation_id")
      .eq("user_id", user!.id)
      .eq("role", "user")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: true });

    const userMsgMap: Record<string, Array<{ content: string; created_at: string }>> = {};
    for (const m of userMsgs || []) {
      if (!userMsgMap[m.conversation_id]) userMsgMap[m.conversation_id] = [];
      userMsgMap[m.conversation_id].push({ content: m.content, created_at: m.created_at });
    }

    // Extract image storage paths from markdown URLs
    const STORAGE_PATH_REGEX = /generated-images\/([^\s?)]+)/;
    const extracted: GalleryImage[] = [];
    const pathsToSign: string[] = [];
    const pathIndexMap: number[] = [];

    for (const msg of assistantMsgs) {
      const match = IMAGE_REGEX.exec(msg.content);
      if (!match) continue;

      const url = match[1];
      // Extract the storage path from the URL
      const pathMatch = STORAGE_PATH_REGEX.exec(url);

      const convUserMsgs = userMsgMap[msg.conversation_id] || [];
      const precedingMsg = convUserMsgs
        .filter((um) => um.created_at < msg.created_at)
        .pop();

      const idx = extracted.length;
      extracted.push({
        url, // Will be replaced with signed URL if possible
        prompt: precedingMsg?.content || "Image generation",
        created_at: msg.created_at,
        conversation_id: msg.conversation_id,
      });

      if (pathMatch) {
        pathsToSign.push(pathMatch[1]);
        pathIndexMap.push(idx);
      }
    }

    // Create signed URLs for all images
    if (pathsToSign.length > 0) {
      const { data: signedUrls } = await supabase.storage
        .from("generated-images")
        .createSignedUrls(pathsToSign, 3600);

      if (signedUrls) {
        for (let i = 0; i < signedUrls.length; i++) {
          if (signedUrls[i].signedUrl) {
            extracted[pathIndexMap[i]].url = signedUrls[i].signedUrl;
          }
        }
      }
    }

    setImages(extracted);
    setLoading(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <PageTransition exiting={exiting}>
    <div className="flex h-screen relative" style={{ background: hasCustomBg ? "transparent" : "var(--bg-content)" }}>
      {hasCustomBg && bgStyle && (
        <>
          <div className="absolute inset-0 z-0" style={bgStyle} />
          <div className="absolute inset-0 z-[1]" style={{ background: "rgba(0, 0, 0, 0.3)" }} />
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <button
            onClick={() => navigateTo("/chat")}
            className="h-7 w-7 flex items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--gray-400)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = hasCustomBg ? GLASS_BORDER : "var(--gray-800)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
            }}
          >
            Gallery
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--gray-500)" }} />
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <ImageIcon className="h-8 w-8" style={{ color: "var(--gray-600)" }} />
              <p style={{ fontSize: "15px", color: "var(--gray-500)", textAlign: "center", maxWidth: "320px" }}>
                No images generated yet. Use the image generation tool in chat to create your first image.
              </p>
            </div>
          ) : (
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className="group relative rounded-xl overflow-hidden cursor-pointer"
                    style={{
                      ...(hasCustomBg ? {
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                      } : {
                        background: "var(--bg-card)",
                        border: "1px solid hsl(var(--border-subtle))",
                      }),
                    }}
                  >
                    <div
                      className="aspect-square overflow-hidden"
                      onClick={() => setLightboxSrc(img.url)}
                    >
                      <img
                        src={img.url}
                        alt={img.prompt}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>

                    {/* Hover overlay */}
                    <div
                      className="absolute inset-0 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto"
                      style={{
                        background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)",
                      }}
                      onClick={() => setLightboxSrc(img.url)}
                    >
                      <div className="p-3">
                        <p
                          className="text-xs mb-2 line-clamp-2"
                          style={{ color: "rgba(255, 255, 255, 0.85)", lineHeight: 1.4 }}
                        >
                          {img.prompt}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px]" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
                            {formatDate(img.created_at)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateTo(`/chat?conversation=${img.conversation_id}`);
                            }}
                            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors"
                            style={{
                              background: "rgba(255, 255, 255, 0.1)",
                              color: "rgba(255, 255, 255, 0.7)",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
                            }}
                          >
                            <ExternalLink className="h-3 w-3" />
                            Chat
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
    </PageTransition>
  );
};

export default Gallery;
