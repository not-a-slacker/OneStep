"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  BarChart3,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  FolderKanban,
  Gauge,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Text,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  eachDayOfInterval,
  endOfDay,
  format,
  getDay,
  isAfter,
  isWithinInterval,
  parseISO,
  startOfDay,
  subDays,
} from "date-fns"
import { useTaskStore } from "@/store/taskStore"
import { usePomodoroStore } from "@/store/pomodoroStore"
import { useHabitStore } from "@/store/habitStore"
import { useProjectStore } from "@/store/projectStore"

const TABS = ["Overview", "Projects", "Tasks", "Habits"] as const
type Tab = typeof TABS[number]
type RangePreset = "weekly" | "monthly" | "yearly" | "allTime" | "custom"

const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "allTime", label: "All time" },
  { value: "custom", label: "Custom" },
]

const PROJECT_CHART_COLORS = [
  "#3b82f6",
  "#10b981",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#6366f1",
]

const tooltipStyle = {
  backgroundColor: "#18181b",
  borderColor: "#3f3f46",
  borderRadius: "12px",
  color: "#fff",
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Overview")
  const [rangePreset, setRangePreset] = useState<RangePreset>("weekly")
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 6), "yyyy-MM-dd"))
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const { tasks, fetchTasks } = useTaskStore()
  const { sessions, fetchSessions } = usePomodoroStore()
  const { habits, logs, fetchHabits } = useHabitStore()
  const { projects, fetchProjects } = useProjectStore()

  useEffect(() => {
    void Promise.all([fetchTasks(), fetchSessions(), fetchHabits(), fetchProjects()])
  }, [fetchHabits, fetchProjects, fetchSessions, fetchTasks])

  const earliestActivityDate = useMemo(() => {
    const timestamps = [
      ...sessions.map((session) => session.start_time),
      ...tasks.flatMap((task) => [task.created_at, task.completed_at].filter((value): value is string => Boolean(value))),
      ...projects.map((project) => project.created_at),
      ...habits.map((habit) => habit.created_at),
      ...Object.values(logs).flat().map((log) => log.completed_at),
    ]
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))

    if (!timestamps.length) return new Date()
    return new Date(Math.min(...timestamps.map((value) => value.getTime())))
  }, [habits, logs, projects, sessions, tasks])

  const applyRangePreset = (preset: RangePreset) => {
    setRangePreset(preset)
    if (preset === "custom") return

    const today = new Date()
    const presetStart = preset === "weekly"
      ? subDays(today, 6)
      : preset === "monthly"
        ? subDays(today, 29)
        : preset === "yearly"
          ? subDays(today, 364)
          : earliestActivityDate
    setStartDate(format(presetStart, "yyyy-MM-dd"))
    setEndDate(format(today, "yyyy-MM-dd"))
  }

  const effectiveStartDate = rangePreset === "allTime"
    ? format(earliestActivityDate, "yyyy-MM-dd")
    : startDate

  const interval = useMemo(() => {
    const start = startOfDay(new Date(effectiveStartDate))
    const end = endOfDay(new Date(endDate))
    return isAfter(start, end)
      ? { start: startOfDay(subDays(new Date(), 30)), end: endOfDay(new Date()) }
      : { start, end }
  }, [effectiveStartDate, endDate])

  const days = useMemo(() => eachDayOfInterval(interval), [interval])
  const filteredSessions = useMemo(() => sessions.filter((session) => (
    isWithinInterval(new Date(session.start_time), interval)
  )), [interval, sessions])
  const filteredLogs = useMemo(() => Object.values(logs).flat().filter((log) => (
    isWithinInterval(parseISO(log.completed_at), interval)
  )), [interval, logs])
  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const referenceDate = task.completed_at ?? task.created_at
    return isWithinInterval(new Date(referenceDate), interval)
  }), [interval, tasks])

  const focusDaily = useMemo(() => days.map((day) => {
    const key = format(day, "yyyy-MM-dd")
    const daySessions = filteredSessions.filter((session) => (
      format(new Date(session.start_time), "yyyy-MM-dd") === key
    ))
    return {
      key,
      date: format(day, "MMM d"),
      focusMinutes: daySessions.reduce((sum, session) => sum + session.duration, 0),
      sessions: daySessions.length,
    }
  }), [days, filteredSessions])

  const focusStats = useMemo(() => {
    const values = focusDaily.map((day) => day.focusMinutes)
    const total = values.reduce((sum, value) => sum + value, 0)
    const average = values.length ? total / values.length : 0
    const variance = values.length
      ? values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length
      : 0
    const most = focusDaily.reduce((best, day) => day.focusMinutes > best.focusMinutes ? day : best, focusDaily[0] ?? { date: "—", focusMinutes: 0 })
    const least = focusDaily.reduce((lowest, day) => day.focusMinutes < lowest.focusMinutes ? day : lowest, focusDaily[0] ?? { date: "—", focusMinutes: 0 })
    return { total, average, standardDeviation: Math.sqrt(variance), most, least }
  }, [focusDaily])

  const hourlyDistribution = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour: `${hour}:00`, sessions: 0, minutes: 0 }))
    filteredSessions.forEach((session) => {
      const hour = new Date(session.start_time).getHours()
      hours[hour].sessions += 1
      hours[hour].minutes += session.duration
    })
    return hours
  }, [filteredSessions])

  const sessionDurationDistribution = useMemo(() => {
    const buckets = [
      { range: "< 15m", count: 0 },
      { range: "15–29m", count: 0 },
      { range: "30–44m", count: 0 },
      { range: "45–59m", count: 0 },
      { range: "60m+", count: 0 },
    ]
    filteredSessions.forEach((session) => {
      const index = session.duration < 15 ? 0 : session.duration < 30 ? 1 : session.duration < 45 ? 2 : session.duration < 60 ? 3 : 4
      buckets[index].count += 1
    })
    return buckets
  }, [filteredSessions])

  const projectTotals = useMemo(() => projects.map((project, projectIndex) => {
    const projectSessions = filteredSessions.filter((session) => session.project_id === project.id)
    const projectTasks = filteredTasks.filter((task) => task.project_id === project.id)
    return {
      id: project.id,
      name: project.name,
      color: PROJECT_CHART_COLORS[projectIndex] ?? `hsl(${Math.round(projectIndex * 137.508) % 360} 70% 55%)`,
      minutes: projectSessions.reduce((sum, session) => sum + session.duration, 0),
      sessions: projectSessions.length,
      completedTasks: projectTasks.filter((task) => task.status === "completed").length,
      totalTasks: projectTasks.length,
      plannedMinutes: projectTasks.reduce((sum, task) => sum + (task.estimated_time ?? 0), 0),
    }
  }).sort((a, b) => b.minutes - a.minutes), [filteredSessions, filteredTasks, projects])

  const projectPlanComparison = useMemo(() => [
    projectTotals.reduce<Record<string, string | number>>((point, project) => ({ ...point, [project.id]: project.plannedMinutes }), { metric: "Planned" }),
    projectTotals.reduce<Record<string, string | number>>((point, project) => ({ ...point, [project.id]: project.minutes }), { metric: "Actual" }),
  ], [projectTotals])

  const projectTaskComparison = useMemo(() => [
    projectTotals.reduce<Record<string, string | number>>((point, project) => ({ ...point, [project.id]: project.completedTasks }), { metric: "Completed" }),
    projectTotals.reduce<Record<string, string | number>>((point, project) => ({ ...point, [project.id]: project.totalTasks }), { metric: "Total" }),
  ], [projectTotals])

  const projectTimeline = useMemo(() => days.map((day) => {
    const key = format(day, "yyyy-MM-dd")
    const point: Record<string, string | number> = { date: format(day, "MMM d") }
    projects.forEach((project) => {
      point[project.id] = filteredSessions
        .filter((session) => session.project_id === project.id && format(new Date(session.start_time), "yyyy-MM-dd") === key)
        .reduce((sum, session) => sum + session.duration, 0)
    })
    return point
  }), [days, filteredSessions, projects])

  const completedTasks = filteredTasks.filter((task) => task.status === "completed")
  const tasksWithDeadlines = completedTasks.filter((task) => task.deadline && task.completed_at)
  const earlyTasks = tasksWithDeadlines.filter((task) => (
    new Date(task.completed_at as string).getTime() <= new Date(task.deadline as string).getTime()
  ))
  const beforeDeadlineRate = tasksWithDeadlines.length
    ? Math.round((earlyTasks.length / tasksWithDeadlines.length) * 100)
    : 0

  const actualMinutesByTask = useMemo(() => {
    const result = new Map<string, number>()
    filteredSessions.forEach((session) => {
      if (session.task_id) result.set(session.task_id, (result.get(session.task_id) ?? 0) + session.duration)
    })
    return result
  }, [filteredSessions])

  const taskEstimateComparison = useMemo(() => filteredTasks
    .filter((task) => task.estimated_time || actualMinutesByTask.get(task.id))
    .map((task) => ({
      name: task.title.length > 18 ? `${task.title.slice(0, 18)}…` : task.title,
      planned: task.estimated_time ?? 0,
      actual: actualMinutesByTask.get(task.id) ?? 0,
    }))
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 12), [actualMinutesByTask, filteredTasks])

  const taskTimeline = useMemo(() => days.map((day) => {
    const key = format(day, "yyyy-MM-dd")
    return {
      date: format(day, "MMM d"),
      created: filteredTasks.filter((task) => format(new Date(task.created_at), "yyyy-MM-dd") === key).length,
      completed: filteredTasks.filter((task) => task.completed_at && format(new Date(task.completed_at), "yyyy-MM-dd") === key).length,
      focusMinutes: filteredSessions
        .filter((session) => format(new Date(session.start_time), "yyyy-MM-dd") === key)
        .reduce((sum, session) => sum + session.duration, 0),
    }
  }), [days, filteredSessions, filteredTasks])

  const taskDayOfWeek = useMemo(() => {
    const values = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name) => ({ name, completed: 0 }))
    completedTasks.forEach((task) => {
      if (task.completed_at) values[getDay(new Date(task.completed_at))].completed += 1
    })
    return values
  }, [completedTasks])

  const habitDaily = useMemo(() => days.map((day) => {
    const key = format(day, "yyyy-MM-dd")
    return {
      key,
      date: format(day, "MMM d"),
      checkIns: filteredLogs.filter((log) => log.completed_at === key).length,
    }
  }), [days, filteredLogs])

  const habitStats = useMemo(() => {
    const values = habitDaily.map((day) => day.checkIns)
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    const median = !sorted.length ? 0 : sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    const variance = values.length ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length : 0
    return { mean, median, standardDeviation: Math.sqrt(variance) }
  }, [habitDaily])

  const habitRates = useMemo(() => habits.map((habit) => {
    const count = filteredLogs.filter((log) => log.habit_id === habit.id).length
    const expected = habit.frequency === "daily"
      ? days.length
      : Math.max(1, Math.ceil(days.length / 7) * habit.target_days_per_week)
    return {
      name: habit.name,
      checkIns: count,
      rate: Math.min(100, Math.round((count / expected) * 100)),
    }
  }).sort((a, b) => b.rate - a.rate), [days.length, filteredLogs, habits])

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-2 text-zinc-400">Understand when you focus, what receives your time, and how consistently you follow through.</p>
        </div>
        <div className="flex max-w-3xl flex-col gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--surface-border)] bg-zinc-900 p-1.5">
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => applyRangePreset(preset.value)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${rangePreset === preset.value ? "bg-[var(--color-primary)] text-white" : "text-zinc-400 hover:text-white"}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {rangePreset === "custom" && (
            <div className="flex flex-col gap-2 rounded-xl border border-[var(--surface-border)] bg-zinc-900 p-3 sm:flex-row sm:items-center">
              <CalendarIcon size={16} className="hidden text-zinc-400 sm:block" />
              <input aria-label="Analytics start date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="bg-transparent text-sm font-medium text-white focus:outline-none" />
              <span className="hidden text-zinc-600 sm:inline">to</span>
              <input aria-label="Analytics end date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="bg-transparent text-sm font-medium text-white focus:outline-none" />
            </div>
          )}
        </div>
      </header>

      <nav className="grid grid-cols-2 rounded-2xl bg-[var(--surface-border)]/50 p-1 sm:grid-cols-4" aria-label="Analytics sections">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-xl px-4 py-3 text-sm font-bold ${activeTab === tab ? "bg-[var(--color-primary)] text-white shadow-lg" : "text-zinc-400 hover:text-white"}`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "Overview" && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Total focus" value={`${Math.round(focusStats.total / 60 * 10) / 10}h`} icon={Clock} />
            <StatCard label="Average per day" value={`${focusStats.average.toFixed(1)}m`} icon={TrendingUp} />
            <StatCard label="Std. deviation" value={`${focusStats.standardDeviation.toFixed(1)}m`} icon={Activity} />
            <StatCard label="Most productive" value={`${focusStats.most.date} · ${focusStats.most.focusMinutes}m`} icon={Zap} />
            <StatCard label="Least productive" value={`${focusStats.least.date} · ${focusStats.least.focusMinutes}m`} icon={Gauge} />
          </section>
          <ChartGrid>
            <ChartCard title="Focus time over time" description="Daily focused minutes in the selected period.">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={focusDaily}>
                  <defs><linearGradient id="focusGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#a1a1aa" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="focusMinutes" name="Focus minutes" stroke="#3b82f6" strokeWidth={3} fill="url(#focusGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Hourly distribution" description="When sessions start and how many minutes they contain.">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hourlyDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fill: "#a1a1aa" }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: "#a1a1aa" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="sessions" name="Sessions" fill="#a855f7" />
                  <Line yAxisId="right" type="monotone" dataKey="minutes" name="Minutes" stroke="#10b981" strokeWidth={3} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Session length distribution" description="See whether your work happens in short bursts or sustained blocks.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sessionDurationDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                  <XAxis dataKey="range" tick={{ fill: "#a1a1aa" }} />
                  <YAxis allowDecimals={false} tick={{ fill: "#a1a1aa" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Sessions" fill="#10b981" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </ChartGrid>
        </div>
      )}

      {activeTab === "Projects" && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active projects" value={String(projects.filter((project) => project.status === "active").length)} icon={FolderKanban} />
            <StatCard label="Project focus time" value={`${Math.round(filteredSessions.reduce((sum, session) => sum + session.duration, 0) / 60 * 10) / 10}h`} icon={Clock} />
            <StatCard label="Project tasks completed" value={String(completedTasks.length)} icon={CheckCircle2} />
            <StatCard label="Most focused project" value={projectTotals[0]?.name ?? "—"} icon={Target} />
          </section>
          <ChartGrid>
            <ChartCard title="Project time over time" description="Daily focus minutes for each project.">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={projectTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#a1a1aa" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  {projectTotals.map((project) => <Line key={project.id} type="monotone" dataKey={project.id} name={project.name} stroke={project.color} strokeWidth={2.5} dot={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Total focus by project" description="Compare the total attention each project received.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectTotals} layout="vertical" margin={{ left: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#a1a1aa" }} />
                  <YAxis type="category" dataKey="name" width={95} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="minutes" name="Focus minutes" radius={[0, 5, 5, 0]}>
                    {projectTotals.map((project) => <Cell key={project.id} fill={project.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Planned vs actual project time" description="Task estimates compared with task-linked focus minutes.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectPlanComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                  <XAxis dataKey="metric" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#a1a1aa" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  {projectTotals.map((project) => <Bar key={project.id} dataKey={project.id} name={project.name} fill={project.color} />)}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Tasks completed by project" description="Completed work alongside total project workload.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectTaskComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                  <XAxis dataKey="metric" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "#a1a1aa" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  {projectTotals.map((project) => <Bar key={project.id} dataKey={project.id} name={project.name} fill={project.color} />)}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </ChartGrid>
        </div>
      )}

      {activeTab === "Tasks" && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Before deadline" value={`${beforeDeadlineRate}%`} icon={Target} />
            <StatCard label="Completed" value={String(completedTasks.length)} icon={CheckCircle2} />
            <StatCard label="Open" value={String(filteredTasks.filter((task) => task.status !== "completed").length)} icon={BarChart3} />
            <StatCard label="Task-linked focus" value={`${[...actualMinutesByTask.values()].reduce((sum, value) => sum + value, 0)}m`} icon={Clock} />
          </section>
          <ChartGrid>
            <ChartCard title="Estimated vs actual task time" description="Actual time is the sum of task-linked Pomodoros.">
              {taskEstimateComparison.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={taskEstimateComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#a1a1aa" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="planned" name="Planned minutes" fill="#3b82f6" />
                    <Bar dataKey="actual" name="Actual minutes" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart message="Task estimates and task-linked Pomodoros will appear here." />}
            </ChartCard>
            <ChartCard title="Task volume vs focus time" description="Created and completed tasks compared with daily focus.">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={taskTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                  <YAxis yAxisId="tasks" allowDecimals={false} tick={{ fill: "#a1a1aa" }} />
                  <YAxis yAxisId="time" orientation="right" tick={{ fill: "#a1a1aa" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar yAxisId="tasks" dataKey="created" name="Created" fill="#a855f7" />
                  <Bar yAxisId="tasks" dataKey="completed" name="Completed" fill="#10b981" />
                  <Line yAxisId="time" type="monotone" dataKey="focusMinutes" name="Focus minutes" stroke="#3b82f6" strokeWidth={3} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Completion by weekday" description="Uses the actual completion timestamp.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taskDayOfWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#a1a1aa" }} />
                  <YAxis allowDecimals={false} tick={{ fill: "#a1a1aa" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="completed" name="Completed tasks" fill="#3b82f6" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </ChartGrid>
        </div>
      )}

      {activeTab === "Habits" && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Check-ins" value={String(filteredLogs.length)} icon={CheckCircle2} />
            <StatCard label="Daily mean" value={habitStats.mean.toFixed(2)} icon={Activity} />
            <StatCard label="Daily median" value={habitStats.median.toFixed(1)} icon={Target} />
            <StatCard label="Std. deviation" value={habitStats.standardDeviation.toFixed(2)} icon={Zap} />
          </section>
          <ChartGrid>
            <ChartCard title="Habit consistency heatmap" description="Darker cells contain more check-ins.">
              <div className="flex h-full content-start flex-wrap gap-2 overflow-y-auto">
                {habitDaily.map((day) => (
                  <div
                    key={day.key}
                    title={`${day.date}: ${day.checkIns} check-ins`}
                    className="flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-[var(--surface-border)]"
                    style={{ backgroundColor: day.checkIns ? `rgba(16, 185, 129, ${Math.min(1, 0.25 + day.checkIns * 0.15)})` : "#09090b" }}
                  >
                    <span className="text-[10px] text-zinc-400">{day.date}</span>
                    <span className="font-bold">{day.checkIns}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
            <ChartCard title="Completion rate by habit" description="Check-ins compared with expected frequency in the selected period.">
              {habitRates.length ? (
                <div className="h-full overflow-y-auto pr-2">
                  <ResponsiveContainer width="100%" height={Math.max(300, habitRates.length * 56)}>
                    <BarChart data={habitRates} layout="vertical" margin={{ left: 10, right: 12 }} barCategoryGap={10}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: "#a1a1aa" }} />
                      <YAxis type="category" dataKey="name" width={190} interval={0} tick={<HabitNameTick />} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="rate" name="Completion rate %" fill="#10b981" radius={[0, 5, 5, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyChart message="Create and check in a habit to populate this chart." />}
            </ChartCard>
            <ChartCard title="Habit check-ins over time" description="Daily check-in volume across all active habits.">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={habitDaily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "#a1a1aa" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="checkIns" name="Check-ins" stroke="#a855f7" fill="#a855f7" fillOpacity={0.25} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </ChartGrid>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-sm text-zinc-400">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>
        <Icon size={24} className="shrink-0 text-[var(--color-primary)]" />
      </div>
    </div>
  )
}

function ChartGrid({ children }: { children: React.ReactNode }) {
  return <section className="grid gap-6 xl:grid-cols-2">{children}</section>
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

function HabitNameTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <Text x={x - 8} y={y} width={175} textAnchor="end" verticalAnchor="middle" fill="#a1a1aa" fontSize={11}>
      {payload?.value ?? ""}
    </Text>
  )
}
