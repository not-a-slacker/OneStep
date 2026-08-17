"use client";

import { useEffect, useState, useMemo } from "react";
import { useProjectStore, type Project } from "@/store/projectStore";
import { useTaskStore, type Task } from "@/store/taskStore";
import { usePomodoroStore, type PomodoroSession } from "@/store/pomodoroStore";
import { FolderKanban, Plus, Calendar, CheckCircle2, Clock, Check, Trash2, CalendarDays, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, startOfYear, endOfYear, addMonths, subMonths, addYears, subYears } from "date-fns";

export default function ProjectsPage() {
  const { projects, loading, error, fetchProjects, ensureMiscProject, addProject, updateProject, deleteProject } = useProjectStore();
  const { tasks, fetchTasks } = useTaskStore();
  const { sessions, fetchSessions } = usePomodoroStore();
  
  const [isAdding, setIsAdding] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState("#3b82f6");
  const [newProjectEndDate, setNewProjectEndDate] = useState("");

  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [heatmapProjectId, setHeatmapProjectId] = useState<string>("");

  useEffect(() => {
    void Promise.all([fetchProjects(), fetchTasks(), fetchSessions()])
      .then(async () => {
        const misc = await ensureMiscProject();
        setHeatmapProjectId((current) => current || misc?.id || "");
      });
  }, [ensureMiscProject, fetchProjects, fetchTasks, fetchSessions]);

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    
    const created = await addProject(
      newProjectName, 
      newProjectColor, 
      newProjectEndDate ? new Date(newProjectEndDate).toISOString() : null
    );
    if (created) {
      setNewProjectName("");
      setNewProjectColor("#3b82f6");
      setNewProjectEndDate("");
      setIsAdding(false);
    }
  };

  const activeProjects = projects.filter(p => p.status === 'active');
  const completedProjects = projects.filter(p => p.status === 'completed');
  const resolvedHeatmapProjectId = heatmapProjectId || projects[0]?.id || "";

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">Projects</h1>
          <p className="mt-2 text-zinc-400">Organize your tasks and track long-term goals.</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center space-x-2 rounded-xl bg-gradient-to-tr from-[var(--color-primary)] to-[var(--color-success)] px-4 py-2.5 font-semibold text-white shadow-lg transition-transform hover:scale-105"
        >
          <Plus size={20} />
          <span>New Project</span>
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Add Project Form */}
      {isAdding && (
        <form onSubmit={handleAddProject} className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-xl">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-400">Project Name</label>
              <input
                autoFocus
                type="text"
                required
                className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-3 text-white focus:border-[var(--color-primary)] focus:outline-none"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-400">Brand Color</label>
              <input
                type="color"
                className="h-12 w-full cursor-pointer rounded-xl border border-[var(--surface-border)] bg-zinc-900 p-1"
                value={newProjectColor}
                onChange={(e) => setNewProjectColor(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-zinc-400">Estimated End Date (Optional)</label>
              <input
                type="date"
                className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-3 text-white focus:border-[var(--color-primary)] focus:outline-none"
                value={newProjectEndDate}
                onChange={(e) => setNewProjectEndDate(e.target.value)}
              />
            </div>
          </div>
          
          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity"
            >
              Create Project
            </button>
          </div>
        </form>
      )}

      <ProjectCalendarHeatmap
        projects={projects}
        sessions={sessions}
        selectedProjectId={resolvedHeatmapProjectId}
        onProjectChange={setHeatmapProjectId}
      />

      {loading && projects.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--surface-border)] border-t-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="space-y-12">
          {/* Active Projects */}
          <section>
            <h2 className="mb-6 text-xl font-bold flex items-center space-x-2">
              <FolderKanban className="text-[var(--color-primary)]" />
              <span>Active Projects</span>
            </h2>
            {activeProjects.length === 0 ? (
              <p className="text-zinc-500 italic">No active projects yet.</p>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {activeProjects.map((project) => (
                  <ProjectCard 
                    key={project.id} 
                    project={project} 
                    updateProject={updateProject} 
                    deleteProject={deleteProject}
                    tasks={tasks.filter(t => t.project_id === project.id)}
                    sessions={sessions.filter(s => s.project_id === project.id)}
                    isExpanded={expandedProjectId === project.id}
                    onToggle={() => setExpandedProjectId(expandedProjectId === project.id ? null : project.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Completed Projects */}
          {completedProjects.length > 0 && (
            <section className="opacity-70 transition-opacity hover:opacity-100">
              <h2 className="mb-6 text-xl font-bold flex items-center space-x-2">
                <CheckCircle2 className="text-[var(--color-success)]" />
                <span>Completed Projects</span>
              </h2>
              <div className="grid gap-6 md:grid-cols-2">
                {completedProjects.map((project) => (
                  <ProjectCard 
                    key={project.id} 
                    project={project} 
                    updateProject={updateProject} 
                    deleteProject={deleteProject}
                    tasks={tasks.filter(t => t.project_id === project.id)}
                    sessions={sessions.filter(s => s.project_id === project.id)}
                    isExpanded={expandedProjectId === project.id}
                    onToggle={() => setExpandedProjectId(expandedProjectId === project.id ? null : project.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  updateProject: (id: string, updates: Partial<Project>) => Promise<boolean>;
  deleteProject: (id: string) => Promise<boolean>;
  tasks: Task[];
  sessions: PomodoroSession[];
  isExpanded: boolean;
  onToggle: () => void;
}

function ProjectCard({ project, updateProject, deleteProject, tasks, sessions, isExpanded, onToggle }: ProjectCardProps) {
  const tasksCompleted = tasks.filter((task) => task.status === 'completed').length;
  const timeSpent = sessions.reduce((total, session) => total + session.duration, 0);

  // Last 14 days heatmap for the mini view
  const last14Days = Array.from({ length: 14 }).map((_, i) => format(subDays(new Date(), 13 - i), 'yyyy-MM-dd'));
  const sessionDates = new Set(sessions.map((session) => format(new Date(session.start_time), 'yyyy-MM-dd')));

  return (
    <div 
      className={`group relative overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] transition-all duration-300 hover:border-zinc-500 hover:shadow-xl cursor-pointer hover:-translate-y-1 ${isExpanded ? 'md:col-span-2' : ''}`}
      onClick={onToggle}
    >
      <div className="absolute left-0 top-0 h-1 w-full" style={{ backgroundColor: project.color }} />
      
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">{project.name}</h3>
            <div className="mt-2 flex flex-wrap gap-4 text-xs font-medium text-zinc-400">
              <span className="flex items-center space-x-1">
                <Calendar size={14} />
                <span>Started: {format(new Date(project.created_at), 'MMM d, yyyy')}</span>
              </span>
              {project.estimated_end_date && (
                <span className="flex items-center space-x-1 text-amber-500/80">
                  <CalendarDays size={14} />
                  <span>Due: {format(new Date(project.estimated_end_date), 'MMM d, yyyy')}</span>
                </span>
              )}
            </div>
          </div>
          
          {/* Actions Menu */}
          <div className="flex items-center space-x-2 opacity-0 transition-opacity group-hover:opacity-100">
            {!project.is_default && <button 
              title={project.status === 'active' ? "Mark Completed" : "Mark Active"}
              onClick={(e) => { e.stopPropagation(); void updateProject(project.id, { status: project.status === 'active' ? 'completed' : 'active' }); }}
              className={`rounded-lg p-2 ${project.status === 'active' ? 'hover:bg-[var(--color-success)] hover:text-white text-zinc-500' : 'text-[var(--color-success)]'}`}
            >
              {project.status === 'active' ? <Check size={18} /> : <RotateCcwIcon />}
            </button>}
            {!project.is_default && <button 
              onClick={(e) => { e.stopPropagation(); void deleteProject(project.id); }}
              className="rounded-lg p-2 text-zinc-500 hover:bg-[var(--color-danger)] hover:text-white"
            >
              <Trash2 size={18} />
            </button>}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-zinc-900 p-4 border border-[var(--surface-border)]">
            <p className="text-xs font-semibold text-zinc-500">Tasks Completed</p>
            <p className="mt-1 text-xl font-bold text-white flex items-center space-x-2">
              <CheckCircle2 size={16} className="text-[var(--color-success)]" />
              <span>{tasksCompleted} / {tasks.length}</span>
            </p>
          </div>
          <div className="rounded-xl bg-zinc-900 p-4 border border-[var(--surface-border)]">
            <p className="text-xs font-semibold text-zinc-500">Time Spent</p>
            <p className="mt-1 text-xl font-bold text-white flex items-center space-x-2">
              <Clock size={16} className="text-[var(--color-primary)]" />
              <span>{Math.floor(timeSpent / 60)}h {timeSpent % 60}m</span>
            </p>
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold text-zinc-500">Activity (Last 14 Days)</p>
          <div className="flex space-x-1">
            {last14Days.map((day: string) => {
              const worked = sessionDates.has(day);
              return (
                <div 
                  key={day} 
                  title={day}
                  className="h-6 flex-1 rounded-sm transition-colors"
                  style={{ backgroundColor: worked ? project.color : 'rgba(39, 39, 42, 0.5)', opacity: worked ? 0.8 : 1 }}
                />
              )
            })}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-[var(--surface-border)] bg-zinc-900/30 p-6 animate-in slide-in-from-top-2" onClick={(e) => e.stopPropagation()}>
          <ProjectDetails project={project} tasks={tasks} sessions={sessions} />
        </div>
      )}
    </div>
  );
}

// --- ProjectDetails Subcomponent ---
function ProjectDetails({ project, tasks, sessions }: { project: Project; tasks: Task[]; sessions: PomodoroSession[] }) {
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'year' | 'all'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Generate Calendar Days based on View Mode
  const calendarDays = useMemo(() => {
    let start, end;
    if (viewMode === 'week') {
      start = startOfWeek(currentDate);
      end = endOfWeek(currentDate);
    } else if (viewMode === 'month') {
      start = startOfWeek(startOfMonth(currentDate));
      end = endOfWeek(endOfMonth(currentDate));
    } else if (viewMode === 'year') {
      start = startOfYear(currentDate);
      end = endOfYear(currentDate);
    } else {
      start = new Date(project.created_at);
      end = new Date();
    }
    return eachDayOfInterval({ start, end });
  }, [viewMode, currentDate, project.created_at]);

  const handlePrev = () => {
    if (viewMode === 'week') setCurrentDate(subDays(currentDate, 7));
    else if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else setCurrentDate(subYears(currentDate, 1));
  };

  const handleNext = () => {
    if (viewMode === 'week') setCurrentDate(addDaysCustom(currentDate, 7));
    else if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else setCurrentDate(addYears(currentDate, 1));
  };

  const addDaysCustom = (date: Date, amount: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + amount);
    return d;
  };

  const getLabel = () => {
    if (viewMode === 'week') return `Week of ${format(startOfWeek(currentDate), 'MMM d, yyyy')}`;
    if (viewMode === 'month') return format(currentDate, 'MMMM yyyy');
    if (viewMode === 'year') return format(currentDate, 'yyyy');
    return 'All Time';
  };

  const sessionDates = new Set(sessions.map((session) => format(new Date(session.start_time), 'yyyy-MM-dd')));

  return (
    <div className="space-y-8">
      {/* Heatmap Configuration */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
          <h4 className="text-sm font-bold text-zinc-400 flex items-center space-x-2">
            <CalendarDays size={16} />
            <span>Activity Heatmap</span>
          </h4>
          
          <div className="flex items-center space-x-2 bg-zinc-900 rounded-xl p-1 border border-[var(--surface-border)]">
            {(['week', 'month', 'year', 'all'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); setCurrentDate(new Date()); }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all capitalize ${
                  viewMode === mode ? 'bg-[var(--color-primary)] text-white' : 'text-zinc-500 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--surface-border)] bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-4">
            {viewMode !== 'all' ? (
              <>
                <button onClick={handlePrev} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400"><ChevronLeft size={20} /></button>
                <span className="font-bold text-white text-sm">{getLabel()}</span>
                <button onClick={handleNext} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400"><ChevronRight size={20} /></button>
              </>
            ) : (
              <span className="font-bold text-white text-sm mx-auto">{getLabel()}</span>
            )}
          </div>

          <div className={`grid gap-1 ${(viewMode === 'year' || viewMode === 'all') ? 'grid-cols-12 sm:grid-cols-[repeat(26,_minmax(0,_1fr))] lg:grid-cols-[repeat(53,_minmax(0,_1fr))] overflow-x-auto no-scrollbar' : 'grid-cols-7'}`}>
            {/* Weekday headers for Week/Month view */}
            {(viewMode === 'week' || viewMode === 'month') && ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-zinc-500 mb-1">{day}</div>
            ))}
            
            {calendarDays.map((day) => {
              const dayStr = format(day, 'yyyy-MM-dd');
              const isWorked = sessionDates.has(dayStr);
              const isCurrentMonth = viewMode === 'month' ? day.getMonth() === currentDate.getMonth() : true;
              
              if (viewMode === 'year' || viewMode === 'all') {
                return (
                  <div 
                    key={dayStr}
                    title={`${format(day, 'MMM d, yyyy')}${isWorked ? ' - Worked' : ''}`}
                    className={`h-3 w-3 sm:h-4 sm:w-4 rounded-[2px] transition-colors ${
                      isWorked ? '' : 'bg-zinc-800'
                    }`}
                    style={isWorked ? { backgroundColor: project.color } : {}}
                  />
                );
              }

              return (
                <div 
                  key={dayStr}
                  title={`${format(day, 'MMM d, yyyy')}${isWorked ? ' - Worked' : ''}`}
                  className={`aspect-square flex items-center justify-center rounded-lg text-xs font-bold transition-all ${
                    !isCurrentMonth ? 'opacity-20' : ''
                  } ${
                    isWorked 
                      ? 'bg-opacity-20 text-white shadow-inner' 
                      : 'bg-zinc-900 border border-[var(--surface-border)] text-zinc-600'
                  }`}
                  style={isWorked ? { backgroundColor: `${project.color}33`, borderColor: `${project.color}80`, color: project.color } : {}}
                >
                  {format(day, 'd')}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Task List */}
      <div>
        <h4 className="text-sm font-bold text-zinc-400 mb-4 flex items-center space-x-2">
          <CheckCircle2 size={16} />
          <span>Project Tasks</span>
        </h4>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
          {tasks.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">No tasks assigned to this project yet.</p>
          ) : (
            tasks.map((t) => (
              <div key={t.id} className={`flex items-center justify-between p-3 rounded-lg border border-[var(--surface-border)] bg-zinc-900 ${t.status === 'completed' ? 'opacity-60 line-through' : ''}`}>
                <div className="flex items-center space-x-3">
                  <div className={`h-2 w-2 rounded-full`} style={{ backgroundColor: project.color }} />
                  <span className="text-sm font-medium text-white">{t.title}</span>
                </div>
                {t.deadline && (
                  <span className="text-xs text-zinc-500">{format(new Date(t.deadline), 'MMM d')}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}

function ProjectCalendarHeatmap({
  projects,
  sessions,
  selectedProjectId,
  onProjectChange,
}: {
  projects: Project[];
  sessions: PomodoroSession[];
  selectedProjectId: string;
  onProjectChange: (projectId: string) => void;
}) {
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const days = useMemo(
    () => eachDayOfInterval({ start: subDays(new Date(), 83), end: new Date() }),
    [],
  );
  const minutesByDate = useMemo(() => {
    const result = new Map<string, number>();
    sessions
      .filter((session) => session.project_id === selectedProjectId)
      .forEach((session) => {
        const key = format(new Date(session.start_time), 'yyyy-MM-dd');
        result.set(key, (result.get(key) ?? 0) + session.duration);
      });
    return result;
  }, [selectedProjectId, sessions]);
  const maximum = Math.max(1, ...minutesByDate.values());

  const backgroundFor = (minutes: number) => {
    if (!minutes) return 'rgba(39, 39, 42, 0.7)';
    const color = selectedProject?.color ?? '#3b82f6';
    const match = /^#([0-9a-f]{6})$/i.exec(color);
    if (!match) return color;
    const value = Number.parseInt(match[1], 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    const alpha = 0.25 + (minutes / maximum) * 0.75;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  };

  return (
    <section className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Project focus calendar</h2>
          <p className="text-sm text-zinc-500">Darker days contain more focused minutes during the last 12 weeks.</p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Project</span>
          <select
            value={selectedProjectId}
            onChange={(event) => onProjectChange(event.target.value)}
            className="min-w-48 rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-2 text-white focus:border-[var(--color-primary)] focus:outline-none"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-1.5 overflow-x-auto pb-2">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const minutes = minutesByDate.get(key) ?? 0;
          return (
            <div
              key={key}
              title={`${format(day, 'MMM d, yyyy')}: ${minutes} focused minutes`}
              aria-label={`${format(day, 'MMMM d')}: ${minutes} focused minutes`}
              className="h-7 w-7 rounded-md border border-white/5"
              style={{ backgroundColor: backgroundFor(minutes) }}
            />
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-zinc-500">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((level) => (
          <span
            key={level}
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: backgroundFor(maximum * level) }}
          />
        ))}
        <span>More</span>
      </div>
    </section>
  );
}

function RotateCcwIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
  )
}
