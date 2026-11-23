# OneStep — Roadmap, Improvements, and Fixes

Companion to [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), which records
what already works. This document records what does not, and what to do next.

Everything below was found by reading the current source. Each item states the
symptom, where it lives, and the suggested fix. Severity legend:

| Tag | Meaning |
|---|---|
| **P0** | Data loss, security, or ships-broken. Fix before any public launch. |
| **P1** | Real user-visible defect or a hard blocker for the next milestone. |
| **P2** | Quality, performance, or scale problem that will bite later. |
| **P3** | Enhancement or nice-to-have. |

---

## 0. Milestone 1 status

Milestone 1 is merged into `main` and its SQL has been applied in the Supabase
SQL editor. Items marked **Done** below are closed by that work.

| Item | Status | Where |
|---|---|---|
| S-0 version control | Done | Root git repo, web history preserved |
| S-1 habit streak tampering | Done | `supabase/milestone_1_integrity.sql`, `habitStore.ts` |
| S-2 focus session limits | Done | `supabase/milestone_1_integrity.sql` |
| S-3 default project flag | Done | `supabase/milestone_1_integrity.sql` |
| S-4 habit log ownership | Done | `supabase/milestone_1_integrity.sql` |
| B-1 timer stops off-page | Done | `pomodoroStore.ts`, `lib/alarm.ts`, `DashboardShell.tsx` |
| B-3 streak never decreased | Done | Closed by S-1 |
| B-13 delete confirmations | Done | `components/ui/ConfirmDialog.tsx` and the three pages |
| B-15 CI cannot build | Done | `.github/workflows/quality.yml`, `lib/supabase.ts` |
| B-16 modal accessibility | Partial | New `ConfirmDialog` traps focus; the task/habit/settings modals still do not |

Since then the Android module has been made to build: CI compiles it, runs its
unit tests and lint, and assembles a debug APK, and the same command now runs
locally in WSL. It has still never been run on a device.

### 0.1 XP fixes (November 2026)

Found while tracing the point system end to end. Three are fixed; the other three
are design decisions and wait on a choice about how strict the scoring should be.

| Item | Status | Where |
|---|---|---|
| B-19 displayed XP is not the server's | Done | `supabase/milestone_2_xp_fixes.sql`, `lib/gamification.ts`, `Header.tsx`, dashboard |
| B-20 manual entries earn the session bonus | Done | `supabase/milestone_2_xp_fixes.sql`, `pomodoroStore.ts` |
| B-2 manual entries shift the long-break cadence | Done | Closed alongside B-20 by the same flag |
| B-22 editing a task moves its deadline | Done | `tasks/page.tsx` |
| S-10 manual focus time is effectively unlimited | Open, needs a decision | — |
| S-11 task and habit XP can be farmed | Open, needs a decision | — |
| B-21 streak bonus is inconsistent | Open, needs a decision | — |

**Apply `milestone_2_xp_fixes.sql` before deploying the matching web build.** The
build writes `pomodoro_sessions.is_manual` and reads `profiles.task_xp`,
`focus_xp` and `habit_xp`. Until the SQL runs, manual focus entries are rejected
and the per-source XP shows 0. The migration was executed against an in-memory
PostgreSQL (PGlite) with the full schema: backfill, recalculation, re-running it,
the column grants as a signed-in user, and a fresh install from `schema.sql`.

---

## 1. Security and data integrity

The backend gets the hard part right — RLS on every table, ownership-validating
triggers, and XP computed server-side from source rows. The gaps below are all
about *inputs* to that trusted computation, which are currently unguarded.

### S-0 · Most of the project is not under version control — **P0** · DONE

Only `web/` is a git repository. The root `.git/` is an empty directory, so
`android/` (about 1,000 lines of Kotlin), `supabase/` (the entire schema and all
migrations), and the root documentation have **no history and no backup**.

