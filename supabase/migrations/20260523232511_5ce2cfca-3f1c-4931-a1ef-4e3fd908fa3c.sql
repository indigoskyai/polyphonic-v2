
-- 1. conversations view: enforce caller's RLS, not creator's
ALTER VIEW public.conversations SET (security_invoker = true);

-- 2. cron_health: only admins can read
DROP POLICY IF EXISTS "Authenticated can read cron health" ON public.cron_health;
CREATE POLICY "Admins can read cron health"
ON public.cron_health
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3. storage.objects: scope owner policies to authenticated role only
DROP POLICY IF EXISTS "Users can delete their own chat attachments" ON storage.objects;
CREATE POLICY "Users can delete their own chat attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-attachments' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can view own chat attachments" ON storage.objects;
CREATE POLICY "Users can view own chat attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-attachments' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can view own generated images" ON storage.objects;
CREATE POLICY "Users can view own generated images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'generated-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "profile-uploads owner delete" ON storage.objects;
CREATE POLICY "profile-uploads owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'profile-uploads' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "profile-uploads owner read" ON storage.objects;
CREATE POLICY "profile-uploads owner read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'profile-uploads' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "profile-uploads owner update" ON storage.objects;
CREATE POLICY "profile-uploads owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'profile-uploads' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "profile-uploads published profile asset read" ON storage.objects;
CREATE POLICY "profile-uploads published profile asset read"
ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'profile-uploads' AND (
    EXISTS (
      SELECT 1 FROM public.profiles_public p
      WHERE p.published = true
        AND (p.avatar_storage_path = objects.name
          OR p.avatar_storage_path = ('profile-uploads/' || objects.name))
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_items i
      JOIN public.profiles_public p ON p.handle = i.handle
      WHERE p.published = true AND i.published = true AND i.item_type = 'upload'
        AND ((i.payload ->> 'storage_path') = objects.name
          OR (i.payload ->> 'storage_path') = ('profile-uploads/' || objects.name))
    )
  )
);

DROP POLICY IF EXISTS "users delete their own workspace files" ON storage.objects;
CREATE POLICY "users delete their own workspace files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'workspace-files'
       AND (auth.uid())::text = (storage.foldername(name))[2]
       AND (storage.foldername(name))[1] = 'workspaces');

DROP POLICY IF EXISTS "users read their own workspace files" ON storage.objects;
CREATE POLICY "users read their own workspace files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'workspace-files'
       AND (auth.uid())::text = (storage.foldername(name))[2]
       AND (storage.foldername(name))[1] = 'workspaces');

DROP POLICY IF EXISTS "users update their own workspace files" ON storage.objects;
CREATE POLICY "users update their own workspace files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'workspace-files'
       AND (storage.foldername(name))[1] = 'workspaces'
       AND (auth.uid())::text = (storage.foldername(name))[2]);
