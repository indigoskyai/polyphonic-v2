import type { MessageAttachment } from '@/stores/threadStore';
import type { ModelInputModality } from '../../shared/modelCapabilities';

export const CHAT_ATTACHMENT_BUCKET = 'chat-attachments';
export const MAX_CHAT_ATTACHMENTS = 10;
export const MAX_CHAT_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const MAX_INLINE_CODE_BYTES = 96 * 1024;
export const MAX_PROMPT_CODE_CHARS = 12_000;

export const CHAT_ATTACHMENT_ACCEPT = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/svg+xml',
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/*', 'application/json', 'application/xml', 'application/rtf', 'application/zip',
  'audio/*', 'video/mp4', 'video/quicktime', 'video/webm',
].join(',');

const CHAT_ATTACHMENT_ACCEPT_WITHOUT_AUDIO_VIDEO = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/svg+xml',
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/*', 'application/json', 'application/xml', 'application/rtf', 'application/zip',
].join(',');

export function getChatAttachmentAccept(inputModalities?: ModelInputModality[] | null): string {
  if (!inputModalities) return CHAT_ATTACHMENT_ACCEPT;
  const supportsAudio = inputModalities.includes('audio');
  const supportsVideo = inputModalities.includes('video');
  return supportsAudio || supportsVideo ? CHAT_ATTACHMENT_ACCEPT : CHAT_ATTACHMENT_ACCEPT_WITHOUT_AUDIO_VIDEO;
}

export function isChatAttachmentSupported(
  file: Pick<File, 'type'>,
  inputModalities?: ModelInputModality[] | null,
): boolean {
  if (!inputModalities) return true;
  if (file.type.startsWith('audio/')) return inputModalities.includes('audio');
  if (file.type.startsWith('video/')) return inputModalities.includes('video');
  if (file.type.startsWith('image/')) return inputModalities.includes('image');
  // Documents and PDFs continue through Polyphonic/OpenRouter's document
  // parser path; they are not advertised as a native model modality.
  return inputModalities.includes('text');
}

const CODE_EXTENSIONS: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  json: 'json',
  jsonl: 'jsonl',
  md: 'markdown',
  markdown: 'markdown',
  css: 'css',
  scss: 'scss',
  html: 'html',
  xml: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  toml: 'toml',
  ini: 'ini',
  env: 'dotenv',
  txt: 'text',
};

const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/javascript',
  'application/typescript',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
  'application/sql',
]);

export function safeAttachmentFileName(name: string): string {
  const baseName = name.split(/[\\/]/).pop() || name;
  const cleaned = baseName
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 96);
  return cleaned || 'attachment';
}

export function inferAttachmentLanguage(name: string, mime = ''): string | undefined {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
  if (ext && CODE_EXTENSIONS[ext]) return CODE_EXTENSIONS[ext];
  if (mime === 'application/json') return 'json';
  if (mime.includes('javascript')) return 'javascript';
  if (mime.includes('typescript')) return 'typescript';
  if (mime.includes('xml')) return 'xml';
  if (mime.includes('yaml')) return 'yaml';
  return undefined;
}

export function inferAttachmentType(file: Pick<File, 'name' | 'type' | 'size'>): MessageAttachment['type'] {
  if (file.type.startsWith('image/')) return 'image';
  if (shouldInlineCodeAttachment(file)) return 'code';
  return 'file';
}

export function shouldInlineCodeAttachment(file: Pick<File, 'name' | 'type' | 'size'>): boolean {
  if (file.size > MAX_INLINE_CODE_BYTES) return false;
  if (file.type.startsWith('text/')) return true;
  if (TEXT_MIME_TYPES.has(file.type)) return true;
  return !!inferAttachmentLanguage(file.name, file.type);
}

export function buildAttachmentPromptContext(attachments: MessageAttachment[]): string {
  if (!attachments.length) return '';

  const lines = attachments.map((attachment, index) => {
    const meta = (attachment.meta || {}) as Record<string, unknown>;
    const name = typeof meta.name === 'string' ? meta.name : `attachment-${index + 1}`;
    const mime = typeof meta.mime === 'string' ? meta.mime : 'application/octet-stream';
    const size = typeof meta.size === 'number' ? `, ${formatBytes(meta.size)}` : '';
    const base = `${index + 1}. ${name} (${mime}${size})`;
    if (attachment.type !== 'code') return base;

    const lang = typeof meta.lang === 'string' && meta.lang ? `, ${meta.lang}` : '';
    const rawCode = typeof meta.code === 'string' ? meta.code : '';
    const code = rawCode.length > MAX_PROMPT_CODE_CHARS
      ? `${rawCode.slice(0, MAX_PROMPT_CODE_CHARS)}\n...[truncated]`
      : rawCode;
    return `${base}${lang}\n\n\`\`\`${typeof meta.lang === 'string' ? meta.lang : ''}\n${code}\n\`\`\``;
  });

  return `\n\nAttached files:\n${lines.join('\n\n')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
