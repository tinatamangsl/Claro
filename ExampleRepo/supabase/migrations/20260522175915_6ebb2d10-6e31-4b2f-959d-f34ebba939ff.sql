
-- Set search_path on remaining functions
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT LANGUAGE SQL SET search_path = public AS $$
  SELECT upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
$$;

-- Lock down SECURITY DEFINER helpers: only authenticated users
REVOKE EXECUTE ON FUNCTION public.is_household_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_household_admin(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_invite_code() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_household_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_household_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;
