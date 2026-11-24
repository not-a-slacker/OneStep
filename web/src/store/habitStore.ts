import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export interface Habit {
  id: string
  user_id: string
  name: string
  frequency: 'daily' | 'weekly' | 'n_times_a_week'
  target_days_per_week: number
  current_streak: number
  longest_streak: number
  display_order: number
  created_at: string
}

export interface HabitLog {
  id: string
  habit_id: string
  user_id: string
  completed_at: string
}

interface HabitState {
  habits: Habit[]
  logs: Record<string, HabitLog[]>
  loading: boolean
  error: string | null
  fetchHabits: () => Promise<void>
  addHabit: (name: string, frequency: Habit['frequency'], targetDays: number) => Promise<boolean>
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<boolean>
  toggleHabitCheckIn: (habitId: string, dateStr: string) => Promise<boolean>
  checkInHabit: (habitId: string, dateStr: string) => Promise<boolean>
  deleteHabit: (habitId: string) => Promise<boolean>
  reorderHabits: (orderedIds: string[]) => Promise<boolean>
  clearError: () => void
}

export const useHabitStore = create<HabitState>((set, get) => ({
  habits: [],
  logs: {},
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchHabits: async () => {
    set({ loading: true, error: null })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      set({ loading: false })
      return
    }

    // Stored streaks only change when a check-in does, so a habit you stopped
    // would keep showing its old current streak. Bring them up to date first
    // (ROADMAP B-23). Best effort: before supabase/milestone_2_streak_bonus.sql
    // is applied the function does not exist, and the stored values are shown.
    await supabase.rpc('refresh_my_habit_streaks').then(() => undefined, () => undefined)

    const [habitResult, logResult] = await Promise.all([
      supabase
        .from('habits')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('habit_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('completed_at', { ascending: true }),
    ])

    if (habitResult.error || logResult.error) {
      set({
        loading: false,
        error: habitResult.error?.message ?? logResult.error?.message ?? 'Unable to load habits.',
      })
      return
    }

    const logsMap: Record<string, HabitLog[]> = {}
    ;(logResult.data as HabitLog[]).forEach((log) => {
      logsMap[log.habit_id] = [...(logsMap[log.habit_id] ?? []), log]
    })

    set({
      habits: habitResult.data as Habit[],
      logs: logsMap,
      loading: false,
    })
  },

  addHabit: async (name, frequency, targetDays) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const nextOrder = get().habits.reduce(
      (maximum, habit) => Math.max(maximum, habit.display_order),
      -1,
    ) + 1

    const { data, error } = await supabase
      .from('habits')
      .insert([{
        name,
        frequency,
        target_days_per_week: targetDays,
        display_order: nextOrder,
        user_id: user.id,
      }])
      .select()
      .single()

    if (error || !data) {
      set({ error: error?.message ?? 'Unable to create habit.' })
      return false
    }

    const habit = data as Habit
    set((state) => ({
      habits: [...state.habits, habit],
      logs: { ...state.logs, [habit.id]: [] },
      error: null,
    }))
    await useAuthStore.getState().refreshProfile()
    return true
  },

  updateHabit: async (id, updates) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await supabase
      .from('habits')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error || !data) {
      set({ error: error?.message ?? 'Unable to update habit.' })
      return false
    }

    set((state) => ({
      habits: state.habits.map((habit) => habit.id === id ? data as Habit : habit),
      error: null,
    }))
    return true
  },

  checkInHabit: async (habitId, dateStr) => {
    const existing = (get().logs[habitId] ?? []).some((log) => log.completed_at === dateStr)
    if (existing) return true
    return get().toggleHabitCheckIn(habitId, dateStr)
  },

  toggleHabitCheckIn: async (habitId, dateStr) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const habit = get().habits.find((item) => item.id === habitId)
    if (!habit) return false

    const existing = (get().logs[habitId] ?? []).find((log) => log.completed_at === dateStr)
    let nextLogs: HabitLog[]

    if (existing) {
      const { error } = await supabase
        .from('habit_logs')
        .delete()
        .eq('id', existing.id)
        .eq('user_id', user.id)
      if (error) {
        set({ error: error.message })
        return false
      }
      nextLogs = (get().logs[habitId] ?? []).filter((log) => log.id !== existing.id)
    } else {
      const { data, error } = await supabase
        .from('habit_logs')
        .insert([{ habit_id: habitId, user_id: user.id, completed_at: dateStr }])
        .select()
        .single()
      if (error || !data) {
        set({ error: error?.message ?? 'Unable to record habit check-in.' })
        return false
      }
      nextLogs = [...(get().logs[habitId] ?? []), data as HabitLog]
    }

    // Streaks are recalculated by a database trigger and the streak columns are
    // no longer writable by the client, so read the authoritative values back
    // instead of computing them here. The old client-side write let any client
    // inflate longest_streak, which feeds the XP formula (ROADMAP S-1), and was
    // monotonic, so undoing a check-in never gave the XP back (B-3).
    // Requires supabase/milestone_1_integrity.sql to have been applied.
    const { data: refreshed, error: refreshError } = await supabase
      .from('habits')
      .select('*')
      .eq('id', habitId)
      .eq('user_id', user.id)
      .single()

    if (refreshError) {
      set({ error: refreshError.message })
      return false
    }

    set((state) => ({
      habits: state.habits.map((item) => item.id === habitId
        ? (refreshed as Habit | null) ?? item
        : item),
      logs: { ...state.logs, [habitId]: nextLogs },
      error: null,
    }))
    await useAuthStore.getState().refreshProfile()
    return true
  },

  reorderHabits: async (orderedIds) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const previous = get().habits
    const byId = new Map(previous.map((habit) => [habit.id, habit]))
    const reordered = orderedIds
      .map((id, displayOrder) => {
        const habit = byId.get(id)
        return habit ? { ...habit, display_order: displayOrder } : null
      })
      .filter((habit): habit is Habit => habit !== null)

    set({ habits: reordered })
    const results = await Promise.all(
      reordered.map((habit) => supabase
        .from('habits')
        .update({ display_order: habit.display_order })
        .eq('id', habit.id)
        .eq('user_id', user.id)),
    )
    const failed = results.find((result) => result.error)
    if (failed?.error) {
      set({ habits: previous, error: failed.error.message })
      return false
    }
    set({ error: null })
    return true
  },

  deleteHabit: async (habitId) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase
      .from('habits')
      .delete()
      .eq('id', habitId)
      .eq('user_id', user.id)

    if (error) {
      set({ error: error.message })
      return false
    }

    const remaining = get().habits.filter((habit) => habit.id !== habitId)
    set((state) => {
      const nextLogs = { ...state.logs }
      delete nextLogs[habitId]
      return { habits: remaining, logs: nextLogs, error: null }
    })
    await get().reorderHabits(remaining.map((habit) => habit.id))
    await useAuthStore.getState().refreshProfile()
    return true
  },
}))
