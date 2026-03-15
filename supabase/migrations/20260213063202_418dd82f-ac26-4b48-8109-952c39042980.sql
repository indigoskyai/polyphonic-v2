
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- User roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS: admins can see all roles, users can see their own
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-assign first user as admin
CREATE OR REPLACE FUNCTION public.auto_assign_first_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_assign_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_first_admin();

-- System prompts table
CREATE TABLE public.system_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  prompt text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage system prompts"
  ON public.system_prompts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read active prompts"
  ON public.system_prompts FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE TRIGGER update_system_prompts_updated_at
  BEFORE UPDATE ON public.system_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default system prompts
INSERT INTO public.system_prompts (feature_key, name, description, prompt) VALUES
  ('chat', 'Chat', 'Main chat system prompt', 'You are a helpful AI assistant. Keep answers clear and concise.'),
  ('memory_extract', 'Memory Extraction', 'Prompt for extracting memories from conversations', 'Extract key facts, preferences, and important details from the conversation.'),
  ('memory_reflect', 'Memory Reflection', 'Prompt for reflecting on stored memories', 'Reflect on the user''s stored memories to provide personalized responses.');

-- Model configs table (maps features to models)
CREATE TABLE public.model_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  model_id text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.model_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage model configs"
  ON public.model_configs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read active configs"
  ON public.model_configs FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE TRIGGER update_model_configs_updated_at
  BEFORE UPDATE ON public.model_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default model configs
INSERT INTO public.model_configs (feature_key, model_id, name, description) VALUES
  ('chat_backend', 'google/gemini-3-flash-preview', 'Chat Backend', 'Model powering the chat backend when user selects default'),
  ('memory_extract', 'google/gemini-3-flash-preview', 'Memory Extraction', 'Model used for extracting memories'),
  ('memory_reflect', 'google/gemini-3-flash-preview', 'Memory Reflection', 'Model used for memory reflection');

-- Allow admins to read all profiles (for user management)
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to read all conversations (for oversight)
CREATE POLICY "Admins can view all conversations"
  ON public.conversations FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to read all messages
CREATE POLICY "Admins can view all messages"
  ON public.messages FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to read all memories
CREATE POLICY "Admins can view all memories"
  ON public.memories FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to manage memories (edit/delete)
CREATE POLICY "Admins can manage all memories"
  ON public.memories FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));