**Fix:** initialise a repository at the OneStep root. Either absorb `web/` as a
normal directory (`git filter-repo`/subtree merge to keep its three commits) or
keep it as a submodule — but the SQL and the Android module must be tracked
either way. Add a root `.gitignore` covering `node_modules/`, `.next/`,
`.pnpm-store/`, `android/build/`, `android/.gradle/`, `local.properties`, and
`.env*`. Confirm `web/.env.local` stays ignored after the move; it currently
holds a live project URL and publishable key.

### S-1 · `habits.longest_streak` is client-writable and feeds XP — **P0** · DONE

`recalculate_user_gamification` awards 25 XP per seven days of `longest_streak`,
but that column is written by the browser
([habitStore.ts:271](web/src/store/habitStore.ts:271)) and the RLS policy is a
blanket `FOR ALL`. Anyone with the publishable key and their own session can
`PATCH /habits?id=eq.…` with `longest_streak = 100000` and mint arbitrary XP and
levels. This is the same class of hole that `REVOKE UPDATE ON profiles` was
added to close for `experience_points` — the fix was never extended to the
column that feeds it.

**Fix:** compute streaks server-side. Add a trigger on `habit_logs` that
recalculates `current_streak` / `longest_streak` for the affected habit, then
`REVOKE UPDATE ON habits FROM authenticated` and
`GRANT UPDATE (name, frequency, target_days_per_week, display_order)`. Delete
the client-side streak write; keep the client calculation only for optimistic
display.

### S-2 · Focus-session values are unconstrained — **P0** · DONE

`pomodoro_sessions` only checks `duration >= 0` and `planned_duration > 0`.
Nothing prevents a client from inserting a 500,000-minute session, a session
whose `end_time` precedes its `start_time`, or one dated in the year 3000 — and
`duration` is worth 1 XP per minute. Manual focus entry makes this reachable
through the normal UI as well, since [pomodoroStore.ts](web/src/store/pomodoroStore.ts)
validates only that the duration is at least 1.

**Fix:** add CHECK constraints — `end_time >= start_time`, a sane ceiling such
as `duration <= 1440` and `planned_duration <= 1440`, and
`start_time <= now() + interval '1 day'`. Add a BEFORE trigger asserting
`duration <= EXTRACT(EPOCH FROM (end_time - start_time)) / 60 + 1`. Optionally
cap total logged minutes per user per day.

### S-3 · `projects.is_default` is client-writable — **P1** · DONE

The `Misc.` project invariant is protected against deletion by
`reassign_project_before_delete`, but a client can simply `UPDATE` its own
project to set `is_default = false` and then delete it, leaving the user with no
fallback project — after which task creation, focus sessions, and project
deletion all start raising `A default Misc. project is required`. The rename and
"mark completed" protections in
[projectStore.ts:143](web/src/store/projectStore.ts:143) are client-side only
and trivially bypassed.

**Fix:** a BEFORE UPDATE trigger on `projects` that rejects any change to
`is_default`, and rejects renaming or completing a row where `is_default` is
true.

### S-4 · `habit_logs` has no ownership trigger — **P1** · DONE

`tasks` and `pomodoro_sessions` both have triggers verifying the referenced
parent row belongs to the same user. `habit_logs` does not — its RLS policy only
checks `user_id = auth.uid()`. A client can insert a log carrying its own
`user_id` but another user's `habit_id`, which awards itself 30 XP per row and
pollutes the other user's habit with foreign rows (invisible to them, since
their reads filter on `user_id`).

**Fix:** a BEFORE INSERT/UPDATE trigger on `habit_logs` asserting
`EXISTS (SELECT 1 FROM habits WHERE id = NEW.habit_id AND user_id = NEW.user_id)`.

### S-5 · No length or format validation on text columns — **P2**

`projects.name`, `tasks.title`, `tasks.notes`, and `habits.name` are unbounded
`text`. A scripted client can store megabytes per row. `projects.color` is
likewise unvalidated but is interpolated directly into inline `style` attributes
in the UI.

