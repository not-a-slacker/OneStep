import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { notifyPeriodComplete, playAlarm, stopAlarm } from '@/lib/alarm'
import { startTicker } from '@/lib/ticker'
import { useProjectStore } from '@/store/projectStore'
import { useTaskStore } from '@/store/taskStore'
import { useAuthStore } from '@/store/authStore'

export type PomodoroMode = 'focus' | 'shortBreak' | 'longBreak'

export interface PomodoroSession {
  id: string
  user_id: string
  project_id: string
  task_id: string | null
  duration: number
  planned_duration: number
  start_time: string
  end_time: string
  // True for entries logged by hand rather than recorded by the timer. Manual
  // entries earn focus minutes but not the completed-session bonus (B-20).
  is_manual: boolean
  // What the user wrote about the session, and their estimate of how far along
  // the task is afterwards (0-100). Both optional; neither affects XP.
  progress_note: string | null
  progress_percent: number | null
}

export const PROGRESS_NOTE_MAX_LENGTH = 2000

export interface SessionEditInput {
  taskId: string | null
  projectId: string | null
  /** datetime-local value, e.g. 2026-11-26T09:30 */
  startedAt: string
  durationMinutes: number
  note: string
  percent: number | null
}

export interface ManualFocusSessionInput {
  taskId: string | null
  projectId: string | null
  durationMinutes: number
  startedAt: string
}

interface TimerSnapshot {
  timeRemaining: number
  isActive: boolean
  mode: PomodoroMode
  focusDuration: number
  shortBreakDuration: number
  longBreakDuration: number
  sessionsCompleted: number
  startTime: string | null
  currentTaskId: string | null
  currentProjectId: string | null
  currentSessionDbId: string | null
  targetEndTime: number | null
}

interface PomodoroState {
  sessions: PomodoroSession[]
  loading: boolean
  error: string | null
  hydrated: boolean
  timeRemaining: number
  isActive: boolean
  mode: PomodoroMode
  focusDuration: number
  shortBreakDuration: number
  longBreakDuration: number
  sessionsCompleted: number
  startTime: Date | null
  currentTaskId: string | null
  currentProjectId: string | null
  currentSessionDbId: string | null
  targetEndTime: number | null
  periodMessage: string | null
  alarmRinging: boolean
  fetchSessions: () => Promise<void>
  addManualSession: (input: ManualFocusSessionInput) => Promise<boolean>
  /**
   * Edits a past session: its task or project, start time, length, progress
   * note and task-progress estimate (null clears it). The session the timer is
   * still writing to only accepts note and estimate changes.
   */
  updateSession: (sessionId: string, input: SessionEditInput) => Promise<boolean>
  /** Permanently deletes a session that the timer is not using. */
  deleteSession: (sessionId: string) => Promise<boolean>
  hydrateTimer: () => void
  updateSettings: (focus: number, short: number, long: number) => void
  setMode: (mode: PomodoroMode) => void
  setTask: (taskId: string | null) => Promise<void>
  startTimer: () => Promise<boolean>
  pauseTimer: () => Promise<void>
  resetTimer: () => Promise<void>
  tick: () => void
  completeSession: () => Promise<PomodoroMode>
  clearError: () => void
  /** Silences the alarm and hides the completion message. */
  dismissPeriodMessage: () => void
}

const TIMER_STORAGE_KEY = 'onestep-pomodoro-timer-v2'

/**
 * The countdown lives at module scope so it keeps running while the user
 * navigates away from /pomodoro. It used to be a setInterval inside the page
 * component, so leaving the page stopped the clock, the alarm, and the write
 * that records the session's duration (ROADMAP B-1).
 */
let stopTicker: (() => void) | null = null
let completionInProgress = false

/** Timer sessions run to their planned length; drives the long-break cadence. */
function countCompletedSessions(sessions: PomodoroSession[]): number {
  return sessions.filter((session) => (
    !session.is_manual
    && session.planned_duration > 0
    && session.duration >= session.planned_duration
  )).length
}

function sortByStartDesc(sessions: PomodoroSession[]): PomodoroSession[] {
  return [...sessions].sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
}

