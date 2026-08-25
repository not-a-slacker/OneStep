package dev.onestep.mobile.tasks

import dev.onestep.mobile.core.model.Task
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from

interface TaskRepository {
    suspend fun openTasks(): List<Task>
}

class SupabaseTaskRepository(
    private val client: SupabaseClient,
) : TaskRepository {
    override suspend fun openTasks(): List<Task> {
        val userId = client.auth.currentUserOrNull()?.id ?: return emptyList()
        return client.from("tasks")
            .select {
                filter {
                    eq("user_id", userId)
                    neq("status", "completed")
                }
            }
            .decodeList<Task>()
            .sortedWith(compareBy<Task> { it.deadline == null }.thenBy { it.deadline })
    }
}

class EmptyTaskRepository : TaskRepository {
    override suspend fun openTasks(): List<Task> = emptyList()
}