**Fix:** `CHECK (char_length(name) BETWEEN 1 AND 120)` and similar for each
field, plus `CHECK (color ~ '^#[0-9a-fA-F]{6}$')`.

### S-6 · No server-side route protection — **P2**

Every dashboard page is a client component guarded only by a redirect inside
[AuthProvider.tsx](web/src/components/providers/AuthProvider.tsx). RLS means no
data actually leaks, but the app shell renders before the redirect resolves and
there is no server-side session check.

**Fix:** adopt `@supabase/ssr` with a root `proxy.ts` that refreshes the session
cookie and redirects unauthenticated requests before the page streams. This also
enables server components and removes the loading flash.

> Next.js 16 renamed the `middleware` file convention and its named export to
> `proxy`; the old names are deprecated. Use `proxy.ts` exporting `proxy`, not
> `middleware.ts`. See
> `web/node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`.

### S-7 · Account-recovery and password policy gaps — **P1**

There is no forgot-password / reset flow on either client. The web sign-up form
enforces no password rules at all (Android requires eight characters). Supabase
error strings are surfaced verbatim, which leaks account-existence information.

**Fix:** add `resetPasswordForEmail` plus an update-password route; mirror
Android's minimum length on the web and enable Supabase's password strength and
leaked-password protection; map auth errors to generic user-facing copy.

### S-8 · Android session storage and release configuration — **P2**

supabase-kt persists the session and refresh token in plain SharedPreferences by
default. Root-level or backup-based extraction is possible; `allowBackup=false`
mitigates part of this but not all.

**Fix:** back the session store with `EncryptedSharedPreferences`, and consider
`android:excludeFromRecents` or `FLAG_SECURE` on the auth screen.

### S-9 · `foregroundServiceType="specialUse"` is a Play Store risk — **P1**

[AndroidManifest.xml](android/app/src/main/AndroidManifest.xml) declares the
timer as `specialUse`, which Google Play reviews case by case and frequently
rejects when a standard type or a non-service approach would work.

**Fix:** before submission, either prepare the Play Console justification or
re-implement the countdown with `AlarmManager.setExactAndAllowWhileIdle` plus a
plain ongoing notification, which needs no foreground-service type at all and
uses less battery.

### S-10 · Manual focus time is effectively unlimited — **P1** · needs a decision

S-2 capped one session at 1,440 minutes and made `duration` agree with
`end_time - start_time`. But the client chooses both timestamps, and nothing
stops sessions from overlapping or being backdated, so anyone can log any number
of 24-hour sessions at 1 XP per minute, through the normal manual-entry form.
The `is_manual` flag from B-20 is reported by the client, so a hand-crafted
request can also claim a manual entry came from the timer.

**Options:** reject sessions that overlap another session of the same user (an
exclusion constraint on `tstzrange(start_time, end_time)`); cap total focus
minutes per user per calendar day at 1,440; limit how far back a manual entry may
be dated; or award XP for timer sessions only. Overlap rejection plus a daily cap
closes the hole without penalising honest catch-up logging.

### S-11 · Task and habit XP can be farmed — **P2** · needs a decision

A task is worth up to 100 XP the moment it is marked complete, however trivial,
and any number can be created. Habit check-ins can be recorded for any past date
(only dates after tomorrow are rejected), at 30 XP each plus the streak bonus
that a backfilled run produces. Neither needs a crafted request.

**Options:** a daily XP cap per source; no XP for a task completed within a few
minutes of being created; no XP for check-ins dated more than one or two days
back (they would still count towards streaks and history); or accept it, on the
basis that XP is a personal motivator with no leaderboard. If a leaderboard or
any shared ranking is ever planned, this has to be closed first.

---

## 2. Bugs

### B-1 · The web timer stops counting when you leave `/pomodoro` — **P0** · DONE

