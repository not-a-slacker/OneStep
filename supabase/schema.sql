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
