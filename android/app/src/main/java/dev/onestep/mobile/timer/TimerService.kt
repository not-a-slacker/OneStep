package dev.onestep.mobile.timer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import dev.onestep.mobile.MainActivity
import dev.onestep.mobile.OneStepApplication
import dev.onestep.mobile.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class TimerService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val repository: TimerRepository
        get() = (application as OneStepApplication).container.timerRepository
    private val focusSessionRepository: FocusSessionRepository
        get() = (application as OneStepApplication).container.focusSessionRepository
    private var countdownJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(RUNNING_NOTIFICATION_ID, runningNotification(TimerSnapshot()))
        scope.launch {
            when (intent?.action ?: ACTION_START) {
                ACTION_START -> {
                    val beforeStart = repository.current()
                    repository.start()
                    startCountdown()
                    if (
                        beforeStart.mode == TimerMode.Focus &&
                        beforeStart.sessionDatabaseId == null
                    ) {
                        runCatching { focusSessionRepository.startSession(beforeStart) }
                            .getOrNull()
                            ?.let { session ->
                                repository.attachDatabaseSession(session.id, session.projectId)
                            }
                    }
                }
                ACTION_PAUSE -> {
                    val beforePause = repository.current()
                    if (beforePause.mode == TimerMode.Focus) {
                        runCatching { focusSessionRepository.updatePartialSession(beforePause) }
                    }
                    repository.pause()
                }
                ACTION_RESET -> {
                    val beforeReset = repository.current()
                    if (beforeReset.mode == TimerMode.Focus) {
                        runCatching { focusSessionRepository.updatePartialSession(beforeReset) }
                    }
                    repository.reset()
                }
            }

            val snapshot = repository.current()
            if (snapshot.status == TimerStatus.Running) {
                startCountdown()
            } else {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        countdownJob?.cancel()
        scope.cancel()
        super.onDestroy()
    }

    private fun startCountdown() {
        countdownJob?.cancel()
        countdownJob = scope.launch {
            while (isActive) {
                val snapshot = repository.current()
                if (snapshot.status != TimerStatus.Running) break

                val remaining = snapshot.displayedRemainingSeconds(System.currentTimeMillis())
                if (remaining <= 0) {
                    val completedMode = snapshot.mode
                    if (completedMode == TimerMode.Focus) {
                        runCatching { focusSessionRepository.completeSession(snapshot) }
                    }
                    repository.complete()
                    showCompletionNotification(completedMode)
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                    break
                }

                notificationManager.notify(
                    RUNNING_NOTIFICATION_ID,
                    runningNotification(snapshot.copy(remainingSeconds = remaining)),
                )
                delay(1_000)
            }
        }
    }

    private fun runningNotification(snapshot: TimerSnapshot) =
        NotificationCompat.Builder(this, RUNNING_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(snapshot.mode.displayName())
            .setContentText(formatDuration(snapshot.remainingSeconds))
            .setContentIntent(contentIntent())
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .addAction(0, "Pause", serviceIntent(ACTION_PAUSE, 1))
            .addAction(0, "Reset", serviceIntent(ACTION_RESET, 2))
            .build()

    private fun showCompletionNotification(mode: TimerMode) {
        val title = if (mode == TimerMode.Focus) "Focus complete" else "Break complete"
        val message = if (mode == TimerMode.Focus) {
            "Nice work. Your break is ready."
        } else {
            "Ready for another focused step?"
        }
        notificationManager.notify(
            COMPLETION_NOTIFICATION_ID,
            NotificationCompat.Builder(this, COMPLETION_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle(title)
                .setContentText(message)
                .setContentIntent(contentIntent())
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .build(),
        )
    }

    private fun createNotificationChannels() {
        notificationManager.createNotificationChannel(
            NotificationChannel(
                RUNNING_CHANNEL_ID,
                "Active timer",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Shows the active OneStep focus timer and its controls."
            },
        )
        notificationManager.createNotificationChannel(
            NotificationChannel(
                COMPLETION_CHANNEL_ID,
                "Timer completion",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Alerts when a focus or break period finishes."
                enableVibration(true)
            },
        )
    }

    private fun contentIntent(): PendingIntent = PendingIntent.getActivity(
        this,
        0,
        Intent(this, MainActivity::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun serviceIntent(action: String, requestCode: Int): PendingIntent =
        PendingIntent.getService(
            this,
            requestCode,
            Intent(this, TimerService::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private val notificationManager: NotificationManager
        get() = getSystemService(NotificationManager::class.java)

    companion object {
        const val ACTION_START = "dev.onestep.mobile.timer.START"
        const val ACTION_PAUSE = "dev.onestep.mobile.timer.PAUSE"
        const val ACTION_RESET = "dev.onestep.mobile.timer.RESET"
        private const val RUNNING_CHANNEL_ID = "active_timer"
        private const val COMPLETION_CHANNEL_ID = "timer_completion"
        private const val RUNNING_NOTIFICATION_ID = 1001
        private const val COMPLETION_NOTIFICATION_ID = 1002
    }
}

fun TimerMode.displayName(): String = when (this) {
    TimerMode.Focus -> "Focus"
    TimerMode.ShortBreak -> "Short break"
    TimerMode.LongBreak -> "Long break"
}

fun formatDuration(totalSeconds: Int): String = "%02d:%02d".format(
    totalSeconds.coerceAtLeast(0) / 60,
    totalSeconds.coerceAtLeast(0) % 60,
)
