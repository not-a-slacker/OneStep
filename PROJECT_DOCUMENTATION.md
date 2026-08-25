# OneStep Project Documentation

## 1. Project overview

OneStep is a productivity web application that combines:

- Project organization
- Task planning and prioritization
- Habit creation and daily check-ins
- Pomodoro focus sessions
- Progress dashboards and analytics
- A source-driven XP, levels, and achievements system

The product is designed to reduce the need to switch between separate task,
habit, timer, and analytics applications. A user can create a project, assign
tasks to it, track habits, record focused work with a Pomodoro timer, and then
review progress from one dashboard.

The current repository represents a functional MVP. Its main productivity
features are implemented, including task completion analytics, streak-aware
habits, responsive navigation, settings, and gamification. Automated tests,
accessibility auditing, and deployment hardening remain future work.

### Product objective

The main objective is to help users improve productivity by supporting three
connected activities:

1. **Plan:** Create projects, tasks, deadlines, priorities, and habits.
2. **Act:** Complete tasks, check in habits, and run focused Pomodoro sessions.
3. **Reflect:** Review daily summaries, project progress, focus trends, and
   consistency analytics.

### Current maturity

The project is suitable as an MVP, portfolio project, or academic demonstration.
Before production deployment, it should receive additional work in data
integrity, error handling, automated testing, accessibility, responsive design,
analytics correctness, and deployment verification.

---

## 2. Main features

### 2.1 Authentication

Users can:

- Create an account with a username, email, password, and matching password
  confirmation.
- Reveal or hide password fields with accessible eye-icon controls.
- See an in-page email-confirmation notice after signup before returning to
  Login mode.
- Sign in with email and password.
- Remain authenticated through a Supabase session.
- Be redirected to `/login` when unauthenticated.
- Be redirected to the dashboard after signing in.

Supabase Auth stores account credentials. A PostgreSQL trigger automatically
creates a row in the `profiles` table whenever a new auth user is created.

### 2.2 Dashboard

The home dashboard provides a summary of current productivity:

- Habits completed today
- Tasks completed today
- Focus time recorded today
- A calculated productivity score
- Up to five important pending tasks
- Daily habit check-in controls

The productivity score is calculated using three capped components:

- Up to 33 points for completing five tasks due today
- Up to 33 points for recording 120 focus minutes
- Up to 34 points for completing three habit check-ins

This produces a maximum score of 100.

Task completion uses the stored `completed_at` timestamp, so the dashboard and
analytics distinguish work completed today from work merely due today.

### 2.3 Projects

Users can:

- Create a project.
- Choose a project color.
- Set an estimated end date.
- Mark a project as active or completed.
- Delete a project.
- Expand a project to view detailed progress.
- View tasks belonging to the project.
- View focus time associated with the project.
- Inspect project activity across week, month, year, or all-time views.

Every task belongs to a project. Focus sessions optionally reference a task and
always reference a project. A task-linked session inherits its task's project;
a manual entry may target a project directly; otherwise the protected `Misc.`
project is the fallback.

### 2.4 Tasks

Users can create tasks with:

- Title
- Notes
- Deadline
- Priority: low, medium, or high
- Estimated time in minutes
- Required project, with `Misc.` as the fallback
- Status: pending, in progress, or completed

The task page supports:

- Creating tasks
- Editing tasks
- Marking tasks complete
- Restoring completed tasks to pending
- Deleting tasks
- Separating active and completed tasks
- Sorting active tasks by deadline and priority
- Highlighting overdue tasks

### 2.5 Habits

Users can create habits with one of these frequencies:

- Daily
- Weekly
- A selected number of times per week

The habit page supports:

- Creating habits
- Editing habits
- Deleting habits
- Checking in a habit for the current date
- Displaying current and longest streaks
- Viewing completion statistics
- Inspecting week, month, and year calendar views
- Clicking eligible calendar days to add or undo backdated check-ins

Habit completion events are stored separately in `habit_logs`. This is the
correct general structure for calendar and heatmap analytics.

Daily and weekly streaks are recalculated from the stored log dates. Future
dates and dates before the habit was created cannot be checked in.

### 2.6 Pomodoro timer

The Pomodoro page supports:

- Focus mode
- Short-break mode
- Long-break mode
- Configurable durations
- Start, pause, and reset controls
- Optional task association
- Automatic task-to-project association
- Manual focus assignment to an open task or directly to a project
- Protected `Misc.` fallback for unassigned focus
- Browser notifications and an alarm sound
- Focus-session history with incremental loading
- Timer recovery after page refresh
- Automatic switching from focus to break
- A long break after every fourth completed focus session

Only focus periods are written to `pomodoro_sessions`; break periods are not
stored.

The timer uses a target end timestamp rather than only decrementing a counter.
This helps reduce timer drift when the browser is temporarily busy or the tab is
in the background.

### 2.7 Analytics

The analytics page has a global date range and four tabs:

#### Overview

- Total and daily focus statistics
- Standard deviation
- Most and least productive day
- Daily focus-time area chart
- Hourly distribution
- Session-length distribution

