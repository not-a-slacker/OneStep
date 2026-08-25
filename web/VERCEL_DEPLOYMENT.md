# Deploy OneStep to Vercel

This guide deploys the Next.js application in this `web` directory and keeps
Supabase as the hosted database and authentication provider.

## 1. Prepare the Supabase database

Open the Supabase dashboard, select the project, and open **SQL Editor**.

For a completely new database, run the full contents of:

```text
../supabase/schema.sql
```

For an existing OneStep database, run these files in order:

```text
../supabase/phase_8_14_improvements.sql
../supabase/gamification_system.sql
../supabase/manual_focus_project_assignment.sql
```

The gamification migration is required for server-calculated XP and levels. It
also recalculates existing users from their tasks, focus sessions, and habit
activity.

Do not run `schema.sql` against an existing populated database. Use the
incremental migrations instead.

## 2. Get the Supabase browser credentials

In Supabase, open the project's **Connect** dialog or **Settings > API Keys**.
Copy:

- Project URL
- Publishable key, beginning with `sb_publishable_`

The legacy anonymous key also works, but the publishable key is preferred for a
new deployment.

Never place a secret key or `service_role` key in a
`NEXT_PUBLIC_...` variable. Browser code can read all variables with that
prefix. Row Level Security is what protects user data when a publishable key is
used.

The application expects:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

The older variable `NEXT_PUBLIC_SUPABASE_ANON_KEY` remains supported as a
fallback.

## 3. Put the project on GitHub

**The repository layout changed.** The Git root is now the `OneStep` directory,
not `web`. One repository holds the web app, the Android client, the Supabase
migrations, and the documentation. The original three `web` commits were
rewritten so their files sit under `web/`, so the history is preserved but the
commit hashes are new.

Review before committing (the web app is developed inside WSL):

```bash
cd /mnt/c/Users/Bhuvee/Documents/IIITH/projects/OneStep
git status
cd web && npm run lint && npm run typecheck && npm run build
```

Because the history was rewritten, the existing remote cannot be updated with a
normal push. Choose one:

- **Replace the existing repository's history** — destructive, and anyone else
  who cloned it must re-clone:

```bash
git push --force-with-lease origin main
```

- **Or push to a new, empty repository** and leave the old one untouched:

```bash
git remote set-url origin https://github.com/YOUR_USERNAME/NEW_REPOSITORY.git
git push -u origin main
```

The local `.env.local`, `.next`, `node_modules`, `.vercel`, and Android build
directories are ignored and must not be committed.

The local `.env.local`, `.next`, `node_modules`, and `.vercel` directories
are ignored and must not be committed.

## 4. Import the project into Vercel

1. Sign in at https://vercel.com.
2. Choose **Add New > Project**.
3. Connect GitHub if needed and import the repository from step 3.
4. Confirm **Framework Preset: Next.js**.
5. Set **Root Directory** to `web`. The repository root is now the parent
   `OneStep` directory, so Vercel will not find `package.json` at `.`. **If this
   project was already deployed with the root directory set to `.`, change it
   under Settings > Build and Deployment > Root Directory before the next
   deploy, or the build will fail.**
6. Leave the install command, build command, and output directory on Vercel's
   detected defaults. The expected build command is `npm run build`.
7. The repository pins Node.js `22.x`. You can confirm this under
   **Settings > Build and Deployment > Node.js Version**.

Selecting the wrong root directory is the most likely reason Vercel would say it
cannot find `package.json`.

## 5. Add Vercel environment variables

Before the first deployment, expand **Environment Variables** and add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |

Enable both variables for **Production** and **Preview**. You may also enable
Development if you plan to use `vercel dev`.

Preview deployments will use the same Supabase database when they receive the
same credentials. Use a separate Supabase project for previews if test data must
be isolated from production.

Click **Deploy**. Vercel will install from `package-lock.json`, run the Next.js
production build, and issue an HTTPS `*.vercel.app` URL.

Environment-variable changes affect only new deployments. After changing a
variable, redeploy from the Deployments page.

## 6. Configure Supabase Auth URLs

After the first Vercel deployment gives you the final production URL, open
Supabase **Authentication > URL Configuration**.

In **Authentication > Providers > Email**, keep email/password authentication
enabled and turn on **Confirm email**. The application signs a new user out,
shows an in-page confirmation notice, and returns them to the login form until
they confirm the address.

Set **Site URL** to the exact production address, for example:

```text
https://onestep.vercel.app
```

Add these **Redirect URLs**:

```text
http://localhost:3000/**
https://onestep.vercel.app/**
https://*-YOUR_VERCEL_ACCOUNT_OR_TEAM_SLUG.vercel.app/**
```

Replace the example production host and account/team slug. Keep the production
URL exact. The wildcard entry permits Git-branch preview deployments; omit it if
preview authentication is not needed.

This configuration ensures confirmation and recovery emails do not send users
back to localhost.

## 7. Verify the production deployment

Create a fresh test account and verify:

1. Sign-up, required confirmation email, sign-in, and sign-out.
2. Project and task creation.
3. Task completion and immediate header XP changes.
4. Habit check-in, backdated check-in, streak, and XP changes.
5. Pomodoro completion and manual focus entry.
6. Analytics date presets and project charts.
7. Reloading a page preserves the session and shows the same level.
8. Timer notifications and sound work after notification permission is granted.

The header should briefly show **Syncing** after a fresh page load, then display
the level calculated from the fetched task, focus, and habit records. Hovering
the XP pill shows the lifetime XP breakdown.

If the dashboard calculation is correct but the profile row is not updated,
confirm that `gamification_system.sql` was applied successfully.

## 8. Add a custom domain (optional)

In Vercel, open the project and go to **Settings > Domains**. Add the apex domain
or subdomain and follow the exact DNS records Vercel provides. Vercel
automatically provisions HTTPS after DNS verification.

After the domain works:

1. Change the Supabase **Site URL** to the custom HTTPS domain.
2. Add `https://your-domain.example/**` to Supabase Redirect URLs.
3. Keep the `vercel.app` URL allowed if it will still be used.
4. Redeploy only if you add a corresponding application environment variable;
   the current app does not otherwise require one.

## 9. Future deployments

With the Git integration, pushes to `main` create production deployments and
other branches create preview deployments:

```bash
git add .
git commit -m "Describe the change"
git push
```

Check the Vercel deployment logs whenever a build fails. A successful deployment
is promoted to the production domain automatically.

## CLI alternative

To deploy without connecting GitHub, run from this `web` directory:

```bash
npm install --global vercel
vercel
vercel --prod
```

The first command links or creates a Vercel project. Configure the same two
environment variables in the Vercel dashboard, then run `vercel --prod` again
so the production build includes them. Git integration is recommended for
automatic preview and production deployments.
