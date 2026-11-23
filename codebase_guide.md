# OneStep Codebase Guide

## Purpose

OneStep is a Next.js productivity application backed by Supabase. It combines
projects, tasks, habit tracking, Pomodoro and manually recorded focus sessions,
analytics, and source-derived gamification.

This guide describes the repository as it exists after the August 2026 feature
work. For the longer product and architecture history, see
`PROJECT_DOCUMENTATION.md`. For Vercel deployment, see
`web/VERCEL_DEPLOYMENT.md`.

## Repository layout

```text
OneStep/
├── codebase_guide.md
├── IMPLEMENTATION_STATUS.md
├── ROADMAP_AND_FIXES.md
├── PROJECT_DOCUMENTATION.md
├── .github/workflows/quality.yml
├── android/
├── supabase/
│   ├── schema.sql
│   ├── update_schema.sql
│   ├── phase_8_14_improvements.sql
│   ├── gamification_system.sql
│   ├── manual_focus_project_assignment.sql
│   ├── milestone_1_integrity.sql
│   ├── milestone_1_verification.sql
│   ├── milestone_2_xp_fixes.sql
│   └── milestone_2_streak_bonus.sql
└── web/
    ├── src/app/
    │   ├── (auth)/login/page.tsx
    │   └── (dashboard)/
    │       ├── analytics/page.tsx
    │       ├── habits/page.tsx
    │       ├── pomodoro/page.tsx
    │       ├── projects/page.tsx
    │       ├── settings/page.tsx
    │       ├── tasks/page.tsx
    │       └── page.tsx
    ├── src/components/
    ├── src/lib/
    ├── src/store/
    ├── .env.example
    ├── README.md
    └── VERCEL_DEPLOYMENT.md
```

The OneStep root is the Git root. An Android client lives in `android/`; see
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for its scope.

## Technology stack

| Layer | Technology |
|---|---|
| Web framework | Next.js 16 App Router |
| UI runtime | React 19 and TypeScript |
| Styling | Tailwind CSS 3 |
| State | Zustand 5 |
| Database and authentication | Supabase Auth, PostgreSQL, and Row Level Security |
| Charts | Recharts |
| Dates | date-fns |
| Icons | lucide-react |
| Package manager | npm with `package-lock.json` |
| Supported runtime | Node.js 22.x |
| Intended hosting | Vercel |

Most application pages are client components because they contain interactive
forms, timers, browser notifications, and Zustand-backed Supabase data.

## Authentication flow

`web/src/app/(auth)/login/page.tsx` owns both Login and Sign Up modes.

- Both password inputs have accessible show/hide controls.
- Sign Up requires username, email, password, and password confirmation.
- Mismatched passwords are rejected before Supabase is called.
- After a successful signup, the client signs out, switches to Login mode,
  displays an in-page email-confirmation message, and remains at `/login`.
- Login uses `supabase.auth.signInWithPassword()` and routes to the dashboard.
- `AuthProvider.tsx` loads the session/profile and guards dashboard routes.
- Supabase email confirmation must be enabled and production URLs must be
  configured as described in `VERCEL_DEPLOYMENT.md`.

## Domain model

### Projects and tasks

Every task belongs to a project. The protected per-user `Misc.` project is the
fallback. Tasks store priority, deadline, estimated minutes, status, and the
actual `completed_at` timestamp.

### Focus sessions

A focus session always belongs to a project and may optionally belong to a task.

- Timer-created focus can select an open task or use `Misc.`.
- Manual focus can be assigned to an open task or directly to a project.
- When a task is selected, its project is authoritative.
- When a project is selected directly, the session has a null `task_id`.
- The database trigger validates that the selected task/project belongs to the
  authenticated user.
- Manual focus records duration, start/end timestamps, and participates in
  analytics and XP.

Existing databases must apply
`supabase/manual_focus_project_assignment.sql` for direct project assignment.

### Habits

Habit completions are individual rows in `habit_logs`, unique per habit/date.