/** A timestamp as a datetime-local value, the form the edit dialog uses. */
function toLocalMinute(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function persistTimer(state: PomodoroState) {
  if (typeof window === 'undefined') return
  const snapshot: TimerSnapshot = {
    timeRemaining: state.timeRemaining,
    isActive: state.isActive,
    mode: state.mode,
    focusDuration: state.focusDuration,
    shortBreakDuration: state.shortBreakDuration,
    longBreakDuration: state.longBreakDuration,
    sessionsCompleted: state.sessionsCompleted,
    startTime: state.startTime?.toISOString() ?? null,
    currentTaskId: state.currentTaskId,
    currentProjectId: state.currentProjectId,
    currentSessionDbId: state.currentSessionDbId,
    targetEndTime: state.targetEndTime,
  }
  window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(snapshot))
}

function clearPersistedTimer() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(TIMER_STORAGE_KEY)
  }
}

export const usePomodoroStore = create<PomodoroState>((set, get) => {
  const stopTicking = () => {
    stopTicker?.()
    stopTicker = null
  }

  const startTicking = () => {
    if (typeof window === 'undefined' || stopTicker) return
    stopTicker = startTicker(() => get().tick())
  }

  // The completion message stays up until dismissed or the next period starts,
  // so someone returning after the alarm has stopped still sees what happened.
  const announceCompletion = (completedMode: PomodoroMode) => {
    const message = notifyPeriodComplete(completedMode, () => get().dismissPeriodMessage())
    set({ periodMessage: message, alarmRinging: true })
    void playAlarm(() => set({ alarmRinging: false })).then((started) => {
      if (!started) set({ alarmRinging: false })
    })
  }

  const silence = () => {
    stopAlarm()
    set({ periodMessage: null, alarmRinging: false })
  }

  return {
    sessions: [],
    loading: false,
    error: null,
    hydrated: false,
    timeRemaining: 25 * 60,
    isActive: false,
    mode: 'focus',
    focusDuration: 25 * 60,
    shortBreakDuration: 5 * 60,
    longBreakDuration: 15 * 60,
    sessionsCompleted: 0,
    startTime: null,
    currentTaskId: null,
    currentProjectId: null,
    currentSessionDbId: null,
    targetEndTime: null,
    periodMessage: null,
    alarmRinging: false,

    clearError: () => set({ error: null }),

    dismissPeriodMessage: () => silence(),

    fetchSessions: async () => {
      set({ loading: true, error: null })
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        set({ loading: false })
        return
      }

      const { data, error } = await supabase
        .from('pomodoro_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('start_time', { ascending: false })

      const sessions = error ? get().sessions : data as PomodoroSession[]
      set({
        sessions,
        sessionsCompleted: countCompletedSessions(sessions),
        loading: false,
        error: error?.message ?? null,
      })
    },

    addManualSession: async ({ taskId, projectId, durationMinutes, startedAt }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false

      const task = taskId
        ? useTaskStore.getState().tasks.find((item) => item.id === taskId)
        : null
      const project = task
        ? useProjectStore.getState().projects.find((item) => item.id === task.project_id)
        : useProjectStore.getState().projects.find((item) => item.id === projectId)
      if ((taskId && !task) || !project) {
        set({ error: 'Select a valid open task or project for the manual focus entry.' })
        return false
      }

      const duration = Math.round(durationMinutes)
      const start = new Date(startedAt)
      if (!Number.isFinite(duration) || duration < 1 || Number.isNaN(start.getTime())) {
        set({ error: 'Enter a valid start time and focus duration.' })
        return false
      }

      // Mirror the database limits so the user gets a readable message instead
      // of a raised exception (see supabase/milestone_1_integrity.sql, S-2).
      if (duration > 1440) {
        set({ error: 'A single focus entry cannot be longer than 24 hours (1440 minutes).' })
        return false
      }
      if (start.getTime() > Date.now() + 60_000) {
        set({ error: 'Focus time cannot be logged with a start time in the future.' })
        return false
      }

      const end = new Date(start.getTime() + duration * 60 * 1000)
      const { data, error } = await supabase
        .from('pomodoro_sessions')
        .insert([{
          user_id: user.id,
          task_id: task?.id ?? null,
          project_id: project.id,
          duration,
          planned_duration: duration,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          // Requires supabase/milestone_2_xp_fixes.sql.
          is_manual: true,
        }])
        .select()
        .single()

      if (error || !data) {
        set({ error: error?.message ?? 'Unable to add manual focus time.' })
        return false
      }

      const session = data as PomodoroSession
      set((state) => ({
        sessions: [session, ...state.sessions]
          .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()),
        // sessionsCompleted is deliberately left alone: it drives the "long
        // break after every fourth session" cadence, and logging past focus
        // time should not shift it (B-2).
        error: null,
      }))
      await useAuthStore.getState().refreshProfile()
      return true
    },

    updateSession: async (sessionId, input) => {
      const original = get().sessions.find((session) => session.id === sessionId)
      if (!original) {
        set({ error: 'That session no longer exists. Refresh the page and try again.' })
        return false
      }

      const note = input.note.trim()
      if (note.length > PROGRESS_NOTE_MAX_LENGTH) {
        set({ error: `Progress notes are limited to ${PROGRESS_NOTE_MAX_LENGTH} characters.` })
        return false
      }
      const percent = input.taskId ? input.percent : null
      if (percent !== null && (!Number.isInteger(percent) || percent < 0 || percent > 100)) {
        set({ error: 'Progress must be a whole number from 0 to 100.' })
        return false
      }

      // Requires supabase/milestone_2_session_progress.sql.
      const patch: Record<string, unknown> = { progress_note: note || null, progress_percent: percent }

      // The timer still writes duration and end time to its current session,
      // so only the note and estimate may change until it finishes or resets.
      if (sessionId !== get().currentSessionDbId) {
        const task = input.taskId
          ? useTaskStore.getState().tasks.find((item) => item.id === input.taskId)
          : null
        const project = task
          ? useProjectStore.getState().projects.find((item) => item.id === task.project_id)
          : useProjectStore.getState().projects.find((item) => item.id === input.projectId)
        if ((input.taskId && !task) || !project) {
          set({ error: 'Select a valid task or project for this session.' })
          return false
        }

        const duration = Math.round(input.durationMinutes)
        const start = new Date(input.startedAt)
        if (!Number.isFinite(duration) || duration < 0 || Number.isNaN(start.getTime())) {
          set({ error: 'Enter a valid start time and focus duration.' })
          return false
        }
        // Same limits as the database (supabase/milestone_1_integrity.sql, S-2).
        if (duration > 1440) {
          set({ error: 'A single focus session cannot be longer than 24 hours (1440 minutes).' })
          return false
        }
        if (start.getTime() > Date.now() + 60_000) {
          set({ error: 'A focus session cannot start in the future.' })
          return false
        }

        if ((task?.id ?? null) !== original.task_id || project.id !== original.project_id) {
          patch.task_id = task?.id ?? null
          patch.project_id = project.id
        }

        // The form works to the minute. Leave the stored timestamps alone unless
        // the start or the length actually changed, so opening and saving a
        // timer session does not round its times.
        const startChanged = input.startedAt !== toLocalMinute(original.start_time)
        if (startChanged || duration !== original.duration) {
          const startTime = startChanged ? start : new Date(original.start_time)
          patch.start_time = startTime.toISOString()
          patch.end_time = new Date(startTime.getTime() + duration * 60_000).toISOString()
          patch.duration = duration
          // A manual entry's plan is its own length (it never earns the
          // completed-session bonus); a timer session keeps the length it was
          // started with, so shortening it removes the bonus.
          if (original.is_manual) patch.planned_duration = Math.max(1, duration)
        }
      }

      const { data, error } = await supabase
        .from('pomodoro_sessions')
        .update(patch)
        .eq('id', sessionId)
        .select()
        .single()

      if (error || !data) {
        set({ error: error?.message ?? 'Unable to save this session.' })
        return false
      }

      const updated = data as PomodoroSession
      const sessions = sortByStartDesc(get().sessions.map((session) => (session.id === updated.id ? updated : session)))
      set({ sessions, sessionsCompleted: countCompletedSessions(sessions), error: null })
      await useAuthStore.getState().refreshProfile()
      return true
    },

    deleteSession: async (sessionId) => {
      if (sessionId === get().currentSessionDbId) {
        set({ error: 'This session is still on the timer. Reset the timer before deleting it.' })
        return false
      }

      const { error } = await supabase
        .from('pomodoro_sessions')
        .delete()
        .eq('id', sessionId)

      if (error) {
        set({ error: error.message })
        return false
      }

      const sessions = get().sessions.filter((session) => session.id !== sessionId)
      set({ sessions, sessionsCompleted: countCompletedSessions(sessions), error: null })
      await useAuthStore.getState().refreshProfile()
      return true
    },

    hydrateTimer: () => {
      if (typeof window === 'undefined' || get().hydrated) return
      const serialized = window.localStorage.getItem(TIMER_STORAGE_KEY)
      if (!serialized) {
        set({ hydrated: true })
        return
      }

      try {
        const snapshot = JSON.parse(serialized) as TimerSnapshot
        const remaining = snapshot.isActive && snapshot.targetEndTime
          ? Math.max(0, Math.ceil((snapshot.targetEndTime - Date.now()) / 1000))
          : snapshot.timeRemaining
        set({
          ...snapshot,
          timeRemaining: remaining,
          startTime: snapshot.startTime ? new Date(snapshot.startTime) : null,
          hydrated: true,
        })

        // Resume the countdown for a session that was running when the tab was
        // closed. tick() finishes it immediately if its target time has passed.
        if (snapshot.isActive) {
          startTicking()
          get().tick()
        }
      } catch {
        clearPersistedTimer()
        set({ hydrated: true })
      }
    },

    updateSettings: (focus, short, long) => {
      set((state) => ({
        focusDuration: focus * 60,
        shortBreakDuration: short * 60,
        longBreakDuration: long * 60,
        timeRemaining: state.mode === 'focus'
          ? focus * 60
          : state.mode === 'shortBreak'
            ? short * 60
            : long * 60,
      }))
      persistTimer(get())
    },

    setMode: (mode) => {
      stopTicking()
      silence()
      set((state) => ({
        mode,
        isActive: false,
        startTime: null,
        currentSessionDbId: null,
        targetEndTime: null,
        timeRemaining: mode === 'focus'
          ? state.focusDuration
          : mode === 'shortBreak'
            ? state.shortBreakDuration
            : state.longBreakDuration,
      }))
      persistTimer(get())
    },

    setTask: async (taskId) => {
      if (taskId) {
        const task = useTaskStore.getState().tasks.find((item) => item.id === taskId)
        set({ currentTaskId: taskId, currentProjectId: task?.project_id ?? null })
      } else {
        const misc = await useProjectStore.getState().ensureMiscProject()
        set({ currentTaskId: null, currentProjectId: misc?.id ?? null })
      }
      persistTimer(get())
    },

    startTimer: async () => {
      silence()
      const state = get()
      let projectId = state.currentProjectId
      let taskId = state.currentTaskId

      if (taskId) {
        const task = useTaskStore.getState().tasks.find((item) => item.id === taskId)
        projectId = task?.project_id ?? null
        if (!task) taskId = null
      }
      if (!projectId) {
        projectId = (await useProjectStore.getState().ensureMiscProject())?.id ?? null
      }
      if (!projectId) {
        set({ error: 'Unable to resolve a project for this focus session.' })
        return false
      }

      if (state.mode === 'focus' && !state.currentSessionDbId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return false

        const now = new Date().toISOString()
        const plannedDuration = Math.max(1, Math.ceil(state.focusDuration / 60))
        const { data, error } = await supabase
          .from('pomodoro_sessions')
          .insert([{
            user_id: user.id,
            task_id: taskId,
            project_id: projectId,
            duration: 0,
            planned_duration: plannedDuration,
            start_time: now,
            end_time: now,
          }])
          .select()
          .single()

        if (error || !data) {
          set({ error: error?.message ?? 'Unable to start focus session.' })
          return false
        }

        set((current) => ({
          sessions: [data as PomodoroSession, ...current.sessions],
          currentSessionDbId: data.id,
        }))
      }

      set((current) => ({
        isActive: true,
        error: null,
        periodMessage: null,
        currentTaskId: taskId,
        currentProjectId: projectId,
        startTime: current.startTime ?? new Date(),
        targetEndTime: Date.now() + current.timeRemaining * 1000,
      }))
      startTicking()
      persistTimer(get())
      return true
    },

    pauseTimer: async () => {
      const state = get()
      stopTicking()
      set({ isActive: false, targetEndTime: null })

      if (state.mode === 'focus' && state.currentSessionDbId) {
        const spentSeconds = Math.max(0, state.focusDuration - state.timeRemaining)
        const durationMinutes = Math.floor(spentSeconds / 60)
        const { data, error } = await supabase
          .from('pomodoro_sessions')
          .update({ duration: durationMinutes, end_time: new Date().toISOString() })
          .eq('id', state.currentSessionDbId)
          .select()
          .single()

        if (error) {
          set({ error: error.message })
        } else if (data) {
          set((current) => ({
            sessions: current.sessions.map((session) => (
              session.id === state.currentSessionDbId ? data as PomodoroSession : session
            )),
          }))
          await useAuthStore.getState().refreshProfile()
        }
      }
      persistTimer(get())
    },

    resetTimer: async () => {
      const state = get()
      stopTicking()
      silence()
      if (state.mode === 'focus' && state.currentSessionDbId) {
        const spentSeconds = Math.max(0, state.focusDuration - state.timeRemaining)
        await supabase
          .from('pomodoro_sessions')
          .update({
            duration: Math.floor(spentSeconds / 60),
            end_time: new Date().toISOString(),
          })
          .eq('id', state.currentSessionDbId)
        await useAuthStore.getState().refreshProfile()
      }

      set((current) => ({
        isActive: false,
        timeRemaining: current.mode === 'focus'
          ? current.focusDuration
          : current.mode === 'shortBreak'
            ? current.shortBreakDuration
            : current.longBreakDuration,
        startTime: null,
        currentSessionDbId: null,
        targetEndTime: null,
      }))
      persistTimer(get())
    },

    tick: () => {
      const state = get()
      if (!state.isActive || !state.targetEndTime) {
        stopTicking()
        return
      }

      const remaining = Math.max(0, Math.ceil((state.targetEndTime - Date.now()) / 1000))
      set({ timeRemaining: remaining })

      if (remaining === 0) {
        void get().completeSession()
      }
    },

    completeSession: async () => {
      const state = get()
      const completedMode = state.mode

      // Stop immediately so a re-entrant tick cannot complete the same period twice.
      if (completionInProgress) return completedMode
      completionInProgress = true
      stopTicking()
      set({ isActive: false, targetEndTime: null })

      // Alarm and notification are fired from the store, not the page, so they
      // still reach the user when the period ends on another route. They go
      // first so a slow network write cannot delay them.
      announceCompletion(completedMode)

      try {
        if (completedMode === 'focus' && state.currentSessionDbId) {
          const durationMinutes = Math.max(1, Math.ceil(state.focusDuration / 60))
          const { data, error } = await supabase
            .from('pomodoro_sessions')
            .update({ duration: durationMinutes, end_time: new Date().toISOString() })
            .eq('id', state.currentSessionDbId)
            .select()
            .single()

          if (error) {
            set({ error: error.message })
          } else if (data) {
            set((current) => ({
              sessions: current.sessions.map((session) => (
                session.id === state.currentSessionDbId ? data as PomodoroSession : session
              )),
            }))
            await useAuthStore.getState().refreshProfile()
          }
        }

        if (completedMode === 'focus') {
          const completedCount = state.sessionsCompleted + 1
          set({
            sessionsCompleted: completedCount,
            mode: completedCount % 4 === 0 ? 'longBreak' : 'shortBreak',
            timeRemaining: completedCount % 4 === 0
              ? state.longBreakDuration
              : state.shortBreakDuration,
            currentSessionDbId: null,
            startTime: null,
          })
        } else {
          set({
            mode: 'focus',
            timeRemaining: state.focusDuration,
            currentSessionDbId: null,
            startTime: null,
          })
        }

        persistTimer(get())
        return completedMode
      } finally {
        completionInProgress = false
      }
    },
  }
})
