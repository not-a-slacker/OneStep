package dev.onestep.mobile.timer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TimerStateMachineTest {
    @Test
    fun startUsesAbsoluteTargetTime() {
        val started = TimerStateMachine.start(
            snapshot = TimerSnapshot(remainingSeconds = 90),
            nowEpochMillis = 10_000,
        )

        assertEquals(TimerStatus.Running, started.status)
        assertEquals(100_000, started.targetEndEpochMillis)
        assertEquals(45, started.displayedRemainingSeconds(55_000))
    }

    @Test
    fun pauseCapturesRemainingTimeAndClearsTarget() {
        val running = TimerStateMachine.start(
            snapshot = TimerSnapshot(remainingSeconds = 120),
            nowEpochMillis = 1_000,
        )

        val paused = TimerStateMachine.pause(running, nowEpochMillis = 31_000)

        assertEquals(TimerStatus.Paused, paused.status)
        assertEquals(90, paused.remainingSeconds)
        assertNull(paused.targetEndEpochMillis)
    }

    @Test
    fun fourthFocusSessionSelectsLongBreak() {
        val completed = TimerStateMachine.complete(
            TimerSnapshot(
                mode = TimerMode.Focus,
                sessionsCompleted = 3,
                sessionDatabaseId = "session-id",
            ),
        )

        assertEquals(4, completed.sessionsCompleted)
        assertEquals(TimerMode.LongBreak, completed.mode)
        assertEquals(completed.longBreakDurationSeconds, completed.remainingSeconds)
        assertNull(completed.sessionDatabaseId)
    }

    @Test
    fun completingBreakReturnsToFocusWithoutIncrementingCount() {
        val completed = TimerStateMachine.complete(
            TimerSnapshot(mode = TimerMode.ShortBreak, sessionsCompleted = 2),
        )

        assertEquals(2, completed.sessionsCompleted)
        assertEquals(TimerMode.Focus, completed.mode)
        assertEquals(completed.focusDurationSeconds, completed.remainingSeconds)
    }

    @Test
    fun resetPreservesAssignmentAndCycleCount() {
        val reset = TimerStateMachine.reset(
            TimerSnapshot(
                status = TimerStatus.Paused,
                remainingSeconds = 500,
                sessionsCompleted = 7,
                selectedTaskId = "task-id",
                selectedProjectId = "project-id",
                sessionDatabaseId = "session-id",
            ),
        )

        assertEquals(TimerStatus.Idle, reset.status)
        assertEquals(reset.focusDurationSeconds, reset.remainingSeconds)
        assertEquals(7, reset.sessionsCompleted)
        assertEquals("task-id", reset.selectedTaskId)
        assertEquals("project-id", reset.selectedProjectId)
        assertNull(reset.sessionDatabaseId)
    }
}

