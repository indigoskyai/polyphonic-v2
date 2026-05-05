-- Launch hardening: keep service-key helpers off client roles and prevent
-- profile upload object listing beyond owner or published-profile references.

REVOKE EXECUTE ON FUNCTION public.invoke_edge_function(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_edge_function(text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_app_config(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_app_config(text) TO service_role;

DROP POLICY IF EXISTS "profile-uploads public read" ON storage.objects;
DROP POLICY IF EXISTS "profile-uploads owner read" ON storage.objects;
DROP POLICY IF EXISTS "profile-uploads published profile asset read" ON storage.objects;

CREATE POLICY "profile-uploads owner read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'profile-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "profile-uploads published profile asset read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'profile-uploads'
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles_public p
        WHERE p.published = true
          AND (
            p.avatar_storage_path = storage.objects.name
            OR p.avatar_storage_path = 'profile-uploads/' || storage.objects.name
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.profile_items i
        JOIN public.profiles_public p ON p.handle = i.handle
        WHERE p.published = true
          AND i.published = true
          AND i.item_type = 'upload'
          AND (
            i.payload->>'storage_path' = storage.objects.name
            OR i.payload->>'storage_path' = 'profile-uploads/' || storage.objects.name
          )
      )
    )
  );