#### Projects

- Focus minutes per project over time
- Total focus per project
- Planned versus actual project time
- Completed tasks per project

#### Tasks

- Percentage completed before deadline
- Estimated versus actual task time
- Task volume versus focus time
- Completed tasks grouped by actual completion weekday

#### Habits

- Daily mean number of check-ins
- Median daily check-ins
- Standard deviation
- Habit consistency heatmap
- Completion rate by habit
- Check-ins over time

Task analytics now use `completed_at`; legacy completed tasks receive a
conservative migration backfill because their original completion time was not
previously stored.

### 2.8 Gamification

Gamification is calculated from completed productivity records rather than
client-side button presses. This makes awards idempotent: retries cannot create
duplicate XP, while reopening a task or removing a check-in recalculates the
total correctly.

XP rules are:

| Activity | XP |
|---|---:|
| Complete a task | 50 |
| Medium-priority task bonus | 15 |
| High-priority task bonus | 30 |
| Complete a task on/before its deadline | 20 |
| Focus time | 1 per recorded minute |
| Finish at least the planned focus duration | 10 per session |
| Habit check-in | 30 |
| Each seven-day longest-streak milestone | 25 |

Level thresholds use a quadratic curve:

```text
XP required for level N = 250 × (N - 1)²
level = floor(sqrt(total XP / 250)) + 1
```

This means Level 2 begins at 250 XP, Level 3 at 1,000 XP, Level 4 at 2,250 XP,
and Level 5 at 4,000 XP. The header shows XP earned within the current level,
while the dashboard shows lifetime XP and a task/focus/habit breakdown.

The dashboard also derives six achievements from source data:

- **First Win:** complete one task
- **Task Crusher:** complete 25 tasks
- **Deep Worker:** record 10 focus hours
- **Focus Master:** record 50 focus hours
- **Habit Builder:** reach a seven-day habit streak
- **Consistency Champion:** reach a 30-day habit streak

Locked achievements display progress and unlock automatically when their target
is reached.

---

## 3. System architecture

OneStep uses a client-heavy architecture:

```text
Browser
│
├── Next.js App Router pages
│   ├── Dashboard
│   ├── Projects
│   ├── Tasks
│   ├── Habits
│   ├── Pomodoro
│   └── Analytics
│
├── React hooks
│   ├── Local form and modal state
│   ├── Derived analytics with useMemo
│   └── Timers and initial data loading with useEffect
│
├── Zustand stores
│   ├── Authentication
│   ├── Projects
│   ├── Tasks
│   ├── Habits
│   └── Pomodoro
│
└── Supabase JavaScript client
    ├── Supabase Auth
    ├── PostgreSQL tables
    ├── Generated database API
    └── Row Level Security
```

### Architectural characteristics

#### Presentation layer

Feature pages are implemented as React client components. They contain the user
interface, form state, modals, data aggregation, and user-event handlers.

#### State layer

Zustand stores contain domain state and asynchronous CRUD operations. Each store
calls Supabase directly and updates the in-memory state after successful
requests.

#### Backend

Supabase provides:

- User authentication
- PostgreSQL persistence
- Automatic REST-style APIs
- Row Level Security
- A trigger for profile creation

#### Analytics

Analytics are calculated in the browser from fetched rows. There is currently no
separate analytics API, SQL view, data warehouse, or server-side aggregation
layer.

### Example data flow: completing a focus session

1. The Pomodoro page calls `startTimer()` in the Pomodoro Zustand store.
2. In focus mode, the store inserts a new `pomodoro_sessions` row with duration
   `0`.
3. The inserted database ID is kept in `currentSessionDbId`.
4. The page calls `tick()` on an interval.
5. Pausing the timer updates the row with elapsed whole minutes.
6. Completing the timer updates the row with the full configured focus duration.
7. The store switches to a short or long break.
8. Dashboard, project, and analytics pages later aggregate the saved session.

---

## 4. Languages and technology stack

### Languages

| Language | Usage |
|---|---|
| TypeScript | Application types, Zustand stores, Supabase access, and Next.js configuration |
| TSX | React pages, layouts, components, and UI behavior |
| JavaScript | Tailwind and PostCSS configuration |
| CSS | Global Tailwind layers and application color variables |
| SQL | Database tables, policies, schema updates, and relationships |
| PL/pgSQL | Trigger function that creates a profile for each new auth user |
| C++ | Standalone Brainfuck interpreter in `shadowing_bf.cpp`; unrelated to OneStep |

### Frameworks and libraries

| Technology | Version in `package.json` | Purpose |
|---|---:|---|
| Next.js | 16.2.10 | Application framework and App Router |
| React | 19.2.4 | Component and hook-based UI |
| React DOM | 19.2.4 | Browser rendering |
| TypeScript | 5.x | Static typing |
| Tailwind CSS | 3.4.19 | Utility-first styling |
| Zustand | 5.0.14 | Client state management |
| Supabase JS | 2.110.2 | Authentication and database client |
| Recharts | 3.9.2 | Area, bar, and line charts |
| date-fns | 4.4.0 | Date formatting and interval calculations |
| Lucide React | 1.24.0 | Interface icons |
| clsx | 2.1.1 | Conditional class composition |
| tailwind-merge | 3.6.0 | Tailwind class conflict resolution |
| ESLint | 9.x | Static code-quality checks |

