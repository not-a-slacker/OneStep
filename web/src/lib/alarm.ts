/**
 * Timer alarm and completion notification.
 *
 * These live at module scope rather than in a React ref so that a focus period
 * can finish, sound, and notify while the user is on another route. The page
 * component used to own the AudioContext, which meant leaving /pomodoro silently
 * killed the alarm along with the countdown (ROADMAP B-1).
 */

import type { PomodoroMode } from '@/store/pomodoroStore'

/** How long the alarm rings if nobody stops it. */
export const ALARM_DURATION_SECONDS = 150
/** One three-tone chime, then silence, repeated. */
const CHIME_PERIOD_SECONDS = 2

let audioContext: AudioContext | null = null
let ringing: { master: GainNode; oscillators: OscillatorNode[] } | null = null
let notification: Notification | null = null

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
    await audioContext.resume().catch(() => undefined)
  }
}

/**
 * A timer restored after a reload has no Start click to unlock audio, so the
 * first click or key press anywhere on the page unlocks it instead.
 */
export function unlockAlarmOnFirstInteraction(): () => void {
  if (typeof window === 'undefined') return () => undefined
  const unlock = () => {
    void unlockAlarm()
    remove()
  }
  const remove = () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  return remove
}

/**
 * Rings for ALARM_DURATION_SECONDS or until stopAlarm(). Every chime is
 * scheduled up front on the audio clock, so a throttled background tab cannot
 * delay or cut it short. Resolves false when audio is still locked (no click
 * since the page loaded), in which case only the notification reaches the user.
 */
export async function playAlarm(onFinished?: () => void): Promise<boolean> {
  stopSound()
  await unlockAlarm()
  const context = audioContext
  if (!context || context.state !== 'running') return false

  const master = context.createGain()
  master.connect(context.destination)
  const oscillators: OscillatorNode[] = []
  const first = context.currentTime + 0.05
  const chimes = Math.floor(ALARM_DURATION_SECONDS / CHIME_PERIOD_SECONDS)

  for (let chime = 0; chime < chimes; chime += 1) {
    const chimeStart = first + chime * CHIME_PERIOD_SECONDS
    ;[0, 0.32, 0.64].forEach((offset, index) => {
      const at = chimeStart + offset
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = index === 2 ? 'sine' : 'triangle'
      oscillator.frequency.setValueAtTime(index === 2 ? 1046 : 880, at)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.28, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24)
      oscillator.connect(gain)
      gain.connect(master)
      oscillator.start(at)
      oscillator.stop(at + 0.25)
      oscillators.push(oscillator)
    })
  }

  const current = { master, oscillators }
  ringing = current
  // onended fires on the audio thread's schedule, so it is not throttled either.
  oscillators[oscillators.length - 1].onended = () => {
    if (ringing !== current) return
    ringing = null
    master.disconnect()
    onFinished?.()
  }
  return true
}

function stopSound(): void {
  if (!ringing) return
  const { master, oscillators } = ringing
  ringing = null
  oscillators.forEach((oscillator) => {
    oscillator.onended = null
    try {
      oscillator.stop()
    } catch {
      // Already stopped.
    }
  })
  master.disconnect()
}

/** Silences the alarm and clears the completion notification. */
export function stopAlarm(): void {
  stopSound()
  notification?.close()
  notification = null
}

/**
 * Shows a system notification and returns the equivalent text for the in-page
 * banner, so the user still sees the result if notifications are denied.
 *
 * The notification stays on screen until it is clicked or closed
 * (requireInteraction), and clicking it brings the tab forward and silences the
 * alarm. It is visual, so it reaches a user whose sound is muted; operating
 * system do-not-disturb modes can still hold it back.
 */
export function notifyPeriodComplete(completedMode: PomodoroMode, onClick?: () => void): string {
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
    try {
      notification?.close()
      const shown = new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'onestep-timer',
        requireInteraction: true,
      })
      shown.onclick = () => {
        window.focus()
        shown.close()
        onClick?.()
      }
      shown.onclose = () => {
        if (notification === shown) notification = null
      }
      notification = shown
    } catch {
      // Chrome on Android only allows notifications from a service worker,
      // which this app does not register yet. The in-page banner still shows.
    }
  }

  return `${title}. ${body}`
}

export async function requestNotificationPermission(): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}
