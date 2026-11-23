"use client"

import { useEffect, useState } from "react"
import Sidebar from "@/components/layout/Sidebar"
import Header from "@/components/layout/Header"
import TimerAlarmBanner from "@/components/timer/TimerAlarmBanner"
import { unlockAlarmOnFirstInteraction } from "@/lib/alarm"
import { usePomodoroStore } from "@/store/pomodoroStore"

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const hydrateTimer = usePomodoroStore((state) => state.hydrateTimer)

  // Hydrate at the shell level so a running focus session keeps counting down,
  // finishes, and records its duration on every dashboard route — not only on
  // /pomodoro (ROADMAP B-1).
  useEffect(() => {
    hydrateTimer()
  }, [hydrateTimer])

  // A timer restored after a reload was never started by a click, so audio is
  // still locked; unlock it on the first interaction so its alarm can sound.
  useEffect(() => unlockAlarmOnFirstInteraction(), [])

  return (
    <div className="flex min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        <Header onOpenMenu={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
      <TimerAlarmBanner />
    </div>
  )
}
