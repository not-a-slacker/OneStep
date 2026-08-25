package dev.onestep.mobile.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.Today
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import dev.onestep.mobile.timer.TimerViewModel

private data class AppDestination(
    val route: String,
    val label: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
)

private val destinations = listOf(
    AppDestination("home", "Home", Icons.Default.Home),
    AppDestination("tasks", "Tasks", Icons.Default.CheckCircle),
    AppDestination("timer", "Timer", Icons.Default.Timer),
    AppDestination("habits", "Habits", Icons.Default.Today),
    AppDestination("more", "More", Icons.Default.MoreHoriz),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppShell(
    timerViewModel: TimerViewModel,
    onSignOut: () -> Unit,
) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val context = LocalContext.current
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("OneStep") },
                actions = {
                    IconButton(onClick = onSignOut) {
                        Text("Exit", style = MaterialTheme.typography.labelLarge)
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                destinations.forEach { destination ->
                    NavigationBarItem(
                        selected = currentRoute == destination.route,
                        onClick = {
                            navController.navigate(destination.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(destination.icon, contentDescription = destination.label) },
                        label = { Text(destination.label) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = "home",
            modifier = Modifier.padding(padding),
        ) {
            composable("home") {
                FeaturePlaceholder(
                    title = "Today",
                    message = "Daily summaries and quick actions are the next vertical slice.",
                )
            }
            composable("tasks") {
                FeaturePlaceholder(
                    title = "Tasks",
                    message = "Open tasks are already loaded for timer assignment. Task management comes next.",
                )
            }
            composable("timer") {
                val state by timerViewModel.uiState.collectAsStateWithLifecycle()
                TimerScreen(
                    state = state,
                    onStart = {
                        if (
                            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                            ContextCompat.checkSelfPermission(
                                context,
                                Manifest.permission.POST_NOTIFICATIONS,
                            ) != PackageManager.PERMISSION_GRANTED
                        ) {
                            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                        timerViewModel.start()
                    },
                    onPause = timerViewModel::pause,
                    onReset = timerViewModel::reset,
                    onModeSelected = timerViewModel::setMode,
                    onTaskSelected = timerViewModel::selectTask,
                )
            }
            composable("habits") {
                FeaturePlaceholder(
                    title = "Habits",
                    message = "Habit check-ins and streak calendars will follow the timer slice.",
                )
            }
            composable("more") {
                FeaturePlaceholder(
                    title = "Projects, analytics & settings",
                    message = "These destinations are reserved in the mobile navigation architecture.",
                )
            }
        }
    }
}

@Composable
private fun FeaturePlaceholder(title: String, message: String) {
    Box(Modifier.fillMaxSize()) {
        CenteredMessage(title = title, body = message)
    }
}

