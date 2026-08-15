
-- 1. Replace the permissive self-update policy on household_members so members
--    cannot escalate themselves to admin (or move their row to another household / user).
DROP POLICY IF EXISTS "update own membership" ON public.household_members;

-- Members may update their own profile-style fields, but is_admin / role /
-- household_id / user_id must remain unchanged (enforced via WITH CHECK).
CREATE POLICY "self update own membership safe columns"
ON public.household_members
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND is_admin = (SELECT hm.is_admin FROM public.household_members hm WHERE hm.id = household_members.id)
  AND role = (SELECT hm.role FROM public.household_members hm WHERE hm.id = household_members.id)
  AND household_id = (SELECT hm.household_id FROM public.household_members hm WHERE hm.id = household_members.id)
  AND user_id = (SELECT hm.user_id FROM public.household_members hm WHERE hm.id = household_members.id)
);

-- Admins of a household may update any membership row in that household
-- (including promoting/demoting other members).
CREATE POLICY "admins update memberships in household"
ON public.household_members
FOR UPDATE
USING (public.is_household_admin(auth.uid(), household_id))
WITH CHECK (public.is_household_admin(auth.uid(), household_id));

-- 2. Add UPDATE policy on the receipts storage bucket so only members of the
--    owning household can overwrite a receipt file (mirrors existing
--    SELECT/DELETE behavior — receipts are stored under <household_id>/...).
CREATE POLICY "members update receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND public.is_household_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'receipts'
  AND public.is_household_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
