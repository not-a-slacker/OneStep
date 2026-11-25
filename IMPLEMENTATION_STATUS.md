# OneStep — Implementation Status

_Snapshot date: 25 August 2026. Derived by reading the source tree, not the
previous documentation. Where this file and `PROJECT_DOCUMENTATION.md` disagree,
this file reflects the code as it currently stands._

Companion document: [ROADMAP_AND_FIXES.md](ROADMAP_AND_FIXES.md) — outstanding
work, defects, and hardening tasks.

---

## 1. What OneStep is

A gamified personal-productivity system built around five linked domains:
**projects → tasks → focus sessions → habits → analytics**, with experience
points and levels derived deterministically from that activity.

It exists as two clients sharing one Supabase backend:

| Surface | Location | Maturity |
|---|---|---|
| Web application | `web/` | Feature-complete for the intended v1 scope; builds and deploys |
| Android application | `android/` | One vertical slice (auth + Pomodoro timer); four of five screens are placeholders |
| Database and business rules | `supabase/` | Schema, triggers, RLS, and server-side XP calculation implemented |

---

## 2. Repository layout

```text
OneStep/
├── IMPLEMENTATION_STATUS.md      ← this file
├── ROADMAP_AND_FIXES.md          ← next steps and fixes
├── PROJECT_DOCUMENTATION.md      ← older exhaustive file-by-file reference (pre-Android)
├── codebase_guide.md             ← condensed web-only guide
├── .github/workflows/            ← CI for both web and android
├── supabase/                     ← SQL schema + incremental migrations
├── web/                          ← Next.js 16 app
└── android/                      ← Kotlin / Jetpack Compose client
```

> **Version control (resolved in Milestone 1):** the whole project is now one
> git repository rooted at `OneStep/`. The three original `web/` commits were
> rewritten so their files sit under `web/` and grafted into it, so the history
> is intact. The `origin` remote still points at
> `github.com/not-a-slacker/OneStep`, which holds the *old* layout — publishing
> the new history needs a force push or a fresh remote. See ROADMAP S-0.

---

## 3. Backend — Supabase (implemented)

### 3.1 Tables

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | Extends `auth.users` | `username`, `level`, `experience_points`, `avatar_url` |
| `projects` | Work containers | `name`, `color`, `estimated_end_date`, `status`, `is_default` |
| `tasks` | Always belongs to a project | `title`, `notes`, `status`, `priority`, `deadline`, `estimated_time`, `completed_at` |
| `habits` | Recurring behaviours | `frequency`, `target_days_per_week`, `current_streak`, `longest_streak`, `display_order` |
| `habit_logs` | One row per check-in | `habit_id`, `completed_at` (date), unique per habit/date |
| `pomodoro_sessions` | Timer and manual focus | `project_id` (required), `task_id` (optional), `duration`, `planned_duration`, `start_time`, `end_time` |

### 3.2 Server-enforced business rules

These are real PostgreSQL triggers, not client conventions:

- **`handle_new_user`** — on signup, creates the `profiles` row *and* a protected
  `Misc.` project in one transaction.
- **`resolve_task_project`** — forces every task onto a project the same user
  owns; falls back to `Misc.`; raises if the project belongs to someone else.
- **`resolve_pomodoro_project`** — resolves a session's project from its task,
  from an explicitly chosen project, or from `Misc.`; validates ownership in
  every branch. (`manual_focus_project_assignment.sql` added the middle branch.)
- **`set_task_completed_at`** — stamps `completed_at` on completion and clears it
  on reopen, so deadline metrics use a real timestamp rather than client input.
- **`reassign_project_before_delete`** — blocks deletion of the default project
  and moves tasks/sessions to `Misc.` instead of cascading them away.
- **`recalculate_user_gamification`** — recomputes XP from source rows and
  derives level as `floor(sqrt(xp / 250)) + 1`. Fired by AFTER triggers on
  tasks, sessions, habit logs, and habits, so retries cannot double-award and
  undoing work removes its XP.
- **Column grants** — `REVOKE UPDATE ON profiles` followed by
  `GRANT UPDATE (username, avatar_url)`, making XP and level server-owned
  ([schema.sql:380](supabase/schema.sql:380)).

### 3.3 Row Level Security

RLS is enabled on all six tables. Each has a single `FOR ALL` policy of the form
`USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` (`profiles`
uses `id`). Uniqueness, ownership, and referential integrity are additionally
enforced by the triggers above and by a partial unique index guaranteeing one
default project per user.

