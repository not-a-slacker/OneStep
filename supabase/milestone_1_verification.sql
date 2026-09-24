-- Verification for milestone_1_integrity.sql.
--
-- Run this in the Supabase SQL editor AFTER applying milestone_1_integrity.sql.
-- It only reads catalogue metadata and your own rows — it writes nothing and
-- creates nothing, so it is safe to run on production.
--
-- Every row of the output should read PASS. Anything else names what is missing.
--
-- Note on scope: the SQL editor runs as an owner role that bypasses RLS and
-- column grants, so this script verifies that the protections are *installed*.
-- It cannot prove what the `authenticated` role can do. To test that end to end,
-- use the REST API with a real user's access token (see the note at the bottom).

WITH expected_triggers(name, table_name, purpose) AS (
  VALUES
    ('habit_logs_validate',        'habit_logs',        'S-4 habit-log ownership and future-date guard'),
    ('habit_logs_refresh_streaks', 'habit_logs',        'S-1 server-side streak recalculation'),
    ('habits_refresh_streaks',     'habits',            'S-1 recalculation on frequency change'),
    ('projects_protect_default',   'projects',          'S-3 default project protection'),
    ('pomodoro_validate_session',  'pomodoro_sessions', 'S-2 focus session sanity check')
),
trigger_checks AS (
  SELECT
    'trigger: ' || e.name AS check_name,
    CASE WHEN t.tgname IS NULL THEN 'FAIL — missing' ELSE 'PASS' END AS result,
    e.purpose AS detail
  FROM expected_triggers e
  LEFT JOIN pg_trigger t
    ON t.tgname = e.name
   AND t.tgrelid = ('public.' || e.table_name)::regclass
   AND NOT t.tgisinternal
),

expected_constraints(name, purpose) AS (
  VALUES
    ('pomodoro_time_order_check',       'S-2 end_time >= start_time'),
    ('pomodoro_duration_ceiling_check', 'S-2 duration <= 1440'),
    ('pomodoro_planned_ceiling_check',  'S-2 planned_duration <= 1440')
),
constraint_checks AS (
  SELECT
    'constraint: ' || e.name AS check_name,
    CASE WHEN c.conname IS NULL THEN 'FAIL — missing' ELSE 'PASS' END AS result,
    e.purpose AS detail
  FROM expected_constraints e
  LEFT JOIN pg_constraint c ON c.conname = e.name
),

-- S-1: `authenticated` must not be able to UPDATE the streak columns.
habit_grants AS (
  SELECT string_agg(column_name, ', ' ORDER BY column_name) AS updatable
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'habits'
    AND grantee = 'authenticated'
    AND privilege_type = 'UPDATE'
),
grant_check AS (
  SELECT
    'grant: habits UPDATE columns' AS check_name,
    CASE
      WHEN updatable IS NULL THEN 'FAIL — no UPDATE grant at all (habit editing will break)'
      WHEN updatable LIKE '%streak%' THEN 'FAIL — streak columns still writable: ' || updatable
      ELSE 'PASS'
    END AS result,
    COALESCE(updatable, '(none)') AS detail
  FROM habit_grants
),

-- Same check for the profiles columns the earlier migration protected.
profile_grants AS (
  SELECT string_agg(column_name, ', ' ORDER BY column_name) AS updatable
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND grantee = 'authenticated'
    AND privilege_type = 'UPDATE'
),
profile_grant_check AS (
  SELECT
    'grant: profiles UPDATE columns' AS check_name,
    CASE
      WHEN updatable IS NULL THEN 'FAIL — no UPDATE grant at all'
      WHEN updatable LIKE '%experience%' OR updatable LIKE '%level%'
        THEN 'FAIL — XP columns still writable: ' || updatable
      ELSE 'PASS'
    END AS result,
    COALESCE(updatable, '(none)') AS detail
  FROM profile_grants
),

-- Data check: no habit should claim a longer streak than its logs can support.
streak_sanity AS (
  SELECT
    'data: habit streaks match logs' AS check_name,
    CASE
      WHEN COUNT(*) = 0 THEN 'PASS'
      ELSE 'FAIL — ' || COUNT(*) || ' habit(s) claim a streak longer than their check-in count'
    END AS result,
    'longest_streak must never exceed the number of logged days' AS detail
  FROM public.habits h
  WHERE h.longest_streak > (
    SELECT COUNT(*) FROM public.habit_logs l WHERE l.habit_id = h.id
  )
),

-- Data check: every user still has exactly one default project.
default_project_sanity AS (
  SELECT
    'data: one default project per user' AS check_name,
    CASE
      WHEN COUNT(*) = 0 THEN 'PASS'
      ELSE 'FAIL — ' || COUNT(*) || ' user(s) without exactly one default project'
    END AS result,
    'handle_new_user creates Misc.; S-3 stops it being unflagged' AS detail
  FROM (
    SELECT p.id
    FROM public.profiles p
    LEFT JOIN public.projects pr
      ON pr.user_id = p.id AND pr.is_default
    GROUP BY p.id
    HAVING COUNT(pr.id) <> 1
  ) offenders
),

-- Data check: no focus session records impossible time.
session_sanity AS (
  SELECT
    'data: focus sessions are plausible' AS check_name,
    CASE
      WHEN COUNT(*) = 0 THEN 'PASS'
      ELSE 'FAIL — ' || COUNT(*) || ' session(s) record more minutes than elapsed'
    END AS result,
    'duration must fit inside end_time - start_time' AS detail
  FROM public.pomodoro_sessions
  WHERE duration > CEIL(EXTRACT(EPOCH FROM (end_time - start_time)) / 60.0) + 1
)

SELECT * FROM trigger_checks
UNION ALL SELECT * FROM constraint_checks
UNION ALL SELECT * FROM grant_check
UNION ALL SELECT * FROM profile_grant_check
UNION ALL SELECT * FROM streak_sanity
UNION ALL SELECT * FROM default_project_sanity
UNION ALL SELECT * FROM session_sanity
ORDER BY 2 DESC, 1;


-- ---------------------------------------------------------------------------
-- End-to-end check (optional, and the only way to prove the grants work).
--
-- The SQL editor bypasses column grants, so only a real request as the
-- `authenticated` role can prove them. In the browser console on the logged-in
-- app (type `allow pasting` first if Chrome blocks it), replace the three
-- constants and run:
--
--   const URL_ = 'https://<PROJECT_REF>.supabase.co'
--   const KEY = '<PUBLISHABLE_KEY>'
--   const HABIT_ID = '<UUID of one of your habits>'
--   const tokenKey = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k))
--   const token = JSON.parse(localStorage[tokenKey]).access_token
--   const patch = async (body) => {
--     const r = await fetch(`${URL_}/rest/v1/habits?id=eq.${HABIT_ID}`, {
--       method: 'PATCH',
--       headers: { apikey: KEY, Authorization: `Bearer ${token}`,
--                  'Content-Type': 'application/json', Prefer: 'return=representation' },
--       body: JSON.stringify(body),
--     })
--     console.log(JSON.stringify(body), '->', r.status, await r.text())
--   }
--   await patch({ longest_streak: 9999 })   // must be 403 (permission denied, 42501)
--   await patch({ display_order: 0 })       // control: must be 200
--
-- Before this migration the first request returned 200 and inflated the user's
-- XP. If the control returns 403, the column grant is too strict.
-- The access token is a live login: never paste it into chat or commit it.
-- ---------------------------------------------------------------------------
