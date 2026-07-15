import { supabase } from '@/integrations/supabase/client';
import type { AttachmentDescriptor } from '@/types/attachments';
import { Upload } from 'tus-js-client';
import { prepareAttachmentExtraction } from '@/lib/attachmentExtraction';

export type AttachmentScope =
  | { threadId: string; roomId?: undefined }
  | { roomId: string; threadId?: undefined }
  | { threadId?: undefined; roomId?: undefined };
export type BoundAttachmentScope = Exclude<AttachmentScope, { threadId?: undefined; roomId?: undefined }>;

export interface UploadProgress {
  progress: number;
  status: AttachmentDescriptor['status'] | 'pending';
  descriptor?: AttachmentDescriptor;
}

const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;
const STATUS_POLL_INTERVAL_MS = 900;
// Finalization normally returns ready immediately. The short polling fallback
// keeps compatibility with a request already in flight during a deployment.
const STATUS_TIMEOUT_MS = 2 * 60 * 1000;

function functionBody(scope: AttachmentScope) {
  return {
    thread_id: 'threadId' in scope ? scope.threadId : undefined,
    room_id: 'roomId' in scope ? scope.roomId : undefined,
  };
}

async function uploadResumable(
  file: File,
  bucket: string,
  path: string,
  signal?: AbortSignal,
  onProgress?: (progress: number) => void,
) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Your sign-in session expired');
  const projectUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const endpoint = `${projectUrl.replace('.supabase.co', '.storage.supabase.co')}/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      headers: { authorization: `Bearer ${data.session.access_token}`, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
      onError: reject,
      onProgress: (uploaded, total) => onProgress?.(8 + Math.round((uploaded / total) * 58)),
      onSuccess: () => resolve(),
    });

    const abort = () => {
      void upload.abort(true).finally(() => reject(new DOMException('Upload cancelled', 'AbortError')));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });

    void upload.findPreviousUploads().then((previous) => {
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(reject);
  });
}

export async function refreshAttachment(id: string): Promise<AttachmentDescriptor> {
  const { data, error } = await supabase.functions.invoke('attachment-url', { body: { attachment_id: id } });
  if (error || !data?.attachment) throw error || new Error('Could not open attachment');
  return data.attachment as AttachmentDescriptor;
}

async function waitUntilReady(
  initial: AttachmentDescriptor,
  signal?: AbortSignal,
  onState?: (state: UploadProgress) => void,
): Promise<AttachmentDescriptor> {
  let descriptor = initial;
  const startedAt = Date.now();
  while (!['ready', 'failed', 'rejected', 'cancelled'].includes(descriptor.status)) {
    if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
    if (Date.now() - startedAt > STATUS_TIMEOUT_MS) throw new Error('File processing timed out. Retry the file.');
    await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_INTERVAL_MS));
    descriptor = await refreshAttachment(descriptor.id);
    const progressByStatus: Record<string, number> = { quarantined: 72, scanning: 80, extracting: 90, ready: 100 };
    onState?.({ descriptor, status: descriptor.status, progress: progressByStatus[descriptor.status] ?? 72 });
  }
  if (descriptor.status !== 'ready') throw new Error(descriptor.error || 'File processing failed');
  return descriptor;
}

export async function uploadChatAttachment(
  file: File,
  scope: AttachmentScope = {},
  options: {
    batchId?: string;
    signal?: AbortSignal;
    onState?: (state: UploadProgress) => void;
  } = {},
): Promise<AttachmentDescriptor> {
  const notify = options.onState;
  notify?.({ progress: 0, status: 'pending' });
  const extraction = await prepareAttachmentExtraction(file);
  if (options.signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
  notify?.({ progress: 5, status: 'extracting' });
  const { data: initialized, error: initError } = await supabase.functions.invoke('attachment-init', {
    body: {
      name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      upload_batch_id: options.batchId,
      ...functionBody(scope),
    },
  });
  if (initError || !initialized?.attachment?.id || !initialized?.upload?.token) {
    throw initError || new Error('Could not initialize upload');
  }
  let descriptor = initialized.attachment as AttachmentDescriptor;
  notify?.({ descriptor, progress: 8, status: descriptor.status });

  if (file.size > RESUMABLE_THRESHOLD) {
    await uploadResumable(file, initialized.upload.bucket, initialized.upload.path, options.signal, (progress) => {
      notify?.({ descriptor, progress, status: 'uploading' });
    });
  } else {
    if (options.signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
    const { error: uploadError } = await supabase.storage
      .from(initialized.upload.bucket)
      .uploadToSignedUrl(initialized.upload.path, initialized.upload.token, file, {
        contentType: file.type || 'application/octet-stream',
      });
    if (uploadError) throw uploadError;
  }

  notify?.({ descriptor, progress: 68, status: 'uploading' });
  const { data: finalized, error: finalizeError } = await supabase.functions.invoke('attachment-finalize', {
    body: { attachment_id: descriptor.id, extraction },
  });
  if (finalizeError || !finalized?.attachment) throw finalizeError || new Error('Could not prepare the uploaded file');
  descriptor = finalized.attachment as AttachmentDescriptor;
  notify?.({ descriptor, progress: 72, status: descriptor.status });
  return waitUntilReady(descriptor, options.signal, notify);
}

export async function bindChatAttachments(
  ids: string[],
  scope: BoundAttachmentScope,
  association: { messageId?: string; groupMessageId?: string } = {},
): Promise<AttachmentDescriptor[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.functions.invoke('attachment-bind', {
    body: {
      attachment_ids: ids,
      message_id: association.messageId,
      group_message_id: association.groupMessageId,
      ...functionBody(scope),
    },
  });
  if (error || !Array.isArray(data?.attachments)) throw error || new Error('Could not attach files to this conversation');
  return data.attachments as AttachmentDescriptor[];
}

export async function cancelChatAttachment(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke('attachment-cancel', { body: { attachment_id: id } });
  if (error) throw error;
}

export async function retryChatAttachment(
  id: string,
  options: { file?: File; signal?: AbortSignal; onState?: (state: UploadProgress) => void } = {},
): Promise<AttachmentDescriptor> {
  const extraction = options.file ? await prepareAttachmentExtraction(options.file) : undefined;
  const { data, error } = await supabase.functions.invoke('attachment-retry', { body: { attachment_id: id, extraction } });
  if (error || !data?.attachment) throw error || new Error('Could not retry file preparation');
  const descriptor = data.attachment as AttachmentDescriptor;
  options.onState?.({ descriptor, status: descriptor.status, progress: 72 });
  return waitUntilReady(descriptor, options.signal, options.onState);
}

export function descriptorToLegacyAttachment(descriptor: AttachmentDescriptor) {
  // Message JSON is a compatibility rendering envelope, not attachment
  // identity. Never persist ephemeral signed URLs or extracted payloads here;
  // DurableAttachment resolves the canonical ID after reload.
  const stableDescriptor: AttachmentDescriptor = {
    version: 1,
    id: descriptor.id,
    kind: descriptor.kind,
    name: descriptor.name,
    mimeType: descriptor.mimeType,
    sizeBytes: descriptor.sizeBytes,
    status: descriptor.status,
    capabilities: descriptor.capabilities,
    metadata: descriptor.metadata,
  };
  return {
    type: descriptor.kind === 'image' ? 'image' as const : descriptor.kind === 'code' ? 'code' as const : 'file' as const,
    url: '',
    descriptor: stableDescriptor,
    meta: {
      attachment_id: descriptor.id,
      name: descriptor.name,
      size: descriptor.sizeBytes,
      mime: descriptor.mimeType,
      kind: descriptor.kind,
      status: descriptor.status,
      capabilities: descriptor.capabilities,
    },
  };
}
