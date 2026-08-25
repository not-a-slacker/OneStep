package dev.onestep.mobile.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Profile(
    val id: String,
    val username: String? = null,
    val level: Int = 1,
    @SerialName("experience_points") val experiencePoints: Int = 0,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class Project(
    val id: String,
    @SerialName("user_id") val userId: String,
    val name: String,
    val color: String,
    @SerialName("estimated_end_date") val estimatedEndDate: String? = null,
    val status: ProjectStatus = ProjectStatus.Active,
    @SerialName("is_default") val isDefault: Boolean = false,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
enum class ProjectStatus {
    @SerialName("active") Active,
    @SerialName("completed") Completed,
}

@Serializable
data class Task(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("project_id") val projectId: String,
    val title: String,
    val notes: String? = null,
    val status: TaskStatus = TaskStatus.Pending,
    val priority: TaskPriority = TaskPriority.Medium,
    val deadline: String? = null,
    @SerialName("estimated_time") val estimatedTime: Int? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
enum class TaskStatus {
    @SerialName("pending") Pending,
    @SerialName("in-progress") InProgress,
    @SerialName("completed") Completed,
}

@Serializable
enum class TaskPriority {
    @SerialName("low") Low,
    @SerialName("medium") Medium,
    @SerialName("high") High,
}

@Serializable
data class PomodoroSession(
    val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("project_id") val projectId: String,
    @SerialName("task_id") val taskId: String? = null,
    val duration: Int,
    @SerialName("planned_duration") val plannedDuration: Int,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String,
)

