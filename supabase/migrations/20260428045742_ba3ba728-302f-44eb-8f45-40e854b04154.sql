REVOKE EXECUTE ON FUNCTION public.openclaw_verify_device_token(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.openclaw_verify_device_token(uuid, text) TO service_role;