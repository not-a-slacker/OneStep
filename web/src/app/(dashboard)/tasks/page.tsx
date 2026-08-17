"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Edit3,
  Flag,
  FolderKanban,
  Gauge,
  Plus,
  Target,
  Trash2,
  X,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { eachDayOfInterval, format, isPast, isToday, subDays } from "date-fns"
import { useTaskStore, type Task } from "@/store/taskStore"
import { useProjectStore, type Project } from "@/store/projectStore"
import { usePomodoroStore } from "@/store/pomodoroStore"

interface TaskFormState {
  title: string
  deadline: string
  projectId: string
  priority: Task["priority"]
  estimatedTime: string
  notes: string
}

const EMPTY_FORM: TaskFormState = {
  title: "",
  deadline: "",
  projectId: "",
  priority: "medium",
  estimatedTime: "",
  notes: "",
}

export default function TasksPage() {
  const {
    tasks,
    loading,
    error,
    fetchTasks,
    addTask,
    updateTaskStatus,
    deleteTask,
    updateTask,
    clearError,
  } = useTaskStore()
  const { projects, fetchProjects, ensureMiscProject } = useProjectStore()
  const { sessions, fetchSessions } = usePomodoroStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [form, setForm] = useState<TaskFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void Promise.all([fetchTasks(), fetchProjects(), fetchSessions()])
      .then(async () => {
        const misc = await ensureMiscProject()
        if (misc) setForm((current) => ({ ...current, projectId: current.projectId || misc.id }))
      })
  }, [ensureMiscProject, fetchProjects, fetchSessions, fetchTasks])

  const miscProject = projects.find((project) => project.is_default)

  const actualMinutesByTask = useMemo(() => {
    const result = new Map<string, number>()
    sessions.forEach((session) => {
      if (session.task_id) {
        result.set(session.task_id, (result.get(session.task_id) ?? 0) + session.duration)
      }
    })
    return result
  }, [sessions])

  const sortedTasks = useMemo(() => {
    const priorityWeight = { high: 3, medium: 2, low: 1 }
    return [...tasks].sort((a, b) => {
      if (a.deadline && b.deadline) {
        const dateDifference = new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        if (dateDifference !== 0) return dateDifference
      } else if (a.deadline) return -1
      else if (b.deadline) return 1
      return priorityWeight[b.priority] - priorityWeight[a.priority]
    })
  }, [tasks])

  const pendingTasks = sortedTasks.filter((task) => task.status !== "completed")
  const completedTasks = sortedTasks.filter((task) => task.status === "completed")

  const completedWithDeadline = completedTasks.filter((task) => task.completed_at && task.deadline)
  const completedBeforeDeadline = completedWithDeadline.filter((task) => (
    new Date(task.completed_at as string).getTime() <= new Date(task.deadline as string).getTime()
  ))
  const beforeDeadlineRate = completedWithDeadline.length
    ? Math.round((completedBeforeDeadline.length / completedWithDeadline.length) * 100)
    : 0

  const plannedVsActual = useMemo(() => tasks
    .filter((task) => task.estimated_time || actualMinutesByTask.get(task.id))
    .map((task) => ({
      name: task.title.length > 18 ? `${task.title.slice(0, 18)}…` : task.title,
      planned: task.estimated_time ?? 0,
      actual: actualMinutesByTask.get(task.id) ?? 0,
    }))
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 10), [actualMinutesByTask, tasks])

  const tasksVsTime = useMemo(() => {
    const days = eachDayOfInterval({ start: subDays(new Date(), 13), end: new Date() })
    return days.map((day) => {
      const key = format(day, "yyyy-MM-dd")
      return {
        date: format(day, "MMM d"),
        tasks: tasks.filter((task) => format(new Date(task.created_at), "yyyy-MM-dd") === key).length,
        focusMinutes: sessions
          .filter((session) => format(new Date(session.start_time), "yyyy-MM-dd") === key)
          .reduce((sum, session) => sum + session.duration, 0),
      }
    })
  }, [sessions, tasks])

  const totalActualMinutes = [...actualMinutesByTask.values()].reduce((sum, value) => sum + value, 0)
  const focusedTaskCount = [...actualMinutesByTask.values()].filter((value) => value > 0).length

  const openCreateModal = () => {
    clearError()
    setEditingTask(null)
    setForm({ ...EMPTY_FORM, projectId: miscProject?.id ?? projects[0]?.id ?? "" })
    setIsModalOpen(true)
  }

  const openEditModal = (task: Task) => {
    clearError()
    setEditingTask(task)
    setForm({
      title: task.title,
      deadline: task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : "",
      projectId: task.project_id,
      priority: task.priority,
      estimatedTime: task.estimated_time?.toString() ?? "",
      notes: task.notes ?? "",
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setIsModalOpen(false)
    setEditingTask(null)
    setForm(EMPTY_FORM)
  }

  const submitTask = async (event: React.FormEvent) => {
    event.preventDefault()
    const resolvedProjectId = form.projectId || miscProject?.id
    if (!resolvedProjectId) return
    setSaving(true)
    const taskData = {
      title: form.title.trim(),
      status: editingTask?.status ?? "pending" as const,
      deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      estimated_time: form.estimatedTime ? Number.parseInt(form.estimatedTime, 10) : null,
      project_id: resolvedProjectId,
      priority: form.priority,
      notes: form.notes.trim() || null,
    }
    const success = editingTask
      ? await updateTask(editingTask.id, taskData)
      : Boolean(await addTask(taskData))
    setSaving(false)
    if (success) closeModal()
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="mt-2 text-zinc-400">Plan work, compare estimates with focus time, and finish before deadlines.</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-3 font-bold text-white hover:opacity-90"
        >
          <Plus size={20} />
          New task
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Task statistics">
        <StatCard label="Completed before deadline" value={`${beforeDeadlineRate}%`} icon={Target} accent="text-emerald-400" />
        <StatCard label="Completed tasks" value={String(completedTasks.length)} icon={CheckCircle2} accent="text-blue-400" />
        <StatCard label="Focused tasks" value={String(focusedTaskCount)} icon={Gauge} accent="text-violet-400" />
        <StatCard label="Actual focus time" value={`${Math.round(totalActualMinutes / 60 * 10) / 10}h`} icon={Clock} accent="text-amber-400" />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Estimated vs actual focus time" description="Pomodoro minutes are counted as actual task time.">
          {plannedVsActual.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={plannedVsActual}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis stroke="#71717a" tick={{ fill: "#a1a1aa" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="planned" name="Planned minutes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual focus minutes" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="Assign estimated time or complete a task Pomodoro to populate this chart." />}
        </ChartCard>

        <ChartCard title="Tasks created vs focus time" description="The last 14 days show planning volume alongside focused execution.">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={tasksVsTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
              <XAxis dataKey="date" stroke="#71717a" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="#71717a" tick={{ fill: "#a1a1aa" }} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#71717a" tick={{ fill: "#a1a1aa" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar yAxisId="left" dataKey="tasks" name="Tasks created" fill="#a855f7" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="focusMinutes" name="Focus minutes" stroke="#10b981" strokeWidth={3} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <TaskColumn
          title={`Open · ${pendingTasks.length}`}
          tasks={pendingTasks}
          projects={projects}
          actualMinutesByTask={actualMinutesByTask}
          loading={loading}
          onEdit={openEditModal}
          onToggle={(task) => void updateTaskStatus(task.id, "completed")}
          onDelete={(task) => void deleteTask(task.id)}
        />
        <TaskColumn
          title={`Completed · ${completedTasks.length}`}
          tasks={completedTasks}
          projects={projects}
          actualMinutesByTask={actualMinutesByTask}
          loading={loading}
          completed
          onEdit={openEditModal}
          onToggle={(task) => void updateTaskStatus(task.id, "pending")}
          onDelete={(task) => void deleteTask(task.id)}
        />
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 id="task-modal-title" className="text-2xl font-bold">{editingTask ? "Edit task" : "New task"}</h2>
              <button type="button" aria-label="Close task form" onClick={closeModal} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={submitTask} className="space-y-4">
              <FormField label="Title">
                <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Project">
                  <select required value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })} className={inputClass}>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Priority">
                  <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Task["priority"] })} className={inputClass}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </FormField>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Deadline">
                  <input type="datetime-local" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className={inputClass} />
                </FormField>
                <FormField label="Estimated minutes">
                  <input type="number" min="0" value={form.estimatedTime} onChange={(event) => setForm({ ...form, estimatedTime: event.target.value })} className={inputClass} />
                </FormField>
              </div>
              <FormField label="Notes">
                <textarea rows={4} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} />
              </FormField>
              {error && <p className="text-sm text-red-300">{error}</p>}
              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={closeModal} className="rounded-lg px-4 py-2 font-semibold text-zinc-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-[var(--color-primary)] px-6 py-2 font-bold text-white disabled:opacity-60">
                  {saving ? "Saving…" : editingTask ? "Save changes" : "Create task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const inputClass = "w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-2.5 text-white focus:border-[var(--color-primary)] focus:outline-none"
const tooltipStyle = { backgroundColor: "#18181b", borderColor: "#3f3f46", borderRadius: "12px", color: "#fff" }

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium text-zinc-400">{label}</span>{children}</label>
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ComponentType<{ size?: number; className?: string }>; accent: string }) {
  return (
    <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between">
        <div><p className="text-sm text-zinc-400">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>
        <Icon size={25} className={accent} />
      </div>
    </div>
  )
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mb-5 text-sm text-zinc-500">{description}</p>
      <div className="h-80">{children}</div>
    </div>
  )
}

