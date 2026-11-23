"use client"

import { BellOff, BellRing, X } from "lucide-react"
import { usePomodoroStore } from "@/store/pomodoroStore"

/**
 * Shown on every dashboard route when a timer period ends, because the alarm
 * keeps ringing for a couple of minutes and has to be stoppable from wherever
 * the user is, not only from /pomodoro.
 */
export default function TimerAlarmBanner() {
  const periodMessage = usePomodoroStore((state) => state.periodMessage)
  const alarmRinging = usePomodoroStore((state) => state.alarmRinging)
  const dismissPeriodMessage = usePomodoroStore((state) => state.dismissPeriodMessage)

  if (!periodMessage) return null

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-emerald-500/40 bg-zinc-950/95 p-4 text-emerald-100 shadow-2xl shadow-black/50 backdrop-blur sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      <BellRing size={20} className={`shrink-0 text-emerald-400 ${alarmRinging ? "animate-pulse" : ""}`} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">{periodMessage}</p>
      {alarmRinging ? (
        <button
          type="button"
          onClick={dismissPeriodMessage}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-zinc-950 hover:bg-emerald-400"
        >
          <BellOff size={16} aria-hidden="true" />
          Stop alarm
        </button>
      ) : (
        <button
          type="button"
          onClick={dismissPeriodMessage}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