### 3.4 Migration files and their order

| File | Applies to | Contents |
|---|---|---|
| `schema.sql` | New projects only | Complete consolidated schema |
| `update_schema.sql` | Legacy DBs | Phase-3.5 column additions |
| `phase_8_14_improvements.sql` | Legacy DBs | FK changes, CHECK constraints, indexes, stronger RLS |
| `gamification_system.sql` | Legacy DBs | XP functions, triggers, column grants |
| `manual_focus_project_assignment.sql` | Legacy DBs | Direct project assignment for taskless focus |
| `milestone_1_integrity.sql` | Legacy DBs | Server-owned habit streaks, habit-log ownership, default-project protection, focus-session limits |
| `milestone_1_verification.sql` | Any | Read-only PASS/FAIL report on the above |
| `milestone_2_xp_fixes.sql` | Legacy DBs | Per-source XP split on profiles, `is_manual` focus entries without the session bonus; ends with its own PASS/FAIL check |
| `milestone_2_streak_bonus.sql` | Legacy DBs | Streak bonus per milestone in every run (7 days daily, 4 weeks weekly); current streaks refreshed on read (B-23); ends with its own PASS/INFO check |
| `milestone_2_session_progress.sql` | Legacy DBs | Optional progress note and task-progress percentage on focus sessions; ends with its own PASS check |

---

## 4. Web application — `web/`

**Stack:** Next.js 16.2.10 (App Router), React 19.2.4, TypeScript 5, Tailwind
CSS 3, Zustand 5, Recharts 3, date-fns 4, lucide-react, `@supabase/supabase-js`
v2. Node 22.x, deployed to Vercel. About 4,900 lines of TypeScript across 23 files.

### 4.1 Route inventory

| Route | File | Lines | State |
|---|---|---|---|
| `/login` | [login/page.tsx](web/src/app/(auth)/login/page.tsx) | 229 | Done |
| `/` | [(dashboard)/page.tsx](web/src/app/(dashboard)/page.tsx) | 260 | Done |
| `/projects` | [projects/page.tsx](web/src/app/(dashboard)/projects/page.tsx) | 559 | Done |
| `/tasks` | [tasks/page.tsx](web/src/app/(dashboard)/tasks/page.tsx) | 415 | Done |
| `/pomodoro` | [pomodoro/page.tsx](web/src/app/(dashboard)/pomodoro/page.tsx) | 544 | Done |
| `/habits` | [habits/page.tsx](web/src/app/(dashboard)/habits/page.tsx) | 588 | Done |
| `/analytics` | [analytics/page.tsx](web/src/app/(dashboard)/analytics/page.tsx) | 617 | Done |
| `/settings` | [settings/page.tsx](web/src/app/(dashboard)/settings/page.tsx) | 125 | Partial |

### 4.2 Authentication

- Combined Login / Sign-Up panel with a mode toggle.
- Sign-up requires username, email, password, and confirmation; a mismatch is
  rejected client-side before any network call.
- Show/hide toggles on both password fields, with `aria-pressed` and labels.
- After sign-up the client signs out, switches to Login mode, and shows an
  in-page "confirm your email" message rather than pretending the user is in.
- `AuthProvider` subscribes to `onAuthStateChange`, loads the profile, renders a
  spinner until the session resolves, and redirects between `/login` and `/`.

### 4.3 Dashboard (`/`)

Four stat tiles (habits done today, tasks done today, focus time today, and a
composite productivity score against fixed daily goals of 5 tasks / 120 minutes
/ 3 habits), a full gamification panel (level, XP progress bar, XP split by
source, six achievements with progress bars), a top-5 priority task list with
one-click completion and overdue highlighting, and a daily habit check-in list.

### 4.4 Projects

Project CRUD with a colour picker and estimated end date; active and completed
sections; a per-project expandable detail panel; a project focus **calendar
heatmap** with week/month/year navigation; and the protected `Misc.` project
enforced on both client and server.

### 4.5 Tasks

