-- Claro's entire server side.
--
-- One row per person, holding the whole ClaroState as JSONB. That mirrors how
-- the app already works: the client keeps a single snapshot and writes it
-- through one function (`saveNow` in src/lib/storage.ts), so a table shaped the
-- same way needs no per-entity mapping and no second source of truth about what
-- a quarter or a habit is. The schema version travels with the row so an older
-- client can refuse a snapshot it would not understand rather than mangling it.
--
-- Applied by `npm run db:push`, which is the path to prefer over the dashboard
-- SQL Editor: pasting into that is a hand copy, and a hand copy is how a stray
-- character got into it once already. Every statement here is safe to re-run.

create table if not exists public.claro_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- The whole ClaroState, exactly as the client serialises it.
  state jsonb not null,
  -- CLARO_SCHEMA_VERSION at the time of writing.
  version integer not null,
  -- The optimistic-concurrency token. The client sends back the value it last
  -- saw, and a write whose token no longer matches is refused rather than
  -- allowed to overwrite whatever the other device put there.
  updated_at timestamptz not null default now()
);

-- Row level security is the whole security boundary here.
--
-- The anon key is public: it is compiled into a static bundle that anybody can
-- read. Nothing below may be relaxed to "true" or to `authenticated` alone, or
-- every user's planner, and their cycle notes, become readable by any other
-- signed-in user.
alter table public.claro_state enable row level security;

drop policy if exists "read own state" on public.claro_state;
create policy "read own state"
  on public.claro_state for select
  using (auth.uid() = user_id);

drop policy if exists "insert own state" on public.claro_state;
create policy "insert own state"
  on public.claro_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own state" on public.claro_state;
create policy "update own state"
  on public.claro_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own state" on public.claro_state;
create policy "delete own state"
  on public.claro_state for delete
  using (auth.uid() = user_id);

-- `updated_at` is the concurrency token, so the client must never be the one
-- deciding it. A trigger stamps it on every write.
create or replace function public.touch_claro_state()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists claro_state_touch on public.claro_state;
create trigger claro_state_touch
  before insert or update on public.claro_state
  for each row execute function public.touch_claro_state();
