-- Add recurrence support to tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence_type TEXT
  CHECK (recurrence_type IN ('daily', 'weekly', 'biweekly', 'monthly'));
