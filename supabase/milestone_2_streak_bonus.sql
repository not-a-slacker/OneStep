-- OneStep: streak bonus per milestone, in every run (ROADMAP B-21).
--
-- Before: each habit paid floor(longest_streak / 7) * 25 XP. A weekly habit's
-- streak is counted in weeks, so it needed seven weeks for the bonus a daily
-- habit earns in seven days, and only the single longest run counted, so
-- rebuilding a broken streak earned nothing until it beat the old record.
--
-- After: every run of a habit pays 25 XP per milestone it reaches.
--   * Daily habits: a milestone every 7 consecutive days.
--   * Weekly and n-times-a-week habits: a milestone every 4 consecutive
--     successful weeks.
-- Milestones are derived from the check-in history rather than stored, like the
-- rest of XP, so removing a check-in takes its bonus back.
--
-- Apply in the Supabase SQL editor after milestone_2_xp_fixes.sql. No client
-- change depends on it. Idempotent: safe to run more than once.

BEGIN;

-- Snapshot for the checks at the end of this file.
DROP TABLE IF EXISTS pg_temp.b21_before;
CREATE TEMP TABLE b21_before AS
SELECT h.id AS habit_id, h.current_streak, h.longest_streak,
       p.id AS profile_id, p.experience_points
FROM public.profiles p
LEFT JOIN public.habits h ON h.user_id = p.id;

-- ---------------------------------------------------------------------------
-- Every streak run of one habit: its length (days for daily habits, successful
-- weeks otherwise) and the day or week-start it ended on.
-- ---------------------------------------------------------------------------
-- The run rules are the ones recalculate_habit_streaks used, moved here so the
-- streak columns and the XP bonus cannot disagree. Weeks start on Monday
-- (date_trunc('week', ...) in PostgreSQL), matching the web app.
--
-- SECURITY INVOKER (the default): called from the SECURITY DEFINER functions
-- below it sees every row, but called directly by a signed-in user it is
-- limited by row-level security to their own habits.

CREATE OR REPLACE FUNCTION public.habit_streak_runs(target_habit_id uuid)
RETURNS TABLE (run_length integer, run_end date) AS $$
#variable_conflict use_column
DECLARE
  v_frequency text;
  v_target_days integer;
  v_weekly_target integer;
BEGIN
  SELECT frequency, target_days_per_week
  INTO v_frequency, v_target_days
  FROM public.habits
  WHERE id = target_habit_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_frequency = 'daily' THEN
    -- Consecutive calendar days form a run when (day - row_number) is constant.
    RETURN QUERY
    WITH days AS (
      SELECT DISTINCT completed_at AS day
      FROM public.habit_logs
      WHERE habit_id = target_habit_id
    ),
    grouped AS (
      SELECT day,
             day - (ROW_NUMBER() OVER (ORDER BY day))::integer AS run_key
      FROM days
    )
    SELECT COUNT(*)::integer, MAX(day)
    FROM grouped
    GROUP BY run_key;
  ELSE
    v_weekly_target := CASE
      WHEN v_frequency = 'weekly' THEN 1
      ELSE GREATEST(1, v_target_days)
    END;

    RETURN QUERY
    WITH weeks AS (
      SELECT date_trunc('week', completed_at::timestamp)::date AS week_start,
             COUNT(*) AS check_ins
      FROM public.habit_logs
      WHERE habit_id = target_habit_id
      GROUP BY 1
    ),
    grouped AS (
      SELECT week_start,
             week_start - ((ROW_NUMBER() OVER (ORDER BY week_start))::integer * 7) AS run_key
      FROM weeks
      WHERE check_ins >= v_weekly_target
    )
    SELECT COUNT(*)::integer, MAX(week_start)
    FROM grouped
    GROUP BY run_key;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

REVOKE ALL ON FUNCTION public.habit_streak_runs(uuid) FROM PUBLIC;

-- Same results as before; it now reads its runs from habit_streak_runs.
CREATE OR REPLACE FUNCTION public.recalculate_habit_streaks(target_habit_id uuid)
RETURNS void AS $$
DECLARE
  v_frequency text;
  v_current integer := 0;
  v_longest integer := 0;
