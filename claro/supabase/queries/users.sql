-- Who has an account, and what is attached to it.
--
-- Accounts live in `auth.users`, a table Supabase manages. Claro never writes
-- to it: the app only ever touches `public.claro_state`, keyed by the same
-- user id. Run these in the SQL Editor, which is admin and so can read `auth`.
--
-- A caution on columns. `auth.users` also holds `encrypted_password` and a set
-- of `*_token` columns used for confirmation, recovery and email changes.
-- Those are live credential material, so nothing here selects them and neither
-- should you: `select *` on this table puts them on your screen and into
-- whatever you paste the results into. Everything below names its columns.

-- ---------------------------------------------------------------- accounts
select id,
       email,
       created_at,
       last_sign_in_at,
       email_confirmed_at is not null as email_confirmed,
       banned_until,
       deleted_at
from auth.users
order by created_at;

-- One line per account, with how much of Claro they have stored.
select u.email,
       u.last_sign_in_at,
       s.version,
       s.updated_at as last_synced,
       pg_size_pretty(pg_column_size(s.state)::bigint) as size,
       (select count(*) from jsonb_object_keys(s.state->'days')) as days
from auth.users u
left join public.claro_state s on s.user_id = u.id
order by u.created_at;

-- Accounts with no data yet: signed in, never synced. Worth knowing about,
-- because that is what a failing sync looks like from the server side.
select u.email, u.created_at, u.last_sign_in_at
from auth.users u
left join public.claro_state s on s.user_id = u.id
where s.user_id is null;

-- ------------------------------------------------------------ how they sign in
-- One row per provider linked to an account. Claro only uses email, so a row
-- here with anything else means a provider was enabled in the dashboard.
select u.email,
       i.provider,
       i.created_at as linked_at,
       i.last_sign_in_at
from auth.identities i
join auth.users u on u.id = i.user_id
order by u.email, i.provider;

-- Live sessions. A row per signed-in browser, so this is how you tell whether
-- a device is still holding a session, and how you would spot one you do not
-- recognise.
select u.email,
       s.created_at,
       s.updated_at as last_active,
       s.user_agent,
       s.ip
from auth.sessions s
join auth.users u on u.id = s.user_id
order by s.updated_at desc;

-- --------------------------------------------------------------- activity
-- Supabase's own audit trail: sign-ins, token refreshes, sign-outs.
select created_at,
       payload->>'action' as action,
       payload->>'actor_username' as who,
       payload->'traits'->>'provider' as provider
from auth.audit_log_entries
order by created_at desc
limit 50;

-- Sign-ins per day, to see whether the app is actually being used.
select date_trunc('day', created_at)::date as day,
       count(*) filter (where payload->>'action' = 'login') as logins,
       count(*) as all_events
from auth.audit_log_entries
group by 1
order by 1 desc
limit 30;

-- ---------------------------------------------------------------- totals
select (select count(*) from auth.users) as accounts,
       (select count(*) from auth.users where deleted_at is not null) as deleted,
       (select count(*) from auth.sessions) as live_sessions,
       (select count(*) from public.claro_state) as synced_planners;
