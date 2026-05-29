
CREATE OR REPLACE FUNCTION public.create_household_with_owner(
  _name TEXT,
  _emoji TEXT,
  _accent_color TEXT,
  _display_name TEXT,
  _role public.household_role
)
RETURNS public.households
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _code TEXT;
  _h public.households;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- generate unique invite code
  LOOP
    _code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.households WHERE invite_code = _code);
  END LOOP;

  INSERT INTO public.households (name, emoji, accent_color, invite_code, created_by)
  VALUES (_name, COALESCE(_emoji,'🏡'), COALESCE(_accent_color,'#E07856'), _code, _uid)
  RETURNING * INTO _h;

  INSERT INTO public.household_members (household_id, user_id, display_name, avatar_emoji, color, role, is_admin)
  VALUES (_h.id, _uid, COALESCE(NULLIF(_display_name,''),'Me'), '🙂', COALESCE(_accent_color,'#E07856'), COALESCE(_role,'adult'::public.household_role), true);

  RETURN _h;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_household_with_owner(TEXT,TEXT,TEXT,TEXT,public.household_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_household_with_owner(TEXT,TEXT,TEXT,TEXT,public.household_role) TO authenticated;
