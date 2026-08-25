package dev.onestep.mobile.timer

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.IOException

private val Context.timerDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "pomodoro_timer",
)

class TimerRepository(
    context: Context,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val dataStore = context.applicationContext.timerDataStore
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    val snapshot: Flow<TimerSnapshot> = dataStore.data
        .catch { throwable ->
            if (throwable is IOException) {
                emit(androidx.datastore.preferences.core.emptyPreferences())
            } else {
                throw throwable
            }
        }
        .map(::decode)

    suspend fun current(): TimerSnapshot = snapshot.first()

    suspend fun start() = update { TimerStateMachine.start(it, clock()) }

    suspend fun pause() = update { TimerStateMachine.pause(it, clock()) }

    suspend fun reset() = update(TimerStateMachine::reset)

    suspend fun complete() = update(TimerStateMachine::complete)

    suspend fun setMode(mode: TimerMode) = update { TimerStateMachine.setMode(it, mode) }

    suspend fun selectTask(taskId: String?, projectId: String?) = update {
        it.copy(selectedTaskId = taskId, selectedProjectId = projectId)
    }

    suspend fun attachDatabaseSession(sessionId: String, projectId: String) = update {
        it.copy(sessionDatabaseId = sessionId, selectedProjectId = projectId)
    }

    suspend fun updateDurations(focus: Int, shortBreak: Int, longBreak: Int) = update {
        TimerStateMachine.updateDurations(it, focus, shortBreak, longBreak)
    }

    private suspend fun update(transform: (TimerSnapshot) -> TimerSnapshot) {
        dataStore.edit { preferences ->
            val next = transform(decode(preferences))
            preferences[SNAPSHOT_KEY] = json.encodeToString(next)
        }
    }

    private fun decode(preferences: Preferences): TimerSnapshot {
        val serialized = preferences[SNAPSHOT_KEY] ?: return TimerSnapshot()
        return runCatching { json.decodeFromString<TimerSnapshot>(serialized) }
            .getOrDefault(TimerSnapshot())
    }

    private companion object {
        val SNAPSHOT_KEY = stringPreferencesKey("timer_snapshot_v1")
    }
}