### Styling

The application uses a dark theme defined in `globals.css`.

Primary design variables include:

- `--background`: main page background
- `--foreground`: main text color
- `--surface`: cards, sidebar, and header
- `--surface-border`: borders and subdued backgrounds
- `--color-primary`: blue
- `--color-success`: green
- `--color-danger`: red

The UI uses:

- Rounded cards and modals
- Blue-to-green gradients
- Dark zinc surfaces
- Lucide icons
- Hover translations and scale effects
- Responsive Tailwind grid classes

---

## 5. Repository structure

```text
OneStep/
├── PROJECT_DOCUMENTATION.md
├── codebase_guide.md
├── shadowing_bf.cpp
├── supabase/
│   ├── schema.sql
│   ├── update_schema.sql
│   ├── phase_8_14_improvements.sql
│   ├── gamification_system.sql
│   └── manual_focus_project_assignment.sql
└── web/
    ├── public/
    │   ├── file.svg
    │   ├── globe.svg
    │   ├── next.svg
    │   ├── vercel.svg
    │   └── window.svg
    ├── src/
    │   ├── app/
    │   │   ├── (auth)/
    │   │   │   └── login/page.tsx
    │   │   ├── (dashboard)/
    │   │   │   ├── analytics/page.tsx
    │   │   │   ├── habits/page.tsx
    │   │   │   ├── pomodoro/page.tsx
    │   │   │   ├── projects/page.tsx
    │   │   │   ├── settings/page.tsx
    │   │   │   ├── tasks/page.tsx
    │   │   │   ├── layout.tsx
    │   │   │   └── page.tsx
    │   │   ├── favicon.ico
    │   │   ├── globals.css
    │   │   └── layout.tsx
    │   ├── components/
    │   │   ├── layout/
    │   │   │   ├── DashboardShell.tsx
    │   │   │   ├── Header.tsx
    │   │   │   └── Sidebar.tsx
    │   │   └── providers/
    │   │       └── AuthProvider.tsx
    │   ├── lib/
    │   │   └── supabase.ts
    │   └── store/
    │       ├── authStore.ts
    │       ├── habitStore.ts
    │       ├── pomodoroStore.ts
    │       ├── projectStore.ts
    │       └── taskStore.ts
    ├── AGENTS.md
    ├── CLAUDE.md
    ├── README.md
    ├── eslint.config.mjs
    ├── next.config.ts
    ├── package-lock.json
    ├── package.json
    ├── postcss.config.js
    ├── tailwind.config.js
    └── tsconfig.json
```

Generated folders such as `node_modules` and `.next` are not part of the source
inventory.

---

## 6. Detailed file guide

### Root files

#### `PROJECT_DOCUMENTATION.md`

This document.

#### `shadowing_bf.cpp`

A standalone C++ interpreter for a modified Brainfuck language with a lagging
“shadow pointer.”

It:

- Reads a configurable pointer lag.
- Filters source input to valid commands.
- Uses 30,000 byte-sized memory cells.
- Precomputes matching loop brackets.
- Records pointer-position history.
- Implements an additional `S` command.
- Prints non-zero visited cells after execution.

It has no relationship to the productivity website and should be moved into a
separate project or explicitly documented as an independent experiment.

### Supabase files

#### `supabase/schema.sql`

Defines the initial database:

- `profiles`
- `projects`
- `tasks`
- `habits`
- `habit_logs`
- `pomodoro_sessions`

It also:

- Enables Row Level Security on every table.
- Creates per-user access policies.
- Defines foreign-key deletion behavior.
- Creates `handle_new_user()`.
- Creates a trigger on `auth.users`.

#### `supabase/update_schema.sql`

Adds features introduced after the initial schema:

- `projects.estimated_end_date`
- `projects.status`
- `tasks.priority`
- `habits.target_days_per_week`

#### `supabase/phase_8_14_improvements.sql`

Migrates an existing OneStep database to the current model:

- Creates a protected `Misc.` project per user
- Backfills required task and Pomodoro project relationships
- Adds task completion timestamps
- Adds task-linked Pomodoros and planned duration
- Adds habit display ordering
- Adds constraints, uniqueness, indexes, triggers, and stronger RLS checks

Future changes should continue as ordered migration files.

#### `supabase/gamification_system.sql`

Adds deterministic XP/level recalculation functions and activity triggers,
backfills existing profiles, and protects score columns from client edits.

#### `supabase/manual_focus_project_assignment.sql`

Updates Pomodoro project resolution so a taskless manual session may target an
explicit user-owned project instead of always being reassigned to `Misc.`.

### Application configuration

#### `web/package.json`

