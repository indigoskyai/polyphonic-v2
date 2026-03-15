-- Fix 1: Restrict decrypt_user_api_key to service_role only
REVOKE EXECUTE ON FUNCTION public.decrypt_user_api_key(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_user_api_key(uuid) FROM anon;

-- Fix 2: Make generated-images bucket private and update policies
UPDATE storage.buckets SET public = false WHERE id = 'generated-images';

DROP POLICY IF EXISTS "Generated images are publicly accessible" ON storage.objects;

CREATE POLICY "Users can view own generated images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'generated-images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );