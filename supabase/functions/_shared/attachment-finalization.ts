import { ValidationError } from "./errors.ts";
import {
  MAX_EXTRACTED_CHARS,
  assertMimeMatches,
  assertSafeSvg,
  capabilitiesFor,
  extensionOf,
  sniffMime,
} from "./attachments.ts";

type AttachmentAdmin = {
  from: (relation: string) => any;
  storage: { from: (bucket: string) => any };
};

type ExtractionPayload = {
  extractedText: string;
  checksum: string | null;
  derivatives: Array<Record<string, unknown>>;
};

const MAX_SVG_BYTES = 5 * 1024 * 1024;
const PREFIX_BYTES = 64 * 1024;

function cleanMetadata(value: unknown): Record<string, string | number | boolean> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 12)) {
    if (typeof item === "string") output[key.slice(0, 80)] = item.slice(0, 300);
    else if (typeof item === "number" && Number.isFinite(item)) output[key.slice(0, 80)] = item;
    else if (typeof item === "boolean") output[key.slice(0, 80)] = item;
  }
  return Object.keys(output).length ? output : undefined;
}

export function normalizeClientExtraction(value: unknown): ExtractionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { extractedText: "", checksum: null, derivatives: [] };
  }
  const source = value as Record<string, unknown>;
  const extractedText = typeof source.extracted_text === "string"
    ? source.extracted_text.replaceAll("\u0000", "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_EXTRACTED_CHARS)
    : "";
  const checksum = typeof source.checksum === "string" && /^[a-f0-9]{64}$/i.test(source.checksum)
    ? source.checksum.toLowerCase()
    : null;
  const derivatives = Array.isArray(source.derivatives)
    ? source.derivatives.slice(0, 8).flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const row = item as Record<string, unknown>;
      if (row.kind !== "extraction") return [];
      return [{
        kind: "extraction",
        label: typeof row.label === "string" ? row.label.slice(0, 160) : "Browser extraction",
        ...(cleanMetadata(row.metadata) ? { metadata: cleanMetadata(row.metadata) } : {}),
      }];
    })
    : [];
  return { extractedText, checksum, derivatives };
}

async function readPrefix(admin: AttachmentAdmin, bucket: string, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw error || new Error("Could not inspect the uploaded file");
  const response = await fetch(data.signedUrl, { headers: { Range: `bytes=0-${PREFIX_BYTES - 1}` } });
  if (!response.ok) throw new Error("Could not inspect the uploaded file");
  if (!response.body) return new Uint8Array(await response.arrayBuffer()).slice(0, PREFIX_BYTES);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < PREFIX_BYTES) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      const remaining = PREFIX_BYTES - total;
      const chunk = value.length > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.length;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function validateSvg(admin: AttachmentAdmin, row: Record<string, any>) {
  if (Number(row.size_bytes) > MAX_SVG_BYTES) throw new ValidationError("SVG files must be 5 MB or smaller");
  const { data, error } = await admin.storage.from(String(row.bucket)).download(String(row.storage_path));
  if (error || !data) throw error || new Error("Could not inspect the SVG file");
  assertSafeSvg(await data.text());
}

function requiresExtractedText(row: Record<string, any>, verifiedMime: string): boolean {
  if (row.kind === "document" && verifiedMime === "application/pdf") return false;
  return ["document", "spreadsheet", "presentation", "code", "text", "archive"].includes(String(row.kind));
}

async function verifiedObjectSize(admin: AttachmentAdmin, row: Record<string, any>): Promise<number> {
  const path = String(row.storage_path);
  const slash = path.lastIndexOf("/");
  const { data, error } = await admin.storage.from(String(row.bucket)).list(path.slice(0, slash), {
    search: path.slice(slash + 1),
    limit: 2,
  });
  if (error) throw error;
  const object = data?.find((item: Record<string, any>) => path.endsWith(`/${item.name}`));
  if (!object) throw new ValidationError("The uploaded object is missing");
  return Number((object.metadata as Record<string, unknown> | null)?.size ?? 0);
}

export async function finalizeAttachmentRecord(
  admin: AttachmentAdmin,
  row: Record<string, any>,
  rawExtraction: unknown,
): Promise<Record<string, any>> {
  if (!["uploading", "quarantined", "scanning", "extracting", "failed"].includes(String(row.status))) {
    throw new ValidationError("This upload cannot be finalized");
  }

  const objectSize = await verifiedObjectSize(admin, row);
  if (objectSize > 0 && objectSize !== Number(row.size_bytes)) {
    throw new ValidationError("Uploaded size does not match the initialized upload");
  }

  await admin.from("chat_attachments").update({ status: "extracting", processing_error: null }).eq("id", row.id);
  const prefix = await readPrefix(admin, String(row.bucket), String(row.storage_path));
  const verifiedMime = sniffMime(prefix, String(row.declared_mime_type || ""), String(row.original_name));
  assertMimeMatches(String(row.original_name), row.kind, String(row.declared_mime_type || ""), verifiedMime);
  if (extensionOf(String(row.original_name)) === "svg") await validateSvg(admin, row);

  const extraction = normalizeClientExtraction(rawExtraction);
  if (requiresExtractedText(row, verifiedMime) && !extraction.extractedText) {
    throw new ValidationError("This file needs the current Polyphonic uploader to prepare its contents for your agent");
  }

  let duplicateOf: string | null = null;
  if (extraction.checksum) {
    const { data: duplicate, error: duplicateError } = await admin.from("chat_attachments")
      .select("id")
      .eq("user_id", row.user_id)
      .eq("sha256", extraction.checksum)
      .eq("status", "ready")
      .neq("id", row.id)
      .limit(1)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    duplicateOf = duplicate?.id || null;
  }

  const existingDerivatives = Array.isArray(row.derivatives)
    ? row.derivatives.filter((item: Record<string, unknown>) => item?.kind === "openrouter-file-annotation")
    : [];
  const { data: ready, error: readyError } = await admin.from("chat_attachments").update({
    status: "ready",
    verified_mime_type: verifiedMime,
    extracted_text: extraction.extractedText || null,
    derivatives: [...existingDerivatives, ...extraction.derivatives],
    sha256: extraction.checksum,
    duplicate_of: duplicateOf,
    capabilities: capabilitiesFor(row.kind),
    scanned_at: null,
    ready_at: new Date().toISOString(),
    processing_error: null,
  }).eq("id", row.id).select("*").single();
  if (readyError) throw readyError;
  return ready;
}

export async function recordAttachmentFailure(
  admin: AttachmentAdmin,
  id: string,
  error: unknown,
): Promise<Record<string, any> | null> {
  const message = error instanceof Error ? error.message : "File preparation failed";
  const rejected = error instanceof ValidationError && /(?:executable|macro|encrypted|password|unsafe|does not match|invalid|not supported|size does not match|svg contains)/i.test(message);
  const { data } = await admin.from("chat_attachments").update({
    status: rejected ? "rejected" : "failed",
    processing_error: message.slice(0, 1000),
  }).eq("id", id).select("*").maybeSingle();
  return data || null;
}
