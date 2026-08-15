-- Expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  category TEXT NOT NULL DEFAULT 'other',
  merchant TEXT,
  note TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_by_member UUID NOT NULL,
  paid_by_user UUID NOT NULL,
  receipt_path TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','receipt')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_household_date ON public.expenses (household_id, expense_date DESC);
CREATE INDEX idx_expenses_paid_by_member ON public.expenses (paid_by_member);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view expenses"
  ON public.expenses FOR SELECT TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "members add expenses"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.is_household_member(auth.uid(), household_id)
    AND auth.uid() = paid_by_user
    AND EXISTS (
      SELECT 1 FROM public.household_members m
      WHERE m.id = paid_by_member
        AND m.user_id = auth.uid()
        AND m.household_id = expenses.household_id
    )
  );

CREATE POLICY "members update expenses"
  ON public.expenses FOR UPDATE TO authenticated
  USING (public.is_household_member(auth.uid(), household_id))
  WITH CHECK (public.is_household_member(auth.uid(), household_id));

CREATE POLICY "members delete expenses"
  ON public.expenses FOR DELETE TO authenticated
  USING (public.is_household_member(auth.uid(), household_id));

CREATE TRIGGER expenses_set_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Receipts storage bucket (private; keyed by household_id/...)
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "members view receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.is_household_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "members upload receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND public.is_household_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "members delete receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.is_household_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );