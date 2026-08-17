# OneStep Web Application

OneStep is a Supabase-backed productivity dashboard for projects, tasks,
task-linked Pomodoro sessions, habits, and analytics.

## Run in WSL

The project is intended to run inside WSL. Keep the repository in the Linux
filesystem for the best Next.js file-watching and build performance, for
example:

```bash
~/projects/OneStep
```

If the repository remains on the Windows drive, open it through:

```bash
cd /mnt/c/Users/<windows-user>/path/to/OneStep/web
```

Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For production hosting, follow [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md).

Do not run `npm install` alternately from Windows and WSL against the same
`node_modules` directory. Native packages such as Next.js SWC are
platform-specific. Delete `node_modules` and reinstall from WSL if the
dependencies were last installed from Windows.

## Environment

Create `web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` variable is also supported as a
fallback. Never expose a Supabase secret or `service_role` key in a
`NEXT_PUBLIC_` variable.

## Database

For a new Supabase project, apply:

```text
supabase/schema.sql
```

For an existing OneStep database that already has the original schema and
`update_schema.sql`, apply:

```text
supabase/phase_8_14_improvements.sql
supabase/gamification_system.sql
```

The migration adds:

- A protected `Misc.` project for every user
- Required task-to-project relationships
- Task completion timestamps
- Task-linked Pomodoro sessions
- Planned versus actual session duration fields
- Habit display ordering
- Data validation, uniqueness, indexes, and stronger RLS policies
- Server-calculated XP, levels, achievement inputs, and protected score fields

Apply the migration before running the updated UI because the client expects the
new columns.

## Quality checks

Run inside WSL:

```bash
npm run lint
npm run typecheck
npm run build
```

## Main routes

| Route | Purpose |
|---|---|
| `/` | Daily dashboard |
| `/projects` | Project management and project focus heatmap |
| `/tasks` | Task CRUD, deadline performance, and time comparisons |
| `/pomodoro` | Task-linked timer, manual focus entry, alarm, notifications, and history |
| `/habits` | Ordered habit cards, current/backdated check-ins, and habit detail |
| `/analytics` | Weekly-by-default presets, custom/all-time ranges, and four analytics sections |
| `/settings` | Profile, timer defaults, and notifications |
