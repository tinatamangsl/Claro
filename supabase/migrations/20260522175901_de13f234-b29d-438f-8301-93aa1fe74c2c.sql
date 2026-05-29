
-- Enums
CREATE TYPE public.household_role AS ENUM ('parent','adult','teen','kid');
CREATE TYPE public.task_status AS ENUM ('open','in_progress','done');
CREATE TYPE public.task_priority AS ENUM ('low','medium','high');
CREATE TYPE public.task_category AS ENUM ('chore','errand','repair','admin','other');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  default_household_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Households
CREATE TABLE public.households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🏡',
  accent_color TEXT NOT NULL DEFAULT '#E07856',
  invite_code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

-- Household members
CREATE TABLE public.household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_emoji TEXT NOT NULL DEFAULT '🙂',
  color TEXT NOT NULL DEFAULT '#E07856',
  role public.household_role NOT NULL DEFAULT 'adult',
  birthday DATE,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id)
);
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_hm_user ON public.household_members(user_id);
CREATE INDEX idx_hm_household ON public.household_members(household_id);

-- Security definer helpers (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_household_member(_user_id UUID, _household_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE user_id = _user_id AND household_id = _household_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_household_admin(_user_id UUID, _household_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE user_id = _user_id AND household_id = _household_id AND is_admin = true
  );
$$;

-- Tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category public.task_category NOT NULL DEFAULT 'other',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  status public.task_status NOT NULL DEFAULT 'open',
  due_date DATE,
  assigned_to UUID REFERENCES public.household_members(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tasks_household ON public.tasks(household_id);

-- Task comments
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_task_comments_task ON public.task_comments(task_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================
-- RLS Policies
-- ============================

-- profiles: each user manages own
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- households: members can see; anyone authed can create; admin can update/delete
CREATE POLICY "members view household" ON public.households FOR SELECT
  USING (public.is_household_member(auth.uid(), id));
CREATE POLICY "create household" ON public.households FOR INSERT
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "admin update household" ON public.households FOR UPDATE
  USING (public.is_household_admin(auth.uid(), id));
CREATE POLICY "admin delete household" ON public.households FOR DELETE
  USING (public.is_household_admin(auth.uid(), id));

-- household_members:
-- View: any member of the same household
CREATE POLICY "view co-members" ON public.household_members FOR SELECT
  USING (public.is_household_member(auth.uid(), household_id));
-- Insert: a user inserting their own membership (join via code) OR admin adding
CREATE POLICY "self join" ON public.household_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);
-- Update: self or admin
CREATE POLICY "update own membership" ON public.household_members FOR UPDATE
  USING (auth.uid() = user_id OR public.is_household_admin(auth.uid(), household_id));
-- Delete: self leaves or admin removes
CREATE POLICY "leave or admin remove" ON public.household_members FOR DELETE
  USING (auth.uid() = user_id OR public.is_household_admin(auth.uid(), household_id));

-- tasks: members of the household
CREATE POLICY "members view tasks" ON public.tasks FOR SELECT
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "members create tasks" ON public.tasks FOR INSERT
  WITH CHECK (public.is_household_member(auth.uid(), household_id) AND auth.uid() = created_by);
CREATE POLICY "members update tasks" ON public.tasks FOR UPDATE
  USING (public.is_household_member(auth.uid(), household_id));
CREATE POLICY "members delete tasks" ON public.tasks FOR DELETE
  USING (public.is_household_member(auth.uid(), household_id));

-- task_comments
CREATE POLICY "view comments" ON public.task_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_household_member(auth.uid(), t.household_id))
);
CREATE POLICY "create comments" ON public.task_comments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_household_member(auth.uid(), t.household_id))
);
CREATE POLICY "delete own comments" ON public.task_comments FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.household_members m WHERE m.id = member_id AND m.user_id = auth.uid())
);

-- Generate invite code helper
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT LANGUAGE SQL AS $$
  SELECT upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
$$;
