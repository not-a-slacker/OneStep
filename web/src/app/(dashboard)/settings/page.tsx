"use client"

import { useEffect, useState } from "react"
import { Bell, Check, Clock, Save, User } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuthStore, type Profile } from "@/store/authStore"
import { usePomodoroStore } from "@/store/pomodoroStore"

export default function SettingsPage() {
  const { user, profile, setProfile } = useAuthStore()
  const {
    focusDuration,
    shortBreakDuration,
    longBreakDuration,
    updateSettings,
    hydrateTimer,
  } = usePomodoroStore()
  const [username, setUsername] = useState(profile?.username ?? "")
  const [focusMinutes, setFocusMinutes] = useState(Math.round(focusDuration / 60))
  const [shortBreakMinutes, setShortBreakMinutes] = useState(Math.round(shortBreakDuration / 60))
  const [longBreakMinutes, setLongBreakMinutes] = useState(Math.round(longBreakDuration / 60))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    hydrateTimer()
  }, [hydrateTimer])

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return
    setError(null)
    const { data, error: updateError } = await supabase
      .from("profiles")
      .update({ username: username.trim() || null })
      .eq("id", user.id)
      .select()
      .single()
    if (updateError) {
      setError(updateError.message)
      return
    }
    setProfile(data as Profile)
    setMessage("Profile saved.")
  }

  const saveTimer = (event: React.FormEvent) => {
    event.preventDefault()
    updateSettings(focusMinutes, shortBreakMinutes, longBreakMinutes)
    setMessage("Timer defaults saved on this device.")
  }

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      setError("This browser does not support desktop notifications.")
      return
    }
    const permission = await Notification.requestPermission()
    setMessage(permission === "granted" ? "Timer notifications enabled." : "Notification permission was not granted.")
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-zinc-400">Manage your profile, timer defaults, and notification permission.</p>
      </header>

      {(message || error) && (
        <div role="status" className={`flex items-center gap-2 rounded-xl border p-4 ${error ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"}`}>
          <Check size={18} />
          {error ?? message}
        </div>
      )}

      <section className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6">
        <h2 className="mb-5 flex items-center gap-2 text-xl font-bold"><User className="text-[var(--color-primary)]" />Profile</h2>
        <form onSubmit={saveProfile} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-400">Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-400">Email</span>
            <input value={user?.email ?? ""} disabled className={`${inputClass} opacity-60`} />
          </label>
          <button type="submit" className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 font-bold text-white">
            <Save size={18} />Save profile
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6">
        <h2 className="mb-5 flex items-center gap-2 text-xl font-bold"><Clock className="text-[var(--color-primary)]" />Timer defaults</h2>
        <form onSubmit={saveTimer} className="grid gap-4 sm:grid-cols-3">
          <DurationInput label="Focus" value={focusMinutes} onChange={setFocusMinutes} />
          <DurationInput label="Short break" value={shortBreakMinutes} onChange={setShortBreakMinutes} />
          <DurationInput label="Long break" value={longBreakMinutes} onChange={setLongBreakMinutes} />
          <button type="submit" className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 font-bold text-white sm:col-span-3 sm:w-fit">
            <Save size={18} />Save timer defaults
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6">
        <h2 className="mb-2 flex items-center gap-2 text-xl font-bold"><Bell className="text-[var(--color-primary)]" />Timer notifications</h2>
        <p className="mb-5 text-sm text-zinc-400">Permission is requested from a button click so browsers can reliably display completion notifications. An alarm also plays when a focus or break period ends.</p>
        <button type="button" onClick={() => void requestNotifications()} className="rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-5 py-2.5 font-bold text-white hover:border-[var(--color-primary)]">
          Enable notifications
        </button>
      </section>
    </div>
  )
}

const inputClass = "w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-2.5 text-white focus:border-[var(--color-primary)] focus:outline-none"

function DurationInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-400">{label} minutes</span>
      <input type="number" min="1" max="180" value={value} onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || 1)} className={inputClass} />
    </label>
  )
}
