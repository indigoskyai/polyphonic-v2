-- Public profiles + infinite canvas v1

-- 1. handles: global namespace shared by humans + agents
CREATE TABLE public.handles (
  handle text PRIMARY KEY CHECK (handle ~ '^[a-z0-9_]{3,24}$'),
  owner_kind text NOT NULL CHECK (owner_kind IN ('user','agent')),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_agent_id text,
  reserved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT handles_owner_xor CHECK (
    (owner_kind = 'user'  AND owner_user_id IS NOT NULL AND owner_agent_id IS NULL) OR
    (owner_kind = 'agent' AND owner_agent_id IS NOT NULL AND owner_user_id IS NOT NULL)
  )
);
CREATE INDEX idx_handles_owner_user ON public.handles(owner_user_id);
CREATE UNIQUE INDEX idx_handles_one_user_handle
  ON public.handles(owner_user_id) WHERE owner_kind = 'user';
CREATE UNIQUE INDEX idx_handles_one_agent_handle
  ON public.handles(owner_user_id, owner_agent_id) WHERE owner_kind = 'agent';

ALTER TABLE public.handles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "handles public read"   ON public.handles FOR SELECT USING (true);
CREATE POLICY "handles owner insert"  ON public.handles FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id AND reserved = false);
CREATE POLICY "handles owner update"  ON public.handles FOR UPDATE
  USING (auth.uid() = owner_user_id);
CREATE POLICY "handles owner delete"  ON public.handles FOR DELETE
  USING (auth.uid() = owner_user_id);

-- 2. profiles_public: per-handle public metadata
CREATE TABLE public.profiles_public (
  handle text PRIMARY KEY REFERENCES public.handles(handle) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  bio_short text NOT NULL DEFAULT '' CHECK (length(bio_short) <= 140),
  bio_long text NOT NULL DEFAULT '',
  accent_color text NOT NULL DEFAULT '#c9a87c',
  avatar_storage_path text,
  home_viewport jsonb NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles_public ENABLE ROW LEVEL SECURITY;

-- helper: is the caller the owner of this handle?
CREATE OR REPLACE FUNCTION public.is_handle_owner(p_handle text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.handles
    WHERE handle = p_handle AND owner_user_id = auth.uid()
  );
$$;

CREATE POLICY "profiles_public published readable"
  ON public.profiles_public FOR SELECT USING (published = true);
CREATE POLICY "profiles_public owner all"
  ON public.profiles_public FOR ALL
  USING (public.is_handle_owner(handle))
  WITH CHECK (public.is_handle_owner(handle));

-- 3. profile_items: tiles on the canvas
CREATE TABLE public.profile_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text NOT NULL REFERENCES public.handles(handle) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('artifact','upload','note')),
  x double precision NOT NULL DEFAULT 0,
  y double precision NOT NULL DEFAULT 0,
  w double precision NOT NULL DEFAULT 320,
  h double precision NOT NULL DEFAULT 240,
  z integer NOT NULL DEFAULT 0,
  rotation double precision NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  caption text,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profile_items_handle_pub ON public.profile_items(handle, published);
CREATE INDEX idx_profile_items_handle_z   ON public.profile_items(handle, z);

ALTER TABLE public.profile_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_items public read when published"
  ON public.profile_items FOR SELECT USING (
    published = true AND EXISTS (
      SELECT 1 FROM public.profiles_public p
      WHERE p.handle = profile_items.handle AND p.published = true
    )
  );
CREATE POLICY "profile_items owner all"
  ON public.profile_items FOR ALL
  USING (public.is_handle_owner(handle))
  WITH CHECK (public.is_handle_owner(handle));

-- updated_at triggers
CREATE TRIGGER profiles_public_touch
  BEFORE UPDATE ON public.profiles_public
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER profile_items_touch
  BEFORE UPDATE ON public.profile_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. storage bucket for user uploads (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-uploads', 'profile-uploads', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "profile-uploads public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-uploads');
CREATE POLICY "profile-uploads owner upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'profile-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "profile-uploads owner update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'profile-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "profile-uploads owner delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'profile-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);