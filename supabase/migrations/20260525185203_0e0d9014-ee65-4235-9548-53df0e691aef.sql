-- 1) Null-safe is_household_member (defensive against NULLIF empty topic segments)
CREATE OR REPLACE FUNCTION public.is_household_member(_user_id uuid, _household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL OR _household_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.household_members
      WHERE user_id = _user_id AND household_id = _household_id
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.is_household_admin(_user_id uuid, _household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL OR _household_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.household_members
      WHERE user_id = _user_id AND household_id = _household_id AND is_admin = true
    )
  END;
$function$;

-- 2) Explicit ownership-scoped UPDATE policy on task_comments
DROP POLICY IF EXISTS "update own comments" ON public.task_comments;
CREATE POLICY "update own comments"
ON public.task_comments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = task_comments.member_id AND m.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = task_comments.member_id AND m.user_id = auth.uid()
  )
);