-- Supabase Schema Update (Phase 3.5: Feature Expansion)

-- 1. Projects Table Updates
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS estimated_end_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'; -- 'active', 'completed'

-- 2. Tasks Table Updates
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium'; -- 'low', 'medium', 'high'

-- 3. Habits Table Updates
ALTER TABLE public.habits 
ADD COLUMN IF NOT EXISTS target_days_per_week integer DEFAULT 7; -- For 'n_times_a_week' frequency