Defines application metadata, commands, dependencies, and development
dependencies.

Commands:

- `npm run dev`
- `npm run build`
- `npm start`
- `npm run lint`

#### `web/package-lock.json`

Locks the complete npm dependency graph for reproducible installations.

The project should consistently use npm while this lockfile is committed.

#### `web/tsconfig.json`

TypeScript configuration:

- Strict mode enabled
- No JavaScript output
- Bundler-style module resolution
- Next.js TypeScript plugin
- React JSX transform
- `@/*` alias mapped to `src/*`
- DOM and modern JavaScript libraries

#### `web/next.config.ts`

Contains a typed but currently empty Next.js configuration object.

#### `web/eslint.config.mjs`

Uses the ESLint flat configuration with:

- Next.js Core Web Vitals rules
- Next.js TypeScript rules
- Ignores for generated build output

#### `web/tailwind.config.js`

Defines which source files Tailwind should scan. There are currently no custom
theme extensions or Tailwind plugins.

#### `web/postcss.config.js`

Uses:

- `tailwindcss`
- `autoprefixer`

This matches the installed Tailwind 3 dependency.

#### Removed: `web/postcss.config.mjs`

The duplicate ESM PostCSS configuration was removed.

It previously caused a likely configuration problem because:

- There are two PostCSS configuration files.
- They describe different setups.
- `@tailwindcss/postcss` is not declared in `package.json`.
- The project declares Tailwind 3, while this plugin is associated with newer
  Tailwind setups.

`web/postcss.config.js` is now the single PostCSS configuration.

#### `web/README.md`

Still contains the default `create-next-app` instructions. It does not explain:

- What OneStep does
- Required environment variables
- Supabase project setup
- Schema installation
- Authentication configuration
- Testing
- Deployment

#### `web/AGENTS.md`

Warns contributors that the installed Next.js version may contain newer
conventions and breaking changes.

#### `web/CLAUDE.md`

Only points readers to `AGENTS.md`.

### Global application files

#### `web/src/app/layout.tsx`

The root layout:

- Defines the HTML document.
- Loads Geist Sans and Geist Mono.
- Sets metadata.
- Applies global page classes.
- Wraps every route with `AuthProvider`.

#### `web/src/app/globals.css`

Contains:

- Tailwind base, components, and utilities directives
- Dark-theme variables
- Brand colors
- Surface colors
- Body background and foreground styles

#### `web/src/app/favicon.ico`

Browser tab icon.

### Authentication

#### `web/src/app/(auth)/login/page.tsx`

A combined login and registration page.

Local state tracks:

- Login versus sign-up mode
- Email
- Password
- Username
- Loading state
- Error message

It calls:

- `supabase.auth.signInWithPassword()`
- `supabase.auth.signUp()`

The username is stored in Supabase user metadata so the database trigger can
copy it into `profiles`.

#### `web/src/components/providers/AuthProvider.tsx`

Handles application-wide authentication:

- Reads the current session.
- Stores the current user in Zustand.
- Fetches and stores the profile.
- Redirects signed-out users to `/login`.
- Redirects signed-in users away from `/login`.
- Subscribes to auth state changes.

Potential issue: the subscription cleanup function is returned from the nested
`initAuth()` function, but `useEffect` does not return that value. The listener
may therefore remain active when the effect runs again.

#### `web/src/store/authStore.ts`

Stores:

- `user`
- `profile`
- `setUser`
- `setProfile`

Both the Supabase `User` and application `Profile` are typed.

### Dashboard shell

#### `web/src/app/(dashboard)/layout.tsx`

Delegates the authenticated application layout to `DashboardShell`.

- Responsive sidebar/drawer
- Sticky top header
- Main content area

#### `web/src/components/layout/DashboardShell.tsx`

Owns mobile navigation state, overlay dismissal, responsive desktop offset, the
shared header, sidebar, and main content container.

#### `web/src/components/layout/Sidebar.tsx`

Provides links to:

- `/`
- `/projects`
- `/tasks`
- `/pomodoro`
- `/habits`
- `/analytics`
- `/settings`

The Settings route is implemented. `DashboardShell.tsx` controls a responsive
sidebar that becomes a dismissible drawer on small screens.

#### `web/src/components/layout/Header.tsx`

Displays:

- Profile level
- Profile XP progress
- Sign-out button
- User avatar button

Level, XP, username, and sign-out now use the authenticated profile/session.

### Feature pages

#### `web/src/app/(dashboard)/page.tsx`

The main dashboard:

- Fetches tasks, sessions, and habits.
- Calculates daily statistics.
- Displays priority-sorted tasks.
- Displays daily habits.
- Allows quick task completion.
- Allows quick habit check-ins.

The greeting reads `profile.username`.

#### `web/src/app/(dashboard)/projects/page.tsx`

Contains project creation, project cards, status controls, expanded project
details, and project activity calendars.

It combines:

- Project store data
- Task store data
- Pomodoro store data

The file is more than 400 lines and would be easier to maintain if project
forms, project cards, statistics, calendars, and task lists were separate
components.

