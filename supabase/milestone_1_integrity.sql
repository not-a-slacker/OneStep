-- Milestone 1 — data integrity and anti-tampering hardening.
--
-- Closes ROADMAP items S-1 (client-writable habit streaks), S-2 (unconstrained
-- focus sessions), S-3 (client-writable default-project flag), and S-4 (missing
-- habit-log ownership check). Also fixes B-3 (longest_streak never decreased).
--
-- Apply AFTER phase_8_14_improvements.sql, gamification_system.sql, and
-- manual_focus_project_assignment.sql. Safe to run more than once, and safe on
-- a populated database: existing rows that would violate the new focus-session
-- constraints are repaired first.
--
-- The web client must be on the matching release before this is applied: it no
-- longer writes habits.current_streak / habits.longest_streak, which this file
-- revokes.


-- ---------------------------------------------------------------------------
-- S-4. A habit check-in must belong to a habit the same user owns.
--
-- tasks and pomodoro_sessions already validate their parent row. habit_logs did
-- not, so a client could insert a log carrying its own user_id but another
-- user's habit_id, awarding itself 30 XP per row.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_habit_log()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.habits
    WHERE id = NEW.habit_id
      AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'A habit check-in must reference a habit owned by the same user';
  END IF;

  -- One day of tolerance so users in timezones ahead of the server can still
  -- check in on their own "today". See ROADMAP B-12 for the real fix.
  IF NEW.completed_at > CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'Habit check-ins cannot be recorded for future dates';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS habit_logs_validate ON public.habit_logs;
CREATE TRIGGER habit_logs_validate
  BEFORE INSERT OR UPDATE ON public.habit_logs
  FOR EACH ROW EXECUTE PROCEDURE public.validate_habit_log();


-- ---------------------------------------------------------------------------
-- S-1 / B-3. Streaks are recalculated from habit_logs on the server.
--
-- longest_streak feeds the gamification formula (25 XP per seven days), but was
-- written by the browser, so any client could mint XP by PATCHing the column.
-- It was also monotonic client-side, so undoing check-ins never gave the XP
-- back. Both problems disappear once the value is derived from the logs.
--
-- The daily rule and the weekly rule mirror habitStore.ts exactly, including the
-- Monday week start (date_trunc('week', ...) is Monday-based in PostgreSQL).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recalculate_habit_streaks(target_habit_id uuid)
RETURNS void AS $$
DECLARE
  habit_row public.habits%ROWTYPE;
  weekly_target integer;
  current_value integer := 0;
  longest_value integer := 0;
