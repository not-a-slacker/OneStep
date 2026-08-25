-- OneStep migration: project/task/Pomodoro integrity, completion timestamps,
-- habit ordering, validation, indexes, and protected Misc. projects.
-- Apply this after schema.sql + update_schema.sql on an existing database.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.pomodoro_sessions
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planned_duration integer;

-- Create a protected Misc. project for every existing profile.
INSERT INTO public.projects (user_id, name, color, status, is_default)
SELECT p.id, 'Misc.', '#71717a', 'active', true
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects existing
  WHERE existing.user_id = p.id AND existing.is_default = true
);

-- Give every legacy task a project.
UPDATE public.tasks task
SET project_id = misc.id
FROM public.projects misc
WHERE task.user_id = misc.user_id
  AND misc.is_default = true
  AND task.project_id IS NULL;

-- Resolve legacy Pomodoros to their task's project, existing project, or Misc.
UPDATE public.pomodoro_sessions session
SET project_id = task.project_id
FROM public.tasks task
WHERE session.task_id = task.id;

UPDATE public.pomodoro_sessions session
SET project_id = misc.id
FROM public.projects misc
WHERE session.user_id = misc.user_id
  AND misc.is_default = true
  AND session.project_id IS NULL;

UPDATE public.pomodoro_sessions
SET planned_duration = GREATEST(duration, 1)
WHERE planned_duration IS NULL;

-- Give existing habits a stable order per user.
WITH ordered AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id ORDER BY created_at, id
  ) - 1 AS new_order
  FROM public.habits
)
UPDATE public.habits habit
SET display_order = ordered.new_order
FROM ordered
WHERE habit.id = ordered.id;

ALTER TABLE public.tasks
  ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE public.pomodoro_sessions
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN planned_duration SET NOT NULL;

-- Replace nullable/SET NULL project relationships with protected assignments.
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;

ALTER TABLE public.pomodoro_sessions
  DROP CONSTRAINT IF EXISTS pomodoro_sessions_project_id_fkey;
ALTER TABLE public.pomodoro_sessions
  ADD CONSTRAINT pomodoro_sessions_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;

-- Backfill completion timestamps conservatively.
UPDATE public.tasks
SET completed_at = COALESCE(deadline, created_at)
WHERE status = 'completed' AND completed_at IS NULL;

-- Constraints that may not already exist.
DELETE FROM public.habit_logs duplicate
USING public.habit_logs retained
WHERE duplicate.habit_id = retained.habit_id
  AND duplicate.completed_at = retained.completed_at
  AND duplicate.id > retained.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_status_check
      CHECK (status IN ('active', 'completed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_status_check'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_status_check
      CHECK (status IN ('pending', 'in-progress', 'completed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_priority_check'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_priority_check
      CHECK (priority IN ('low', 'medium', 'high'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'habits_frequency_check'
  ) THEN
    ALTER TABLE public.habits
      ADD CONSTRAINT habits_frequency_check
      CHECK (frequency IN ('daily', 'weekly', 'n_times_a_week'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'habits_target_days_check'
  ) THEN
    ALTER TABLE public.habits
      ADD CONSTRAINT habits_target_days_check
      CHECK (target_days_per_week BETWEEN 1 AND 7);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pomodoro_duration_check'
  ) THEN
    ALTER TABLE public.pomodoro_sessions
      ADD CONSTRAINT pomodoro_duration_check CHECK (duration >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pomodoro_planned_duration_check'
  ) THEN
    ALTER TABLE public.pomodoro_sessions
      ADD CONSTRAINT pomodoro_planned_duration_check CHECK (planned_duration > 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS projects_one_default_per_user_idx
  ON public.projects (user_id) WHERE is_default;
CREATE UNIQUE INDEX IF NOT EXISTS habit_logs_one_per_day_idx
  ON public.habit_logs (habit_id, completed_at);
CREATE INDEX IF NOT EXISTS tasks_user_deadline_idx
  ON public.tasks (user_id, deadline);
CREATE INDEX IF NOT EXISTS tasks_user_completed_idx
  ON public.tasks (user_id, completed_at);
CREATE INDEX IF NOT EXISTS pomodoro_user_start_idx
  ON public.pomodoro_sessions (user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS pomodoro_project_start_idx
  ON public.pomodoro_sessions (project_id, start_time);
CREATE INDEX IF NOT EXISTS pomodoro_task_start_idx
  ON public.pomodoro_sessions (task_id, start_time);
CREATE INDEX IF NOT EXISTS habits_user_order_idx
  ON public.habits (user_id, display_order, created_at);

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

DROP TRIGGER IF EXISTS tasks_resolve_project ON public.tasks;
CREATE TRIGGER tasks_resolve_project
  BEFORE INSERT OR UPDATE OF project_id, user_id ON public.tasks
  FOR EACH ROW EXECUTE PROCEDURE public.resolve_task_project();

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

DROP TRIGGER IF EXISTS tasks_set_completed_at ON public.tasks;
CREATE TRIGGER tasks_set_completed_at
  BEFORE INSERT OR UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE PROCEDURE public.set_task_completed_at();

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
  ELSE
    SELECT id INTO resolved_project_id
    FROM public.projects
    WHERE user_id = NEW.user_id AND is_default = true;
  END IF;

  IF resolved_project_id IS NULL THEN
    RAISE EXCEPTION 'A default Misc. project is required';
  END IF;

  NEW.project_id := resolved_project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS pomodoro_resolve_project ON public.pomodoro_sessions;
CREATE TRIGGER pomodoro_resolve_project
  BEFORE INSERT OR UPDATE OF task_id, user_id ON public.pomodoro_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.resolve_pomodoro_project();

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

  UPDATE public.tasks
  SET project_id = misc_project_id
  WHERE project_id = OLD.id;

  UPDATE public.pomodoro_sessions
  SET project_id = misc_project_id, task_id = NULL
  WHERE project_id = OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS projects_reassign_before_delete ON public.projects;
CREATE TRIGGER projects_reassign_before_delete
  BEFORE DELETE ON public.projects
  FOR EACH ROW EXECUTE PROCEDURE public.reassign_project_before_delete();

-- Recreate broad policies with explicit write checks.
DROP POLICY IF EXISTS "Users can manage own projects" ON public.projects;
CREATE POLICY "Users can manage own projects" ON public.projects FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can manage own tasks" ON public.tasks;
CREATE POLICY "Users can manage own tasks" ON public.tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can manage own habits" ON public.habits;
CREATE POLICY "Users can manage own habits" ON public.habits FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can manage own habit logs" ON public.habit_logs;
CREATE POLICY "Users can manage own habit logs" ON public.habit_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can manage own pomodoro sessions" ON public.pomodoro_sessions;
CREATE POLICY "Users can manage own pomodoro sessions" ON public.pomodoro_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Ensure future users receive a Misc. project.
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
