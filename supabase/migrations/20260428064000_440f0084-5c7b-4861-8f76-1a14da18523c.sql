-- Phase L6: private per-user workspace storage bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('workspace-files', 'workspace-files', false, 10485760)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760;

DROP POLICY IF EXISTS "users read their own workspace files" ON storage.objects;
CREATE POLICY "users read their own workspace files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'workspace-files'
    AND auth.uid()::text = (storage.foldername(name))[2]
    AND (storage.foldername(name))[1] = 'workspaces'
  );

DROP POLICY IF EXISTS "users delete their own workspace files" ON storage.objects;
CREATE POLICY "users delete their own workspace files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'workspace-files'
    AND auth.uid()::text = (storage.foldername(name))[2]
    AND (storage.foldername(name))[1] = 'workspaces'
  );
