
-- Fix: task_comments INSERT must verify member_id belongs to caller
DROP POLICY IF EXISTS "create comments" ON public.task_comments;
CREATE POLICY "create comments" ON public.task_comments
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_comments.task_id
      AND public.is_household_member(auth.uid(), t.household_id)
  )
  AND EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = task_comments.member_id
      AND m.user_id = auth.uid()
  )
);

-- Fix: realtime 'unread:<household_id>:<user_id>' channel must verify user_id segment
DROP POLICY IF EXISTS "household members can read realtime" ON realtime.messages;
CREATE POLICY "household members can read realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    (realtime.topic() LIKE 'household_messages:%' OR realtime.topic() LIKE 'shopping:%')
    AND public.is_household_member(
      auth.uid(),
      NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
    )
  )
  OR
  (
    realtime.topic() LIKE 'unread:%'
    AND public.is_household_member(
      auth.uid(),
      NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
    )
    AND NULLIF(split_part(realtime.topic(), ':', 3), '') = auth.uid()::text
  )
);