#### `web/src/app/(dashboard)/tasks/page.tsx`

Contains:

- Task form state
- Create/edit modal
- Pending tasks
- Completed tasks
- Sorting
- Deadline formatting
- Priority formatting
- Project labels
- Update and delete actions

Task completion does not record a completion timestamp.

#### `web/src/app/(dashboard)/habits/page.tsx`

Contains:

- Habit create/edit modal
- Check-in controls
- Habit cards
- Streak displays
- Habit statistics
- Week/month/year calendars

The page depends on cached streak values from the `habits` table rather than
deriving streaks from logs.

#### `web/src/app/(dashboard)/pomodoro/page.tsx`

Contains:

- Timer display
- Timer mode controls
- Task selection with automatic project resolution
- Start, pause, and reset controls
- Settings modal
- Session history
- Browser notifications and an alarm sound

Notification permission is requested from the Start button or Settings page,
which satisfies browser user-gesture requirements.

#### `web/src/app/(dashboard)/analytics/page.tsx`

Fetches all four main data domains and calculates analytics in the browser.

It contains four tabs:

- Overview
- Projects
- Tasks
- Habits

This is another large page that would benefit from extracted calculation
functions and chart components.

#### `web/src/app/(dashboard)/settings/page.tsx`

Supports authenticated username updates, device-local timer defaults, and
notification permission from an explicit user action.

### Data client

#### `web/src/lib/supabase.ts`

Creates one Supabase client using:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The non-null assertions mean a missing environment variable will fail at
runtime without a helpful configuration message.

### Zustand stores

#### `web/src/store/projectStore.ts`

Defines:

- `Project`
- Project array
- Loading state
- Fetch
- Add
- Update
- Delete

Every fetch is filtered by the current authenticated user.

#### `web/src/store/taskStore.ts`

Defines:

- `Task`
- Task array
- Loading state
- Fetch
- Add
- General update
- Status update
- Delete

Tasks are ordered by deadline during fetch.

#### `web/src/store/habitStore.ts`

Defines:

- `Habit`
- `HabitLog`
- Habit array
- Logs grouped by habit ID
- Fetch
- Add
- Update
- Check-in
- Delete

`checkInHabit()`:

1. Checks for an existing local log on the selected date.
2. Inserts a new log.
3. Increments the current streak.
4. Updates the longest streak.
5. Updates local state.

The duplicate guard exists only in client logic. The database should also
enforce uniqueness.

#### `web/src/store/pomodoroStore.ts`

Defines both timer state and session persistence:

- Current mode
- Remaining time
- Active status
- Focus and break durations
- Completed-session count
- Selected project
- Start timestamp
- Target end timestamp
- Current database session ID
- Session history

The store is effectively a timer state machine plus a Supabase repository.

### Public assets

The files below are default create-next-app assets and do not appear to be used
by the current OneStep interface:

- `web/public/file.svg`
- `web/public/globe.svg`
- `web/public/next.svg`
- `web/public/vercel.svg`
- `web/public/window.svg`

They can be removed if they are not needed.

---

## 7. Database design

### `profiles`

| Column | Purpose |
|---|---|
| `id` | Same UUID as `auth.users.id` |
| `username` | Display name |
| `level` | Server-calculated level from the quadratic XP curve |
| `experience_points` | Server-calculated lifetime XP from productivity records |
| `avatar_url` | Optional profile image |
| `created_at` | Profile creation timestamp |

### `projects`

| Column | Purpose |
|---|---|
| `id` | Project UUID |
| `user_id` | Project owner |
| `name` | Display name |
| `color` | UI color |
| `estimated_end_date` | Planned completion date |
| `status` | Active or completed |
| `created_at` | Creation timestamp |

### `tasks`

| Column | Purpose |
|---|---|
| `id` | Task UUID |
| `user_id` | Task owner |
| `project_id` | Required project; defaults to the user's protected `Misc.` project |
| `title` | Task name |
| `notes` | Optional description |
| `status` | Pending, in progress, or completed |
| `priority` | Low, medium, or high |
| `deadline` | Due date and time |
| `estimated_time` | Estimated minutes |
| `completed_at` | Actual completion timestamp; cleared when reopened |
| `created_at` | Creation timestamp |

### `habits`

| Column | Purpose |
|---|---|
| `id` | Habit UUID |
| `user_id` | Habit owner |
| `name` | Habit name |
| `frequency` | Daily, weekly, or N times per week |
| `target_days_per_week` | Weekly target |
| `current_streak` | Cached current streak |
| `longest_streak` | Cached best streak |
| `created_at` | Creation timestamp |

### `habit_logs`

| Column | Purpose |
|---|---|
| `id` | Log UUID |
| `habit_id` | Related habit |
| `user_id` | Log owner |
| `completed_at` | Completion date |

Recommended constraint:

```sql
UNIQUE (habit_id, completed_at)
```

### `pomodoro_sessions`

