/**
 * OpenRouter PKCE OAuth flow.
 *
 * Lets a user connect (or sign up for) OpenRouter from inside the
 * Polyphonic app: a small popup opens to openrouter.ai/auth, the user
 * authenticates there, OpenRouter redirects the popup back to our
 * /auth/openrouter/callback page with a one-time code, the popup posts
 * the code to its opener (this app) and closes itself, and we exchange
 * the code for a real OpenRouter API key over the OpenRouter token
 * endpoint.
 *
 * The user never leaves Polyphonic, never copy/pastes a key, and new
 * OpenRouter accounts can be created inline from the popup.
 *
 * References:
 *   https://openrouter.ai/docs/use-cases/oauth-pkce
 */

const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
const OPENROUTER_KEY_EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";

const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 720;
/** Slot in sessionStorage where the popup hands the code back if the
 *  postMessage path is unavailable (e.g. opener was reloaded). */
const FALLBACK_CODE_KEY = "polyphonic_openrouter_pending_code";
/** Seconds to wait for the popup to return a code before timing out. */
const POPUP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
/** Slot for the per-flow PKCE verifier. We keep it in sessionStorage so
 *  the callback page can read it even if the popup-message path breaks
 *  and we fall back to "did the parent see a code in storage" polling. */
const VERIFIER_KEY = "polyphonic_openrouter_pkce_verifier";

export interface OpenRouterConnectResult {
  /** The new API key returned by OpenRouter. Format: `sk-or-v1-…` */
  key: string;
  /** Optional metadata OpenRouter returns alongside the key. */
  user_id?: string;
  label?: string;
}

export class OpenRouterAuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "OpenRouterAuthError";
  }
}

// ──────────────────────────────────────────────────────────────────────
// PKCE primitives
// ──────────────────────────────────────────────────────────────────────

function base64UrlEncode(bytes: Uint8Array): string {
  // btoa works on binary-strings, so we map the byte array through
  // String.fromCharCode then strip the URL-unsafe characters.
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateVerifier(): string {
  const arr = new Uint8Array(48); // 48 bytes → 64-char base64url string
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr);
}

async function challengeFromVerifier(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const hashed = await crypto.subtle.digest("SHA-256", encoded);
  return base64UrlEncode(new Uint8Array(hashed));
}

// ──────────────────────────────────────────────────────────────────────
// URL builders
// ──────────────────────────────────────────────────────────────────────

