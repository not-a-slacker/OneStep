/**
 * Timer alarm and completion notification.
 *
 * These live at module scope rather than in a React ref so that a focus period
 * can finish, sound, and notify while the user is on another route. The page
 * component used to own the AudioContext, which meant leaving /pomodoro silently
 * killed the alarm along with the countdown (ROADMAP B-1).
 */

import type { PomodoroMode } from '@/store/pomodoroStore'

let audioContext: AudioContext | null = null

/**
 * Must be called from inside a user gesture. Browsers start an AudioContext in
 * the "suspended" state and only allow resuming it during a real interaction,
 * so the Start button calls this before the countdown begins.
 */
export async function unlockAlarm(): Promise<void> {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return

  if (!audioContext) {
    audioContext = new AudioContext()
  }
  if (audioContext.state === 'suspended') {
    await audioContext.resume()
  }
}

export async function playAlarm(): Promise<void> {
  await unlockAlarm()
  const context = audioContext
  if (!context || context.state !== 'running') return

  const start = context.currentTime
  ;[0, 0.32, 0.64].forEach((offset, index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = index === 2 ? 'sine' : 'triangle'
    oscillator.frequency.setValueAtTime(index === 2 ? 1046 : 880, start + offset)
    gain.gain.setValueAtTime(0.0001, start + offset)
    gain.gain.exponentialRampToValueAtTime(0.28, start + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.24)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start + offset)
    oscillator.stop(start + offset + 0.25)
  })
}

/**
 * Fires the desktop notification and returns the equivalent text for the
 * in-page banner, so the user still sees the result if notifications are denied.
 */
export function notifyPeriodComplete(completedMode: PomodoroMode): string {
  const wasFocus = completedMode === 'focus'
  const title = wasFocus ? 'Focus session complete' : 'Break complete'
  const body = wasFocus
    ? 'Great work. Step away for a short break.'
    : 'Your break is over. Ready for the next focus session?'

  if (
    typeof window !== 'undefined'
    && 'Notification' in window
    && Notification.permission === 'granted'
  ) {
    new Notification(title, { body, icon: '/favicon.ico', tag: 'onestep-timer' })
  }

  return `${title}. ${body}`
}

export async function requestNotificationPermission(): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}
