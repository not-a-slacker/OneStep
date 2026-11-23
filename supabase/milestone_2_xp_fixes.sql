-- OneStep: XP display and manual focus entry fixes.
--
-- Closes ROADMAP items B-19 (the web app displayed an XP total it computed
-- itself instead of the server's) and B-20 (manual focus entries always earned
-- the +10 completed-session bonus).
--
-- Apply in the Supabase SQL editor AFTER milestone_1_integrity.sql and BEFORE
-- deploying the matching web build. That build inserts pomodoro_sessions.is_manual
-- and reads the per-source XP columns on profiles; neither exists until this runs.
--
-- Idempotent: safe to run more than once.

BEGIN;

-- ---------------------------------------------------------------------------
-- B-20. Mark manual focus entries.
-- ---------------------------------------------------------------------------
-- The +10 bonus is for finishing a timed session. The manual-entry form sets
-- planned_duration = duration, so every manual entry qualified, and a stream of
-- one-minute entries earned 11 XP each.
--
-- This flag is reported by the client, so a hand-crafted request can still
-- claim is_manual = false. It stops the app's own manual form from paying the
-- bonus; it is not a defence against a hostile client (see ROADMAP S-10).

ALTER TABLE public.pomodoro_sessions
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

-- Backfill existing manual entries. The web form takes its start time from a
-- minute-precision datetime-local input and writes end_time = start_time plus
-- exactly `duration` minutes, with planned_duration = duration. Timer sessions,
-- on web and Android, use the current time to the millisecond or finer for both
-- ends, so they essentially never satisfy all of these at once.
UPDATE public.pomodoro_sessions
SET is_manual = true
WHERE NOT is_manual
  AND duration > 0
  AND duration = planned_duration
  AND date_trunc('minute', start_time) = start_time
  AND end_time - start_time = make_interval(mins => duration);

-- ---------------------------------------------------------------------------
-- B-19. Store the per-source XP split on the profile.
-- ---------------------------------------------------------------------------
-- The dashboard shows XP from tasks, focus and habits separately. Only the
-- total was stored, so the web app re-implemented the whole formula in
-- TypeScript to get the split, and displayed its own total rather than the
-- server's. Storing the split lets the client read every number it shows.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS task_xp integer NOT NULL DEFAULT 0 CHECK (task_xp >= 0),
  ADD COLUMN IF NOT EXISTS focus_xp integer NOT NULL DEFAULT 0 CHECK (focus_xp >= 0),
  ADD COLUMN IF NOT EXISTS habit_xp integer NOT NULL DEFAULT 0 CHECK (habit_xp >= 0);

-- profiles already has UPDATE revoked from `authenticated` except for
-- (username, avatar_url), so the new columns are server-owned without further
-- grants.

CREATE OR REPLACE FUNCTION public.recalculate_user_gamification(target_user_id uuid)
RETURNS void AS $$
DECLARE
  -- Prefixed so they cannot collide with the profiles columns of the same name.
  v_task_xp integer := 0;
  v_focus_xp integer := 0;
  v_habit_xp integer := 0;
  v_total_xp integer := 0;
BEGIN
  SELECT COALESCE(SUM(
    50
    + CASE priority WHEN 'high' THEN 30 WHEN 'medium' THEN 15 ELSE 0 END
    + CASE
        WHEN deadline IS NOT NULL
          AND completed_at IS NOT NULL
          AND completed_at <= deadline
        THEN 20
        ELSE 0
      END
  ), 0)::integer
  INTO v_task_xp
  FROM public.tasks
  WHERE user_id = target_user_id
    AND status = 'completed'
    AND completed_at IS NOT NULL;

  SELECT COALESCE(SUM(
    duration
    + CASE
        WHEN NOT is_manual AND duration > 0 AND duration >= planned_duration THEN 10
        ELSE 0
      END
  ), 0)::integer
  INTO v_focus_xp
  FROM public.pomodoro_sessions
  WHERE user_id = target_user_id;

  SELECT (
    COALESCE((
      SELECT COUNT(*) * 30
      FROM public.habit_logs
      WHERE user_id = target_user_id
    ), 0)
    + COALESCE((
      SELECT SUM(FLOOR(longest_streak / 7.0)) * 25
      FROM public.habits
      WHERE user_id = target_user_id
    ), 0)
  )::integer
  INTO v_habit_xp;

  v_total_xp := GREATEST(0, v_task_xp + v_focus_xp + v_habit_xp);

  UPDATE public.profiles
  SET experience_points = v_total_xp,
      level = FLOOR(SQRT(v_total_xp::numeric / 250))::integer + 1,
      task_xp = v_task_xp,
      focus_xp = v_focus_xp,
      habit_xp = v_habit_xp
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.recalculate_user_gamification(uuid) FROM PUBLIC;

-- Recalculate when a session's manual flag changes, as well as its durations.
DROP TRIGGER IF EXISTS pomodoro_refresh_gamification ON public.pomodoro_sessions;
CREATE TRIGGER pomodoro_refresh_gamification
  AFTER INSERT OR DELETE OR UPDATE OF duration, planned_duration, is_manual, user_id
  ON public.pomodoro_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.refresh_gamification_after_activity();

-- Re-derive everyone's XP: manual entries lose their bonus and the new split
-- columns are filled in.
DO $$
DECLARE
  profile_row record;
BEGIN
  FOR profile_row IN SELECT id FROM public.profiles LOOP
    PERFORM public.recalculate_user_gamification(profile_row.id);
  END LOOP;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Check (read-only). Every row should say PASS.
-- ---------------------------------------------------------------------------
SELECT 'XP split adds up to the total' AS check_name,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || COUNT(*) || ' profiles' END AS result
FROM public.profiles
WHERE experience_points <> task_xp + focus_xp + habit_xp
UNION ALL
SELECT 'No manual entry earns the session bonus',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM pg_proc
WHERE proname = 'recalculate_user_gamification'
  AND prosrc NOT LIKE '%NOT is_manual%'
UNION ALL
SELECT 'Manual entries found by the backfill (information only)',
       'INFO: ' || COUNT(*) || ' sessions'
FROM public.pomodoro_sessions
WHERE is_manual;
