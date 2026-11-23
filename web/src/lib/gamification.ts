import type { Profile } from '@/store/authStore'
import type { Habit, HabitLog } from '@/store/habitStore'
import type { PomodoroSession } from '@/store/pomodoroStore'
import type { Task } from '@/store/taskStore'

// XP is calculated only by the database (recalculate_user_gamification in
// supabase/schema.sql) and read here from the profile, so the number on screen
// is the number that is stored (ROADMAP B-19). The browser used to run its own
// copy of the formula, which could drift from the server's.
//
// The level curve is the one piece still repeated here, because the progress
// bar needs the XP at which each level starts. It must match the SQL
// `FLOOR(SQRT(xp / 250)) + 1`.
const LEVEL_CURVE = 250

export function experienceForLevel(level: number) {
  return LEVEL_CURVE * Math.max(0, level - 1) ** 2
}

export function levelFromExperience(experience: number) {
  return Math.floor(Math.sqrt(Math.max(0, experience) / LEVEL_CURVE)) + 1
}

export function levelProgress(experience: number) {
  const level = levelFromExperience(experience)
  const levelStart = experienceForLevel(level)
  const nextLevel = experienceForLevel(level + 1)
  const earnedThisLevel = Math.max(0, experience - levelStart)
  const neededThisLevel = nextLevel - levelStart
  return {
    level,
    levelStart,
    nextLevel,
    earnedThisLevel,
    neededThisLevel,
    percentage: neededThisLevel ? Math.min(100, (earnedThisLevel / neededThisLevel) * 100) : 0,
  }
}

export interface ExperienceBreakdown {
  total: number
  tasks: number
  focus: number
  habits: number
}

/** The server's XP figures, or null while the profile has not loaded. */
export function experienceFromProfile(profile: Profile | null): ExperienceBreakdown | null {
  if (!profile) return null
  return {
    total: profile.experience_points,
    tasks: profile.task_xp ?? 0,
    focus: profile.focus_xp ?? 0,
    habits: profile.habit_xp ?? 0,
  }
}

export interface ActivitySummary {
  tasksCompleted: number
  focusMinutes: number
  habitCheckIns: number
  achievements: Array<{
    id: string
    name: string
    description: string
    progress: number
    target: number
    unlocked: boolean
  }>
}

/** Activity counts and achievements. These award no XP. */
export function summarizeActivity(
  tasks: Task[],
  sessions: PomodoroSession[],
  habits: Habit[],
  logs: Record<string, HabitLog[]>,
): ActivitySummary {
  const tasksCompleted = tasks.filter((task) => task.status === 'completed' && task.completed_at).length
  const focusMinutes = sessions.reduce((total, session) => total + Math.max(0, session.duration), 0)
  const habitCheckIns = Object.values(logs).reduce((total, habitLogs) => total + habitLogs.length, 0)
  const longestStreak = habits.reduce((longest, habit) => Math.max(longest, habit.longest_streak), 0)

  const achievementInputs = [
    { id: 'first-task', name: 'First Win', description: 'Complete your first task.', progress: tasksCompleted, target: 1 },
    { id: 'task-crusher', name: 'Task Crusher', description: 'Complete 25 tasks.', progress: tasksCompleted, target: 25 },
    { id: 'deep-worker', name: 'Deep Worker', description: 'Record 10 hours of focus.', progress: focusMinutes, target: 600 },
    { id: 'focus-master', name: 'Focus Master', description: 'Record 50 hours of focus.', progress: focusMinutes, target: 3000 },
    { id: 'habit-builder', name: 'Habit Builder', description: 'Reach a 7-day streak.', progress: longestStreak, target: 7 },
    { id: 'consistency-champion', name: 'Consistency Champion', description: 'Reach a 30-day streak.', progress: longestStreak, target: 30 },
  ]

  return {
    tasksCompleted,
    focusMinutes,
    habitCheckIns,
    achievements: achievementInputs.map((achievement) => ({
      ...achievement,
      unlocked: achievement.progress >= achievement.target,
    })),
  }
}