| Column | Purpose |
|---|---|
| `id` | Session UUID |
| `user_id` | Session owner |
| `project_id` | Required resolved project |
| `task_id` | Optional associated task |
| `duration` | Recorded minutes |
| `planned_duration` | Intended focus minutes |
| `start_time` | Start timestamp |
| `end_time` | End timestamp |

A future schema could add:

- `status`: active, paused, completed, or cancelled
- `planned_duration`
- `actual_duration_seconds`
- `mode`
- `task_id`

### Relationships

```text
auth.users
    │
    └── 1:1 profiles
              │
              ├── 1:N projects
              │       ├── 1:N tasks
              │       └── 1:N pomodoro_sessions
              │
              ├── 1:N tasks
              ├── 1:N habits
              │       └── 1:N habit_logs
              ├── 1:N habit_logs
              └── 1:N pomodoro_sessions
```

### Row Level Security

RLS is enabled on all application tables.

Policies compare `auth.uid()` with:

- `profiles.id`
- `projects.user_id`
- `tasks.user_id`
- `habits.user_id`
- `habit_logs.user_id`
- `pomodoro_sessions.user_id`

This is the application’s primary security boundary.

### Data-integrity improvements

The database should add:

- `CHECK` constraint for project status
- `CHECK` constraint for task status
- `CHECK` constraint for task priority
- `CHECK` constraint for habit frequency
- `CHECK` constraint for target days between 1 and 7
- Non-negative duration constraints
- Unique habit check-ins
- Explicit `WITH CHECK` clauses in ownership policies
- Indexes on common user/date/project filters

Example indexes:

```sql
CREATE INDEX tasks_user_deadline_idx
ON public.tasks (user_id, deadline);

CREATE INDEX pomodoro_user_start_idx
ON public.pomodoro_sessions (user_id, start_time);

CREATE INDEX pomodoro_project_start_idx
ON public.pomodoro_sessions (project_id, start_time);

CREATE INDEX habit_logs_user_date_idx
ON public.habit_logs (user_id, completed_at);
```

---

## 8. Current code-quality status

### TypeScript

The updated source passes:

```bash
tsc --noEmit
```

### ESLint

The previous 15 errors and 7 warnings were cleared. The complete web project
passes the configured Next.js and TypeScript ESLint rules.

### Production build

The project runs in WSL and its installed Next.js SWC packages are Linux
binaries. A production `npm run build` was completed successfully in WSL with
Next.js 16.2.10; all application routes were prerendered successfully.

### Tests

No automated tests were found:

- No unit tests
- No component tests
- No integration tests
- No end-to-end tests

### CI/CD

No CI workflow or deployment configuration was found in the inspected source.

---

## 9. Phase 8-14 implementation update

### 9.1 Task completion and deadline analytics

Tasks now have `completed_at`, which is set when a task becomes completed and
cleared when it is reopened. Dashboard and analytics calculations now use the
actual completion timestamp.

Implemented task metrics include:

- Percentage completed before deadline
- Estimated minutes versus task-linked Pomodoro minutes
- Tasks created and completed versus focus time
- Completion by actual weekday

### 9.2 Habit consistency and ordering

Habit cards now have persistent `display_order`. Users can drag cards or use
accessible move-up and move-down controls.

Streaks are recalculated from logs for:

- Daily habits
- Weekly habits
- N-times-per-week habits
- Missed periods
- Undo operations

The database now prevents duplicate logs for the same habit and date. A stored
user timezone is still recommended for consistent travel and multi-device
behavior.

### 9.3 Auth listener cleanup

Resolved. `AuthProvider` now returns the Supabase subscription cleanup directly,
tracks when initial authentication is ready, and avoids rendering protected
content before the initial session check.

### 9.4 Error handling

Project, task, habit, and Pomodoro stores now expose errors, and the main feature
pages display failed requests. A shared toast system remains an optional polish
improvement.

### 9.5 Timer assignment, persistence, and completion alerts

Pomodoros can now be assigned to tasks. The session project is taken from the
task, or resolved to the protected `Misc.` project when no task is selected.

The active timer is persisted on the device, partial sessions are updated when
paused or reset, and completion is guarded against duplicate execution.
Notification permission is requested from a user gesture. Every focus, short
break, or long break completion triggers an in-app message, desktop
notification when permitted, and a three-tone Web Audio alarm.

History initially shows five sessions and provides a “Load 5 more” control.

Users can also record focus time manually by selecting an open task or a
project, plus start date/time and duration. Task-linked entries inherit the
task's project; project-only entries keep a null task reference. Both appear in
session history, analytics, and gamification.

### 9.6 Profile and gamification UI

The header uses the quadratic level curve and displays current-level XP. The
dashboard includes lifetime XP, a task/focus/habit XP breakdown, level progress,
and six progress-aware achievements. Database triggers keep profile XP and level
in sync after task, session, habit-log, or streak changes. Client stores refresh
the profile after those mutations so the header updates immediately.

The header also fetches the three activity sources when the authenticated shell
mounts and derives its displayed level directly with the shared gamification
calculator. It therefore reflects live player progress on every route instead
of relying on a default or stale profile value.

