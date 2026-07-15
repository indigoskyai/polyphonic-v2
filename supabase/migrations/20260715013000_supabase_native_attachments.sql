-- Keep chat attachment processing inside the existing Polyphonic deployment:
-- browser preparation + authenticated Supabase Edge Functions + OpenRouter.
-- The durable external-worker queue is no longer part of the architecture.

update public.chat_attachments
set status = 'failed',
    processing_error = 'This upload was waiting on retired processing infrastructure. Please retry it in the current Polyphonic uploader.',
    updated_at = now()
where status in ('quarantined', 'scanning', 'extracting');

drop function if exists public.lease_attachment_processing_job(text, integer);
drop table if exists public.attachment_processing_jobs;

comment on column public.chat_attachments.extracted_text is
  'Bounded text prepared locally by the authenticated Polyphonic client and normalized by attachment-finalize.';

comment on column public.chat_attachments.scanned_at is
  'Reserved for future provider-backed scanning. Null in the Supabase-native attachment path.';
