export type AttachmentKind =
  | 'image'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'code'
  | 'text'
  | 'audio'
  | 'video'
  | 'archive'
  | 'file';

export type AttachmentStatus =
  | 'uploading'
  | 'quarantined'
  | 'scanning'
  | 'extracting'
  | 'ready'
  | 'failed'
  | 'rejected'
  | 'cancelled';

export interface AttachmentCapabilities {
  vision?: boolean;
  text?: boolean;
  pages?: boolean;
  sheets?: boolean;
  slides?: boolean;
  transcript?: boolean;
  playback?: boolean;
  download?: boolean;
}

export interface AttachmentPreview {
  url?: string;
  text?: string;
  segments?: Array<{ start: number; end: number; text: string }>;
  thumbnailUrl?: string;
  downloadUrl?: string;
  expiresAt?: string;
}

export interface AttachmentDerivative {
  id?: string;
  kind: 'thumbnail' | 'safe-display' | 'page' | 'slide' | 'sheet' | 'transcript' | 'keyframe' | 'summary' | 'text' | 'scan' | 'extraction' | 'openrouter-file-annotation';
  label?: string;
  mimeType?: string;
  storagePath?: string;
  url?: string;
  text?: string;
  segments?: Array<{ start: number; end: number; text: string }>;
  page?: number;
  slide?: number;
  sheet?: string;
  rowStart?: number;
  rowEnd?: number;
  timestampStart?: number;
  timestampEnd?: number;
  metadata?: Record<string, unknown>;
}

/** Canonical v1 attachment wire shape. URLs are ephemeral and never identity. */
export interface AttachmentDescriptor {
  version: 1;
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: AttachmentStatus;
  preview?: AttachmentPreview;
  capabilities: AttachmentCapabilities;
  derivatives?: AttachmentDerivative[];
  extractedText?: string;
  error?: string;
  checksum?: string;
  duplicateOf?: string;
  metadata?: Record<string, unknown>;
}

export function isCanonicalAttachment(value: unknown): value is AttachmentDescriptor {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<AttachmentDescriptor>;
  return row.version === 1 && typeof row.id === 'string' && typeof row.name === 'string';
}

export function attachmentIsBusy(status: AttachmentStatus | 'pending'): boolean {
  return ['pending', 'uploading', 'quarantined', 'scanning', 'extracting'].includes(status);
}

export function attachmentIsTerminal(status: AttachmentStatus | 'pending'): boolean {
  return ['ready', 'failed', 'rejected', 'cancelled'].includes(status);
}
