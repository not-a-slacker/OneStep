"use client"

import { useState } from "react"
import { format } from "date-fns"
import { NotebookPen, X } from "lucide-react"
import { PROGRESS_NOTE_MAX_LENGTH, usePomodoroStore, type PomodoroSession } from "@/store/pomodoroStore"

interface SessionProgressDialogProps {
  session: PomodoroSession
  /** Null when the session has no task (or its task was deleted). */
  taskTitle: string | null
  /** The task's estimate before this session, used as the starting value. */
  previousPercent: number | null
  onClose: () => void
}

/**
 * Lets the user write what a focus session achieved and estimate how far along
 * its task is afterwards. The estimate is cumulative ("the task is now 60 %
 * done"), so the Tasks page can show the latest one as the task's progress.
 *
 * Mount it with a `key` of the session id so its fields reset per session.
 */
export default function SessionProgressDialog({ session, taskTitle, previousPercent, onClose }: SessionProgressDialogProps) {
  const updateSessionProgress = usePomodoroStore((state) => state.updateSessionProgress)
  const error = usePomodoroStore((state) => state.error)
  const clearError = usePomodoroStore((state) => state.clearError)

  const canEstimate = Boolean(session.task_id)
  const [note, setNote] = useState(session.progress_note ?? "")
  const [hasEstimate, setHasEstimate] = useState(
    canEstimate && (session.progress_percent != null || previousPercent != null),
  )
  const [percent, setPercent] = useState(session.progress_percent ?? previousPercent ?? 0)
  const [saving, setSaving] = useState(false)

  const close = () => {
    clearError()
    onClose()
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    const saved = await updateSessionProgress(session.id, note, canEstimate && hasEstimate ? percent : null)
    setSaving(false)
    if (saved) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="session-progress-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="session-progress-title" className="flex items-center gap-2 text-2xl font-bold">
              <NotebookPen />
              Session progress
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {taskTitle ?? "Unassigned focus"} · {session.duration} min ·{" "}
              {format(new Date(session.start_time), "MMM d, h:mm a")}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={close} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={save} className="space-y-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-400">What did you get done?</span>
            <textarea
              rows={5}
              autoFocus
              maxLength={PROGRESS_NOTE_MAX_LENGTH}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Drafted the introduction, fixed the failing test…"
              className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-2.5 text-white focus:border-[var(--color-primary)] focus:outline-none"
            />
            <span className="mt-1 block text-right text-xs text-zinc-500">
              {note.length} / {PROGRESS_NOTE_MAX_LENGTH}
            </span>
          </label>

          {canEstimate ? (
            <fieldset className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                <input
                  type="checkbox"
                  checked={hasEstimate}
                  onChange={(event) => setHasEstimate(event.target.checked)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                Estimate how far along the task is now
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
                {previousPercent != null
                  ? `Before this session it was at ${previousPercent}%. `
                  : ""}
                The task&apos;s progress bar shows its most recent estimate.
              </p>
            </fieldset>
          ) : (
            <p className="text-xs text-zinc-500">
              This session has no task, so there is no task progress to estimate.
            </p>
          )}

          {error && <p className="text-sm text-red-300">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={close} className="rounded-lg px-4 py-2 font-semibold text-zinc-400 hover:text-white">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-[var(--color-primary)] px-6 py-2 font-bold text-white hover:opacity-90 disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