Full CRUD in a modal (title, project, priority, deadline, estimated minutes,
notes), open and completed columns, overdue styling, and four analytics tiles.
Two charts: *estimated vs actual focus time* per task (actual is the sum of
task-linked Pomodoro minutes) and *tasks created vs focus minutes* over 14 days.
Open tasks show a **progress bar** with the most recent progress estimate
entered against one of their focus sessions (see 4.6). Clicking a task opens a
**progress dialog**: progress %, time spent, estimate and session count; a line
chart of each estimate against the cumulative focus minutes at that point (from
0 % at 0 minutes, ending at 100 % if completed), with a dashed *planned pace*
line to 100 % at the estimate when one is set; and the session notes, newest
first, which double as the chart's data table.

### 4.6 Pomodoro

- Clicking a session in the history opens a **progress form**: a note on what
  the session achieved (up to 2,000 characters) and, for task sessions, an
  estimate of how far along the task is afterwards (0–100 %, starting from the
  previous estimate). The history shows the note and percentage; the Tasks page
  uses the latest estimate per task, by session start time. Neither affects XP.
- Focus / short-break / long-break modes with a circular SVG progress ring.
- **Target-timestamp countdown** rather than a decrementing counter, so a
  throttled tab does not lose time.
- Timer state persisted to `localStorage` and rehydrated on load.
- Focus can be attached to an open task (whose project is authoritative) or left
  unassigned under `Misc.`.
- A DB row is inserted at start with `duration = 0`; pause and reset write the
  elapsed whole minutes; normal completion writes the full planned duration.
- The countdown runs in the dashboard shell, so it keeps going on every route,
  and ticks from a Web Worker so a background tab still finishes on time.
- When a period ends, a WebAudio chime repeats for 2½ minutes, a system
  notification stays on screen until clicked, and a banner with **Stop alarm**
  appears on whichever page is open. Starting the next period, resetting, or
  clicking the notification also silences it.
- Long break automatically after every fourth completed focus session.
- **Manual focus entry** — log time after the fact against a task *or* directly
  against a project, with start time and duration.
- Paginated session history (five at a time).

### 4.7 Habits

Three frequency types (daily, weekly, n-times-a-week). Ordered habit cards with
drag-and-drop *and* keyboard-friendly move buttons, persisted via
`display_order`. Check-in is a toggle: clicking an incomplete day records it,
clicking a completed day undoes it. It is clickable on the card's recent-day
strip, in the expanded week/month/year calendar, and through a backdate modal.
Days before the habit was created and future days are disabled. Daily and weekly
streaks are recalculated from the log set, with completion-rate statistics for
the past week, month, year, and all time.

### 4.8 Analytics

Four tabs — **Overview, Projects, Tasks, Habits** — over a shared range selector
(weekly by default, monthly, yearly, all-time computed from the earliest real
activity, or a custom start/end range). Fifteen charts in total, including focus
over time, hourly distribution, session-length distribution, per-project time
series and totals, planned vs actual project time, completion by weekday using
real completion timestamps, a habit consistency heatmap, and per-habit
completion rates.

### 4.9 Gamification

XP is calculated only in the database and the web app displays the stored
figures, including the split by source (see `milestone_2_xp_fixes.sql`). The
formula: 50 XP per task plus a priority bonus (0/15/30)
plus 20 for beating a deadline; 1 XP per focus minute plus 10 per completed
timer session (manual entries do not get the bonus); 30 XP per habit check-in plus
25 per streak milestone reached in any run (every 7 days for a daily habit, every
4 successful weeks for a weekly or n-times-a-week habit);
level = `floor(sqrt(xp / 250)) + 1`.

### 4.10 State layer

Five Zustand stores — `authStore`, `projectStore`, `taskStore`, `habitStore`,
`pomodoroStore` — each owning its own fetch/mutate/error surface and calling
`refreshProfile()` after any XP-affecting write.

### 4.11 Delivery

[quality.yml](.github/workflows/quality.yml) runs lint, typecheck, and build for
the web app, plus unit tests, lint, and `assembleDebug` for Android, on pushes to
`main` and on pull requests. `VERCEL_DEPLOYMENT.md` documents hosting, and the
project is pinned to Node 22.x. The web app is developed inside WSL (Ubuntu, Node
22 via nvm); see the README for why `node_modules` must not be shared between
Windows Node and WSL Node.

---

## 5. Android application — `android/`

**Stack:** Kotlin 2.3.21, AGP 8.13.2, Jetpack Compose (BOM 2026.04.01),
Material 3, Navigation-Compose, DataStore Preferences, WorkManager (declared but
unused), supabase-kt 3.7.0 (auth + postgrest), Ktor/OkHttp,
kotlinx-serialization. `minSdk 26`, `targetSdk 36`, JVM target 17. About 1,000
lines of Kotlin.

