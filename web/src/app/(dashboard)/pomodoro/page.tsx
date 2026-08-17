"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BellRing,
  BrainCircuit,
  ChevronDown,
  Coffee,
  FolderKanban,
  History,
  ListTodo,
  Pause,
  Play,
  PlusCircle,
  RotateCcw,
  Settings2,
  Volume2,
} from "lucide-react"
import { format } from "date-fns"
import { usePomodoroStore, type PomodoroMode } from "@/store/pomodoroStore"
import { useProjectStore } from "@/store/projectStore"
import { useTaskStore } from "@/store/taskStore"

const HISTORY_PAGE_SIZE = 5

export default function PomodoroPage() {
  const {
    timeRemaining,
    isActive,
    mode,
    sessionsCompleted,
    sessions,
    currentTaskId,
    focusDuration,
    shortBreakDuration,
    longBreakDuration,
    error,
    setMode,
    startTimer,
    pauseTimer,
    resetTimer,
    tick,
    completeSession,
    setTask,
    updateSettings,
    fetchSessions,
    hydrateTimer,
    clearError,
    addManualSession,
  } = usePomodoroStore()
  const { projects, fetchProjects, ensureMiscProject } = useProjectStore()
  const { tasks, fetchTasks } = useTaskStore()

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false)
  const [manualTaskId, setManualTaskId] = useState("")
  const [manualDuration, setManualDuration] = useState("25")
  const [manualStartedAt, setManualStartedAt] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [focusInput, setFocusInput] = useState("25")
  const [shortInput, setShortInput] = useState("5")
  const [longInput, setLongInput] = useState("15")
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(HISTORY_PAGE_SIZE)
  const [periodMessage, setPeriodMessage] = useState<string | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const completionInProgress = useRef(false)

  useEffect(() => {
    hydrateTimer()
    void Promise.all([fetchSessions(), fetchProjects(), fetchTasks()])
      .then(() => ensureMiscProject())
  }, [ensureMiscProject, fetchProjects, fetchSessions, fetchTasks, hydrateTimer])

  const unlockAlarm = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume()
    }
  }, [])

  const playAlarm = useCallback(async () => {
    await unlockAlarm()
    const context = audioContextRef.current
    if (!context) return

    const start = context.currentTime
    ;[0, 0.32, 0.64].forEach((offset, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = index === 2 ? "sine" : "triangle"
      oscillator.frequency.setValueAtTime(index === 2 ? 1046 : 880, start + offset)
      gain.gain.setValueAtTime(0.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(0.28, start + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.24)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(start + offset)
      oscillator.stop(start + offset + 0.25)
    })
  }, [unlockAlarm])

  const sendCompletionNotification = useCallback((completedMode: PomodoroMode) => {
    const wasFocus = completedMode === "focus"
    const title = wasFocus ? "Focus session complete" : "Break complete"
    const body = wasFocus
      ? "Great work. Step away for a short break."
      : "Your break is over. Ready for the next focus session?"

    setPeriodMessage(`${title}. ${body}`)
    window.setTimeout(() => setPeriodMessage(null), 8000)

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico", tag: "onestep-timer" })
    }
  }, [])

  const handlePeriodComplete = useCallback(async () => {
    if (completionInProgress.current) return
    completionInProgress.current = true
    try {
      const completedMode = await completeSession()
      await playAlarm()
      sendCompletionNotification(completedMode)
    } finally {
      completionInProgress.current = false
    }
  }, [completeSession, playAlarm, sendCompletionNotification])

  useEffect(() => {
    if (!isActive) return
    if (timeRemaining === 0) {
      void handlePeriodComplete()
      return
    }
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [handlePeriodComplete, isActive, tick, timeRemaining])

  const handleStart = async () => {
    clearError()
    await unlockAlarm()
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission()
    }
    await startTimer()
  }

  const openSettings = () => {
    setFocusInput(String(Math.round(focusDuration / 60)))
    setShortInput(String(Math.round(shortBreakDuration / 60)))
    setLongInput(String(Math.round(longBreakDuration / 60)))
    setIsSettingsOpen(true)
  }

  const saveSettings = (event: React.FormEvent) => {
    event.preventDefault()
    updateSettings(
      Number.parseInt(focusInput, 10) || 25,
      Number.parseInt(shortInput, 10) || 5,
      Number.parseInt(longInput, 10) || 15,
    )
    setIsSettingsOpen(false)
  }

  const openManualEntry = () => {
    clearError()
    setManualTaskId(currentTaskId ?? "")
    setManualDuration("25")
    setManualStartedAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"))
    setIsManualEntryOpen(true)
  }

  const saveManualEntry = async (event: React.FormEvent) => {
    event.preventDefault()
    const saved = await addManualSession({
      taskId: manualTaskId,
      durationMinutes: Number(manualDuration),
      startedAt: manualStartedAt,
    })
    if (saved) {
      setIsManualEntryOpen(false)
      setVisibleHistoryCount((count) => Math.max(count, HISTORY_PAGE_SIZE))
    }
  }

  const totalForMode = mode === "focus"
    ? focusDuration
    : mode === "shortBreak"
      ? shortBreakDuration
      : longBreakDuration
  const progress = Math.min(100, Math.max(0, ((totalForMode - timeRemaining) / totalForMode) * 100))
  const visibleSessions = sessions.slice(0, visibleHistoryCount)

  const taskOptions = useMemo(() => tasks
    .filter((task) => task.status !== "completed")
    .sort((a, b) => a.title.localeCompare(b.title)), [tasks])

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center pb-12 pt-6 md:pt-10">
      <div className="mb-8 flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Pomodoro</h1>
          <p className="text-zinc-400">Focus on a task and measure the time it actually takes.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openManualEntry}
            className="flex items-center gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] px-4 py-3 text-sm font-bold text-zinc-200 hover:border-[var(--color-primary)]"
          >
            <PlusCircle size={19} />
            Add focus time
          </button>
          <button
            type="button"
            aria-label="Open timer settings"
            onClick={openSettings}
            className="rounded-xl bg-[var(--surface-border)] p-3 text-zinc-400 hover:bg-zinc-700 hover:text-white"
          >
            <Settings2 size={24} />
          </button>
        </div>
      </div>

      {(error || periodMessage) && (
        <div
          role="status"
          className={`mb-6 flex w-full items-center gap-3 rounded-xl border p-4 ${
            error
              ? "border-red-500/40 bg-red-500/10 text-red-200"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
          }`}
        >
          {error ? <BellRing size={18} /> : <Volume2 size={18} />}
          <span>{error ?? periodMessage}</span>
        </div>
      )}

      <div className="mb-10 w-full max-w-lg space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-zinc-300">Focus task</span>
          <div className="relative">
            <ListTodo className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <select
              className="w-full appearance-none rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] py-3 pl-10 pr-10 text-sm font-medium text-white focus:border-[var(--color-primary)] focus:outline-none"
              value={currentTaskId ?? ""}
              onChange={(event) => void setTask(event.target.value || null)}
              disabled={isActive}
            >
              <option value="">No task — record under Misc.</option>
              {taskOptions.map((task) => {
                const project = projects.find((item) => item.id === task.project_id)
                return (
                  <option key={task.id} value={task.id}>
                    {task.title} · {project?.name ?? "Misc."}
                  </option>
                )
              })}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          </div>
        </label>

        <div className="grid grid-cols-3 rounded-2xl bg-[var(--surface-border)]/50 p-1">
          {([
            ["focus", "Focus", BrainCircuit],
            ["shortBreak", "Short break", Coffee],
            ["longBreak", "Long break", Coffee],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              disabled={isActive}
              className={`flex items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-xs font-bold transition-colors sm:text-sm ${
                mode === value
                  ? value === "focus"
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-success)] text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex h-72 w-72 items-center justify-center rounded-full bg-[var(--surface)] shadow-2xl shadow-[var(--color-primary)]/10 sm:h-80 sm:w-80">
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 320 320" aria-hidden="true">
          <circle cx="160" cy="160" r="150" className="stroke-[var(--surface-border)]" strokeWidth="8" fill="none" />
          <circle
            cx="160"
            cy="160"
            r="150"
            className={mode === "focus" ? "stroke-[var(--color-primary)]" : "stroke-[var(--color-success)]"}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 150}
            strokeDashoffset={(2 * Math.PI * 150) * (1 - progress / 100)}
          />
        </svg>
        <div className="z-10 flex flex-col items-center">
          <span className="text-6xl font-bold tabular-nums tracking-tighter sm:text-7xl">
            {formatTime(timeRemaining)}
          </span>
          <span className="mt-2 text-sm font-medium uppercase tracking-widest text-zinc-400">
            {mode === "focus" ? "Time to focus" : "Time to recharge"}
          </span>
        </div>
      </div>

      <div className="mt-10 flex items-center gap-6">
        <button
          type="button"
          aria-label={isActive ? "Pause timer" : "Start timer"}
          onClick={() => void (isActive ? pauseTimer() : handleStart())}
          className={`flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl transition-transform hover:scale-105 ${
            isActive
              ? "bg-[var(--surface-border)] hover:bg-zinc-700"
              : "bg-gradient-to-tr from-[var(--color-primary)] to-[var(--color-success)]"
          }`}
        >
          {isActive ? <Pause size={32} /> : <Play size={32} className="ml-1" />}
        </button>
        <button
          type="button"
          aria-label="Reset timer"
          onClick={() => void resetTimer()}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--surface-border)] bg-[var(--surface)] text-zinc-400 hover:bg-[var(--surface-border)] hover:text-white"
        >
          <RotateCcw size={24} />
        </button>
      </div>

      <p className="mt-7 text-sm font-medium text-zinc-500">
        Completed focus sessions: <span className="text-[var(--color-primary)]">{sessionsCompleted}</span>
      </p>

      <section className="mt-16 w-full" aria-labelledby="session-history-heading">
        <h2 id="session-history-heading" className="mb-6 flex items-center gap-2 border-b border-[var(--surface-border)] pb-2 text-xl font-bold">
          <History className="text-zinc-400" />
          Session history
        </h2>

        {sessions.length === 0 ? (
          <p className="py-8 text-center italic text-zinc-500">No sessions logged yet. Time to focus!</p>
        ) : (
          <>
            <div className="space-y-3">
              {visibleSessions.map((session) => {
                const project = projects.find((item) => item.id === session.project_id)
                const task = tasks.find((item) => item.id === session.task_id)
                return (
                  <article key={session.id} className="flex flex-col gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                        <BrainCircuit size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-white">
                          {session.duration} min
                          {session.planned_duration ? ` of ${session.planned_duration} min planned` : ""}
                        </p>
                        <p className="text-sm text-zinc-300">{task?.title ?? "Unassigned focus"}</p>
                        <p className="text-xs text-zinc-500">
                          {format(new Date(session.start_time), "MMM d, yyyy · h:mm a")} – {format(new Date(session.end_time), "h:mm a")}
                        </p>
                      </div>
                    </div>
                    <div
                      className="flex w-fit items-center gap-1 rounded-full border border-[var(--surface-border)] bg-zinc-900 px-3 py-1 text-xs font-semibold"
                      style={{ color: project?.color ?? "#a1a1aa" }}
                    >
                      <FolderKanban size={12} />
                      <span>{project?.name ?? "Misc."}</span>
                    </div>
                  </article>
                )
              })}
            </div>
            {visibleHistoryCount < sessions.length && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleHistoryCount((count) => count + HISTORY_PAGE_SIZE)}
                  className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-bold text-zinc-200 hover:border-[var(--color-primary)]"
                >
                  Load 5 more
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {isManualEntryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="manual-focus-title">
          <div className="w-full max-w-md rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-2xl">
            <h2 id="manual-focus-title" className="flex items-center gap-2 text-2xl font-bold">
              <PlusCircle />
              Add focus time
            </h2>
            <p className="mt-2 text-sm text-zinc-400">Record a focus block you completed away from the timer.</p>
            <form onSubmit={saveManualEntry} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-400">Task *</span>
                <select
                  required
                  value={manualTaskId}
                  onChange={(event) => setManualTaskId(event.target.value)}
                  className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-2.5 text-white focus:border-[var(--color-primary)] focus:outline-none"
                >
                  <option value="">Select a task</option>
                  {[...tasks].sort((a, b) => a.title.localeCompare(b.title)).map((task) => {
                    const project = projects.find((item) => item.id === task.project_id)
                    return <option key={task.id} value={task.id}>{task.title} · {project?.name ?? "Misc."}</option>
                  })}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-400">Started at *</span>
                <input
                  required
                  type="datetime-local"
                  max={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                  value={manualStartedAt}
                  onChange={(event) => setManualStartedAt(event.target.value)}
                  className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-2.5 text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-400">Focus duration (minutes) *</span>
                <input
                  required
                  type="number"
                  min="1"
                  max="1440"
                  value={manualDuration}
                  onChange={(event) => setManualDuration(event.target.value)}
                  className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-2.5 text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
              </label>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsManualEntryOpen(false)} className="rounded-lg px-4 py-2 font-semibold text-zinc-400 hover:text-white">Cancel</button>
                <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-6 py-2 font-bold text-white hover:opacity-90">Save focus time</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="timer-settings-title">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-2xl">
            <h2 id="timer-settings-title" className="mb-6 flex items-center gap-2 text-2xl font-bold">
              <Settings2 />
              Timer settings
            </h2>
            <form onSubmit={saveSettings} className="space-y-4">
              {[
                ["Focus time", focusInput, setFocusInput],
                ["Short break", shortInput, setShortInput],
                ["Long break", longInput, setLongInput],
              ].map(([label, value, setter]) => (
                <label key={label as string} className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-400">{label as string} (minutes)</span>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    required
                    value={value as string}
                    onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)}
                    className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-2 text-white focus:border-[var(--color-primary)] focus:outline-none"
                  />
                </label>
              ))}
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsSettingsOpen(false)} className="rounded-lg px-4 py-2 font-semibold text-zinc-400 hover:text-white">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-6 py-2 font-bold text-white hover:opacity-90">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
