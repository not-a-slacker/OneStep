"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { FolderKanban, TrendingUp, X } from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatFocusMinutes, minuteAxisTicks, progressTimeline, type ProgressPoint } from "@/lib/taskProgress"
import type { PomodoroSession } from "@/store/pomodoroStore"
import type { Project } from "@/store/projectStore"
import type { Task } from "@/store/taskStore"

// Matches the other charts on the Tasks page. The brand blue passes the
// dataviz palette checks against the #18181b card surface (contrast >= 3:1).
const SERIES_COLOR = "#3b82f6"
const AXIS_COLOR = "#71717a"
const TICK_COLOR = "#a1a1aa"

interface TaskProgressDialogProps {
  task: Task
  project: Project | undefined
  sessions: PomodoroSession[]
  onClose: () => void
}

/**
 * Opened from a task card: how far along the task is (the user's estimates,
 * entered on the Pomodoro page) against the focus time spent on it.
 */
export default function TaskProgressDialog({ task, project, sessions, onClose }: TaskProgressDialogProps) {
  const completed = task.status === "completed"
  const points = useMemo(
    () => progressTimeline(sessions, task.id, completed ? task.completed_at ?? task.created_at : null),
    [completed, sessions, task.completed_at, task.created_at, task.id],
  )
  const taskSessions = useMemo(
    () => sessions
      .filter((session) => session.task_id === task.id)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [sessions, task.id],
  )

  const minutesSpent = taskSessions.reduce((sum, session) => sum + session.duration, 0)
  const estimates = points.filter((point) => point.kind === "estimate")
  const latest = completed ? 100 : estimates.at(-1)?.percent ?? null
  const hasChart = estimates.length > 0 || completed
  const estimate = task.estimated_time && task.estimated_time > 0 ? task.estimated_time : null
  const xAxis = minuteAxisTicks(Math.max(minutesSpent, estimate ?? 0, 1))

  // Log rows, newest first, with the running total after each session so the
  // list doubles as the chart's data table.
  const log = useMemo(() => {
    const rows: { session: PomodoroSession; minutesAfter: number }[] = []
    taskSessions.reduce((running, session) => {
      const minutesAfter = running + session.duration
      if (session.progress_note || session.progress_percent != null) rows.push({ session, minutesAfter })
      return minutesAfter
    }, 0)
    return rows.reverse()
  }, [taskSessions])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-progress-title"
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="task-progress-title" className="flex items-center gap-2 text-2xl font-bold">
              <TrendingUp className="shrink-0" />
              <span className="min-w-0 break-words">{task.title}</span>
            </h2>
            <p className="mt-1 flex items-center gap-1 text-sm text-zinc-400">
              <FolderKanban size={13} style={{ color: project?.color }} aria-hidden="true" />
              {project?.name ?? "Misc."}
            </p>
          </div>
          <button type="button" aria-label="Close" autoFocus onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Progress" value={latest == null ? "—" : `${latest}%`} />
          <Stat label="Time spent" value={formatFocusMinutes(minutesSpent)} />
          <Stat label="Estimate" value={estimate ? formatFocusMinutes(estimate) : "—"} />
          <Stat label="Sessions" value={String(taskSessions.length)} />
        </dl>

        <h3 className="text-sm font-semibold text-zinc-200">Progress vs time spent</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Each point is an estimate you entered after a focus session, placed at the total focus time up to then.
        </p>
        {hasChart ? (
          <>
            <div className="h-64" role="img" aria-label={`Progress of ${task.title} against focus time spent: ${points.map((point) => `${point.percent}% at ${formatFocusMinutes(point.minutes)}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
                  <XAxis
                    type="number"
                    dataKey="minutes"
                    domain={[0, xAxis.ticks.at(-1) ?? 1]}
                    ticks={xAxis.ticks}
                    tickFormatter={xAxis.format}
                    stroke={AXIS_COLOR}
                    tick={{ fill: TICK_COLOR, fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickFormatter={(value: number) => `${value}%`}
                    stroke={AXIS_COLOR}
                    tick={{ fill: TICK_COLOR, fontSize: 11 }}
                  />
                  {estimate && (
                    <ReferenceLine
                      segment={[{ x: 0, y: 0 }, { x: estimate, y: 100 }]}
                      stroke={AXIS_COLOR}
                      strokeDasharray="5 5"
                      strokeWidth={1.5}
                    />
                  )}
                  <Tooltip
                    content={<PointTooltip />}
                    cursor={{ stroke: AXIS_COLOR, strokeDasharray: "3 3" }}
                  />
                  <Line
                    type="linear"
                    dataKey="percent"
                    name="Progress"
                    stroke={SERIES_COLOR}
                    strokeWidth={2}
                    dot={{ r: 4, fill: SERIES_COLOR, stroke: "var(--surface)", strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: SERIES_COLOR, stroke: "var(--surface)", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {estimate && (
              <p className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                <svg width="22" height="6" aria-hidden="true">
                  <line x1="0" y1="3" x2="22" y2="3" stroke={AXIS_COLOR} strokeWidth="1.5" strokeDasharray="5 5" />
                </svg>
                Planned pace: 100% at the {formatFocusMinutes(estimate)} estimate. Points above it are ahead of plan.
              </p>
            )}
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--surface-border)] p-8 text-center text-sm text-zinc-500">
            No progress estimates yet. On the Pomodoro tab, click a session for this task and set how far along it is.
          </p>
        )}

        {log.length > 0 && (
          <section className="mt-6" aria-labelledby="task-progress-log">
            <h3 id="task-progress-log" className="mb-3 text-sm font-semibold text-zinc-200">Session notes</h3>
            <ol className="space-y-2">
              {log.map(({ session, minutesAfter }) => (
                <li key={session.id} className="rounded-xl border border-[var(--surface-border)] bg-zinc-950/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                    <span>
                      {format(new Date(session.start_time), "MMM d, h:mm a")} · {session.duration} min · {formatFocusMinutes(minutesAfter)} total
                    </span>
                    {session.progress_percent != null && (
                      <span className="rounded-full bg-[var(--color-primary)]/15 px-2 py-0.5 font-bold text-zinc-100">
                        {session.progress_percent}%
                      </span>
                    )}
                  </div>
                  {session.progress_note && (
                    <p className="mt-2 whitespace-pre-line text-sm text-zinc-300">{session.progress_note}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--surface-border)] bg-zinc-950/30 p-3">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-white">{value}</dd>
    </div>
  )
}

interface PointTooltipProps {
  active?: boolean
  payload?: { payload: ProgressPoint }[]
}

function PointTooltip({ active, payload }: PointTooltipProps) {
  const point = active ? payload?.[0]?.payload : undefined
  if (!point) return null
  const title = point.kind === "start" ? "Start" : point.kind === "completed" ? "Completed" : `${point.percent}% done`
  return (
    <div className="max-w-xs rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-xl">
      <p className="font-bold text-white">{title}</p>
      <p className="text-zinc-400">
        after {formatFocusMinutes(point.minutes)} of focus
        {point.at ? ` · ${format(new Date(point.at), "MMM d")}` : ""}
      </p>
      {point.note && <p className="mt-1 line-clamp-3 text-zinc-300">{point.note}</p>}
    </div>
  )
}