The one-second interval driving the countdown lives in the page component
([pomodoro/page.tsx:138](web/src/app/(dashboard)/pomodoro/page.tsx:138)), not in
the store. Navigate to Tasks mid-session and the tick, the completion handler,
the alarm, and the notification all stop. The session's DB row stays at
`duration = 0` until you come back. Because `targetEndTime` is persisted, the
display corrects itself on return — which makes this easy to miss in testing and
guarantees under-recorded focus time in real use.

**Fix (short term):** move the interval into the store, started by `startTimer`
and cleared on pause/reset/complete, so it survives route changes within the
SPA. **Fix (proper):** run the countdown in a Web Worker or a Service Worker so
it also survives background-tab throttling, and finalise the session from a
`visibilitychange` / `beforeunload` handler.

### B-2 · Manual focus entries inflate the long-break counter — **P1** · DONE

Closed alongside B-20: manual entries no longer increment `sessionsCompleted`,
and entries flagged `is_manual` are excluded when it is recounted on load.

`addManualSession` does `sessionsCompleted: state.sessionsCompleted + 1`
([pomodoroStore.ts:191](web/src/store/pomodoroStore.ts:191)) regardless of
duration, so logging past focus time shifts the "long break after every fourth
session" cadence.

**Fix:** derive `sessionsCompleted` from today's timer-created sessions only, or
track the break cadence in a separate counter.

### B-3 · `longest_streak` never decreases — **P1** · DONE

`Math.max(habit.longest_streak, streak.longest)` is monotonic, so undoing
check-ins leaves the inflated record — and its 25 XP per seven days — in place
permanently. Fixed for free by the server-side recalculation in S-1.

### B-4 · Changing timer settings mid-session silently reverts — **P2**

`updateSettings` rewrites `timeRemaining` but leaves `targetEndTime` untouched,
so the next `tick` overwrites the new value with the old schedule.

**Fix:** ignore duration changes while running, or recompute `targetEndTime`
from the delta and adjust the session's `planned_duration` alongside it.

### B-5 · Android: a restarted process resumes a paused timer — **P1**

`onStartCommand` returns `START_STICKY`, and after a process kill Android
redelivers a **null** intent. The `when (intent?.action ?: ACTION_START)`
expression at [TimerService.kt:38](android/app/src/main/java/dev/onestep/mobile/timer/TimerService.kt:38)
maps that to `ACTION_START`, so a timer the user had paused starts running
again.

**Fix:** handle the null-intent case explicitly — re-read the snapshot and
resume the countdown only if the persisted status is already `Running`,
otherwise stop the service. Consider `START_REDELIVER_INTENT`.

### B-6 · Android: the notification flashes a default state — **P2**

`startForeground(RUNNING_NOTIFICATION_ID, runningNotification(TimerSnapshot()))`
([TimerService.kt:36](android/app/src/main/java/dev/onestep/mobile/timer/TimerService.kt:36))
posts a hardcoded "Focus 25:00" on every `onStartCommand`, including pause and
reset, before the real snapshot loads.

**Fix:** read the persisted snapshot synchronously (or cache the last one) and
post that; do not promote to foreground at all for pause/reset when the service
is about to stop.

### B-7 · Android: DataStore is read from disk every second — **P2**

The countdown loop calls `repository.current()` (a `Flow.first()` over a file
read) once per tick.

**Fix:** collect the snapshot flow once into a local variable and tick against
the in-memory copy, persisting only on state transitions.

### B-8 · Orphaned zero-duration session rows — **P2**

The web `startTimer` inserts the row before the countdown begins, and Android
does the same. If the user closes the tab, the process dies, or the pause write
fails, a `duration = 0` row is left behind. Nothing ever cleans these up and
they appear in the session history.

**Fix:** guard against double submission, and add a periodic cleanup (or a
`WHERE duration = 0 AND end_time < now() - interval '1 day'` sweep) — or defer
the insert until the first pause/complete and keep the start time client-side.