- Today can be toggled from the habit card.
- Recent day cells on the card are clickable.
- Every eligible day in the expanded week/month/year calendar is clickable.
- Clicking an incomplete day checks it in; clicking a completed day undoes it.
- Dates before habit creation and future dates are disabled.
- Daily and weekly streaks are recalculated **by the database** from the logs.
  The streak columns are not writable by clients, because `longest_streak` feeds
  the XP formula.
- Habit ordering is persisted with `display_order`.

### Gamification

XP is deterministically derived from task completions, task bonuses, focus
minutes, completed focus sessions, habit check-ins, and streak milestones.
PostgreSQL triggers update `profiles.experience_points` and `profiles.level`.
The dashboard and header use the shared calculator in
`web/src/lib/gamification.ts`.

## State and data flow

| Store | Responsibility |
|---|---|
| `authStore.ts` | Auth user, profile, readiness, profile refresh |
| `projectStore.ts` | Project CRUD and protected `Misc.` project |
| `taskStore.ts` | Task CRUD, project fallback, completion timestamps |
| `habitStore.ts` | Habit CRUD, logs, ordering, server streak read-back |
| `pomodoroStore.ts` | Timer state, countdown, persistence, sessions, manual focus |

All user-owned tables use Supabase RLS. The browser uses only a publishable
(or legacy anonymous) key; never expose a secret or service-role key.

## Database setup and migration order

For a new empty Supabase project, run:

```text
supabase/schema.sql
```

For an existing original OneStep database, apply:

```text
supabase/update_schema.sql                  # only if not previously applied
supabase/phase_8_14_improvements.sql
supabase/gamification_system.sql
supabase/manual_focus_project_assignment.sql
supabase/milestone_1_integrity.sql
supabase/milestone_2_xp_fixes.sql
supabase/milestone_2_streak_bonus.sql
```

Then run `supabase/milestone_1_verification.sql` to confirm every protection is
installed. `milestone_1_integrity.sql` must ship with the matching client
release: the client stopped writing habit streaks and the database stopped
allowing it.

Do not run the full `schema.sql` over a populated database.

## Local development in WSL

```bash
cd /mnt/c/Users/Bhuvee/Documents/IIITH/projects/OneStep/web
cp .env.example .env.local
npm install
npm run dev
```

Set the Supabase URL and publishable key in `.env.local`. Do not share one
`node_modules` installation between Windows Node and WSL Node.

Quality checks:

```bash
npm run lint
npm run typecheck
npm run build
```

## Main routes

| Route | Main behavior |
|---|---|
| `/login` | Login, signup, password visibility, confirmation handoff |
| `/` | Daily summary, priorities, habits, gamification |
| `/projects` | Projects, tasks, progress, focus heatmap |
| `/tasks` | Task creation, completion, deadline/time metrics |
| `/pomodoro` | Timer, manual focus, notifications, history |
| `/habits` | Ordered habits, clickable calendars, streak analytics |
| `/analytics` | Overview, Projects, Tasks, and Habits analytics |
| `/settings` | Profile, timer defaults, notification permission |

## Deployment

The application is prepared for Vercel with Node.js 22.x and public Supabase
environment variables. Follow `web/VERCEL_DEPLOYMENT.md`, including Supabase
Site URL and redirect URL configuration after Vercel assigns the production
domain.

## Verified repository state

The current implementation passes TypeScript (`tsc --noEmit`), the configured
ESLint rules, and a production Next.js 16.2.10 build executed inside WSL. Before
using direct project assignment for manual focus entries against an existing
database, apply `supabase/manual_focus_project_assignment.sql` after the earlier
Phase 8-14 and gamification migrations.

## Current follow-up opportunities

The largest remaining engineering improvements are automated unit/integration
tests, generated Supabase TypeScript types, explicit user timezones,
reduced-motion and chart-table accessibility, background notification delivery,
and splitting the largest page components into smaller testable modules.
