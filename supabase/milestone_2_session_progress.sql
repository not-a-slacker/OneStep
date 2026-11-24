-- OneStep: progress notes on focus sessions.
--
-- Each focus session can carry a note about what was achieved and an estimate
-- of how far along its task is after the session (0-100 %). The web app shows
-- a task's most recent estimate as a progress bar on the Tasks page.
--
-- Both columns are optional and do not affect XP: the gamification and
-- validation triggers on pomodoro_sessions only watch other columns, and the
-- existing row-level policy already limits users to their own sessions.
--
-- Apply in the Supabase SQL editor before using the feature; until then,
-- saving a note fails with an unknown-column error and nothing else changes.
-- Idempotent: safe to run more than once.

BEGIN;

ALTER TABLE public.pomodoro_sessions
  ADD COLUMN IF NOT EXISTS progress_note text
    CHECK (progress_note IS NULL OR char_length(progress_note) <= 2000),
  ADD COLUMN IF NOT EXISTS progress_percent smallint
    CHECK (progress_percent IS NULL OR progress_percent BETWEEN 0 AND 100);

-- Finding a task's latest estimate reads the newest session with a value.
CREATE INDEX IF NOT EXISTS pomodoro_task_progress_idx
  ON public.pomodoro_sessions (task_id, start_time DESC)
  WHERE progress_percent IS NOT NULL;

COMMIT;

-- ---------------------------------------------------------------------------
-- Check (read-only). Both rows should say PASS.
-- ---------------------------------------------------------------------------
SELECT 'Progress columns exist' AS check_name,
       CASE WHEN COUNT(*) = 2 THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pomodoro_sessions'
  AND column_name IN ('progress_note', 'progress_percent')
UNION ALL
SELECT 'Signed-in users can write them',
       CASE WHEN has_column_privilege('authenticated', 'public.pomodoro_sessions', 'progress_note', 'UPDATE')
             AND has_column_privilege('authenticated', 'public.pomodoro_sessions', 'progress_percent', 'UPDATE')
            THEN 'PASS' ELSE 'FAIL' END;