function EmptyChart({ message }: { message: string }) {
  return <div className="flex h-full items-center justify-center px-8 text-center text-sm text-zinc-500">{message}</div>
}

interface TaskColumnProps {
  title: string
  tasks: Task[]
  projects: Project[]
  actualMinutesByTask: Map<string, number>
  loading: boolean
  completed?: boolean
  onEdit: (task: Task) => void
  onToggle: (task: Task) => void
  onDelete: (task: Task) => void
}

function TaskColumn({ title, tasks, projects, actualMinutesByTask, loading, completed, onEdit, onToggle, onDelete }: TaskColumnProps) {
  return (
    <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-5">
      <h2 className="mb-4 text-lg font-semibold text-zinc-200">{title}</h2>
      {loading ? <p className="text-zinc-500">Loading tasks…</p> : tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--surface-border)] p-8 text-center text-sm text-zinc-500">No tasks in this section.</p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const project = projects.find((item) => item.id === task.project_id)
            const overdue = Boolean(task.deadline && isPast(new Date(task.deadline)) && !isToday(new Date(task.deadline)) && !completed)
            return (
              <article key={task.id} className={`rounded-xl border p-4 ${overdue ? "border-red-500/40 bg-red-500/5" : "border-[var(--surface-border)] bg-zinc-950/30"}`}>
                <div className="flex items-start justify-between gap-3">
                  <button type="button" aria-label={completed ? "Reopen task" : "Complete task"} onClick={() => onToggle(task)} className="mt-0.5 text-zinc-500 hover:text-emerald-400">
                    {completed ? <CheckCircle2 size={21} className="text-emerald-400" /> : <Circle size={21} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <h3 className={`font-semibold ${completed ? "text-zinc-500 line-through" : "text-white"}`}>{task.title}</h3>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
                      <span className="flex items-center gap-1"><FolderKanban size={12} style={{ color: project?.color }} />{project?.name ?? "Misc."}</span>
                      <span className="flex items-center gap-1"><Flag size={12} />{task.priority}</span>
                      {task.deadline && <span className={`flex items-center gap-1 ${overdue ? "text-red-300" : ""}`}><Calendar size={12} />{format(new Date(task.deadline), "MMM d, h:mm a")}</span>}
                      <span className="flex items-center gap-1"><Clock size={12} />{task.estimated_time ?? 0}m planned / {actualMinutesByTask.get(task.id) ?? 0}m actual</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" aria-label={`Edit ${task.title}`} onClick={() => onEdit(task)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white"><Edit3 size={16} /></button>
                    <button type="button" aria-label={`Delete ${task.title}`} onClick={() => onDelete(task)} className="rounded-lg p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 size={16} /></button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