### 9.7 Settings route

Resolved. `/settings` now supports username changes, device-local Pomodoro
defaults, and notification permission.

### 9.8 Mobile navigation

Resolved. The dashboard shell now provides a mobile menu, overlay, close
controls, and desktop-only fixed content offset.

### 9.9 Large page components

Several feature pages are 300–400 lines long. They combine:

- Data fetching
- Calculation logic
- Form state
- Modal rendering
- Cards
- Calendars
- Charts

This makes reuse and testing harder.

### 9.10 Analytics structure and new plots

Analytics now has four sections:

- **Overview:** focus time, hourly distribution, daily average, standard
  deviation, most productive day, least productive day, and session-length
  distribution.
- **Projects:** time spent on each project over time, total focus by project,
  planned versus actual project time, and completed tasks by project.
- **Tasks:** before-deadline percentage, estimated versus actual task time,
  number of tasks versus focus time, and completion weekday.
- **Habits:** daily distribution statistics, consistency heatmap, per-habit
  completion rate, and check-ins over time.

The previous separate Pomodoro analytics tab was merged into Overview.
The completion-rate chart allocates a row to every habit, disables automatic
tick skipping, and wraps full habit names on the Y-axis.

Analytics defaults to a rolling seven-day weekly view. Monthly (30-day), yearly
(365-day), all-time, and custom date ranges are also available. All-time begins
at the earliest recorded session, task creation/completion, project, habit, or
habit check-in. Every project is represented by a consistent distinct chart
color across all plots in the Projects analytics section.

### 9.11 Project calendar heatmap

The Projects page now includes a configurable project selector and a 12-week
focus calendar. A day's color becomes darker as more time is recorded for the
selected project.

### 9.12 Backdated habit check-ins

Each habit card now includes a previous-day check-in action. Users can select
any date between the habit's creation date and yesterday. Existing dates are
detected before submission, and a successful backdated entry recalculates the
habit's current and longest streaks.

Recent-day cells and every eligible cell in the expanded week/month/year
calendar are also direct toggle buttons, so users can add or undo a check-in by
clicking the date itself.

---

## 10. Remaining improvements

The completion timestamp, data constraints, auth cleanup, single PostCSS
configuration, lint cleanup, error surfaces, habit rules, timer persistence,
responsive navigation, settings route, and expanded analytics described in the
original roadmap have now been implemented.

### Priority 0: correctness and release baseline

#### Apply migrations to the hosted database

Apply the existing-database migration:

```text
supabase/phase_8_14_improvements.sql
supabase/gamification_system.sql
supabase/manual_focus_project_assignment.sql
```

The WSL production build is verified. The migrations must still be applied to
each target Supabase database before the updated UI is used because it expects
the new task, project, habit, gamification, and Pomodoro behavior.

#### Strengthen database constraints

Implemented in `schema.sql` and `phase_8_14_improvements.sql`: `CHECK`
constraints, habit-log uniqueness, duration and target validation, query
indexes, protected project relationships, and explicit RLS `WITH CHECK`
clauses.

#### Authentication lifecycle

Implemented: subscription cleanup, initial auth loading state, typed profiles,
sign-out, and profile-driven header/dashboard values.

#### Standardize build tooling

npm and `package-lock.json` remain the selected toolchain, the duplicate
PostCSS configuration was removed, and lint now passes. A clean WSL production
build is the remaining check.

### Priority 1: make existing features trustworthy

#### Improve error handling

Typed success/error results and inline errors are now present in the main
stores and pages. A shared toast/retry system and more detailed skeleton states
would be useful further polish.

#### Continue habit refinement

Log-derived daily/weekly streaks, undo, ordering, weekly targets, database
uniqueness, and backdated check-ins are implemented. The main remaining
refinement is explicit user timezone support.

#### Continue timer refinement

Timer state, task/project assignment, planned duration, timestamps, pause
state, and database session ID are persisted. A future schema can add an
explicit cancelled status and background delivery after the browser closes.

#### Continue accessibility work

Mobile navigation, responsive padding, dialog semantics, and accessible labels
were added. Remaining work includes reduced-motion handling, chart data tables,
formal contrast testing, and a complete keyboard audit.

#### Add automated tests

Recommended stack:

- Vitest for pure functions and stores
- React Testing Library for components
- Playwright for critical user journeys

High-value tests:

- Authentication redirects
- Task completion timestamp behavior
- Habit duplicate prevention and streaks
- Timer pause/resume/reload behavior
- RLS ownership isolation
- Analytics calculations

### Priority 2: architecture and product expansion

#### Break pages into domain components

Example task structure:

```text
features/tasks/
├── components/
│   ├── TaskCard.tsx
│   ├── TaskForm.tsx
│   ├── TaskList.tsx
│   └── TaskStatusButton.tsx
├── hooks/
│   └── useTaskFilters.ts
├── calculations.ts
├── repository.ts
└── types.ts
```

Similar modules can be created for projects, habits, Pomodoro, and analytics.

