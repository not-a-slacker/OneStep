-- OneStep Database Schema

-- Users table (extends Supabase Auth)
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  username text,
  level integer NOT NULL DEFAULT 1 CHECK (level > 0),
  experience_points integer NOT NULL DEFAULT 0 CHECK (experience_points >= 0),
  avatar_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Projects
CREATE TABLE public.projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  estimated_end_date timestamp with time zone,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX projects_one_default_per_user_idx
  ON public.projects (user_id)
  WHERE is_default;

CREATE INDEX projects_user_created_idx
  ON public.projects (user_id, created_at DESC);

-- Tasks. Every task belongs to a project; the protected Misc. project is the fallback.
CREATE TABLE public.tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT NOT NULL,
  title text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in-progress', 'completed')),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  deadline timestamp with time zone,
  estimated_time integer CHECK (estimated_time IS NULL OR estimated_time >= 0),
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX tasks_user_deadline_idx
  ON public.tasks (user_id, deadline);

CREATE INDEX tasks_project_status_idx
  ON public.tasks (project_id, status);

CREATE INDEX tasks_user_completed_idx
  ON public.tasks (user_id, completed_at);

-- Ensure a task's project belongs to the same user; fall back to Misc.
CREATE OR REPLACE FUNCTION public.resolve_task_project()
RETURNS trigger AS $$
DECLARE
  resolved_project_id uuid;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT id INTO resolved_project_id
    FROM public.projects
    WHERE id = NEW.project_id AND user_id = NEW.user_id;
  ELSE
    SELECT id INTO resolved_project_id
    FROM public.projects
    WHERE user_id = NEW.user_id AND is_default = true;
  END IF;

  IF resolved_project_id IS NULL THEN
    RAISE EXCEPTION 'Task project must belong to the same user';
  END IF;

  NEW.project_id := resolved_project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER tasks_resolve_project
  BEFORE INSERT OR UPDATE OF project_id, user_id ON public.tasks
  FOR EACH ROW EXECUTE PROCEDURE public.resolve_task_project();

-- Habits
CREATE TABLE public.habits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  frequency text NOT NULL DEFAULT 'daily'
    CHECK (frequency IN ('daily', 'weekly', 'n_times_a_week')),
  target_days_per_week integer NOT NULL DEFAULT 7
    CHECK (target_days_per_week BETWEEN 1 AND 7),
  current_streak integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak integer NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX habits_user_order_idx
  ON public.habits (user_id, display_order, created_at);

-- Habit Logs
CREATE TABLE public.habit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id uuid REFERENCES public.habits(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  completed_at date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (habit_id, completed_at)
);

CREATE INDEX habit_logs_user_date_idx
  ON public.habit_logs (user_id, completed_at);

-- Pomodoro Sessions. task_id is optional, but project_id is always resolved.
CREATE TABLE public.pomodoro_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT NOT NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  duration integer NOT NULL DEFAULT 0 CHECK (duration >= 0),
  planned_duration integer NOT NULL CHECK (planned_duration > 0),
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone NOT NULL
);

CREATE INDEX pomodoro_user_start_idx
  ON public.pomodoro_sessions (user_id, start_time DESC);

CREATE INDEX pomodoro_project_start_idx
  ON public.pomodoro_sessions (project_id, start_time);

CREATE INDEX pomodoro_task_start_idx
  ON public.pomodoro_sessions (task_id, start_time);

-- Automatically timestamp task completion and clear it when a task is reopened.
CREATE OR REPLACE FUNCTION public.set_task_completed_at()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'completed' AND
     (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed' OR NEW.completed_at IS NULL) THEN
    NEW.completed_at := timezone('utc'::text, now());
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_set_completed_at
  BEFORE INSERT OR UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE PROCEDURE public.set_task_completed_at();

-- Resolve each Pomodoro to its task's project, an explicitly selected project,
-- or the user's Misc. project.
CREATE OR REPLACE FUNCTION public.resolve_pomodoro_project()
RETURNS trigger AS $$
DECLARE
  resolved_project_id uuid;
BEGIN
  IF NEW.task_id IS NOT NULL THEN
    SELECT project_id INTO resolved_project_id
    FROM public.tasks
    WHERE id = NEW.task_id AND user_id = NEW.user_id;

    IF resolved_project_id IS NULL THEN
      RAISE EXCEPTION 'Pomodoro task must belong to the same user';
    END IF;
  ELSIF NEW.project_id IS NOT NULL THEN
    SELECT id INTO resolved_project_id
    FROM public.projects
    WHERE id = NEW.project_id AND user_id = NEW.user_id;

    IF resolved_project_id IS NULL THEN
      RAISE EXCEPTION 'Pomodoro project must belong to the same user';
    END IF;
  ELSE
    SELECT id INTO resolved_project_id
    FROM public.projects
    WHERE user_id = NEW.user_id AND is_default = true;
  END IF;

  IF resolved_project_id IS NULL THEN
    RAISE EXCEPTION 'A valid project or default Misc. project is required';
  END IF;

  NEW.project_id := resolved_project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER pomodoro_resolve_project
  BEFORE INSERT OR UPDATE OF task_id, project_id, user_id ON public.pomodoro_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.resolve_pomodoro_project();

-- Protect the default project and move child records to Misc. before deleting a project.
CREATE OR REPLACE FUNCTION public.reassign_project_before_delete()
RETURNS trigger AS $$
DECLARE
  misc_project_id uuid;
BEGIN
  IF OLD.is_default THEN
    RAISE EXCEPTION 'The default Misc. project cannot be deleted';
  END IF;

  SELECT id INTO misc_project_id
  FROM public.projects
  WHERE user_id = OLD.user_id AND is_default = true;

  IF misc_project_id IS NULL THEN
    RAISE EXCEPTION 'A default Misc. project is required';
  END IF;

  UPDATE public.tasks
  SET project_id = misc_project_id
  WHERE project_id = OLD.id;

  UPDATE public.pomodoro_sessions
  SET project_id = misc_project_id, task_id = NULL
  WHERE project_id = OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER projects_reassign_before_delete
  BEFORE DELETE ON public.projects
  FOR EACH ROW EXECUTE PROCEDURE public.reassign_project_before_delete();

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pomodoro_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own data.
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can manage own projects"
  ON public.projects FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own tasks"
  ON public.tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own habits"
  ON public.habits FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own habit logs"
  ON public.habit_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own pomodoro sessions"
  ON public.pomodoro_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Deterministic gamification. XP is derived from completed source records so
-- retries cannot award duplicate points and undoing work removes its XP.
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


-- Create both the profile and protected Misc. project for every new user.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.projects (user_id, name, color, is_default)
  VALUES (NEW.id, 'Misc.', '#71717a', true);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ===========================================================================
-- Milestone 1 integrity hardening.
--
-- Identical to supabase/milestone_1_integrity.sql, inlined so that schema.sql
-- remains sufficient on its own for a brand new project. Existing databases
-- should apply the standalone migration instead of re-running this file.
-- ===========================================================================
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
