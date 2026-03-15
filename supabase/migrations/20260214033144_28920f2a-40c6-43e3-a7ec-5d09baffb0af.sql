-- 1. Add DELETE policy for journal_entries
CREATE POLICY "Users can delete own journal entries"
  ON public.journal_entries FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Make chat-attachments bucket private
UPDATE storage.buckets SET public = false WHERE id = 'chat-attachments';

-- 3. Drop the public SELECT policy on chat-attachments
DROP POLICY IF EXISTS "Chat attachments are publicly accessible" ON storage.objects;

-- 4. Create authenticated-only SELECT policy for chat-attachments
CREATE POLICY "Users can view own chat attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 5. Add server-side file type validation on upload policy
-- First drop existing upload policy to replace it
DROP POLICY IF EXISTS "Users can upload chat attachments" ON storage.objects;

CREATE POLICY "Users can upload validated chat attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND (LOWER(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'gif', 'webp'))
    AND octet_length(name) < 500
  );