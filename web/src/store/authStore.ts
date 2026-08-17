import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export interface Profile {
  id: string
  username: string | null
  level: number
  experience_points: number
  avatar_url: string | null
  created_at: string
}

interface AuthState {
  user: User | null
  profile: Profile | null
  authReady: boolean
  setUser: (user: User | null) => void
  setProfile: (profile: Profile | null) => void
  setAuthReady: (ready: boolean) => void
  refreshProfile: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  authReady: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setAuthReady: (authReady) => set({ authReady }),
  refreshProfile: async () => {
    const user = get().user
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    if (data) set({ profile: data as Profile })
  },
}))
