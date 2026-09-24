"use client";

import { useEffect, useState, useMemo } from "react";
import { useHabitStore, Habit, HabitLog } from "@/store/habitStore";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Plus, Flame, Check, Trash2, CalendarDays, Edit3, BarChart2, ChevronLeft, ChevronRight, GripVertical, ArrowUp, ArrowDown, AlertCircle } from "lucide-react";
import { format, subDays, differenceInDays, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, startOfYear, endOfYear, addMonths, subMonths, addYears, subYears } from "date-fns";

export default function HabitsPage() {
  const {
    habits,
    logs,
    loading,
    error,
    fetchHabits,
    addHabit,
    updateHabit,
    toggleHabitCheckIn,
    checkInHabit,
    deleteHabit,
    reorderHabits,
    clearError,
  } = useHabitStore();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null);
  const [draggedHabitId, setDraggedHabitId] = useState<string | null>(null);
  const [backdateHabit, setBackdateHabit] = useState<Habit | null>(null);
  const [habitPendingDeletion, setHabitPendingDeletion] = useState<Habit | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [backdateDate, setBackdateDate] = useState(format(subDays(new Date(), 1), 'yyyy-MM-dd'));

  // Form State
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'n_times_a_week'>('daily');
  const [targetDays, setTargetDays] = useState(7);

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  const openAddModal = () => {
    clearError();
    setEditingHabit(null);
    setName("");
    setFrequency("daily");
    setTargetDays(7);
    setIsModalOpen(true);
  };

  const openEditModal = (habit: Habit, e: React.MouseEvent) => {
    e.stopPropagation();
    clearError();
    setEditingHabit(habit);
    setName(habit.name);
    setFrequency(habit.frequency);
    setTargetDays(habit.target_days_per_week);
    setIsModalOpen(true);
  };

  const openBackdateModal = (habit: Habit, e: React.MouseEvent) => {
    e.stopPropagation();
    clearError();
    setBackdateHabit(habit);
    setBackdateDate(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
  };

  const saveBackdatedCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backdateHabit) return;
    const saved = await checkInHabit(backdateHabit.id, backdateDate);
    if (saved) setBackdateHabit(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    if (editingHabit) {
      await updateHabit(editingHabit.id, {
        name,
        frequency,
        target_days_per_week: frequency === 'daily' ? 7 : frequency === 'weekly' ? 1 : targetDays
      });
    } else {
      await addHabit(
        name, 
        frequency, 
        frequency === 'daily' ? 7 : frequency === 'weekly' ? 1 : targetDays
      );
    }
    
    if (!useHabitStore.getState().error) setIsModalOpen(false);
  };

  const moveHabit = (habitId: string, direction: -1 | 1) => {
    const currentIndex = habits.findIndex((habit) => habit.id === habitId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= habits.length) return;
    const next = [...habits];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    void reorderHabits(next.map((habit) => habit.id));
  };

  const dropHabit = (targetHabitId: string) => {
    if (!draggedHabitId || draggedHabitId === targetHabitId) return;
    const next = [...habits];
    const sourceIndex = next.findIndex((habit) => habit.id === draggedHabitId);
    const targetIndex = next.findIndex((habit) => habit.id === targetHabitId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDraggedHabitId(null);
    void reorderHabits(next.map((habit) => habit.id));
  };

  const confirmDeleteHabit = async () => {
    if (!habitPendingDeletion) return;
    setDeleting(true);
    const removed = await deleteHabit(habitPendingDeletion.id);
    setDeleting(false);
    if (removed) setHabitPendingDeletion(null);
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const last7Days = Array.from({ length: 7 }).map((_, i) => format(subDays(new Date(), 6 - i), 'yyyy-MM-dd')).reverse();

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">Habits</h1>
          <p className="mt-2 text-zinc-400">Build consistency, track your progress.</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center space-x-2 rounded-xl bg-gradient-to-tr from-[var(--color-primary)] to-[var(--color-success)] px-4 py-2.5 font-semibold text-white shadow-lg transition-transform hover:scale-105"
        >
          <Plus size={20} />
          <span>New Habit</span>
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {loading && habits.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--surface-border)] border-t-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {habits.map((habit) => {
            const habitLogs = logs[habit.id] || [];
            const checkedInToday = habitLogs.some(log => log.completed_at === todayStr);
            const isExpanded = expandedHabitId === habit.id;

            return (
              <div 
                key={habit.id} 
                draggable
                onDragStart={() => setDraggedHabitId(habit.id)}
                onDragEnd={() => setDraggedHabitId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropHabit(habit.id)}
                className={`group relative overflow-hidden rounded-2xl border bg-[var(--surface)] transition-all duration-300 hover:border-[var(--color-primary)]/50 hover:shadow-xl cursor-pointer ${isExpanded ? 'md:col-span-2' : ''} ${draggedHabitId === habit.id ? 'border-[var(--color-primary)] opacity-50' : 'border-[var(--surface-border)]'}`}
                onClick={() => setExpandedHabitId(isExpanded ? null : habit.id)}
              >
                <div className="p-6">
                  <div className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-[var(--surface)]/90 p-1 opacity-100 shadow-sm md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label={`Move ${habit.name} up`}
                      disabled={habits[0]?.id === habit.id}
                      onClick={(event) => { event.stopPropagation(); moveHabit(habit.id, -1); }}
                      className="p-1.5 text-zinc-500 hover:text-white disabled:opacity-30"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${habit.name} down`}
                      disabled={habits[habits.length - 1]?.id === habit.id}
                      onClick={(event) => { event.stopPropagation(); moveHabit(habit.id, 1); }}
                      className="p-1.5 text-zinc-500 hover:text-white disabled:opacity-30"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button 
                      type="button"
                      aria-label={`Check in ${habit.name} for a previous day`}
                      onClick={(e) => openBackdateModal(habit, e)}
                      className="p-1.5 text-zinc-500 hover:text-[var(--color-success)]"
                    >
                      <CalendarDays size={16} />
                    </button>
                    <button 
                      type="button"
                      aria-label={`Edit ${habit.name}`}
                      onClick={(e) => openEditModal(habit, e)}
                      className="p-1.5 text-zinc-500 hover:text-[var(--color-primary)]"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button 
                      type="button"
                      aria-label={`Delete ${habit.name}`}
                      onClick={(e) => { e.stopPropagation(); setHabitPendingDeletion(habit); }}
                      className="p-1.5 text-zinc-500 hover:text-[var(--color-danger)]"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div className={`flex h-12 w-12 shrink-0 cursor-grab items-center justify-center rounded-xl shadow-inner active:cursor-grabbing ${checkedInToday ? 'bg-gradient-to-tr from-[var(--color-primary)] to-[var(--color-success)] text-white' : 'bg-[var(--surface-border)] text-zinc-400'}`} title="Drag to reorder">
                      <GripVertical size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate pr-48 text-lg font-bold text-white">{habit.name}</h3>
                      <div className="flex items-center space-x-3 text-sm font-medium text-zinc-400">
                        <span className="flex items-center space-x-1 text-[var(--color-danger)] whitespace-nowrap">
                          <Flame size={14} />
                          <span>{habit.current_streak} Streak</span>
                        </span>
                        <span className="text-zinc-600 hidden sm:inline">•</span>
                        <span className="hidden sm:inline">Best: {habit.longest_streak}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    {/* Mini 7-day heatmap */}
                    <div className="flex space-x-1.5">
                      {last7Days.map((dayStr) => {
                        const isCompleted = habitLogs.some(log => log.completed_at === dayStr);
                        const isToday = dayStr === todayStr;
                        const isBeforeHabit = dayStr < format(new Date(habit.created_at), 'yyyy-MM-dd');
                        return (
                          <button
                            type="button"
                            key={dayStr}
                            disabled={isBeforeHabit}
                            onClick={(event) => { event.stopPropagation(); void toggleHabitCheckIn(habit.id, dayStr); }}
                            title={`${format(new Date(dayStr), 'MMM d, yyyy')} · ${isCompleted ? 'Click to undo' : 'Click to check in'}`}
                            aria-label={`${isCompleted ? 'Remove' : 'Add'} ${habit.name} check-in for ${format(new Date(dayStr), 'MMMM d, yyyy')}`}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
                              isCompleted 
                                ? 'border-transparent bg-[var(--color-success)]/20 text-[var(--color-success)]' 
                                : isToday
                                  ? 'border-[var(--color-primary)] bg-transparent text-[var(--color-primary)]'
                                  : 'border-transparent bg-zinc-900 text-zinc-600 hover:border-[var(--color-success)] hover:text-[var(--color-success)]'
                            }`}
                          >
                            {isCompleted ? <Check size={14} /> : format(new Date(dayStr), 'd')}
                          </button>
                        );
                      })}
                    </div>
                    
                    <button 
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void toggleHabitCheckIn(habit.id, todayStr); }}
                      className={`flex items-center justify-center gap-1 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                        checkedInToday
                          ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-red-500/10 hover:text-red-300'
                          : 'bg-[var(--surface-border)] text-white hover:bg-[var(--color-primary)]'
                      }`}
                    >
                      {checkedInToday && <Check size={16} />}
                      <span>{checkedInToday ? 'Completed · undo' : 'Check in today'}</span>
                    </button>
                  </div>
                </div>

                {/* Expanded Detailed View */}
                {isExpanded && (
                  <div className="border-t border-[var(--surface-border)] bg-zinc-900/30 p-6 animate-in slide-in-from-top-2" onClick={(e) => e.stopPropagation()}>
                    <HabitDetails
                      habit={habit}
                      logs={habitLogs}
                      onToggle={(dayStr) => toggleHabitCheckIn(habit.id, dayStr)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-bold mb-6">{editingHabit ? "Edit Habit" : "New Habit"}</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-400">Habit Name *</label>
                <input
                  autoFocus
                  required
                  type="text"
                  placeholder="e.g. Read 20 pages"
                  className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-2 text-white focus:border-[var(--color-primary)] focus:outline-none"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-400">Frequency</label>
                <select
                  className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-2 text-white focus:border-[var(--color-primary)] focus:outline-none"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as Habit['frequency'])}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Once a Week</option>
                  <option value="n_times_a_week">Multiple times a week</option>
                </select>
              </div>

              {frequency === 'n_times_a_week' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-400">Target Days per Week</label>
                  <input
                    type="number"
                    min="1"
                    max="7"
                    required
                    className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-2 text-white focus:border-[var(--color-primary)] focus:outline-none"
                    value={targetDays}
                    onChange={(e) => setTargetDays(parseInt(e.target.value))}
                  />
                </div>
              )}

              <div className="mt-6 flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg px-4 py-2 font-semibold text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--color-primary)] px-6 py-2 font-bold text-white hover:opacity-90 transition-opacity"
                >
                  {editingHabit ? "Save Changes" : "Create Habit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {backdateHabit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="backdate-check-in-title">
          <div className="w-full max-w-md rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 id="backdate-check-in-title" className="flex items-center gap-2 text-2xl font-bold">
              <CalendarDays />
              Previous-day check-in
            </h2>
            <p className="mt-2 text-sm text-zinc-400">Add a missed check-in for <span className="font-semibold text-white">{backdateHabit.name}</span>.</p>
            <form onSubmit={saveBackdatedCheckIn} className="mt-6 space-y-5">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-400">Date *</span>
                <input
                  required
                  type="date"
                  min={format(new Date(backdateHabit.created_at), 'yyyy-MM-dd')}
                  max={format(subDays(new Date(), 1), 'yyyy-MM-dd')}
                  value={backdateDate}
                  onChange={(e) => setBackdateDate(e.target.value)}
                  className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900 px-4 py-2.5 text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
              </label>
              {(logs[backdateHabit.id] ?? []).some((log) => log.completed_at === backdateDate) && (
                <p className="rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">This habit is already checked in on the selected date.</p>
              )}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setBackdateHabit(null)} className="rounded-lg px-4 py-2 font-semibold text-zinc-400 hover:text-white">Cancel</button>
                <button
                  type="submit"
                  disabled={(logs[backdateHabit.id] ?? []).some((log) => log.completed_at === backdateDate)}
                  className="rounded-lg bg-[var(--color-primary)] px-6 py-2 font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add check-in
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(habitPendingDeletion)}
        title="Delete this habit?"
        description={
          <>
            <strong className="text-zinc-200">{habitPendingDeletion?.name}</strong> and all{" "}
            {habitPendingDeletion ? (logs[habitPendingDeletion.id]?.length ?? 0) : 0} of its
            check-ins will be permanently deleted, and the XP earned from them will be
            removed. This cannot be undone.
          </>
        }
        confirmLabel="Delete habit"
        busy={deleting}
        onConfirm={() => void confirmDeleteHabit()}
        onCancel={() => setHabitPendingDeletion(null)}
      />
    </div>
  );
}


