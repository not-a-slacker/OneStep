# OneStep Android

Native Android client for OneStep, built with Kotlin, Jetpack Compose, Material 3,
Supabase Auth/PostgREST, and DataStore.

## Implemented vertical slice

- Supabase email/password login and signup
- Email-confirmation deep link (`onestep://auth`)
- Persisted Supabase session restoration
- Authenticated five-destination navigation shell
- Open-task loading for focus assignment
- Focus, short-break, and long-break timer modes
- Target-timestamp countdown to avoid timer drift
- Timer persistence across activity and process recreation
- Foreground service with an ongoing notification
- Pause and reset notification actions
- Completion notification and vibration
- Long break after every fourth completed focus session
- Partial and completed focus-session updates in Supabase
- Pure timer state-machine unit tests

Home, task management, habits, projects, analytics, settings, Room caching, and
the durable offline mutation queue are intentionally represented as later slices.

## Prerequisites

- Android Studio with Android SDK 36
- JDK 17 (Android Studio's bundled JDK is suitable)
- The existing OneStep Supabase schema and migrations

## Configuration

1. Copy `local.properties.example` to `local.properties`.
2. Set `sdk.dir` to the Android SDK path.
3. Copy the same Supabase URL and publishable key used by the web app into
   `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
4. In Supabase Auth, add `onestep://auth` to the allowed redirect URLs.

The publishable key is intended for client applications. Never place a Supabase
secret or service-role key in this project.

## Build and test

```powershell
.\gradlew.bat testDebugUnitTest
.\gradlew.bat lintDebug
.\gradlew.bat assembleDebug
```

The repository includes the Gradle wrapper scripts, wrapper JAR, and Gradle 8.13
distribution configuration.

## Current data behavior

Starting an online focus period creates a zero-duration `pomodoro_sessions` row.
Pause/reset writes elapsed whole minutes, and normal completion writes the full
planned duration. Break periods remain device-local and are not stored, matching
the web app.

The timer itself continues locally if the session insert or update fails. A
Room-backed mutation queue is the next data-integrity task; until it exists,
failed offline writes are not retried automatically.
