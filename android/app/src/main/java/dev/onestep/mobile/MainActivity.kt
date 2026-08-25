package dev.onestep.mobile

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.onestep.mobile.auth.AuthState
import dev.onestep.mobile.auth.AuthViewModel
import dev.onestep.mobile.timer.TimerViewModel
import dev.onestep.mobile.ui.AppShell
import dev.onestep.mobile.ui.AuthScreen
import dev.onestep.mobile.ui.CenteredMessage
import dev.onestep.mobile.ui.theme.OneStepTheme
import io.github.jan.supabase.auth.handleDeeplinks

class MainActivity : ComponentActivity() {
    private val container: AppContainer
        get() = (application as OneStepApplication).container

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        container.supabaseClient?.handleDeeplinks(intent)
        enableEdgeToEdge()
        setContent {
            OneStepTheme {
                OneStepRoot(container)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        container.supabaseClient?.handleDeeplinks(intent)
    }
}

@Composable
private fun OneStepRoot(container: AppContainer) {
    val authViewModel: AuthViewModel = viewModel(
        factory = AuthViewModel.factory(container.authRepository),
    )
    val authUiState by authViewModel.uiState.collectAsStateWithLifecycle()

    when (val authState = authUiState.authState) {
        AuthState.Loading -> FullScreenProgress()
        AuthState.SignedOut -> AuthScreen(
            state = authUiState,
            onSignIn = authViewModel::signIn,
            onSignUp = authViewModel::signUp,
        )
        is AuthState.Authenticated -> {
            val timerViewModel: TimerViewModel = viewModel(
                factory = TimerViewModel.factory(
                    repository = container.timerRepository,
                    controller = container.timerController,
                    taskRepository = container.taskRepository,
                ),
            )
            AppShell(
                timerViewModel = timerViewModel,
                onSignOut = authViewModel::signOut,
            )
        }
        is AuthState.NotConfigured -> CenteredMessage(
            title = "Supabase configuration required",
            body = authState.message,
        )
        is AuthState.Error -> CenteredMessage(
            title = "Session unavailable",
            body = authState.message,
        )
    }
}

@Composable
private fun FullScreenProgress() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

