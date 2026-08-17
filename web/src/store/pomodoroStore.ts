import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
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
  fetchSessions: () => Promise<void>
  addManualSession: (input: ManualFocusSessionInput) => Promise<boolean>
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
}

const TIMER_STORAGE_KEY = 'onestep-pomodoro-timer-v2'

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

export const usePomodoroStore = create<PomodoroState>((set, get) => ({
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

  clearError: () => set({ error: null }),

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
      sessionsCompleted: sessions.filter((session) => (
        session.planned_duration > 0 && session.duration >= session.planned_duration
      )).length,
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
      sessionsCompleted: state.sessionsCompleted + 1,
      error: null,
    }))
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
      currentTaskId: taskId,
      currentProjectId: projectId,
      startTime: current.startTime ?? new Date(),
      targetEndTime: Date.now() + current.timeRemaining * 1000,
    }))
    persistTimer(get())
    return true
  },

  pauseTimer: async () => {
    const state = get()
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
    if (!state.isActive || !state.targetEndTime) return
    set({ timeRemaining: Math.max(0, Math.ceil((state.targetEndTime - Date.now()) / 1000)) })
  },

  completeSession: async () => {
    const state = get()
    const completedMode = state.mode

    // Stop immediately so React effects cannot complete the same period twice.
    set({ isActive: false, targetEndTime: null })

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
  },
}))
