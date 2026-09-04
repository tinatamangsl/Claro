-- Reading Claro's data in the Supabase SQL Editor.
--
-- Everything lives in one JSONB column, `claro_state.state`, holding the whole
-- ClaroState the browser keeps. So these are mostly JSON accessors rather than
-- joins: -> returns JSON, ->> returns text, and jsonb_each unpacks an object
-- whose keys are ids into rows.
--
-- Run any single statement by selecting it and pressing Run. Every one of these
-- has been run against a live Claro project.
--
-- Note on what you will see: the SQL Editor runs as an admin role, which
-- bypasses row-level security. That is why you can read your row here while the
-- app's public key cannot. It also means these would show *every* user's data
-- if the project ever had more than one, so treat this file accordingly.

-- ---------------------------------------------------------------- overview
-- One row per person. Start here.
select user_id,
       version,
       updated_at,
       pg_size_pretty(pg_column_size(state)::bigint) as size
from public.claro_state;

-- What branches exist in the snapshot.
select jsonb_object_keys(state) as key
from public.claro_state
order by key;

-- How much is in each branch. The nulls are the ones that are not objects,
-- like `version` and `activeFocusSessionId`.
select k as branch,
       case jsonb_typeof(state->k)
         when 'object' then (select count(*) from jsonb_object_keys(state->k))
         else null
       end as entries
from public.claro_state,
     lateral jsonb_object_keys(state) k
order by entries desc nulls last;

-- ------------------------------------------------------------- the planner
-- Counts across the three levels of the hierarchy.
select (select count(*) from jsonb_object_keys(state->'quarters')) as quarters,
       (select count(*) from jsonb_object_keys(state->'weeks'))    as weeks,
       (select count(*) from jsonb_object_keys(state->'days'))     as days
from public.claro_state;

-- The most recent days, newest first. Day ids are ISO dates, so ordering by
-- the key is ordering by date.
select d.key as day,
       d.value->>'notes' as notes,
       jsonb_array_length(coalesce(d.value->'priorities', '[]'::jsonb)) as priorities
from public.claro_state,
     lateral jsonb_each(state->'days') d
order by d.key desc
limit 20;

-- Habits, and how many completions each has.
select h.value->>'name' as habit,
       h.key as id,
       (select count(*)
        from jsonb_each(state->'habitCompletions') c
        where c.value->>'habitId' = h.key) as completions
from public.claro_state,
     lateral jsonb_each(state->'habits') h
order by habit;

-- ----------------------------------------------------------------- cycle
-- Settings and volumes only. `syncConsentAt` is the one that matters: null
-- means cycle notes are being withheld from every upload, so anything you see
-- under entries or checkIns got here from a device that had consented.
select state->'cycle'->'settings' as settings,
       (select count(*) from jsonb_object_keys(state->'cycle'->'entries'))  as periods,
       (select count(*) from jsonb_object_keys(state->'cycle'->'checkIns')) as check_ins
from public.claro_state;

-- Logged period dates.
select e.value->>'startDate' as started,
       e.value->>'endDate'   as ended
from public.claro_state,
     lateral jsonb_each(state->'cycle'->'entries') e
order by started desc;

-- --------------------------------------------------------------- security
-- These two are worth re-running after any schema change. RLS is the only
-- thing protecting this data: the app's key is public and in the bundle.
select relname as "table", relrowsecurity as rls_enabled
from pg_class
where relname = 'claro_state';

select policyname,
       cmd,
       qual is not null       as has_using,
       with_check is not null as has_check
from pg_policies
where tablename = 'claro_state'
order by cmd;

-- --------------------------------------------------------- the escape hatch
-- The whole snapshot, indented. Large, but it is the ground truth when a
-- narrower query is not telling you what you expected.
select jsonb_pretty(state) from public.claro_state;
