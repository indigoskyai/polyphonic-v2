-- Luca convictions layer.
--
-- Adds 'convictions' as a fourth doc_type alongside soul / self_model / user_model
-- in agent_identity and agent_identity_patches.
--
-- Convictions are stances Luca holds about how the world / people / work / time
-- actually operate. They sit between soul.md (identity) and self-model
-- (observed self-patterns). The dialectic layer proposes patches at a higher
-- confidence threshold than self/user-model and slightly higher than soul,
-- because convictions are foundational stances that should evolve more readily
-- than identity but more conservatively than frequent behavioral observations.

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
