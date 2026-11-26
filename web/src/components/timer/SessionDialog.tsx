"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { NotebookPen, Trash2, X } from "lucide-react"
import ConfirmDialog from "@/components/ui/ConfirmDialog"
import { progressBefore } from "@/lib/taskProgress"
import { PROGRESS_NOTE_MAX_LENGTH, usePomodoroStore, type PomodoroSession } from "@/store/pomodoroStore"
import type { Project } from "@/store/projectStore"
import type { Task } from "@/store/taskStore"

interface SessionDialogProps {
  session: PomodoroSession
  sessions: PomodoroSession[]
  tasks: Task[]
  projects: Project[]
  onClose: () => void
}

const inputClass = "w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-2.5 text-white focus:border-[var(--color-primary)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"

/**
 * Opened from the Pomodoro history. Edits a session's task or project, start
 * time and length, records what it achieved and how far along its task is
 * afterwards (cumulative, so the Tasks page can show the latest estimate),
 * and deletes it.
 *
 * Mount it with a `key` of the session id so its fields reset per session.
 */
export default function SessionDialog({ session, sessions, tasks, projects, onClose }: SessionDialogProps) {
  const updateSession = usePomodoroStore((state) => state.updateSession)
  const deleteSession = usePomodoroStore((state) => state.deleteSession)
  const error = usePomodoroStore((state) => state.error)
  const clearError = usePomodoroStore((state) => state.clearError)
  // The timer is still writing to this session (running or paused).
  const onTimer = usePomodoroStore((state) => state.currentSessionDbId === session.id)

  const [assignment, setAssignment] = useState<"task" | "project">(session.task_id ? "task" : "project")
  const [taskId, setTaskId] = useState(session.task_id ?? "")
  const [projectId, setProjectId] = useState(session.project_id)
  const [startedAt, setStartedAt] = useState(format(new Date(session.start_time), "yyyy-MM-dd'T'HH:mm"))
  const [duration, setDuration] = useState(String(session.duration))
  const [note, setNote] = useState(session.progress_note ?? "")
  const initialPrevious = progressBefore(sessions, session)
  const [hasEstimate, setHasEstimate] = useState(
    Boolean(session.task_id) && (session.progress_percent != null || initialPrevious != null),
  )
  const [percent, setPercent] = useState(session.progress_percent ?? initialPrevious ?? 0)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const selectedTaskId = assignment === "task" && taskId ? taskId : null
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)

  // Open tasks, plus this session's own task if it has since been completed.
  const taskOptions = useMemo(() => tasks
    .filter((task) => task.status !== "completed" || task.id === session.task_id)
    .sort((a, b) => a.title.localeCompare(b.title)), [session.task_id, tasks])
  const projectOptions = useMemo(() => [...projects]
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)), [projects])

  // The estimate the selected task had before this session's (edited) start.
  const previousPercent = useMemo(() => {
    if (!selectedTaskId) return null
    const start = new Date(startedAt)
    return progressBefore(sessions, {
      ...session,
      task_id: selectedTaskId,
      start_time: Number.isNaN(start.getTime()) ? session.start_time : start.toISOString(),
    })
  }, [selectedTaskId, session, sessions, startedAt])

  const close = () => {
    clearError()
    onClose()
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    const saved = await updateSession(session.id, {
      taskId: selectedTaskId,
      projectId: assignment === "project" ? projectId : null,
      startedAt,
      durationMinutes: Number(duration),
      note,
      percent: selectedTaskId && hasEstimate ? percent : null,
    })
    setSaving(false)
    if (saved) onClose()
  }

  const confirmDelete = async () => {
    setDeleting(true)
    const deleted = await deleteSession(session.id)
    setDeleting(false)
    setConfirmingDelete(false)
    if (deleted) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="session-dialog-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="session-dialog-title" className="flex items-center gap-2 text-2xl font-bold">
              <NotebookPen />
              Focus session
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {session.is_manual ? "Logged by hand" : "Recorded by the timer"}
              {!session.is_manual && session.planned_duration ? ` · ${session.planned_duration} min planned` : ""}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={close} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={save} className="space-y-5">
          <fieldset disabled={onTimer} className="space-y-4">
            <legend className="sr-only">Session details</legend>
            {onTimer && (
              <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                The timer is still using this session. You can add a note now; finish or reset the
                timer to change its time or task, or to delete it.
              </p>
            )}
            <div className="grid grid-cols-2 rounded-xl bg-zinc-900 p-1">
              {([["task", "Task"], ["project", "Project only"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAssignment(value)}
                  className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed ${assignment === value ? "bg-[var(--color-primary)] text-white" : "text-zinc-400 hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {assignment === "task" ? (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-400">Task</span>
                <select required value={taskId} onChange={(event) => setTaskId(event.target.value)} className={inputClass}>
                  <option value="">Select a task</option>
                  {taskOptions.map((task) => {
                    const project = projects.find((item) => item.id === task.project_id)
                    return (
                      <option key={task.id} value={task.id}>
                        {task.title} · {project?.name ?? "Misc."}{task.status === "completed" ? " · completed" : ""}
                      </option>
                    )
                  })}
                </select>
              </label>
            ) : (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-400">Project</span>
                <select required value={projectId} onChange={(event) => setProjectId(event.target.value)} className={inputClass}>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}{project.status === "completed" ? " · completed" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-400">Started at</span>
                <input
                  required
                  type="datetime-local"
                  max={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                  value={startedAt}
                  onChange={(event) => setStartedAt(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-400">Focus minutes</span>
                <input
                  required
                  type="number"
                  min="0"
                  max="1440"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-400">What did you get done?</span>
            <textarea
              rows={4}
              maxLength={PROGRESS_NOTE_MAX_LENGTH}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Drafted the introduction, fixed the failing test…"
              className={inputClass}
            />
            <span className="mt-1 block text-right text-xs text-zinc-500">
              {note.length} / {PROGRESS_NOTE_MAX_LENGTH}
            </span>
          </label>

          {selectedTask ? (
            <fieldset className="space-y-3">
              <legend className="sr-only">Task progress</legend>
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                <input
                  type="checkbox"
                  checked={hasEstimate}
                  onChange={(event) => setHasEstimate(event.target.checked)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                Estimate how far along &ldquo;{selectedTask.title}&rdquo; is after this session
              </label>
              {hasEstimate && (
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={percent}
                    onChange={(event) => setPercent(Number(event.target.value))}
                    aria-label="Task progress percentage"
                    className="flex-1 accent-[var(--color-primary)]"
                  />
                  <label className="flex items-center gap-1 text-sm text-zinc-300">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={percent}
                      onChange={(event) => {
                        const value = Math.round(Number(event.target.value))
                        setPercent(Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0)
                      }}
                      aria-label="Task progress percentage"
                      className="w-16 rounded-lg border border-[var(--surface-border)] bg-zinc-900 px-2 py-1 text-right text-white focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    %
                  </label>
                </div>
              )}
              <p className="text-xs text-zinc-500">
                {previousPercent != null ? `Before this session it was at ${previousPercent}%. ` : ""}
                The task&apos;s progress bar shows its most recent estimate.
              </p>
            </fieldset>
          ) : (
            <p className="text-xs text-zinc-500">Assign a task to estimate its progress.</p>
          )}

          {error && <p className="text-sm text-red-300">{error}</p>}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={onTimer}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={16} aria-hidden="true" />
              Delete
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={close} className="rounded-lg px-4 py-2 font-semibold text-zinc-400 hover:text-white">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="rounded-lg bg-[var(--color-primary)] px-6 py-2 font-bold text-white hover:opacity-90 disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this focus session?"
        description={
          <>
            The <strong className="text-zinc-200">{session.duration}-minute</strong> session from{" "}
            {format(new Date(session.start_time), "MMM d, h:mm a")} and its progress note will be
            permanently deleted, and the XP it earned is removed. This cannot be undone.
          </>
        }
        confirmLabel="Delete session"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  )
}
