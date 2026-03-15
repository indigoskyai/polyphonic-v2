-- Issue 7: Batch memory access count update function
CREATE OR REPLACE FUNCTION public.increment_memory_access(memory_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE memories
  SET access_count = COALESCE(access_count, 0) + 1,
      last_accessed_at = now()
  WHERE id = ANY(memory_ids);
$$;

-- Issue 8: Update storage policy to allow document uploads
-- First drop the existing restrictive policy if it exists
DROP POLICY IF EXISTS "Users can upload validated chat attachments" ON storage.objects;

-- Recreate with broader file type support
CREATE POLICY "Users can upload validated chat attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND (LOWER(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt', 'csv', 'doc', 'docx'))
    AND octet_length(name) < 500
  );