-- Allow a taskless manual focus session to target any project owned by the user.

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

DROP TRIGGER IF EXISTS pomodoro_resolve_project ON public.pomodoro_sessions;
CREATE TRIGGER pomodoro_resolve_project
  BEFORE INSERT OR UPDATE OF task_id, project_id, user_id ON public.pomodoro_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.resolve_pomodoro_project();

