package dev.onestep.mobile.timer

import dev.onestep.mobile.core.model.PomodoroSession
import dev.onestep.mobile.core.model.Project
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Instant
import kotlin.math.ceil
import kotlin.math.floor

interface FocusSessionRepository {
    suspend fun startSession(snapshot: TimerSnapshot): PomodoroSession?
    suspend fun updatePartialSession(snapshot: TimerSnapshot)
    suspend fun completeSession(snapshot: TimerSnapshot)
}

class SupabaseFocusSessionRepository(
    private val client: SupabaseClient,
) : FocusSessionRepository {
    override suspend fun startSession(snapshot: TimerSnapshot): PomodoroSession? {
        if (snapshot.mode != TimerMode.Focus || snapshot.sessionDatabaseId != null) return null
        val userId = client.auth.currentUserOrNull()?.id ?: return null
        val projectId = snapshot.selectedProjectId ?: defaultProjectId(userId) ?: return null
        val now = Instant.now().toString()
        val input = NewPomodoroSession(
            userId = userId,
            projectId = projectId,
            taskId = snapshot.selectedTaskId,
            duration = 0,
            plannedDuration = ceil(snapshot.focusDurationSeconds / 60.0).toInt().coerceAtLeast(1),
            startTime = now,
            endTime = now,
        )
        return client.from("pomodoro_sessions")
            .insert(input) { select() }
            .decodeSingle<PomodoroSession>()
    }

    override suspend fun updatePartialSession(snapshot: TimerSnapshot) {
        val id = snapshot.sessionDatabaseId ?: return
        val userId = client.auth.currentUserOrNull()?.id ?: return
        val elapsedSeconds = (
            snapshot.focusDurationSeconds -
                snapshot.displayedRemainingSeconds(System.currentTimeMillis())
            ).coerceAtLeast(0)
        updateSession(id, userId, floor(elapsedSeconds / 60.0).toInt())
    }

    override suspend fun completeSession(snapshot: TimerSnapshot) {
        val id = snapshot.sessionDatabaseId ?: return
        val userId = client.auth.currentUserOrNull()?.id ?: return
        val durationMinutes = ceil(snapshot.focusDurationSeconds / 60.0).toInt().coerceAtLeast(1)
        updateSession(id, userId, durationMinutes)
    }

    private suspend fun defaultProjectId(userId: String): String? =
        client.from("projects")
            .select {
                filter {
                    eq("user_id", userId)
                    eq("is_default", true)
                }
            }
            .decodeList<Project>()
            .firstOrNull()
            ?.id

    private suspend fun updateSession(id: String, userId: String, durationMinutes: Int) {
        client.from("pomodoro_sessions").update(
            {
                set("duration", durationMinutes)
                set("end_time", Instant.now().toString())
            },
        ) {
            filter {
                eq("id", id)
                eq("user_id", userId)
            }
        }
    }
}

class NoOpFocusSessionRepository : FocusSessionRepository {
    override suspend fun startSession(snapshot: TimerSnapshot): PomodoroSession? = null
    override suspend fun updatePartialSession(snapshot: TimerSnapshot) = Unit
    override suspend fun completeSession(snapshot: TimerSnapshot) = Unit
}

@Serializable
private data class NewPomodoroSession(
    @SerialName("user_id") val userId: String,
    @SerialName("project_id") val projectId: String,
    @SerialName("task_id") val taskId: String?,
    val duration: Int,
    @SerialName("planned_duration") val plannedDuration: Int,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String,
)

