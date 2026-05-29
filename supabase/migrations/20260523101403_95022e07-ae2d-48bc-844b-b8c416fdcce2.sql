
-- 1. Restrict direct INSERTs on household_members: only the household creator (via SECURITY DEFINER RPCs).
-- The RPCs `create_household_with_owner` and `join_household_by_code` are SECURITY DEFINER and bypass RLS,
-- so legitimate joining flows still work. Direct client inserts are blocked.
DROP POLICY IF EXISTS "self join" ON public.household_members;

CREATE POLICY "self join as creator only"
ON public.household_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.households h
    WHERE h.id = household_id AND h.created_by = auth.uid()
  )
);

-- 2. Realtime authorization: restrict channel subscriptions to household members.
-- Channels are named `household_messages:<household_id>` and `unread:<household_id>:<user_id>`.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read realtime" ON realtime.messages;
CREATE POLICY "household members can read realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    realtime.topic() LIKE 'household_messages:%'
    AND public.is_household_member(
      auth.uid(),
      NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
    )
  )
  OR (
    realtime.topic() LIKE 'unread:%'
    AND public.is_household_member(
      auth.uid(),
      NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
    )
  )
);
