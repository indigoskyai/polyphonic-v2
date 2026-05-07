import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  connectOpenRouter,
  OpenRouterAuthError,
} from "@/lib/openrouterAuth";

type Phase = "idle" | "connecting" | "saving" | "success" | "error";

export interface ConnectOpenRouterProps {
  /** Called once the key is stored successfully. Use this to refresh
   *  whatever state was waiting for a key (e.g. modelKeyStatus in
   *  ChatView, or the settings preview pill). */
  onConnected?: (preview: string | null) => void;
  /** "primary" matches the cream PrimaryButton from the landing.
   *  "ghost" is a transparent treatment that fits inline notices. */
  variant?: "primary" | "ghost";
  /** Override the default copy. */
  label?: string;
  className?: string;
  /** Optional inline style on the button. */
  style?: React.CSSProperties;
}

/**
 * "Connect OpenRouter" button — opens a popup, runs the PKCE flow,
 * stores the resulting API key in Supabase via save_user_api_key, and
 * surfaces success / error state inline. Designed to drop in anywhere
 * the user might need to provision a model key without leaving the app.
 */
export default function ConnectOpenRouter({
  onConnected,
  variant = "primary",
  label = "Connect OpenRouter",
  className,
  style,
}: ConnectOpenRouterProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    setPhase("connecting");
    try {
      const result = await connectOpenRouter();
      setPhase("saving");

      const { error: saveError } = await supabase.rpc("save_user_api_key", {
        p_key: result.key,
      });
      if (saveError) {
        throw new OpenRouterAuthError(
          "save_failed",
          saveError.message || "Could not save the new key.",
        );
      }

      // Read back the preview so callers can render the connected pill.
      const { data: preview } = await supabase
        .from("user_api_keys")
        .select("key_preview")
        .maybeSingle();

      setPhase("success");
      onConnected?.(preview?.key_preview ?? null);
    } catch (err) {
      let message = "Connection failed. Please try again.";
      if (err instanceof OpenRouterAuthError) {
        message = err.message;
        if (err.code === "popup_blocked") {
          message =
            "Popups are blocked for this site. Allow popups, or paste a key manually below.";
        } else if (err.code === "popup_closed") {
          message =
            "The sign-in window closed before we got a key. Try again.";
        } else if (err.code === "timeout") {
          message =
            "The OpenRouter sign-in window took too long. Try again.";
        }
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
      setPhase("error");
    }
  }, [onConnected]);

  const buttonText =
    phase === "connecting"
      ? "Opening OpenRouter…"
      : phase === "saving"
      ? "Saving key…"
      : phase === "success"
      ? "Connected"
      : label;

  const disabled = phase === "connecting" || phase === "saving";

  const styles =
    variant === "primary"
      ? primaryStyles(disabled)
      : ghostStyles(disabled);

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        style={styles.button}
        onMouseEnter={(e) => {
          if (disabled) return;
          Object.assign(
            (e.currentTarget as HTMLButtonElement).style,
            styles.hover,
          );
        }}
        onMouseLeave={(e) => {
          Object.assign(
            (e.currentTarget as HTMLButtonElement).style,
            styles.button,
          );
        }}
      >
        <OpenRouterGlyph />
        <span>{buttonText}</span>
      </button>
      {error && (
        <p
          role="alert"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            lineHeight: 1.5,
            color: "#c97c7c",
            margin: 0,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────── */

function primaryStyles(disabled: boolean): {
  button: React.CSSProperties;
  hover: React.CSSProperties;
} {
  return {
    button: {
      width: "100%",
      height: 44,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      background: "linear-gradient(180deg, #f4f3f0 0%, #e8e6e1 100%)",
      border: "1px solid rgba(255, 255, 255, 0.5)",
      borderRadius: 10,
      fontFamily: "var(--font-sans)",
      fontSize: 14,
      fontWeight: 500,
      letterSpacing: "-0.005em",
      color: "#1a1a1f",
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.55 : 1,
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 0 rgba(0,0,0,0.4), 0 8px 20px -8px rgba(0,0,0,0.6)",
      transition:
        "transform 220ms cubic-bezier(0.22,1,0.36,1), box-shadow 220ms cubic-bezier(0.22,1,0.36,1), background 220ms cubic-bezier(0.22,1,0.36,1)",
    },
    hover: {
      transform: "translateY(-0.5px)",
      background: "linear-gradient(180deg, #faf9f6 0%, #f0eee9 100%)",
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 0 rgba(0,0,0,0.4), 0 12px 28px -10px rgba(0,0,0,0.65)",
    },
  };
}

function ghostStyles(disabled: boolean): {
  button: React.CSSProperties;
  hover: React.CSSProperties;
} {
  return {
    button: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 14px",
      background: "transparent",
      border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
      borderRadius: "var(--radius-pill, 999px)",
      fontFamily: "var(--font-sans)",
      fontSize: 12.5,
      fontWeight: 450,
      letterSpacing: "var(--track-body)",
      color: "var(--text-body)",
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.55 : 1,
      transition: "color 180ms ease, border-color 180ms ease, background 180ms ease",
    },
    hover: {
      color: "var(--text-primary)",
      borderColor: "rgba(255,255,255,0.13)",
      background: "var(--overlay-hover, rgba(255,255,255,0.03))",
    },
  };
}

/* ─── Glyph ───────────────────────────────────────────────────────── */

function OpenRouterGlyph() {
  // Simple, original mark — three converging strokes meeting at a
  // hub. Visually evokes "many models, one router" without infringing
  // OpenRouter's branding.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2" />
      <path d="M8 6V2" />
      <path d="M11.4 9.4l2.6 2.6" />
      <path d="M4.6 9.4L2 12" />
    </svg>
  );
}
