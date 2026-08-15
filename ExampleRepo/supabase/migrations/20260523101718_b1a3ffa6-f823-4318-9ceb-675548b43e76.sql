
CREATE TABLE public.shopping_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  quantity text,
  category text NOT NULL DEFAULT 'other',
  note text,
  checked boolean NOT NULL DEFAULT false,
  checked_at timestamptz,
  checked_by_member uuid,
  added_by_member uuid NOT NULL,
  added_by_user uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shopping_items_household_idx ON public.shopping_items(household_id, checked, created_at DESC);

ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view shopping items" ON public.shopping_items
FOR SELECT TO authenticated
USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "members add shopping items" ON public.shopping_items
FOR INSERT TO authenticated
WITH CHECK (
  public.is_household_member(auth.uid(), household_id)
  AND auth.uid() = added_by_user
  AND EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = added_by_member
      AND m.user_id = auth.uid()
      AND m.household_id = shopping_items.household_id
  )
);

CREATE POLICY "members update shopping items" ON public.shopping_items
FOR UPDATE TO authenticated
USING (public.is_household_member(auth.uid(), household_id))
WITH CHECK (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "members delete shopping items" ON public.shopping_items
FOR DELETE TO authenticated
USING (public.is_household_member(auth.uid(), household_id));

CREATE TRIGGER shopping_items_updated_at
BEFORE UPDATE ON public.shopping_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.shopping_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;

DROP POLICY IF EXISTS "household members can read realtime" ON realtime.messages;
CREATE POLICY "household members can read realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    (realtime.topic() LIKE 'household_messages:%'
     OR realtime.topic() LIKE 'unread:%'
     OR realtime.topic() LIKE 'shopping:%')
    AND public.is_household_member(
      auth.uid(),
      NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
    )
  )
);
