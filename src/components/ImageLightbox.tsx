import { useState, useEffect, useCallback } from "react";
import { X, Download, Loader2, Check } from "lucide-react";

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

type DownloadState = "idle" | "loading" | "done";

const mimeToExt: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

const ImageLightbox = ({ src, alt, onClose }: ImageLightboxProps) => {
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");

  useEffect(() => {
    if (!src) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [src, onClose]);

  const handleDownload = useCallback(async () => {
    if (!src || downloadState === "loading") return;
    setDownloadState("loading");
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "";
      const ext = mimeToExt[contentType] || ".png";
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `polyphonic-image-${date}${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadState("done");
      setTimeout(() => setDownloadState("idle"), 1500);
    } catch (e) {
      console.error("Download failed", e);
      window.open(src, "_blank");
      setDownloadState("idle");
    }
  }, [src, downloadState]);

  if (!src) return null;

  const btnStyle = {
    background: "rgba(255, 255, 255, 0.1)",
    color: "rgba(255, 255, 255, 0.7)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
  };
  const btnHover = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
    e.currentTarget.style.color = "rgba(255, 255, 255, 0.95)";
  };
  const btnLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
    e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)";
  };

  const DownloadIcon = downloadState === "loading" ? Loader2 : downloadState === "done" ? Check : Download;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center animate-in fade-in duration-200"
      style={{
        background: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); handleDownload(); }}
          className="h-10 w-10 flex items-center justify-center rounded-full transition-colors"
          style={btnStyle}
          onMouseEnter={btnHover}
          onMouseLeave={btnLeave}
          disabled={downloadState === "loading"}
        >
          <DownloadIcon className={`h-5 w-5 ${downloadState === "loading" ? "animate-spin" : ""}`} />
        </button>
        <button
          onClick={onClose}
          className="h-10 w-10 flex items-center justify-center rounded-full transition-colors"
          style={btnStyle}
          onMouseEnter={btnHover}
          onMouseLeave={btnLeave}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <img
        src={src}
        alt={alt || "Image"}
        className="animate-in zoom-in-95 duration-200"
        style={{
          maxWidth: "90vw",
          maxHeight: "90vh",
          objectFit: "contain",
          borderRadius: "12px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
          imageRendering: "high-quality" as any,
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};

export default ImageLightbox;
