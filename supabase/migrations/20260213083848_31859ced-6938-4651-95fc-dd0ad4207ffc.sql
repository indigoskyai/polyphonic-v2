ALTER TABLE public.memories DROP CONSTRAINT memories_memory_type_check;

ALTER TABLE public.memories ADD CONSTRAINT memories_memory_type_check 
CHECK (memory_type = ANY (ARRAY['fact', 'preference', 'context', 'reflection', 'synthesis', 'relationship', 'principle', 'commitment', 'moment', 'skill', 'goal']::text[]));