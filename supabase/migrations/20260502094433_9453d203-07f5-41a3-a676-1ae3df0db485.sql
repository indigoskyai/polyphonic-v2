-- Enable realtime for engrams + connections so the Mnemos graph updates live as new memories form.
ALTER TABLE public.engrams REPLICA IDENTITY FULL;
ALTER TABLE public.connections REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.engrams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.connections;