### B-9 · Every navigation double-fetches — **P2**

[Header.tsx](web/src/components/layout/Header.tsx) calls `fetchTasks`,
`fetchSessions`, and `fetchHabits` on mount to render the level badge, and each
dashboard page then fetches the same data again in its own effect.

**Fix:** fetch once at the shell level with request deduplication and a staleness
window, or read the level from `profiles` (which the server already keeps
accurate) instead of recomputing it in the header.

### B-10 · A network round trip before every mutation — **P2**

`supabase.auth.getUser()` appears 19 times across the stores. It is a network
call to `/auth/v1/user`, so each add/update/delete costs an extra round trip.

**Fix:** read the user from `authStore` (already populated by `AuthProvider`), or
use `getSession()`, which reads local storage. RLS already enforces ownership, so
the explicit `.eq('user_id', …)` filters are defence in depth, not a requirement.

### B-11 · No pagination anywhere — **P2**

Every fetch pulls the user's complete history: all tasks, all sessions, all habit
logs. Analytics loads four full tables and computes everything in the browser.
After a year of daily use this is thousands of rows on every page load.

**Fix:** range-scope the analytics queries to the selected window, paginate task
and session lists, and move heavy aggregation into Postgres views or RPCs.

### B-12 · Timezone handling is inconsistent — **P2**

Habit check-ins send a browser-local `yyyy-MM-dd` string, but
`habit_logs.completed_at` defaults to UTC `CURRENT_DATE`, and streak math mixes
local `new Date()` with `parseISO` of date-only strings. Users far from UTC will
see off-by-one days, and a check-in made late at night can land on the wrong
day.

**Fix:** store an explicit IANA timezone on `profiles`, and resolve "today"
against it consistently on both clients and in SQL.

### B-13 · Destructive actions have no confirmation — **P1** · DONE

Deleting a task, a project, or a habit is immediate and irreversible — no dialog,
no undo. Deleting a project also silently reassigns all its tasks and sessions to
`Misc.`, which the user is never told.

