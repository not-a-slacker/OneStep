package dev.onestep.mobile.timer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import dev.onestep.mobile.core.model.Task
import dev.onestep.mobile.tasks.TaskRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class TimerUiState(
    val snapshot: TimerSnapshot = TimerSnapshot(),
    val openTasks: List<Task> = emptyList(),
    val loadingTasks: Boolean = false,
    val error: String? = null,
)

class TimerViewModel(
    private val repository: TimerRepository,
    private val controller: TimerController,
    private val taskRepository: TaskRepository,
) : ViewModel() {
    private val mutableUiState = MutableStateFlow(TimerUiState())
    val uiState: StateFlow<TimerUiState> = mutableUiState.asStateFlow()

    private var persistedSnapshot = TimerSnapshot()
    private var tickerJob: Job? = null
    private var serviceRecoveryRequested = false

    init {
        viewModelScope.launch {
            repository.snapshot.collect { snapshot ->
                persistedSnapshot = snapshot
                publishDisplayedSnapshot()
                if (snapshot.status == TimerStatus.Running) {
                    startTicker()
                    if (!serviceRecoveryRequested) {
                        serviceRecoveryRequested = true
                        runCatching { controller.start() }
                    }
                } else {
                    serviceRecoveryRequested = false
                    tickerJob?.cancel()
                }
            }
        }
        refreshTasks()
    }

    fun start() = runAction {
        serviceRecoveryRequested = true
        controller.start()
    }

    fun pause() = runAction { controller.pause() }

    fun reset() = runAction { controller.reset() }

    fun setMode(mode: TimerMode) = runSuspendAction { repository.setMode(mode) }

    fun selectTask(taskId: String?) = runSuspendAction {
        val task = mutableUiState.value.openTasks.firstOrNull { it.id == taskId }
        repository.selectTask(task?.id, task?.projectId)
    }

    fun refreshTasks() {
        viewModelScope.launch {
            mutableUiState.update { it.copy(loadingTasks = true, error = null) }
            runCatching { taskRepository.openTasks() }
                .onSuccess { tasks ->
                    mutableUiState.update { it.copy(openTasks = tasks, loadingTasks = false) }
                }
                .onFailure { throwable ->
                    mutableUiState.update {
                        it.copy(
                            loadingTasks = false,
                            error = throwable.message ?: "Unable to load tasks.",
                        )
                    }
                }
        }
    }

    fun clearError() {
        mutableUiState.update { it.copy(error = null) }
    }

    private fun runAction(action: () -> Unit) {
        runCatching(action).onFailure { throwable ->
            mutableUiState.update {
                it.copy(error = throwable.message ?: "Unable to update the timer.")
            }
        }
    }

    private fun runSuspendAction(action: suspend () -> Unit) {
        viewModelScope.launch {
            runCatching { action() }.onFailure { throwable ->
                mutableUiState.update {
                    it.copy(error = throwable.message ?: "Unable to update the timer.")
                }
            }
        }
    }

    private fun startTicker() {
        if (tickerJob?.isActive == true) return
        tickerJob = viewModelScope.launch {
            while (isActive && persistedSnapshot.status == TimerStatus.Running) {
                publishDisplayedSnapshot()
                delay(250)
            }
        }
    }

    private fun publishDisplayedSnapshot() {
        val remaining = persistedSnapshot.displayedRemainingSeconds(System.currentTimeMillis())
        mutableUiState.update {
            it.copy(snapshot = persistedSnapshot.copy(remainingSeconds = remaining))
        }
    }

    companion object {
        fun factory(
            repository: TimerRepository,
            controller: TimerController,
            taskRepository: TaskRepository,
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                TimerViewModel(repository, controller, taskRepository) as T
        }
    }
}
