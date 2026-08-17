"use client";

import { useEffect, useMemo } from 'react';
import { Award, CheckCircle, Clock, Flame, LockKeyhole, Medal, Sparkles, Target, TrendingUp, Trophy } from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';
import { usePomodoroStore } from '@/store/pomodoroStore';
import { useHabitStore } from '@/store/habitStore';
import { useAuthStore } from '@/store/authStore';
import { format, isToday, isPast } from 'date-fns';
import { calculateGamification, levelProgress } from '@/lib/gamification';

export default function Home() {
  const { tasks, fetchTasks, updateTaskStatus } = useTaskStore();
  const { sessions, fetchSessions } = usePomodoroStore();
  const { habits, logs, fetchHabits, checkInHabit } = useHabitStore();
  const profile = useAuthStore((state) => state.profile);

  useEffect(() => {
    fetchTasks();
    fetchSessions();
    fetchHabits();
  }, [fetchTasks, fetchSessions, fetchHabits]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // --- STATS CALCULATION ---
  const stats = useMemo(() => {
    // Habits Today
    const allLogs = Object.values(logs).flat();
    const habitsCompletedToday = allLogs.filter(l => l.completed_at === todayStr).length;

    const tasksCompletedToday = tasks.filter(t => (
      t.status === 'completed' && t.completed_at && isToday(new Date(t.completed_at))
    )).length;

    // Focus Hours Today
    const sessionsToday = sessions.filter(s => format(new Date(s.start_time), 'yyyy-MM-dd') === todayStr);
    const focusMinutesToday = sessionsToday.reduce((acc, curr) => acc + curr.duration, 0);

    // Productivity Score (Formula: max 100 based on goals: 5 tasks, 120 mins focus, 3 habits)
    const taskScore = Math.min((tasksCompletedToday / 5) * 33, 33);
    const focusScore = Math.min((focusMinutesToday / 120) * 33, 33);
    const habitScore = Math.min((habitsCompletedToday / 3) * 34, 34);
    const productivityScore = Math.round(taskScore + focusScore + habitScore);

    return {
      habitsCompletedToday,
      tasksCompletedToday,
      focusMinutesToday,
      productivityScore
    };
  }, [tasks, sessions, logs, todayStr]);

  // --- UI LISTS ---
  const pendingTasks = useMemo(() => {
    return tasks
      .filter(t => t.status !== 'completed')
      .sort((a, b) => {
        // High priority first, then deadline
        const pWeight = { high: 3, medium: 2, low: 1 };
        if (pWeight[b.priority] !== pWeight[a.priority]) return pWeight[b.priority] - pWeight[a.priority];
        if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        return 0;
      })
      .slice(0, 5); // top 5
  }, [tasks]);

  const gamification = useMemo(
    () => calculateGamification(tasks, sessions, habits, logs),
    [habits, logs, sessions, tasks],
  );
  const gamificationProgress = levelProgress(gamification.totalExperience);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <header className="mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight">
          Welcome back, <span className="bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-success)] bg-clip-text text-transparent">{profile?.username || 'there'}</span>
        </h1>
        <p className="mt-2 text-zinc-400">Ready to conquer your goals today?</p>
      </header>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Habits Done Today', value: stats.habitsCompletedToday.toString(), icon: Flame, color: 'text-[var(--color-danger)]', bg: 'bg-[var(--color-danger)]/10' },
          { label: 'Tasks Done Today', value: stats.tasksCompletedToday.toString(), icon: CheckCircle, color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success)]/10' },
          { label: 'Focus Time Today', value: `${Math.floor(stats.focusMinutesToday / 60)}h ${stats.focusMinutesToday % 60}m`, icon: Target, color: 'text-[var(--color-primary)]', bg: 'bg-[var(--color-primary)]/10' },
          { label: 'Productivity Score', value: `${stats.productivityScore}%`, icon: TrendingUp, color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success)]/10' },
        ].map((stat) => (
          <div key={stat.label} className="group relative overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[var(--color-primary)]/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-400">{stat.label}</p>
                <p className="mt-2 text-3xl font-bold">{stat.value}</p>
              </div>
              <div className={`rounded-xl p-3 ${stat.bg} ${stat.color} transition-transform group-hover:scale-110`}>
                <stat.icon size={24} />
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[var(--color-primary)]/10 p-6" aria-labelledby="gamification-heading">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-500/15 p-3 text-amber-400"><Trophy size={25} /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Productivity level</p>
                <h2 id="gamification-heading" className="text-2xl font-black">Level {gamification.level}</h2>
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                <span className="font-semibold text-zinc-300">{gamificationProgress.earnedThisLevel} of {gamificationProgress.neededThisLevel} XP to Level {gamification.level + 1}</span>
                <span className="shrink-0 text-zinc-500">{gamification.totalExperience} lifetime XP</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-[var(--color-primary)] to-[var(--color-success)] transition-all" style={{ width: `${gamificationProgress.percentage}%` }} />
              </div>
            </div>
          </div>

          <div className="grid shrink-0 gap-3 sm:grid-cols-3">
            {[
              { label: 'Tasks', xp: gamification.tasks.experience, detail: `${gamification.tasks.completed} completed`, icon: CheckCircle, color: 'text-emerald-400 bg-emerald-500/10' },
              { label: 'Focus', xp: gamification.focus.experience, detail: `${gamification.focus.minutes} minutes`, icon: Target, color: 'text-blue-400 bg-blue-500/10' },
              { label: 'Habits', xp: gamification.habits.experience, detail: `${gamification.habits.checkIns} check-ins`, icon: Flame, color: 'text-orange-400 bg-orange-500/10' },
            ].map((source) => (
              <div key={source.label} className="min-w-36 rounded-xl border border-[var(--surface-border)] bg-zinc-950/40 p-4">
                <div className={`mb-3 w-fit rounded-lg p-2 ${source.color}`}><source.icon size={18} /></div>
                <p className="text-sm font-bold">{source.label}</p>
                <p className="mt-1 text-xl font-black text-white">{source.xp} XP</p>
                <p className="text-xs text-zinc-500">{source.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-7 border-t border-[var(--surface-border)] pt-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="flex items-center gap-2 font-bold"><Medal size={18} className="text-amber-400" />Achievements</h3>
            <span className="text-xs text-zinc-500">{gamification.achievements.filter((achievement) => achievement.unlocked).length}/{gamification.achievements.length} unlocked</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {gamification.achievements.map((achievement) => {
              const completion = Math.min(100, (achievement.progress / achievement.target) * 100);
              return (
                <article key={achievement.id} className={`rounded-xl border p-4 ${achievement.unlocked ? 'border-amber-500/30 bg-amber-500/5' : 'border-[var(--surface-border)] bg-zinc-950/30'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`rounded-lg p-2 ${achievement.unlocked ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-800 text-zinc-500'}`}>
                      {achievement.unlocked ? <Award size={18} /> : <LockKeyhole size={18} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-zinc-100">{achievement.name}</h4>
                        {achievement.unlocked && <Sparkles size={15} className="shrink-0 text-amber-400" />}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{achievement.description}</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                        <div className={`h-full rounded-full ${achievement.unlocked ? 'bg-amber-400' : 'bg-[var(--color-primary)]'}`} style={{ width: `${completion}%` }} />
                      </div>
                      <p className="mt-1 text-right text-[10px] text-zinc-500">{Math.min(achievement.progress, achievement.target)}/{achievement.target}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Pending Tasks */}
        <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 flex flex-col h-[400px]">
          <h2 className="mb-4 text-xl font-bold flex items-center justify-between">
            <span>Top Priorities</span>
          </h2>
          <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
            {pendingTasks.length === 0 ? (
              <p className="text-sm text-zinc-500 italic">No pending tasks. You&apos;re all caught up!</p>
            ) : (
              pendingTasks.map((task) => {
                const isOverdue = task.deadline && isPast(new Date(task.deadline)) && !isToday(new Date(task.deadline));
                return (
                  <div key={task.id} className={`group flex items-center justify-between rounded-xl border p-4 transition-colors ${isOverdue ? 'border-[var(--color-danger)]/50 bg-[var(--color-danger)]/5' : 'border-[var(--surface-border)] hover:bg-[var(--surface-border)]/50'}`}>
                    <div className="flex items-center space-x-4 min-w-0">
                      <button onClick={() => updateTaskStatus(task.id, 'completed')} className="shrink-0 text-zinc-500 hover:text-[var(--color-success)]">
                        <CheckCircle size={20} />
                      </button>
                      <div className="truncate">
                        <p className={`font-medium truncate ${isOverdue ? 'text-[var(--color-danger)]' : 'text-zinc-200'}`}>{task.title}</p>
                        {task.deadline && (
                          <p className="text-xs text-zinc-500 mt-1 flex items-center space-x-1">
                            <Clock size={12} />
                            <span>{format(new Date(task.deadline), 'MMM d, h:mm a')}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${
                      task.priority === 'high' ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' : 
                      task.priority === 'medium' ? 'bg-amber-500/10 text-amber-500' : 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                    }`}>
                      {task.priority}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Daily Habits */}
        <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 flex flex-col h-[400px]">
          <h2 className="mb-4 text-xl font-bold">Daily Habits</h2>
          <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
            {habits.length === 0 ? (
              <p className="text-sm text-zinc-500 italic">No habits tracking right now.</p>
            ) : (
              habits.map((habit) => {
                const habitLogs = logs[habit.id] || [];
                const checkedInToday = habitLogs.some(log => log.completed_at === todayStr);

                return (
                  <div key={habit.id} className="flex items-center justify-between rounded-xl border border-[var(--surface-border)] p-4 transition-colors hover:bg-[var(--surface-border)]/50">
                    <div className="flex items-center space-x-4">
                      <button 
                        onClick={() => { if(!checkedInToday) checkInHabit(habit.id, todayStr) }}
                        disabled={checkedInToday}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${checkedInToday ? 'bg-[var(--color-success)] text-white shadow-lg shadow-[var(--color-success)]/20 cursor-default' : 'bg-zinc-800 text-zinc-400 hover:bg-[var(--color-primary)] hover:text-white'}`}
                      >
                        <Target size={20} />
                      </button>
                      <div>
                        <span className={`font-medium ${checkedInToday ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{habit.name}</span>
                        <p className="text-xs text-zinc-500 mt-1 flex items-center space-x-1">
                          <Flame size={12} className={checkedInToday ? "text-[var(--color-danger)]" : ""} />
                          <span>{habit.current_streak} Streak</span>
                        </p>
                      </div>
                    </div>
                    {checkedInToday && (
                      <span className="text-xs font-bold text-[var(--color-success)] bg-[var(--color-success)]/10 px-3 py-1 rounded-full">
                        Done
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