**Fix:** a confirmation dialog naming what will be affected ("this project has 12
tasks and 40 focus sessions, which will move to Misc."), plus an undo toast for
the common cases.

### B-14 · `reorderHabits` is not atomic — **P2**

Reordering fires one UPDATE per habit through `Promise.all`. A partial failure
rolls back the local array but leaves the database half-reordered.

**Fix:** a single RPC taking the ordered ID array and updating in one
transaction.

### B-15 · CI almost certainly cannot build — **P1** · DONE

[quality.yml](web/.github/workflows/quality.yml) runs `npm run build` without
`NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
[supabase.ts](web/src/lib/supabase.ts) asserts both non-null and calls
`createClient` at module scope. The installed `@supabase/supabase-js` throws
`supabaseUrl is required.` on an empty URL (verified in
`node_modules/@supabase/supabase-js/dist/index.cjs:995`), and the module is
evaluated when client components are prerendered, so the build step should fail.
Confirm with one CI run — the local build only succeeds because `.env.local` is
present.

**Fix:** supply placeholder values as workflow `env`, and make
[supabase.ts](web/src/lib/supabase.ts) fail with an explicit, readable message
instead of a non-null assertion. Add an Android job
(`./gradlew testDebugUnitTest lintDebug assembleDebug`) — nothing currently
builds the mobile app in CI.

### B-16 · Modals are not accessible — **P2** · PARTIAL

The task, habit, settings, and manual-entry modals set `role="dialog"` and
`aria-modal` but do not trap focus, close on Escape, or restore focus to the
trigger on close. Background content stays reachable by keyboard.

**Fix:** a shared `<Modal>` component built on the native `<dialog>` element or a
headless library.

### B-17 · "Today" is computed once per render — **P3**

`todayStr` is derived at render time on the dashboard and habits pages. A tab
left open across midnight keeps showing the previous day until it is reloaded.

**Fix:** a small clock hook that re-renders on date rollover.

### B-18 · Android: start and permission request race — **P3**

`onStart` launches the `POST_NOTIFICATIONS` dialog and calls
`timerViewModel.start()` in the same frame
([AppShell.kt:125](android/app/src/main/java/dev/onestep/mobile/ui/AppShell.kt:125)).
If the user denies, the foreground service runs with no visible notification and
no controls.

**Fix:** start the timer from the permission callback, and show a rationale plus
a settings shortcut on denial.

### B-19 · The web app displays XP it computed itself, not the server's — **P1** · DONE

`profiles.experience_points` is calculated by the database, but the header and
dashboard ignored it and recomputed XP in the browser with a TypeScript copy of
the formula in [gamification.ts](web/src/lib/gamification.ts). The two agreed
only as long as both copies were edited together; any change to one would have
shown users a number different from the one stored. The header also loaded every
task, session and habit on every page just to do this.

**Done:** the recalculation function now also stores the split
(`task_xp`, `focus_xp`, `habit_xp`) on `profiles`, and the client reads every XP
figure from the profile. The dashboard reloads the profile on visit, so XP earned
on Android shows up. Only the level curve is still repeated in TypeScript, to
draw the progress bar; it must stay in step with the SQL.

### B-20 · Manual focus entries always earn the completed-session bonus — **P1** · DONE

The +10 bonus is for a session where `duration >= planned_duration`. The manual
entry form sets `planned_duration = duration`, so every manual entry qualified,
and a one-minute entry was worth 11 XP — the cheapest way to farm points.

**Done:** `pomodoro_sessions.is_manual` (default `false`) marks hand-logged
entries, the web form sets it, and the formula skips the bonus for them. Existing
manual entries were identified by their shape — whole-minute start, `end_time`
exactly `duration` minutes later, and `planned_duration = duration` — which timer
sessions, timed to the millisecond, do not produce. This fixes the app's own form;
it does not stop a crafted request (S-10).

### B-21 · The streak bonus means different things for different habits — **P2** · needs a decision

The bonus is `floor(longest_streak / 7) × 25` per habit. For a daily habit a
streak is counted in days, for a weekly habit in weeks, so a weekly habit needs
seven weeks of streak for the bonus a daily habit earns in seven days. And
because only the single longest run counts, rebuilding a streak after breaking it
earns nothing until it beats the old record.

**Options:** count weekly streaks in weeks but pay the bonus every week, or every
four; and pay per milestone reached in any run (store milestones earned, or
derive them from all runs) instead of from the longest run alone. Deciding this
also settles what `current_streak` should be worth, which today is nothing.

### B-22 · Editing a task moves its deadline by the UTC offset — **P1** · DONE

The edit form filled the `datetime-local` input with
`new Date(deadline).toISOString().slice(0, 16)` — UTC wall-clock time — and the
browser read it back as local time on save. In India every edit-and-save moved
the deadline 5½ hours earlier, which could also cost the +20 on-time bonus.

**Done:** the form now formats the deadline in local time
([tasks/page.tsx:160](web/src/app/(dashboard)/tasks/page.tsx:160)). Deadlines
already shifted by earlier edits cannot be detected and stay as saved. The wider
timezone work is B-12.

---

## 3. Improvements

### 3.1 Engineering foundation

| Item | Priority | Notes |
|---|---|---|
| Automated tests | **P1** | There is one test file in the whole repository. Start with the pure logic: `gamification.ts`, the habit streak calculators, and analytics range math (Vitest). Then Playwright for the auth → task → focus → XP path. |
| Generated Supabase types | **P1** | `supabase gen types typescript` replaces the roughly 20 `as Task[]` / `as Profile` casts, which currently hide schema drift until runtime. |
| Split the large pages | **P2** | Four pages exceed 500 lines and mix data, layout, and charts. Extract chart components and the habit calendar into `components/` so they can be tested in isolation. |
| SQL migration discipline | **P2** | Migrations are hand-ordered files with a README-documented apply order. Move to the Supabase CLI with timestamped migrations and a local `supabase start` workflow. |
| Error and observability | **P2** | Errors surface as raw Postgres strings in coloured boxes. Add a toast system, an error boundary, and Sentry (or equivalent) on both clients. |
| Shared domain layer | **P3** | The XP formula now lives in three places (SQL, TypeScript, and soon Kotlin). Consider a single JSON spec or a `/rpc` endpoint both clients call. |

### 3.2 Web product gaps

- **Settings is the thinnest page.** Timer defaults are saved to `localStorage`
  only, so they do not follow the user to another browser *or to the Android
  app*, despite both storing the same three values. Move them to a
  `user_settings` table. Also missing: password change, email change, theme
  choice (the CSS is dark-only), timezone, data export, and account deletion.
- **No search or filter** on tasks, projects, or sessions.
- **No recurring tasks, subtasks, tags, or task-level reordering** — the most
  commonly expected features for a task manager of this maturity.
- **No cross-device realtime.** Supabase Realtime subscriptions would let the web
  dashboard update when the Android timer finishes a session.
- **No PWA layer** — no manifest, no service worker, no offline shell, no install
  prompt. This is the cheapest path to a usable mobile web experience while the
  native app catches up.
- **Accessibility**: chart-only data with no table equivalent, no
  `prefers-reduced-motion` handling despite pervasive animations, and several
  low-contrast zinc-on-zinc text pairings.
- **Fixed productivity-score goals** (5 tasks / 120 minutes / 3 habits) should be
  user-configurable, since the score is presented as a headline metric.

### 3.3 Android roadmap

The README describes the current state as an intentional vertical slice. The
natural order for the remaining slices:

1. **Offline foundation first** — Room cache plus the durable mutation queue
   (WorkManager is already a dependency and unused). Today a failed write during
   a focus session is silently swallowed by `runCatching` and the minutes are
   lost. Everything after this depends on it.
2. **Tasks** — promote `TaskRepository` from `openTasks()` to full CRUD, then
   build the Tasks screen.
3. **Today / Home** — daily stats and quick check-ins, reusing the task and
   session repositories.
4. **Habits** — check-in toggles and streak calendars, sharing the streak rules
   with the server-side implementation from S-1.
5. **Projects, analytics, settings** — the "More" destination, including timer
   defaults synced through the shared settings table.
6. **Platform extras** — a home-screen widget or Tile for the timer, quick
   settings, and `BOOT_COMPLETED` recovery so a running timer survives a reboot.

Also worth doing along the way: dependency injection (Hilt) instead of the
hand-rolled `AppContainer`, replacing the hand-written `gradlew` scripts with
the generated ones, a lint baseline, and Compose UI tests.

---

## 4. Suggested sequence

**Milestone 1 — Make it safe (1–2 weeks)**
S-0 (version control), S-1, S-2, S-3, S-4 (XP integrity), B-1 (timer accuracy),
B-15 (working CI), B-13 (delete confirmations).

**Milestone 2 — Make it trustworthy (2–3 weeks)**
Generated types, unit tests for the XP and streak logic, S-6 (SSR auth),
S-7 (password reset), B-9/B-10/B-11 (fetch and pagination), B-12 (timezones),
and a decision on S-10, S-11 and B-21 (how strict XP scoring should be).

**Milestone 3 — Make it complete (3–4 weeks)**
Settings sync to the database, theme and accessibility pass, task search and
filtering, PWA shell, realtime sync.

**Milestone 4 — Make it mobile (ongoing)**
The Android slice order in 3.3, starting with the offline queue and resolving
S-9 before any Play Store submission.
