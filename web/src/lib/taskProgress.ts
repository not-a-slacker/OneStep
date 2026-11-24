import type { PomodoroSession } from '@/store/pomodoroStore'

/**
 * A session's progress_percent is the user's estimate of how far along the
 * task is after that session, so a task's progress is its most recent
 * estimate, by when the session started. Sessions with a note but no estimate
 * are skipped rather than resetting the bar.
 */
export function latestProgressByTask(sessions: PomodoroSession[]): Map<string, number> {
  const latest = new Map<string, { percent: number; startedAt: number }>()
  sessions.forEach((session) => {
    if (!session.task_id || session.progress_percent == null) return
    const startedAt = new Date(session.start_time).getTime()
    const current = latest.get(session.task_id)
    if (!current || startedAt > current.startedAt) {
      latest.set(session.task_id, { percent: session.progress_percent, startedAt })
    }
  })
  return new Map([...latest].map(([taskId, { percent }]) => [taskId, percent]))
}

/** The task's estimate as it stood before the given session, if any. */
export function progressBefore(sessions: PomodoroSession[], session: PomodoroSession): number | null {
  if (!session.task_id) return null
  const before = sessions.filter((other) => (
    other.id !== session.id
    && other.task_id === session.task_id
    && new Date(other.start_time).getTime() < new Date(session.start_time).getTime()
  ))
  return latestProgressByTask(before).get(session.task_id) ?? null
}
