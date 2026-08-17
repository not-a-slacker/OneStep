"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { useAuthStore, type Profile } from "@/store/authStore"

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { authReady, setUser, setProfile, setAuthReady } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    let active = true

    const applySession = async (session: Session | null) => {
      if (!active) return
      if (!session?.user) {
        setUser(null)
        setProfile(null)
        setAuthReady(true)
        if (pathname !== "/login") router.replace("/login")
        return
      }

      setUser(session.user)
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single()
      if (!active) return
      setProfile((profile as Profile | null) ?? null)
      setAuthReady(true)
      if (pathname === "/login") router.replace("/")
    }

    void supabase.auth.getSession().then(({ data }) => applySession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [pathname, router, setAuthReady, setProfile, setUser])

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--surface-border)] border-t-[var(--color-primary)]" aria-label="Loading session" />
      </div>
    )
  }

  return <>{children}</>
}
