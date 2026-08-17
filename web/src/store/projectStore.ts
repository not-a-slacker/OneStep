import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface Project {
  id: string
  user_id: string
  name: string
  color: string
  estimated_end_date: string | null
  status: 'active' | 'completed'
  is_default: boolean
  created_at: string
}

interface ProjectState {
  projects: Project[]
  loading: boolean
  error: string | null
  fetchProjects: () => Promise<void>
  ensureMiscProject: () => Promise<Project | null>
  addProject: (name: string, color: string, estimatedEndDate: string | null) => Promise<Project | null>
  updateProject: (id: string, updates: Partial<Project>) => Promise<boolean>
  deleteProject: (id: string) => Promise<boolean>
  clearError: () => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchProjects: async () => {
    set({ loading: true, error: null })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      set({ loading: false })
      return
    }

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    set({
      projects: error ? get().projects : (data as Project[]),
      loading: false,
      error: error?.message ?? null,
    })
  },

  ensureMiscProject: async () => {
    const existing = get().projects.find((project) => project.is_default)
    if (existing) return existing

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: fetched } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .maybeSingle()

    if (fetched) {
      const misc = fetched as Project
      set((state) => ({ projects: [misc, ...state.projects.filter((p) => p.id !== misc.id)] }))
      return misc
    }

    const { data, error } = await supabase
      .from('projects')
      .insert([{
        user_id: user.id,
        name: 'Misc.',
        color: '#71717a',
        status: 'active',
        is_default: true,
      }])
      .select()
      .single()

    if (error || !data) {
      set({ error: error?.message ?? 'Unable to create the Misc. project.' })
      return null
    }

    const misc = data as Project
    set((state) => ({ projects: [misc, ...state.projects] }))
    return misc
  },

  addProject: async (name, color, estimatedEndDate) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('projects')
      .insert([{
        name,
        color,
        estimated_end_date: estimatedEndDate,
        user_id: user.id,
        is_default: false,
      }])
      .select()
      .single()

    if (error || !data) {
      set({ error: error?.message ?? 'Unable to create project.' })
      return null
    }

    const project = data as Project
    set((state) => ({ projects: [project, ...state.projects], error: null }))
    return project
  },

  updateProject: async (id, updates) => {
    const project = get().projects.find((item) => item.id === id)
    if (project?.is_default && (updates.name || updates.status === 'completed')) {
      set({ error: 'The Misc. project is protected.' })
      return false
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error || !data) {
      set({ error: error?.message ?? 'Unable to update project.' })
      return false
    }

    set((state) => ({
      projects: state.projects.map((item) => item.id === id ? data as Project : item),
      error: null,
    }))
    return true
  },

  deleteProject: async (id) => {
    const project = get().projects.find((item) => item.id === id)
    if (project?.is_default) {
      set({ error: 'The Misc. project cannot be deleted.' })
      return false
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      set({ error: error.message })
      return false
    }

    set((state) => ({
      projects: state.projects.filter((item) => item.id !== id),
      error: null,
    }))
    return true
  },
}))
