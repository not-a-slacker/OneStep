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

CI runs the same three tasks on every push and pull request; see
`.github/workflows/quality.yml` at the repository root. It supplies placeholder
Supabase values through the `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
environment variables, which `app/build.gradle.kts` reads in preference to
`local.properties`.

## Testing on a phone

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`. Build
it with real Supabase values in `local.properties` (above); an APK built without
them opens to a "Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY" error. Android 8.0
(API 26) or newer is required.

### Install

**Without any tools:** copy `app-debug.apk` to the phone (USB file transfer,
or upload it to your own cloud drive and download it on the phone), open it from
the Files app, and allow that app to "install unknown apps" when asked. Play
Protect may warn about an unrecognised developer, because debug builds are signed
with a local debug key; choose "Install anyway".

**With adb over Wi-Fi (Android 11+):** this also gives you logs. No USB driver
or extra software is needed, only the `platform-tools` already in the SDK.

1. On the phone, enable Developer options (Settings → About phone → tap
   *Build number* seven times), then turn on Developer options → *Wireless
   debugging*. The phone and computer must be on the same Wi-Fi network.
2. Tap *Pair device with pairing code*. Note the `IP:port` and six-digit code.
3. `adb pair <IP>:<pairing port>` and enter the code.
4. `adb connect <IP>:<port>`, using the port shown on the main *Wireless
   debugging* screen (it differs from the pairing port).
5. `adb install -r app/build/outputs/apk/debug/app-debug.apk`
6. Logs while testing: `adb logcat --pid=$(adb shell pidof dev.onestep.mobile)`

`adb` is `$ANDROID_HOME/platform-tools/adb`. From WSL 2 the outbound connection
to the phone normally works; if `adb connect` times out, a VPN or firewall is
usually in the way.

### What to check

The mobile app currently has sign-in and the focus timer; the Home, Tasks,
Habits and More tabs are placeholders.

1. **Sign in** with the same account as the web app. Signing up on the phone
   also works, but the confirmation email's link only returns to the app if
   `onestep://auth` is in Supabase's redirect URLs (Authentication → URL
   Configuration → Redirect URLs).
2. **Session restore:** close the app from recents and reopen it; you should
   still be signed in. *Exit* (top right) signs out.
3. **Timer tab:** the task button lists your open tasks from the web app.
   Choose one, press Start, and allow notifications when Android asks
   (Android 13+).
4. **Background:** an ongoing notification shows the countdown with Pause and
   Reset. Press Home, lock the phone, or swipe the app away; the countdown must
   continue and stay accurate.
5. **Completion:** focus is fixed at 25 minutes on mobile (no settings screen
   yet), so test completion with a 5-minute *Short break* first. When it ends you
   get a completion notification and a vibration.
6. **Data:** after a focus period, the session appears in the web app's
   Pomodoro history against the chosen task, and XP goes up by the minutes plus
   10. Pausing or resetting part-way writes the elapsed whole minutes, without
   the bonus.
7. **Cadence:** after the fourth completed focus period the next break is a long
   break.

## Current data behavior

Starting an online focus period creates a zero-duration `pomodoro_sessions` row.
Pause/reset writes elapsed whole minutes, and normal completion writes the full
planned duration. Break periods remain device-local and are not stored, matching
the web app.

The timer itself continues locally if the session insert or update fails. A
Room-backed mutation queue is the next data-integrity task; until it exists,
failed offline writes are not retried automatically.
