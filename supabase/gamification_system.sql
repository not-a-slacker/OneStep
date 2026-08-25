-- Deterministic gamification for existing OneStep databases.
-- XP is recalculated from source records, preventing duplicate awards.

CREATE OR REPLACE FUNCTION public.recalculate_user_gamification(target_user_id uuid)
RETURNS void AS $$
DECLARE
  task_xp integer := 0;
  focus_xp integer := 0;
  habit_xp integer := 0;
  total_xp integer := 0;
  calculated_level integer := 1;
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
  INTO task_xp
  FROM public.tasks
  WHERE user_id = target_user_id
    AND status = 'completed'
    AND completed_at IS NOT NULL;

  SELECT COALESCE(SUM(
    duration
    + CASE
        WHEN duration > 0 AND duration >= planned_duration THEN 10
        ELSE 0
      END
  ), 0)::integer
  INTO focus_xp
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
  INTO habit_xp;

  total_xp := GREATEST(0, task_xp + focus_xp + habit_xp);
  calculated_level := FLOOR(SQRT(total_xp::numeric / 250))::integer + 1;

  UPDATE public.profiles
  SET experience_points = total_xp,
      level = calculated_level
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.refresh_gamification_after_activity()
RETURNS trigger AS $$
DECLARE
  affected_user_id uuid;
BEGIN
  affected_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  PERFORM public.recalculate_user_gamification(affected_user_id);

  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    PERFORM public.recalculate_user_gamification(OLD.user_id);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tasks_refresh_gamification ON public.tasks;
CREATE TRIGGER tasks_refresh_gamification
  AFTER INSERT OR DELETE OR UPDATE OF status, priority, deadline, completed_at, user_id
  ON public.tasks
  FOR EACH ROW EXECUTE PROCEDURE public.refresh_gamification_after_activity();

DROP TRIGGER IF EXISTS pomodoro_refresh_gamification ON public.pomodoro_sessions;
CREATE TRIGGER pomodoro_refresh_gamification
  AFTER INSERT OR DELETE OR UPDATE OF duration, planned_duration, user_id
  ON public.pomodoro_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.refresh_gamification_after_activity();

DROP TRIGGER IF EXISTS habit_logs_refresh_gamification ON public.habit_logs;
CREATE TRIGGER habit_logs_refresh_gamification
  AFTER INSERT OR DELETE OR UPDATE OF user_id, completed_at, habit_id
  ON public.habit_logs
  FOR EACH ROW EXECUTE PROCEDURE public.refresh_gamification_after_activity();

DROP TRIGGER IF EXISTS habits_refresh_gamification ON public.habits;
CREATE TRIGGER habits_refresh_gamification
  AFTER INSERT OR DELETE OR UPDATE OF longest_streak, user_id
  ON public.habits
  FOR EACH ROW EXECUTE PROCEDURE public.refresh_gamification_after_activity();

-- Users may edit profile presentation fields, but XP and levels are server-owned.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (username, avatar_url) ON public.profiles TO authenticated;

REVOKE ALL ON FUNCTION public.recalculate_user_gamification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_gamification_after_activity() FROM PUBLIC;

DO $$
DECLARE
  profile_row record;
BEGIN
  FOR profile_row IN SELECT id FROM public.profiles LOOP
    PERFORM public.recalculate_user_gamification(profile_row.id);
  END LOOP;
END;
$$;

