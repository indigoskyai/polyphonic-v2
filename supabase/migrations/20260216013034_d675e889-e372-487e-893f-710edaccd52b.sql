
-- Add edited_at to messages for tracking edits
ALTER TABLE public.messages ADD COLUMN edited_at timestamptz NULL;

-- Add parent_conversation_id and branched_at_message_id to conversations
ALTER TABLE public.conversations ADD COLUMN parent_conversation_id uuid NULL REFERENCES public.conversations(id) ON DELETE SET NULL;
ALTER TABLE public.conversations ADD COLUMN branched_at_message_id uuid NULL;

-- Allow users to update their own messages (needed for editing)
CREATE POLICY "Users can update own messages"
ON public.messages
FOR UPDATE
USING (auth.uid() = user_id);

-- Allow users to delete their own messages (needed for edit truncation and regeneration)
CREATE POLICY "Users can delete own messages"
ON public.messages
FOR DELETE
USING (auth.uid() = user_id);
