
CREATE TABLE public.household_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  -- First day of the month this budget applies to
  month date NOT NULL,
  -- NULL = overall budget for the month; otherwise a per-category cap
  category text,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  created_by_user uuid NOT NULL,
  created_by_member uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per (household, month, category-or-overall, currency)
CREATE UNIQUE INDEX household_budgets_unique_overall
  ON public.household_budgets (household_id, month, currency)
  WHERE category IS NULL;
CREATE UNIQUE INDEX household_budgets_unique_category
  ON public.household_budgets (household_id, month, category, currency)
  WHERE category IS NOT NULL;

CREATE INDEX household_budgets_household_month_idx
  ON public.household_budgets (household_id, month);

ALTER TABLE public.household_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view budgets"
  ON public.household_budgets FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "members add budgets"
  ON public.household_budgets FOR INSERT TO authenticated
  WITH CHECK (
    public.is_household_member(auth.uid(), household_id)
    AND auth.uid() = created_by_user
    AND EXISTS (
      SELECT 1 FROM public.household_members m
      WHERE m.id = household_budgets.created_by_member
        AND m.user_id = auth.uid()
        AND m.household_id = household_budgets.household_id
    )
  );

CREATE POLICY "members update budgets"
  ON public.household_budgets FOR UPDATE TO authenticated
  USING (public.is_household_member(auth.uid(), household_id))
  WITH CHECK (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "members delete budgets"
  ON public.household_budgets FOR DELETE TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));

CREATE TRIGGER trg_household_budgets_updated_at
  BEFORE UPDATE ON public.household_budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
