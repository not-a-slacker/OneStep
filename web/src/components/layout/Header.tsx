"use client"

import { useEffect, useMemo, useState } from "react"
import { LogOut, Menu, User } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuthStore } from "@/store/authStore"
import { calculateGamification, levelProgress } from "@/lib/gamification"
import { useTaskStore } from "@/store/taskStore"
import { usePomodoroStore } from "@/store/pomodoroStore"
import { useHabitStore } from "@/store/habitStore"

export default function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const profile = useAuthStore((state) => state.profile)
  const { tasks, fetchTasks } = useTaskStore()
  const { sessions, fetchSessions } = usePomodoroStore()
  const { habits, logs, fetchHabits } = useHabitStore()
  const [progressReady, setProgressReady] = useState(false)

  useEffect(() => {
    let active = true
    void Promise.all([fetchTasks(), fetchSessions(), fetchHabits()]).finally(() => {
      if (active) setProgressReady(true)
    })
    return () => { active = false }
  }, [fetchHabits, fetchSessions, fetchTasks])

  const gamification = useMemo(
    () => calculateGamification(tasks, sessions, habits, logs),
    [habits, logs, sessions, tasks],
  )
  const experience = gamification.totalExperience
  const progress = levelProgress(experience)
  const level = progress.level
  const displayName = profile?.username?.trim() || "User"
  const progressDescription = `${experience} lifetime XP: ${gamification.tasks.experience} from tasks, ${gamification.focus.experience} from focus, and ${gamification.habits.experience} from habits`

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[var(--surface-border)] bg-[var(--surface)]/90 px-4 backdrop-blur-xl sm:px-6">
      <button type="button" aria-label="Open navigation" onClick={onOpenMenu} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white md:hidden">
        <Menu size={22} />
      </button>
      <div className="hidden md:block" />
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-4 py-1.5 sm:flex" title={progressReady ? progressDescription : "Loading player progress"} aria-label={progressReady ? progressDescription : "Loading player progress"}>
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">{progressReady ? `Lvl ${level}` : "Syncing"}</span>
          <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--surface-border)]">
            <div className={`h-full rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-success)] ${progressReady ? "" : "animate-pulse"}`} style={{ width: progressReady ? `${progress.percentage}%` : "35%" }} />
          </div>
          <span className="text-xs text-zinc-400">{progressReady ? `${progress.earnedThisLevel}/${progress.neededThisLevel} XP` : "Loading"}</span>
        </div>
        <div className="hidden text-right lg:block">
          <p className="text-sm font-semibold text-white">{displayName}</p>
          <p className="text-xs text-zinc-500">Productivity profile</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-600 text-white" aria-label={`${displayName} profile`}>
          <User className="h-5 w-5" />
        </div>
        <button type="button" aria-label="Sign out" onClick={() => void supabase.auth.signOut()} className="rounded-full p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-300">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}