BEGIN
  SELECT frequency INTO v_frequency FROM public.habits WHERE id = target_habit_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(MAX(r.run_length), 0),
    -- The current streak is the run that is still alive: for a daily habit one
    -- that includes today or yesterday; otherwise one that includes this week
    -- or last week (this week may still be in progress).
    COALESCE(MAX(r.run_length) FILTER (
      WHERE r.run_end >= CASE
        WHEN v_frequency = 'daily' THEN CURRENT_DATE - 1
        ELSE date_trunc('week', CURRENT_DATE)::date - 7
      END
    ), 0)
  INTO v_longest, v_current
  FROM public.habit_streak_runs(target_habit_id) r;

  UPDATE public.habits
  SET current_streak = v_current,
      longest_streak = v_longest
  WHERE id = target_habit_id
    AND (
      current_streak IS DISTINCT FROM v_current
      OR longest_streak IS DISTINCT FROM v_longest
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.recalculate_habit_streaks(uuid) FROM PUBLIC;

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
    -- B-21: 25 XP per milestone in every run, not just the longest. A milestone
    -- is 7 days for a daily habit and 4 successful weeks for a weekly one.
    + COALESCE((
      SELECT SUM(FLOOR(r.run_length / CASE WHEN h.frequency = 'daily' THEN 7 ELSE 4 END)) * 25
      FROM public.habits h
      CROSS JOIN LATERAL public.habit_streak_runs(h.id) r
      WHERE h.user_id = target_user_id
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

-- The bonus is now read from the check-ins (already watched by
-- habit_logs_refresh_gamification), not from habits.longest_streak, but it does
-- depend on the habit's frequency and weekly target, so watch those instead.
DROP TRIGGER IF EXISTS habits_refresh_gamification ON public.habits;
CREATE TRIGGER habits_refresh_gamification
  AFTER INSERT OR DELETE OR UPDATE OF frequency, target_days_per_week, user_id
  ON public.habits
  FOR EACH ROW EXECUTE PROCEDURE public.refresh_gamification_after_activity();

-- Re-derive streaks and XP for everyone.
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN SELECT id FROM public.habits LOOP
    PERFORM public.recalculate_habit_streaks(v_row.id);
  END LOOP;
  FOR v_row IN SELECT id FROM public.profiles LOOP
    PERFORM public.recalculate_user_gamification(v_row.id);
  END LOOP;
END;
$$;

-- The streak rules only moved, so no stored streak may change. Abort (and roll
-- everything back) if one did.
DO $$
DECLARE
  v_changed integer;
BEGIN
  SELECT COUNT(*) INTO v_changed
  FROM b21_before b
  JOIN public.habits h ON h.id = b.habit_id
  WHERE h.current_streak IS DISTINCT FROM b.current_streak
     OR h.longest_streak IS DISTINCT FROM b.longest_streak;
  IF v_changed > 0 THEN
    RAISE EXCEPTION 'B-21 migration changed % stored streaks; nothing was applied', v_changed;
  END IF;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Check (read-only). PASS rows must pass; INFO rows are for your information.
-- ---------------------------------------------------------------------------
SELECT 'XP split adds up to the total' AS check_name,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || COUNT(*) || ' profiles' END AS result
FROM public.profiles
WHERE experience_points <> task_xp + focus_xp + habit_xp
UNION ALL
SELECT 'Streak bonus counts every run',
       CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM pg_proc
WHERE proname = 'recalculate_user_gamification'
  AND prosrc LIKE '%habit_streak_runs%'
UNION ALL
SELECT 'XP gained from the new streak bonus (information only)',
       'INFO: ' || COALESCE(SUM(p.experience_points - b.experience_points), 0) || ' XP across '
         || COUNT(*) FILTER (WHERE p.experience_points <> b.experience_points) || ' profiles'
FROM public.profiles p
JOIN (SELECT DISTINCT profile_id, experience_points FROM b21_before) b ON b.profile_id = p.id;
