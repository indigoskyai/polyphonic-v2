/**
 * Parse a Lovable Cloud edge-function error response into a friendly toast string.
 * Edge functions follow envelope: { error: string, code?: string, request_id?: string }
 */

export interface EdgeError {
  message: string;
  code?: string;
  requestId?: string;
}

export async function parseEdgeError(resp: Response): Promise<EdgeError> {
  let body: any = null;
  try { body = await resp.json(); } catch { /* non-json */ }
  const message =
    (typeof body?.error === "string" && body.error) ||
    (typeof body?.message === "string" && body.message) ||
    `Request failed (${resp.status})`;
  return {
    message,
    code: typeof body?.code === "string" ? body.code : undefined,
    requestId: typeof body?.request_id === "string" ? body.request_id : undefined,
  };
}

export function friendlyMessage(err: EdgeError): string {
  switch (err.code) {
    case "quota_exceeded": return "You've hit today's usage limit. Try again tomorrow.";
    case "missing_api_key": return "No model API key configured. Open Settings -> Models to add your OpenRouter key.";
    case "upstream_unavailable": return "The model provider is having trouble. Please retry in a moment.";
    case "unauthorized": return "Please sign in again.";
    case "validation_error": return err.message;
    default: return err.message;
  }
}
