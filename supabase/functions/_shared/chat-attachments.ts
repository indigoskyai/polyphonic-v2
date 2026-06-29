type ChatAttachment = {
  type?: string;
  url?: string;
  meta?: Record<string, unknown>;
};

const MAX_ATTACHMENTS = 6;
const MAX_PROMPT_CODE_CHARS = 12_000;

export function appendAttachmentContext(message: string, attachments: unknown): string {
  const context = formatAttachmentContext(attachments);
  return context ? `${message}${context}` : message;
}

export function formatAttachmentContext(attachments: unknown): string {
  if (!Array.isArray(attachments) || attachments.length === 0) return "";

  const rows = attachments
    .slice(0, MAX_ATTACHMENTS)
    .map((attachment, index) => formatAttachmentRow(attachment as ChatAttachment, index))
    .filter(Boolean);

  return rows.length ? `\n\nAttached files:\n${rows.join("\n\n")}` : "";
}

function formatAttachmentRow(attachment: ChatAttachment, index: number): string {
  const meta = isRecord(attachment.meta) ? attachment.meta : {};
  const name = cleanText(meta.name, `attachment-${index + 1}`);
  const mime = cleanText(meta.mime, "application/octet-stream");
  const size = typeof meta.size === "number" && Number.isFinite(meta.size) ? `, ${formatBytes(meta.size)}` : "";
  const base = `${index + 1}. ${name} (${mime}${size})`;

  if (attachment.type !== "code") return base;

  const lang = cleanText(meta.lang, "");
  const rawCode = cleanText(meta.code, "");
  if (!rawCode) return base;

  const code = rawCode.length > MAX_PROMPT_CODE_CHARS
    ? `${rawCode.slice(0, MAX_PROMPT_CODE_CHARS)}\n...[truncated]`
    : rawCode;
  return `${base}${lang ? `, ${lang}` : ""}\n\n\`\`\`${lang}\n${code}\n\`\`\``;
}

function cleanText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.split("\u0000").join("").trim().slice(0, 24_000) || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