### 5.1 What is implemented

- **Auth** — email/password sign-in and sign-up via supabase-kt, PKCE flow,
  `onestep://auth` deep link handled in `MainActivity`, automatic session
  restore and refresh from storage, and a sealed `AuthState` covering loading,
  authenticated, signed-out, error, and *not-configured* states.
- **Client-side validation** — non-empty fields, minimum 8-character password,
  and confirmation match (stricter than the web form).
- **Graceful unconfigured mode** — if `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`
  are absent, `AppContainer` swaps in no-op repositories and the app explains
  what to configure instead of crashing.
- **Navigation shell** — Material 3 `Scaffold` with a five-item bottom bar and
  state-preserving navigation.
- **Timer (the completed slice):**
  - Pure `TimerStateMachine` (start / pause / reset / complete / setMode /
    updateDurations) with a target-timestamp countdown.
  - `TimerSnapshot` persisted to DataStore as JSON, surviving activity *and*
    process recreation.
  - `TimerService` foreground service with an ongoing notification, Pause and
    Reset actions, a separate high-importance completion channel with vibration,
    and an automatic long break after every fourth focus session.
  - Runtime `POST_NOTIFICATIONS` request on Android 13+ before starting.
  - `TimerViewModel` re-attaches to a running service after process death.
- **Focus-session sync** — open tasks are loaded for assignment; starting a focus
  period inserts a zero-duration `pomodoro_sessions` row; pause and reset write
  the elapsed whole minutes; completion writes the full planned duration —
  matching web semantics. Breaks stay device-local, as on the web.
- **Build hygiene** — R8 minification and resource shrinking on release,
  BuildConfig secrets injected from `local.properties` or environment variables
  (never committed), `allowBackup=false`, and a committed Gradle wrapper.
- **Tests** — one unit-test file (82 lines) covering the pure timer state
  machine. This is the only automated test in the entire repository.

### 5.2 What is not implemented

| Destination | Current state |
|---|---|
| Home / Today | `FeaturePlaceholder` |
| Tasks | `FeaturePlaceholder` (the data layer is read-only: `openTasks()` only) |
| Habits | `FeaturePlaceholder` |
| More (projects, analytics, settings) | `FeaturePlaceholder` |

Also absent: Room caching, the durable offline mutation queue, manual focus
entry, gamification display, widgets, and any UI or instrumentation tests.

---

## 6. Feature parity matrix

| Capability | Web | Android |
|---|---|---|
| Email/password auth + email confirmation | Yes | Yes |
| Session persistence | Yes | Yes |
| Pomodoro timer with DB-backed sessions | Yes | Yes |
| Timer survives app/tab restart | Yes (localStorage) | Yes (DataStore) |
| Timer runs while the UI is not visible | While any dashboard tab is open | Yes (foreground service) |
| Task selection for focus | Yes | Yes (read-only list) |
| Manual focus entry | Yes | No |
| Task CRUD | Yes | No |
| Project CRUD + heatmap | Yes | No |
| Habits + streak calendars | Yes | No |
| Analytics | Yes | No |
| Gamification display | Yes | No |
| Offline support | No | No |
| Automated tests | No | Timer state machine only |

---

## 7. Verified state of the code

- Both clients build in CI on every push to `main` and every pull request. The
  first fully green run was `4b7e258`
  (GitHub Actions run 43916004968).
- Web: type-checks, lints, and produces a production Next.js build, locally in
  WSL and in CI.
- Android: compiles, passes its unit tests, passes `lintDebug`, and assembles a
  debug APK in CI. **This had never happened before November 2026.** The first
  CI runs uncovered three defects that stopped the module building at all: a
  build-script error under Kotlin 2.3 (`kotlinOptions` is rejected), an import
  that shadowed Compose's `RowScope.weight`, and an `Int`-vs-`Long` assertion
  that failed the timer test. All three are fixed. The app has still never been
  run on a device or emulator.
- `gradlew` and `gradlew.bat` are hand-written minimal launchers rather than the
  standard generated scripts. They work in CI.
- No end-to-end or integration tests exist for either client.

Known defects, security gaps, and the prioritised plan to close them are in
[ROADMAP_AND_FIXES.md](ROADMAP_AND_FIXES.md).