#### Separate responsibilities

The current stores mix:

- State
- Database access
- Business rules
- Timer behavior

A clearer structure would use:

- UI components
- Domain hooks
- Business-rule functions
- Supabase repositories
- Zustand state where genuinely shared

#### Generate Supabase types

Generated database types would:

- Remove `any`
- Keep TypeScript aligned with migrations
- Catch invalid table and column usage
- Improve insert/update types

#### Move canonical analytics to the database

SQL views or RPC functions can provide:

- Daily focus totals
- Project summaries
- Completion trends
- Habit consistency
- Weekly review statistics

This reduces client processing and ensures all screens use the same metric
definitions.

#### Continue gamification refinement

The XP rules, level curve, achievements, server-side recalculation triggers, and
protected profile score fields are implemented. Possible future refinements are
seasonal challenges, achievement history timestamps, configurable daily caps,
and an optional append-only audit ledger for displaying an XP activity feed.

#### Expand productivity features

Potential additions:

- Recurring tasks
- Task dependencies
- Subtasks
- Tags
- Search
- Saved filters
- Calendar view
- Quick capture
- Reminders
- Weekly review
- Goal milestones
- Data export

### Priority 3: production readiness

Add:

- CI checks
- Preview deployments
- Error monitoring
- Performance monitoring
- Database backups
- Account deletion
- User data export
- Privacy documentation
- Rate limiting
- Security review
- Migration rollback process

### Optional AI features

AI could later help with:

- Breaking goals into tasks
- Suggesting realistic schedules
- Summarizing weekly progress
- Detecting overloaded days
- Explaining productivity patterns
- Converting natural language into tasks

These features should be optional, transparent, and designed with clear user
consent because productivity data can be personal.

---

## 11. Suggested development roadmap

### Phase 1: stabilize — implemented

- Add `tasks.completed_at`.
- Add database constraints and indexes.
- Fix auth subscription cleanup.
- Type the profile.
- Remove duplicate PostCSS configuration.
- Clear lint errors.
- Verify production build.
- Add user-visible errors.

### Phase 2: build trust — substantially implemented

- Correct habit streak calculations.
- Add undo check-ins.
- Persist active timers.
- Distinguish partial and completed sessions.
- Add responsive navigation.
- Complete an accessibility pass.
- Add automated tests.

### Phase 3: improve insight — substantially implemented

- Standardize timezone behavior.
- Move analytics to SQL views or RPC.
- Add completion-rate metrics.
- Add planned versus actual focus time.
- Add weekly reviews.
- Add CSV or JSON export.

### Phase 4: differentiate

- XP, levels, and six progress-aware achievements are implemented.
- Add reminders and recurring tasks.
- Add calendar integrations.
- Add optional intelligent planning assistance.

---

## 12. Setup and development

### Prerequisites

- WSL with a Linux distribution such as Ubuntu
- A Node.js version supported by the installed Next.js release
- npm
- A Supabase project

Run installation, development, lint, type checks, and builds from WSL. Do not
share one `node_modules` installation between Windows Node.js and WSL Node.js;
Next.js SWC packages are platform-specific.

### Environment variables

Create `web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Do not commit the real environment file.

### Database setup

For a new database:

1. Apply `supabase/schema.sql`.
2. Confirm the profile/Misc. project trigger exists.
3. Confirm RLS and ownership policies are enabled.
4. Configure authentication settings in Supabase.

For a database already created from the original schema:

1. Confirm `supabase/update_schema.sql` was previously applied.
2. Apply `supabase/phase_8_14_improvements.sql`.
3. Apply `supabase/gamification_system.sql`.
4. Apply `supabase/manual_focus_project_assignment.sql`.

The new migration must be applied before using the updated client.

### Install and run

```bash
cd ~/projects/OneStep
cd web
npm install
npm run dev
```

If the repository remains on the Windows drive, use its `/mnt/c/...` path from
inside WSL. Keeping active development repositories in the WSL Linux filesystem
usually gives better file-watching performance.

Open:

```text
http://localhost:3000
```

### Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

Tests should be added to this command sequence after a test framework is
introduced.

---

## 13. Maintenance checklist

Before merging a feature:

- Run TypeScript checks.
- Run ESLint.
- Run automated tests.
- Run a production build.
- Verify empty, loading, success, and failure states.
- Check mobile and keyboard behavior.
- Check database migrations.
- Review RLS policies.
- Update generated database types.
- Confirm analytics labels match their calculations.
- Update this documentation when architecture or data definitions change.

---

## 14. Final assessment

OneStep already has a coherent product concept and a sensible modern stack. The
main domains—projects, tasks, habits, focus sessions, and analytics—are connected
in a way that supports a complete productivity loop.

The core behavior is now connected and precise: tasks record completion time,
habit streaks are log-derived, timers persist, backend errors are surfaced, and
profile gamification is driven by real productivity records. The highest-value
next steps are automated tests, formal accessibility checks, reminder delivery,
weekly reviews, integrations, and optional AI-assisted productivity features.
