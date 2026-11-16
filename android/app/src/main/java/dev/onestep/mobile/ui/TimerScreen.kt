package dev.onestep.mobile.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.onestep.mobile.timer.TimerMode
import dev.onestep.mobile.timer.TimerStatus
import dev.onestep.mobile.timer.TimerUiState
import dev.onestep.mobile.timer.displayName
import dev.onestep.mobile.timer.formatDuration

@Composable
fun TimerScreen(
    state: TimerUiState,
    onStart: () -> Unit,
    onPause: () -> Unit,
    onReset: () -> Unit,
    onModeSelected: (TimerMode) -> Unit,
    onTaskSelected: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val snapshot = state.snapshot
    val progress = if (snapshot.durationFor() == 0) {
        0f
    } else {
        1f - snapshot.remainingSeconds.toFloat() / snapshot.durationFor().toFloat()
    }
    var taskMenuExpanded by remember { mutableStateOf(false) }
    val selectedTask = state.openTasks.firstOrNull { it.id == snapshot.selectedTaskId }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Pomodoro", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(20.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            TimerMode.entries.forEach { mode ->
                val selected = snapshot.mode == mode
                if (selected) {
                    FilledTonalButton(
                        onClick = { onModeSelected(mode) },
                        enabled = snapshot.status != TimerStatus.Running,
                        modifier = Modifier.weight(1f),
                    ) { Text(mode.shortName(), maxLines = 1) }
                } else {
                    OutlinedButton(
                        onClick = { onModeSelected(mode) },
                        enabled = snapshot.status != TimerStatus.Running,
                        modifier = Modifier.weight(1f),
                    ) { Text(mode.shortName(), maxLines = 1) }
                }
            }
        }

        Spacer(Modifier.height(36.dp))
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(260.dp)) {
            CircularProgressIndicator(
                progress = { progress.coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxSize(),
                strokeWidth = 12.dp,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    formatDuration(snapshot.remainingSeconds),
                    style = MaterialTheme.typography.displayLarge,
                )
                Text(
                    snapshot.mode.displayName(),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Spacer(Modifier.height(28.dp))
        Box {
            OutlinedButton(
                onClick = { taskMenuExpanded = true },
                enabled = snapshot.status != TimerStatus.Running && !state.loadingTasks,
            ) {
                Text(selectedTask?.title ?: "Unassigned · Misc.")
            }
            DropdownMenu(
                expanded = taskMenuExpanded,
                onDismissRequest = { taskMenuExpanded = false },
            ) {
                DropdownMenuItem(
                    text = { Text("Unassigned · Misc.") },
                    onClick = {
                        onTaskSelected(null)
                        taskMenuExpanded = false
                    },
                )
                state.openTasks.forEach { task ->
                    DropdownMenuItem(
                        text = { Text(task.title) },
                        onClick = {
                            onTaskSelected(task.id)
                            taskMenuExpanded = false
                        },
                    )
                }
            }
        }

        Spacer(Modifier.height(24.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (snapshot.status == TimerStatus.Running) {
                Button(onClick = onPause) {
                    androidx.compose.material3.Icon(Icons.Default.Pause, contentDescription = null)
                    Text("Pause", modifier = Modifier.padding(start = 8.dp))
                }
            } else {
                Button(onClick = onStart) {
                    androidx.compose.material3.Icon(Icons.Default.PlayArrow, contentDescription = null)
                    Text(
                        if (snapshot.status == TimerStatus.Paused) "Resume" else "Start",
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
            OutlinedButton(onClick = onReset) {
                androidx.compose.material3.Icon(Icons.Default.Refresh, contentDescription = null)
                Text("Reset", modifier = Modifier.padding(start = 8.dp))
            }
        }

        Spacer(Modifier.height(20.dp))
        Text(
            "${snapshot.sessionsCompleted} completed focus sessions",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        state.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(
                it,
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center,
            )
        }
    }
}

private fun TimerMode.shortName(): String = when (this) {
    TimerMode.Focus -> "Focus"
    TimerMode.ShortBreak -> "Short"
    TimerMode.LongBreak -> "Long"
}
