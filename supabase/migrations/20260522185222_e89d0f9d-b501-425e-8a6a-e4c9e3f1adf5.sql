CREATE TABLE public.household_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  body text NOT NULL CHECK (length(body) > 0 AND length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_household_messages_household_created
  ON public.household_messages (household_id, created_at DESC);

ALTER TABLE public.household_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view messages"
  ON public.household_messages FOR SELECT
  USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "members send messages"
  ON public.household_messages FOR INSERT
  WITH CHECK (
    public.is_household_member(auth.uid(), household_id)
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.household_members m
      WHERE m.id = member_id AND m.user_id = auth.uid() AND m.household_id = household_messages.household_id
    )
  );

CREATE POLICY "delete own messages"
  ON public.household_messages FOR DELETE
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.household_messages;
ALTER TABLE public.household_messages REPLICA IDENTITY FULL;