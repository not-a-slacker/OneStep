import { create } from 'zustand'
import {
  differenceInCalendarDays,
  format,
  parseISO,
  startOfWeek,
  subWeeks,
} from 'date-fns'
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

function calculateDailyStreak(logs: HabitLog[]) {
  const dates = [...new Set(logs.map((log) => log.completed_at))].sort()
  if (!dates.length) return { current: 0, longest: 0 }

  let longest = 1
  let run = 1
  for (let index = 1; index < dates.length; index += 1) {
    const difference = differenceInCalendarDays(parseISO(dates[index]), parseISO(dates[index - 1]))
    run = difference === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
  }

  const today = new Date()
  const lastDate = parseISO(dates[dates.length - 1])
  const distanceFromToday = differenceInCalendarDays(today, lastDate)
  if (distanceFromToday > 1) return { current: 0, longest }

  let current = 1
  for (let index = dates.length - 1; index > 0; index -= 1) {
    if (differenceInCalendarDays(parseISO(dates[index]), parseISO(dates[index - 1])) !== 1) break
    current += 1
  }
  return { current, longest }
}

function calculateWeeklyStreak(habit: Habit, logs: HabitLog[]) {
  const target = habit.frequency === 'weekly' ? 1 : habit.target_days_per_week
  const counts = new Map<string, number>()
  logs.forEach((log) => {
    const week = format(startOfWeek(parseISO(log.completed_at), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    counts.set(week, (counts.get(week) ?? 0) + 1)
  })

  const successfulWeeks = [...counts.entries()]
    .filter(([, count]) => count >= target)
    .map(([week]) => week)
    .sort()

  if (!successfulWeeks.length) return { current: 0, longest: 0 }

  let longest = 1
  let run = 1
  for (let index = 1; index < successfulWeeks.length; index += 1) {
    const difference = differenceInCalendarDays(
      parseISO(successfulWeeks[index]),
      parseISO(successfulWeeks[index - 1]),
    )
    run = difference === 7 ? run + 1 : 1
    longest = Math.max(longest, run)
  }

  const currentWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const previousWeek = format(subWeeks(parseISO(currentWeek), 1), 'yyyy-MM-dd')
  const anchor = counts.get(currentWeek) && (counts.get(currentWeek) ?? 0) >= target
    ? currentWeek
    : previousWeek

  if ((counts.get(anchor) ?? 0) < target) return { current: 0, longest }

  let current = 0
  let cursor = parseISO(anchor)
  while ((counts.get(format(cursor, 'yyyy-MM-dd')) ?? 0) >= target) {
    current += 1
    cursor = subWeeks(cursor, 1)
  }
  return { current, longest }
}

function calculateStreak(habit: Habit, logs: HabitLog[]) {
  return habit.frequency === 'daily'
    ? calculateDailyStreak(logs)
    : calculateWeeklyStreak(habit, logs)
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

    const streak = calculateStreak(habit, nextLogs)
    const longestStreak = Math.max(habit.longest_streak, streak.longest)
    const { error: streakError } = await supabase
      .from('habits')
      .update({ current_streak: streak.current, longest_streak: longestStreak })
      .eq('id', habitId)
      .eq('user_id', user.id)

    if (streakError) {
      set({ error: streakError.message })
      return false
    }

    set((state) => ({
      habits: state.habits.map((item) => item.id === habitId
        ? { ...item, current_streak: streak.current, longest_streak: longestStreak }
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
