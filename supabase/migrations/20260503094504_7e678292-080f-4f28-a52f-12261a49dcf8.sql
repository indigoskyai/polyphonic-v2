ALTER TABLE public.agent_identity
  DROP CONSTRAINT IF EXISTS agent_identity_doc_type_check;
ALTER TABLE public.agent_identity
  ADD CONSTRAINT agent_identity_doc_type_check
  CHECK (doc_type IN ('soul', 'self_model', 'user_model', 'convictions'));

ALTER TABLE public.agent_identity_patches
  DROP CONSTRAINT IF EXISTS agent_identity_patches_doc_type_check;
ALTER TABLE public.agent_identity_patches
  ADD CONSTRAINT agent_identity_patches_doc_type_check
  CHECK (doc_type IN ('soul', 'self_model', 'user_model', 'convictions'));