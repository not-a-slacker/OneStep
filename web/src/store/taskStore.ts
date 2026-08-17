import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useProjectStore } from '@/store/projectStore'
import { useAuthStore } from '@/store/authStore'

export interface Task {
  id: string
  user_id: string
  project_id: string
  title: string
  notes: string | null
  status: 'pending' | 'in-progress' | 'completed'
  priority: 'low' | 'medium' | 'high'
  deadline: string | null
  estimated_time: number | null
  completed_at: string | null
  created_at: string
}

export type NewTask = Omit<Task, 'id' | 'created_at' | 'user_id' | 'completed_at' | 'project_id'> & {
  project_id: string | null
}

interface TaskState {
  tasks: Task[]
  loading: boolean
  error: string | null
  fetchTasks: () => Promise<void>
  addTask: (task: NewTask) => Promise<Task | null>
  updateTask: (id: string, updates: Partial<Task>) => Promise<boolean>
  updateTaskStatus: (id: string, status: Task['status']) => Promise<boolean>
  deleteTask: (id: string) => Promise<boolean>
  clearError: () => void
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchTasks: async () => {
    set({ loading: true, error: null })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      set({ loading: false })
      return
    }

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('deadline', { ascending: true, nullsFirst: false })

    set({
      tasks: error ? get().tasks : (data as Task[]),
      loading: false,
      error: error?.message ?? null,
    })
  },

  addTask: async (taskInput) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    let projectId = taskInput.project_id
    if (!projectId) {
      projectId = (await useProjectStore.getState().ensureMiscProject())?.id ?? null
    }
    if (!projectId) {
      set({ error: 'A project is required and the Misc. project could not be created.' })
      return null
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert([{ ...taskInput, project_id: projectId, user_id: user.id }])
      .select()
      .single()

    if (error || !data) {
      set({ error: error?.message ?? 'Unable to create task.' })
      return null
    }

    const task = data as Task
    set((state) => ({ tasks: [task, ...state.tasks], error: null }))
    await useAuthStore.getState().refreshProfile()
    return task
  },

  updateTask: async (id, updates) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const normalizedUpdates = { ...updates }
    if ('project_id' in normalizedUpdates && !normalizedUpdates.project_id) {
      normalizedUpdates.project_id = (await useProjectStore.getState().ensureMiscProject())?.id
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(normalizedUpdates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error || !data) {
      set({ error: error?.message ?? 'Unable to update task.' })
      return false
    }

    set((state) => ({
      tasks: state.tasks.map((task) => task.id === id ? data as Task : task),
      error: null,
    }))
    await useAuthStore.getState().refreshProfile()
    return true
  },

  updateTaskStatus: async (id, status) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await supabase
      .from('tasks')
      .update({
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error || !data) {
      set({ error: error?.message ?? 'Unable to update task status.' })
      return false
    }

    set((state) => ({
      tasks: state.tasks.map((task) => task.id === id ? data as Task : task),
      error: null,
    }))
    await useAuthStore.getState().refreshProfile()
    return true
  },

  deleteTask: async (id) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      set({ error: error.message })
      return false
    }

    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
      error: null,
    }))
    await useAuthStore.getState().refreshProfile()
    return true
  },
}))
