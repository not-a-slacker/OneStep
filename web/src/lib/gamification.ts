import type { Habit, HabitLog } from '@/store/habitStore'
import type { PomodoroSession } from '@/store/pomodoroStore'
import type { Task } from '@/store/taskStore'

export const GAMIFICATION_RULES = {
  taskCompletion: 50,
  taskPriorityBonus: { low: 0, medium: 15, high: 30 },
  beforeDeadlineBonus: 20,
  focusMinute: 1,
  completedFocusSession: 10,
  habitCheckIn: 30,
  sevenDayStreakMilestone: 25,
  levelCurve: 250,
} as const

export function experienceForLevel(level: number) {
  return GAMIFICATION_RULES.levelCurve * Math.max(0, level - 1) ** 2
}

export function levelFromExperience(experience: number) {
  return Math.floor(Math.sqrt(Math.max(0, experience) / GAMIFICATION_RULES.levelCurve)) + 1
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

export interface GamificationSummary {
  totalExperience: number
  level: number
  tasks: { experience: number; completed: number; deadlineBonuses: number }
  focus: { experience: number; minutes: number; completedSessions: number }
  habits: { experience: number; checkIns: number; streakMilestones: number }
  achievements: Array<{
    id: string
    name: string
    description: string
    progress: number
    target: number
    unlocked: boolean
  }>
}

export function calculateGamification(
  tasks: Task[],
  sessions: PomodoroSession[],
  habits: Habit[],
  logs: Record<string, HabitLog[]>,
): GamificationSummary {
  const completedTasks = tasks.filter((task) => task.status === 'completed' && task.completed_at)
  const deadlineBonuses = completedTasks.filter((task) => (
    task.deadline && new Date(task.completed_at as string).getTime() <= new Date(task.deadline).getTime()
  )).length
  const taskExperience = completedTasks.reduce((total, task) => (
    total
      + GAMIFICATION_RULES.taskCompletion
      + GAMIFICATION_RULES.taskPriorityBonus[task.priority]
      + (task.deadline && new Date(task.completed_at as string).getTime() <= new Date(task.deadline).getTime()
        ? GAMIFICATION_RULES.beforeDeadlineBonus
        : 0)
  ), 0)

  const focusMinutes = sessions.reduce((total, session) => total + Math.max(0, session.duration), 0)
  const completedFocusSessions = sessions.filter((session) => (
    session.duration > 0 && session.duration >= session.planned_duration
  )).length
  const focusExperience = focusMinutes * GAMIFICATION_RULES.focusMinute
    + completedFocusSessions * GAMIFICATION_RULES.completedFocusSession

  const allLogs = Object.values(logs).flat()
  const streakMilestones = habits.reduce((total, habit) => total + Math.floor(habit.longest_streak / 7), 0)
  const habitExperience = allLogs.length * GAMIFICATION_RULES.habitCheckIn
    + streakMilestones * GAMIFICATION_RULES.sevenDayStreakMilestone

  const totalExperience = taskExperience + focusExperience + habitExperience
  const longestStreak = habits.reduce((longest, habit) => Math.max(longest, habit.longest_streak), 0)

  const achievementInputs = [
    { id: 'first-task', name: 'First Win', description: 'Complete your first task.', progress: completedTasks.length, target: 1 },
    { id: 'task-crusher', name: 'Task Crusher', description: 'Complete 25 tasks.', progress: completedTasks.length, target: 25 },
    { id: 'deep-worker', name: 'Deep Worker', description: 'Record 10 hours of focus.', progress: focusMinutes, target: 600 },
    { id: 'focus-master', name: 'Focus Master', description: 'Record 50 hours of focus.', progress: focusMinutes, target: 3000 },
    { id: 'habit-builder', name: 'Habit Builder', description: 'Reach a 7-day streak.', progress: longestStreak, target: 7 },
    { id: 'consistency-champion', name: 'Consistency Champion', description: 'Reach a 30-day streak.', progress: longestStreak, target: 30 },
  ]

  return {
    totalExperience,
    level: levelFromExperience(totalExperience),
    tasks: { experience: taskExperience, completed: completedTasks.length, deadlineBonuses },
    focus: { experience: focusExperience, minutes: focusMinutes, completedSessions: completedFocusSessions },
    habits: { experience: habitExperience, checkIns: allLogs.length, streakMilestones },
    achievements: achievementInputs.map((achievement) => ({
      ...achievement,
      unlocked: achievement.progress >= achievement.target,
    })),
  }
}
