package dev.onestep.mobile.timer

import kotlinx.serialization.Serializable
import kotlin.math.ceil

@Serializable
enum class TimerMode {
    Focus,
    ShortBreak,
    LongBreak,
}

@Serializable
enum class TimerStatus {
    Idle,
    Running,
    Paused,
}

@Serializable
data class TimerSnapshot(
    val mode: TimerMode = TimerMode.Focus,
    val status: TimerStatus = TimerStatus.Idle,
    val focusDurationSeconds: Int = 25 * 60,
    val shortBreakDurationSeconds: Int = 5 * 60,
    val longBreakDurationSeconds: Int = 15 * 60,
    val remainingSeconds: Int = 25 * 60,
    val targetEndEpochMillis: Long? = null,
    val sessionsCompleted: Int = 0,
    val selectedTaskId: String? = null,
    val selectedProjectId: String? = null,
    val sessionDatabaseId: String? = null,
) {
    fun durationFor(currentMode: TimerMode = mode): Int = when (currentMode) {
        TimerMode.Focus -> focusDurationSeconds
        TimerMode.ShortBreak -> shortBreakDurationSeconds
        TimerMode.LongBreak -> longBreakDurationSeconds
    }

    fun displayedRemainingSeconds(nowEpochMillis: Long): Int {
        if (status != TimerStatus.Running || targetEndEpochMillis == null) {
            return remainingSeconds.coerceAtLeast(0)
        }
        return ceil((targetEndEpochMillis - nowEpochMillis) / 1_000.0)
            .toInt()
            .coerceAtLeast(0)
    }
}

object TimerStateMachine {
    fun start(snapshot: TimerSnapshot, nowEpochMillis: Long): TimerSnapshot {
        if (snapshot.status == TimerStatus.Running) return snapshot
        val remaining = snapshot.remainingSeconds
            .takeIf { it > 0 }
            ?: snapshot.durationFor()
        return snapshot.copy(
            status = TimerStatus.Running,
            remainingSeconds = remaining,
            targetEndEpochMillis = nowEpochMillis + remaining * 1_000L,
        )
    }

    fun pause(snapshot: TimerSnapshot, nowEpochMillis: Long): TimerSnapshot {
        if (snapshot.status != TimerStatus.Running) return snapshot
        return snapshot.copy(
            status = TimerStatus.Paused,
            remainingSeconds = snapshot.displayedRemainingSeconds(nowEpochMillis),
            targetEndEpochMillis = null,
        )
    }

    fun reset(snapshot: TimerSnapshot): TimerSnapshot = snapshot.copy(
        status = TimerStatus.Idle,
        remainingSeconds = snapshot.durationFor(),
        targetEndEpochMillis = null,
        sessionDatabaseId = null,
    )

    fun complete(snapshot: TimerSnapshot): TimerSnapshot {
        val nextMode: TimerMode
        val completedSessions: Int
        if (snapshot.mode == TimerMode.Focus) {
            completedSessions = snapshot.sessionsCompleted + 1
            nextMode = if (completedSessions % 4 == 0) {
                TimerMode.LongBreak
            } else {
                TimerMode.ShortBreak
            }
        } else {
            completedSessions = snapshot.sessionsCompleted
            nextMode = TimerMode.Focus
        }

        return snapshot.copy(
            mode = nextMode,
            status = TimerStatus.Idle,
            remainingSeconds = snapshot.durationFor(nextMode),
            targetEndEpochMillis = null,
            sessionsCompleted = completedSessions,
            sessionDatabaseId = null,
        )
    }

    fun setMode(snapshot: TimerSnapshot, mode: TimerMode): TimerSnapshot {
        if (snapshot.status == TimerStatus.Running) return snapshot
        return snapshot.copy(
            mode = mode,
            status = TimerStatus.Idle,
            remainingSeconds = snapshot.durationFor(mode),
            targetEndEpochMillis = null,
            sessionDatabaseId = null,
        )
    }

    fun updateDurations(
        snapshot: TimerSnapshot,
        focusMinutes: Int,
        shortBreakMinutes: Int,
        longBreakMinutes: Int,
    ): TimerSnapshot {
        val updated = snapshot.copy(
            focusDurationSeconds = focusMinutes.coerceIn(1, 180) * 60,
            shortBreakDurationSeconds = shortBreakMinutes.coerceIn(1, 180) * 60,
            longBreakDurationSeconds = longBreakMinutes.coerceIn(1, 180) * 60,
        )
        return if (snapshot.status == TimerStatus.Running) {
            updated
        } else {
            updated.copy(remainingSeconds = updated.durationFor())
        }
    }
}