BEGIN
  SELECT * INTO habit_row FROM public.habits WHERE id = target_habit_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF habit_row.frequency = 'daily' THEN
    -- Consecutive calendar days form a run when (day - row_number) is constant.
    WITH days AS (
      SELECT DISTINCT completed_at AS day
      FROM public.habit_logs
      WHERE habit_id = target_habit_id
    ),
    grouped AS (
      SELECT day,
             day - (ROW_NUMBER() OVER (ORDER BY day))::integer AS run_key
      FROM days
    ),
    runs AS (
      SELECT run_key,
             COUNT(*)::integer AS run_length,
             MAX(day) AS last_day
      FROM grouped
      GROUP BY run_key
    )
    SELECT
      COALESCE(MAX(run_length), 0),
      -- The current streak is the run containing today or yesterday, if any.
      COALESCE(MAX(run_length) FILTER (WHERE last_day >= CURRENT_DATE - 1), 0)
    INTO longest_value, current_value
    FROM runs;
  ELSE
    weekly_target := CASE
      WHEN habit_row.frequency = 'weekly' THEN 1
      ELSE GREATEST(1, habit_row.target_days_per_week)
    END;

    WITH weeks AS (
      SELECT date_trunc('week', completed_at::timestamp)::date AS week_start,
             COUNT(*) AS check_ins
      FROM public.habit_logs
      WHERE habit_id = target_habit_id
      GROUP BY 1
    ),
    successful AS (
      SELECT week_start
      FROM weeks
      WHERE check_ins >= weekly_target
    ),
    grouped AS (
      SELECT week_start,
             week_start - ((ROW_NUMBER() OVER (ORDER BY week_start))::integer * 7) AS run_key
      FROM successful
    ),
    runs AS (
      SELECT run_key,
             COUNT(*)::integer AS run_length,
             MAX(week_start) AS last_week
      FROM grouped
      GROUP BY run_key
    )
    SELECT
      COALESCE(MAX(run_length), 0),
      -- The current streak counts if this week already met its target, or if
      -- last week did and this week is still in progress.
      COALESCE(MAX(run_length) FILTER (
        WHERE last_week >= date_trunc('week', CURRENT_DATE)::date - 7
      ), 0)
    INTO longest_value, current_value
    FROM runs;
  END IF;

  UPDATE public.habits
  SET current_streak = current_value,
      longest_streak = longest_value
  WHERE id = target_habit_id
    AND (
      current_streak IS DISTINCT FROM current_value
      OR longest_streak IS DISTINCT FROM longest_value
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION public.refresh_streaks_from_log()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_habit_streaks(OLD.habit_id);
    RETURN NULL;
  END IF;

  PERFORM public.recalculate_habit_streaks(NEW.habit_id);

  IF TG_OP = 'UPDATE' AND OLD.habit_id IS DISTINCT FROM NEW.habit_id THEN
    PERFORM public.recalculate_habit_streaks(OLD.habit_id);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS habit_logs_refresh_streaks ON public.habit_logs;
CREATE TRIGGER habit_logs_refresh_streaks
  AFTER INSERT OR DELETE OR UPDATE OF habit_id, completed_at ON public.habit_logs
  FOR EACH ROW EXECUTE PROCEDURE public.refresh_streaks_from_log();


-- Changing a habit's frequency or weekly target changes what counts as a
-- streak, so recalculate. This trigger deliberately does not watch the streak
-- columns themselves, so recalculate_habit_streaks cannot recurse.
CREATE OR REPLACE FUNCTION public.refresh_streaks_from_habit()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalculate_habit_streaks(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS habits_refresh_streaks ON public.habits;
CREATE TRIGGER habits_refresh_streaks
  AFTER UPDATE OF frequency, target_days_per_week ON public.habits
  FOR EACH ROW EXECUTE PROCEDURE public.refresh_streaks_from_habit();


-- Backfill every existing habit from its logs. This corrects any streak that
-- was previously inflated, whether by the monotonic client rule or deliberately.
DO $$
DECLARE
  habit_row record;
BEGIN
  FOR habit_row IN SELECT id FROM public.habits LOOP
    PERFORM public.recalculate_habit_streaks(habit_row.id);
  END LOOP;
END;
$$;


-- Streaks are now server-owned, exactly as profiles.experience_points already is.
REVOKE UPDATE ON public.habits FROM authenticated;
GRANT UPDATE (name, frequency, target_days_per_week, display_order)
  ON public.habits TO authenticated;

REVOKE ALL ON FUNCTION public.recalculate_habit_streaks(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_streaks_from_log() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_streaks_from_habit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_habit_log() FROM PUBLIC;


-- ---------------------------------------------------------------------------
-- S-3. The protected Misc. project cannot be unflagged, renamed, or completed.
--
-- Deletion was already blocked, but a client could clear is_default and then
-- delete the row, leaving the user with no fallback project and breaking task
-- creation, focus sessions, and project deletion.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_default_project()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_default IS DISTINCT FROM NEW.is_default THEN
    RAISE EXCEPTION 'The default project flag cannot be changed';
  END IF;

  IF OLD.is_default THEN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
      RAISE EXCEPTION 'The default Misc. project cannot be renamed';
    END IF;

    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'The default Misc. project cannot be completed';
    END IF;

    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'The default Misc. project cannot be reassigned';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS projects_protect_default ON public.projects;
CREATE TRIGGER projects_protect_default
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE PROCEDURE public.protect_default_project();

REVOKE ALL ON FUNCTION public.protect_default_project() FROM PUBLIC;


-- ---------------------------------------------------------------------------
-- S-2. Focus sessions must describe time that could actually have passed.
--
-- duration is worth 1 XP per minute and was bounded only by "duration >= 0", so
-- a single crafted insert could award unlimited XP.
-- ---------------------------------------------------------------------------

-- Repair rows that would fail the new constraints before adding them.
UPDATE public.pomodoro_sessions
SET end_time = start_time
WHERE end_time < start_time;

UPDATE public.pomodoro_sessions
SET duration = 1440
WHERE duration > 1440;

UPDATE public.pomodoro_sessions
SET planned_duration = 1440
WHERE planned_duration > 1440;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pomodoro_time_order_check'
  ) THEN
    ALTER TABLE public.pomodoro_sessions
      ADD CONSTRAINT pomodoro_time_order_check CHECK (end_time >= start_time);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pomodoro_duration_ceiling_check'
  ) THEN
    ALTER TABLE public.pomodoro_sessions
      ADD CONSTRAINT pomodoro_duration_ceiling_check CHECK (duration <= 1440);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pomodoro_planned_ceiling_check'
  ) THEN
    ALTER TABLE public.pomodoro_sessions
      ADD CONSTRAINT pomodoro_planned_ceiling_check CHECK (planned_duration <= 1440);
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.validate_pomodoro_session()
RETURNS trigger AS $$
DECLARE
  elapsed_minutes numeric;
BEGIN
  IF NEW.start_time > now() + interval '1 day' THEN
    RAISE EXCEPTION 'A focus session cannot start more than a day in the future';
  END IF;

  -- Recorded minutes may not exceed the wall-clock span of the session. One
  -- minute of slack absorbs the client's rounding (the timer writes whole
  -- minutes with ceil on completion).
  elapsed_minutes := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60.0;
  IF NEW.duration > CEIL(elapsed_minutes) + 1 THEN
    RAISE EXCEPTION
      'Recorded focus duration of % minutes exceeds the % minutes that elapsed',
      NEW.duration, ROUND(elapsed_minutes, 1);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Runs after pomodoro_resolve_project (BEFORE triggers fire in name order).
DROP TRIGGER IF EXISTS pomodoro_validate_session ON public.pomodoro_sessions;
CREATE TRIGGER pomodoro_validate_session
  BEFORE INSERT OR UPDATE OF duration, start_time, end_time
  ON public.pomodoro_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.validate_pomodoro_session();

REVOKE ALL ON FUNCTION public.validate_pomodoro_session() FROM PUBLIC;


-- ---------------------------------------------------------------------------
-- Re-derive XP for everyone, since streak corrections change habit XP.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  profile_row record;
BEGIN
  FOR profile_row IN SELECT id FROM public.profiles LOOP
    PERFORM public.recalculate_user_gamification(profile_row.id);
  END LOOP;
END;
$$;
