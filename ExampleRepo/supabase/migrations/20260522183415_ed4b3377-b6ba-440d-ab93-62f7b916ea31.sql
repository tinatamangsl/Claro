
CREATE OR REPLACE FUNCTION public.join_household_by_code(
  _code text,
  _display_name text,
  _role public.household_role,
  _avatar_emoji text DEFAULT '🙂',
  _color text DEFAULT '#E07856'
)
RETURNS public.households
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _h public.households;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO _h FROM public.households
   WHERE invite_code = upper(trim(_code))
   LIMIT 1;

  IF _h.id IS NULL THEN
    RAISE EXCEPTION 'invalid_invite_code';
  END IF;

  IF EXISTS (SELECT 1 FROM public.household_members
              WHERE household_id = _h.id AND user_id = _uid) THEN
    RAISE EXCEPTION 'already_member';
  END IF;

  INSERT INTO public.household_members
    (household_id, user_id, display_name, avatar_emoji, color, role, is_admin)
  VALUES
    (_h.id, _uid, COALESCE(NULLIF(_display_name,''),'Me'),
     COALESCE(_avatar_emoji,'🙂'), COALESCE(_color,'#E07856'),
     COALESCE(_role,'adult'::public.household_role), false);

  RETURN _h;
END;
$$;

REVOKE ALL ON FUNCTION public.join_household_by_code(text, text, public.household_role, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.join_household_by_code(text, text, public.household_role, text, text) TO authenticated;