// --- HabitDetails Subcomponent ---
function HabitDetails({ habit, logs, onToggle }: { habit: Habit; logs: HabitLog[]; onToggle: (dayStr: string) => Promise<boolean> }) {
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'year'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Calculate Stats
  const stats = useMemo(() => {
    const logSet = new Set(logs.map(l => l.completed_at));
    const today = new Date();
    const created = new Date(habit.created_at);
    
    const countCompleted = (days: number) => {
      let count = 0;
      for (let i = 0; i < days; i++) {
        if (logSet.has(format(subDays(today, i), 'yyyy-MM-dd'))) count++;
      }
      return count;
    };

    const pastWeek = countCompleted(7);
    const pastMonth = countCompleted(30);
    const pastYear = countCompleted(365);
    
    const daysSinceCreated = Math.max(1, differenceInDays(today, created) + 1);
    const allTimeCount = logSet.size;

    return {
      week: Math.round((pastWeek / 7) * 100),
      month: Math.round((pastMonth / 30) * 100),
      year: Math.round((pastYear / 365) * 100),
      allTime: Math.round((allTimeCount / daysSinceCreated) * 100),
    };
  }, [logs, habit.created_at]);

  // Generate Calendar Days based on View Mode
  const calendarDays = useMemo(() => {
    let start, end;
    if (viewMode === 'week') {
      start = startOfWeek(currentDate);
      end = endOfWeek(currentDate);
    } else if (viewMode === 'month') {
      start = startOfWeek(startOfMonth(currentDate));
      end = endOfWeek(endOfMonth(currentDate));
    } else {
      start = startOfYear(currentDate);
      end = endOfYear(currentDate);
    }
    return eachDayOfInterval({ start, end });
  }, [viewMode, currentDate]);

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
    return format(currentDate, 'yyyy');
  };

  const logSet = new Set(logs.map(l => l.completed_at));

  return (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div>
        <h4 className="text-sm font-bold text-zinc-400 mb-4 flex items-center space-x-2">
          <BarChart2 size={16} />
          <span>Completion Rates</span>
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBox label="Past 7 Days" percentage={stats.week} />
          <StatBox label="Past 30 Days" percentage={stats.month} />
          <StatBox label="Past Year" percentage={stats.year} />
          <StatBox label="All Time" percentage={stats.allTime} />
        </div>
      </div>

      {/* Heatmap Configuration */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
          <h4 className="text-sm font-bold text-zinc-400 flex items-center space-x-2">
            <CalendarDays size={16} />
            <span>Activity Heatmap</span>
          </h4>
          <p className="text-xs text-zinc-500">Click any eligible day to add or undo a check-in.</p>
          
          <div className="flex items-center space-x-2 bg-zinc-900 rounded-xl p-1 border border-[var(--surface-border)]">
            {(['week', 'month', 'year'] as const).map(mode => (
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
            <button onClick={handlePrev} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400"><ChevronLeft size={20} /></button>
            <span className="font-bold text-white text-sm">{getLabel()}</span>
            <button onClick={handleNext} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400"><ChevronRight size={20} /></button>
          </div>

          <div className={`grid gap-1 ${viewMode === 'year' ? 'grid-cols-12 sm:grid-cols-[repeat(26,_minmax(0,_1fr))] lg:grid-cols-[repeat(53,_minmax(0,_1fr))] overflow-x-auto no-scrollbar' : 'grid-cols-7'}`}>
            {/* Weekday headers for Week/Month view */}
            {viewMode !== 'year' && ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-zinc-500 mb-1">{day}</div>
            ))}
            
            {calendarDays.map(day => {
              const dayStr = format(day, 'yyyy-MM-dd');
              const isCompleted = logSet.has(dayStr);
              const isCurrentMonth = viewMode === 'month' ? day.getMonth() === currentDate.getMonth() : true;
              const isEligible = dayStr <= format(new Date(), 'yyyy-MM-dd')
                && dayStr >= format(new Date(habit.created_at), 'yyyy-MM-dd');
              
              if (viewMode === 'year') {
                return (
                  <button
                    type="button"
                    key={dayStr}
                    disabled={!isEligible}
                    onClick={() => void onToggle(dayStr)}
                    title={`${format(day, 'MMM d, yyyy')}${isCompleted ? ' · Click to undo' : isEligible ? ' · Click to check in' : ''}`}
                    aria-label={`${isCompleted ? 'Remove' : 'Add'} ${habit.name} check-in for ${format(day, 'MMMM d, yyyy')}`}
                    className={`h-3 w-3 sm:h-4 sm:w-4 rounded-[2px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                      isCompleted ? 'bg-[var(--color-success)]' : 'bg-zinc-800'
                    } ${isEligible ? 'hover:ring-2 hover:ring-[var(--color-success)]/60' : ''}`}
                  />
                );
              }

              return (
                <button
                  type="button"
                  key={dayStr}
                  disabled={!isEligible}
                  onClick={() => void onToggle(dayStr)}
                  title={`${format(day, 'MMM d, yyyy')}${isCompleted ? ' · Click to undo' : isEligible ? ' · Click to check in' : ''}`}
                  aria-label={`${isCompleted ? 'Remove' : 'Add'} ${habit.name} check-in for ${format(day, 'MMMM d, yyyy')}`}
                  className={`aspect-square flex items-center justify-center rounded-lg text-xs font-bold transition-all disabled:cursor-not-allowed ${
                    !isCurrentMonth ? 'opacity-20' : ''
                  } ${
                    isCompleted 
                      ? 'bg-[var(--color-success)]/20 text-[var(--color-success)] border border-[var(--color-success)]/30 hover:bg-red-500/10 hover:text-red-300'
                      : isEligible
                        ? 'bg-zinc-900 border border-[var(--surface-border)] text-zinc-600 hover:border-[var(--color-success)] hover:text-[var(--color-success)]'
                        : 'bg-zinc-900 border border-[var(--surface-border)] text-zinc-700 opacity-30'
                  }`}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, percentage }: { label: string, percentage: number }) {
  return (
    <div className="rounded-xl border border-[var(--surface-border)] bg-zinc-900 p-4 flex flex-col items-center justify-center text-center">
      <span className="text-xs font-semibold text-zinc-500 mb-1">{label}</span>
      <div className="flex items-baseline space-x-1">
        <span className="text-2xl font-black text-white">{percentage}</span>
        <span className="text-sm font-bold text-[var(--color-primary)]">%</span>
      </div>
    </div>
  );
}