function buildAuthUrl(callbackUrl: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    callback_url: callbackUrl,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${OPENROUTER_AUTH_URL}?${params.toString()}`;
}

function defaultCallbackUrl(): string {
  return `${window.location.origin}/auth/openrouter/callback`;
}

// ──────────────────────────────────────────────────────────────────────
// Token exchange
// ──────────────────────────────────────────────────────────────────────

async function exchangeCodeForKey(
  code: string,
  codeVerifier: string,
): Promise<OpenRouterConnectResult> {
  let resp: Response;
  try {
    resp = await fetch(OPENROUTER_KEY_EXCHANGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        code_challenge_method: "S256",
      }),
    });
  } catch (err) {
    throw new OpenRouterAuthError(
      "network",
      err instanceof Error ? err.message : "Network error talking to OpenRouter.",
    );
  }

  if (!resp.ok) {
    let bodyText = "";
    try {
      bodyText = await resp.text();
    } catch {
      // ignore
    }
    throw new OpenRouterAuthError(
      "exchange_failed",
      `OpenRouter token exchange failed (${resp.status}). ${bodyText.slice(0, 220)}`,
    );
  }

  let payload: unknown;
  try {
    payload = await resp.json();
  } catch {
    throw new OpenRouterAuthError(
      "bad_response",
      "OpenRouter returned a non-JSON response to the key exchange.",
    );
  }

  const key =
    (payload as { key?: string })?.key ??
    (payload as { api_key?: string })?.api_key;
  if (!key || typeof key !== "string") {
    throw new OpenRouterAuthError(
      "no_key",
      "OpenRouter response did not include an API key.",
    );
  }

  return {
    key,
    user_id: (payload as { user_id?: string })?.user_id,
    label: (payload as { label?: string })?.label,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Popup orchestration
// ──────────────────────────────────────────────────────────────────────

interface ConnectOpts {
  /** Override the callback URL for testing. */
  callbackUrl?: string;
  /** Called when the popup window opens. */
  onPopupOpen?: () => void;
}

/**
 * Start the OpenRouter PKCE flow. Opens a popup, waits for the callback
 * page to post its `code` back, then exchanges the code for an API key.
 *
 * If the popup is blocked (window.open returned null), throws with code
 * 'popup_blocked' so callers can fall back to a full-page redirect or
 * surface a clear error.
 */
export async function connectOpenRouter(
  opts: ConnectOpts = {},
): Promise<OpenRouterConnectResult> {
  if (typeof window === "undefined") {
    throw new OpenRouterAuthError(
      "no_window",
      "OpenRouter PKCE flow requires a browser window.",
    );
  }

  const callbackUrl = opts.callbackUrl || defaultCallbackUrl();

  const verifier = generateVerifier();
  const challenge = await challengeFromVerifier(verifier);

  // Stash verifier so the callback page (and recovery polling) can
  // reach it without us having to keep a JS reference alive across
  // the popup round-trip.
  try {
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.removeItem(FALLBACK_CODE_KEY);
  } catch {
    // sessionStorage may be unavailable in some embedded contexts;
    // we keep the in-memory verifier as a backup.
  }

  const authUrl = buildAuthUrl(callbackUrl, challenge);

  const left = Math.max(0, (window.screen.availWidth - POPUP_WIDTH) / 2);
  const top = Math.max(0, (window.screen.availHeight - POPUP_HEIGHT) / 2);
  const features = `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`;
  const popup = window.open(authUrl, "polyphonic-openrouter", features);

  if (!popup) {
    throw new OpenRouterAuthError(
      "popup_blocked",
      "Popup blocked. Allow popups for this site, or use the manual key path.",
    );
  }

  opts.onPopupOpen?.();

  // Wait for the callback page to send back a code via postMessage,
  // OR for sessionStorage to surface a code (popup may write there if
  // postMessage fails for any reason).
  const code = await new Promise<string>((resolve, reject) => {
    let done = false;
    const settle = (action: () => void) => {
      if (done) return;
      done = true;
      action();
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as
        | { type?: string; code?: string; error?: string }
        | null;
      if (!data || data.type !== "openrouter-auth-callback") return;
      cleanup();
      if (data.error) {
        settle(() =>
          reject(new OpenRouterAuthError("popup_error", data.error || "")),
        );
        return;
      }
      if (!data.code) {
        settle(() =>
          reject(
            new OpenRouterAuthError(
              "popup_no_code",
              "OpenRouter callback completed without a code.",
            ),
          ),
        );
        return;
      }
      settle(() => resolve(data.code as string));
    };

    const pollClosed = window.setInterval(() => {
      // Detect the popup being closed by the user without finishing.
      try {
        if (popup.closed) {
          // Last-chance check: did the callback write a code to storage?
          const stashed = (() => {
            try {
              return sessionStorage.getItem(FALLBACK_CODE_KEY);
            } catch {
              return null;
            }
          })();
          if (stashed) {
            try {
              sessionStorage.removeItem(FALLBACK_CODE_KEY);
            } catch {
              // ignore
            }
            cleanup();
            settle(() => resolve(stashed));
            return;
          }
          cleanup();
          settle(() =>
            reject(
              new OpenRouterAuthError(
                "popup_closed",
                "Sign-in window was closed before completing.",
              ),
            ),
          );
        }
      } catch {
        // Cross-origin reads during the OpenRouter portion can throw;
        // ignore and keep polling.
      }
    }, 500);

    const timeout = window.setTimeout(() => {
      cleanup();
      try {
        popup.close();
      } catch {
        // ignore
      }
      settle(() =>
        reject(
          new OpenRouterAuthError(
            "timeout",
            "Sign-in took too long. Please try again.",
          ),
        ),
      );
    }, POPUP_TIMEOUT_MS);

    function cleanup() {
      window.removeEventListener("message", onMessage);
      window.clearInterval(pollClosed);
      window.clearTimeout(timeout);
    }

    window.addEventListener("message", onMessage);
  });

  // Pull the verifier back out — we may have just resumed from a
  // fallback-storage code, so prefer the storage value if present.
  const storedVerifier = (() => {
    try {
      return sessionStorage.getItem(VERIFIER_KEY) || verifier;
    } catch {
      return verifier;
    }
  })();

  // Best-effort cleanup. The verifier is single-use anyway.
  try {
    sessionStorage.removeItem(VERIFIER_KEY);
  } catch {
    // ignore
  }

  return await exchangeCodeForKey(code, storedVerifier);
}

/**
 * Read-only check: is a popup currently open holding the OpenRouter
 * verifier? Useful for callers that want to disable a re-click.
 */
export function isOpenRouterFlowPending(): boolean {
  try {
    return Boolean(sessionStorage.getItem(VERIFIER_KEY));
  } catch {
    return false;
  }
}

/**
 * Helper used by the /auth/openrouter/callback page. Reads the `code`
 * out of the URL, posts it back to opener, and closes the popup. If
 * postMessage fails for any reason, writes the code to sessionStorage
 * as a fallback so the parent's poll-on-close path can still recover.
 */
export function handleOpenRouterCallbackInPopup(): {
  ok: boolean;
  message: string;
} {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");

  let payload: { type: string; code?: string; error?: string };
  if (error) {
    payload = {
      type: "openrouter-auth-callback",
      error: params.get("error_description") || error,
    };
  } else if (code) {
    payload = { type: "openrouter-auth-callback", code };
  } else {
    payload = {
      type: "openrouter-auth-callback",
      error: "Missing code in OpenRouter callback URL.",
    };
  }

  try {
    if (window.opener) {
      window.opener.postMessage(payload, window.location.origin);
    } else if (code) {
      // Lost the opener (e.g., user reloaded the parent during the
      // round-trip). Stash the code so the parent's poll-on-close
      // path can still pick it up if it eventually reopens.
      try {
        sessionStorage.setItem(FALLBACK_CODE_KEY, code);
      } catch {
        // ignore
      }
    }
  } catch {
    // postMessage can throw across some sandboxed iframes; treat as a
    // soft failure.
  }

  // Close after a beat so any pending postMessage can ship.
  window.setTimeout(() => {
    try {
      window.close();
    } catch {
      // ignore — close may be denied if not opener-spawned
    }
  }, 80);

  if (error) {
    return { ok: false, message: payload.error || "Connection failed." };
  }
  return {
    ok: true,
    message: "Connected. You can close this window.",
  };
}
