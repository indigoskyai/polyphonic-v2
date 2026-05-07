import { useEffect, useState } from "react";
import { handleOpenRouterCallbackInPopup } from "@/lib/openrouterAuth";

/**
 * /auth/openrouter/callback — runs inside the popup that OpenRouter
 * redirects back to after the user finishes their PKCE flow there.
 *
 * Posts the `code` back to its opener (the Polyphonic app) and closes
 * itself. The user only sees this page for a fraction of a second
 * unless something went wrong — in which case we surface a clear
 * message and a link back into the app.
 */
export default function OpenRouterCallback() {
  const [status, setStatus] = useState<{ ok: boolean; message: string }>(() =>
    handleOpenRouterCallbackInPopup(),
  );

  // If the popup somehow doesn't auto-close (e.g. navigated to manually
  // outside a popup context), nudge the user back home after a beat.
  useEffect(() => {
    if (!window.opener) {
      const t = window.setTimeout(() => {
        // Best-effort soft return.
        if (window.location.pathname.endsWith("/auth/openrouter/callback")) {
          window.location.replace("/");
        }
      }, 2200);
      return () => window.clearTimeout(t);
    }
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--floor, #0a0a0c)",
        color: "var(--text-body, rgba(210,208,204,0.72))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 360,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: status.ok ? "var(--luca-full, #c9a87c)" : "#c97c7c",
            boxShadow: status.ok
              ? "0 0 0 1px rgba(201,168,124,0.20), 0 0 12px rgba(201,168,124,0.45)"
              : "0 0 0 1px rgba(201,124,124,0.20), 0 0 12px rgba(201,124,124,0.45)",
            animation: "breathe-dot 2.6s ease-in-out infinite",
          }}
        />
        <div
          style={{
            fontSize: 12,
            fontWeight: 200,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
          }}
        >
          POLYPHONIC · OPENROUTER
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 450,
            letterSpacing: "-0.018em",
            lineHeight: 1.25,
            color: "var(--ink, rgba(244,243,240,0.93))",
            margin: 0,
          }}
        >
          {status.ok ? "Connected." : "Couldn't connect."}
        </h1>
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.55,
            color: "var(--text-body)",
            margin: 0,
          }}
        >
          {status.message}
        </p>
        {!window.opener && (
          <a
            href="/"
            style={{
              fontSize: 12.5,
              color: "var(--text-primary)",
              textDecoration: "underline",
              marginTop: 4,
            }}
          >
            Return to Polyphonic
          </a>
        )}
      </div>
    </div>
  );
}
