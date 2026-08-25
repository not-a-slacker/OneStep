package dev.onestep.mobile.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class AuthUiState(
    val authState: AuthState = AuthState.Loading,
    val submitting: Boolean = false,
    val message: String? = null,
    val error: String? = null,
)

class AuthViewModel(
    private val repository: AuthRepository,
) : ViewModel() {
    private val operationState = MutableStateFlow(AuthUiState())

    val uiState: StateFlow<AuthUiState> = combine(
        repository.state,
        operationState,
    ) { authState, operation ->
        operation.copy(authState = authState)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = AuthUiState(),
    )

    fun signIn(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            operationState.value = operationState.value.copy(error = "Enter your email and password.")
            return
        }
        runOperation {
            repository.signIn(email, password)
        }
    }

    fun signUp(username: String, email: String, password: String, confirmation: String) {
        when {
            username.isBlank() || email.isBlank() || password.isBlank() -> {
                operationState.value = operationState.value.copy(error = "Complete every field.")
            }
            password.length < 8 -> {
                operationState.value = operationState.value.copy(error = "Use at least 8 characters.")
            }
            password != confirmation -> {
                operationState.value = operationState.value.copy(error = "Passwords do not match.")
            }
            else -> runOperation(successMessage = "Check your email to confirm your account.") {
                repository.signUp(username, email, password)
            }
        }
    }

    fun signOut() = runOperation { repository.signOut() }

    fun clearFeedback() {
        operationState.value = operationState.value.copy(message = null, error = null)
    }

    private fun runOperation(successMessage: String? = null, operation: suspend () -> Unit) {
        viewModelScope.launch {
            operationState.value = operationState.value.copy(
                submitting = true,
                message = null,
                error = null,
            )
            runCatching { operation() }
                .onSuccess {
                    operationState.value = operationState.value.copy(
                        submitting = false,
                        message = successMessage,
                    )
                }
                .onFailure { throwable ->
                    operationState.value = operationState.value.copy(
                        submitting = false,
                        error = throwable.message ?: "Something went wrong. Try again.",
                    )
                }
        }
    }

    companion object {
        fun factory(repository: AuthRepository): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    AuthViewModel(repository) as T
            }
    }
}

