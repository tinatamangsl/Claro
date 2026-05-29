CREATE TABLE public.household_expense_weights (
  id           UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID          NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id    UUID          NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  weight       NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (weight >= 0),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE(household_id, member_id)
);

CREATE INDEX idx_expense_weights_household ON public.household_expense_weights(household_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_expense_weights TO authenticated;
GRANT ALL ON public.household_expense_weights TO service_role;

ALTER TABLE public.household_expense_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view weights"
  ON public.household_expense_weights FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "members insert weights"
  ON public.household_expense_weights FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "members update weights"
  ON public.household_expense_weights FOR UPDATE TO authenticated
  USING (public.is_household_member(auth.uid(), household_id))
  WITH CHECK (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "members delete weights"
  ON public.household_expense_weights FOR DELETE TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));

CREATE TRIGGER expense_weights_set_updated_at
  BEFORE UPDATE ON public.household_expense_weights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();