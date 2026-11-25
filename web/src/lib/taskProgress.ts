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

export interface ProgressPoint {
  /** Focus minutes spent on the task up to and including this point. */
  minutes: number
  percent: number
  kind: 'start' | 'estimate' | 'completed'
  /** When the session started (estimate) or the task was completed. */
  at: string | null
  note: string | null
}

/**
 * The task's progress plotted against the focus time spent on it: a point at
 * 0 minutes / 0 %, one per session that carries an estimate (at the cumulative
 * minutes after that session), and, for a completed task, 100 % at the total.
 * Sessions without an estimate still add their minutes.
 */
export function progressTimeline(
  sessions: PomodoroSession[],
  taskId: string,
  completedAt: string | null,
): ProgressPoint[] {
  const ordered = sessions
    .filter((session) => session.task_id === taskId)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  const points: ProgressPoint[] = [{ minutes: 0, percent: 0, kind: 'start', at: null, note: null }]
  let minutes = 0
  ordered.forEach((session) => {
    minutes += session.duration
    if (session.progress_percent != null) {
      points.push({
        minutes,
        percent: session.progress_percent,
        kind: 'estimate',
        at: session.start_time,
        note: session.progress_note,
      })
    }
  })

  if (completedAt) {
    points.push({ minutes, percent: 100, kind: 'completed', at: completedAt, note: null })
  }
  return points
}

/**
 * Round tick positions for a minutes axis running from 0 to at least `max`, in
 * one unit throughout: minutes below two hours, hours above.
 */
export function minuteAxisTicks(max: number): { ticks: number[]; format: (minutes: number) => string } {
  const step = [5, 10, 15, 30, 60, 120, 240, 480, 960].find((candidate) => max / candidate <= 6) ?? Math.ceil(max / 6)
  const end = Math.max(step, Math.ceil(max / step) * step)
  const ticks = Array.from({ length: end / step + 1 }, (_, index) => index * step)
  const inHours = end >= 120
  return {
    ticks,
    format: (minutes) => (inHours ? `${Number((minutes / 60).toFixed(1))}h` : `${minutes}m`),
  }
}

/** "45m" under two hours, "2.5h" above. */
export function formatFocusMinutes(minutes: number): string {
  if (minutes < 120) return `${Math.round(minutes)}m`
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`
}
