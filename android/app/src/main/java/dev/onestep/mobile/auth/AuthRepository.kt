package dev.onestep.mobile.auth

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

sealed interface AuthState {
    data object Loading : AuthState
    data class Authenticated(val userId: String, val email: String?) : AuthState
    data object SignedOut : AuthState
    data class Error(val message: String) : AuthState
    data class NotConfigured(val message: String) : AuthState
}

interface AuthRepository {
    val state: Flow<AuthState>
    suspend fun signIn(email: String, password: String)
    suspend fun signUp(username: String, email: String, password: String)
    suspend fun signOut()
}

class SupabaseAuthRepository(
    private val client: SupabaseClient,
) : AuthRepository {
    override val state: Flow<AuthState> = client.auth.sessionStatus.map { status ->
        when (status) {
            SessionStatus.Initializing -> AuthState.Loading
            is SessionStatus.Authenticated -> {
                val user = client.auth.currentUserOrNull()
                if (user == null) {
                    AuthState.SignedOut
                } else {
                    AuthState.Authenticated(user.id, user.email)
                }
            }
            is SessionStatus.NotAuthenticated -> AuthState.SignedOut
            is SessionStatus.RefreshFailure -> AuthState.Error(
                "Your session could not be refreshed. Check your connection and try again.",
            )
        }
    }

    override suspend fun signIn(email: String, password: String) {
        client.auth.signInWith(Email) {
            this.email = email.trim()
            this.password = password
        }
    }

    override suspend fun signUp(username: String, email: String, password: String) {
        client.auth.signUpWith(Email, redirectUrl = "onestep://auth") {
            this.email = email.trim()
            this.password = password
            data = buildJsonObject {
                put("username", username.trim())
            }
        }
    }

    override suspend fun signOut() {
        client.auth.signOut()
    }
}

class UnconfiguredAuthRepository : AuthRepository {
    override val state: Flow<AuthState> = flowOf(
        AuthState.NotConfigured(
            "Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to android/local.properties.",
        ),
    )

    override suspend fun signIn(email: String, password: String) = Unit
    override suspend fun signUp(username: String, email: String, password: String) = Unit
    override suspend fun signOut() = Unit
}
