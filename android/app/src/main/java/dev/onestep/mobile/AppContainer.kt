package dev.onestep.mobile

import android.content.Context
import dev.onestep.mobile.auth.AuthRepository
import dev.onestep.mobile.auth.SupabaseAuthRepository
import dev.onestep.mobile.auth.UnconfiguredAuthRepository
import dev.onestep.mobile.core.network.SupabaseFactory
import dev.onestep.mobile.tasks.EmptyTaskRepository
import dev.onestep.mobile.tasks.SupabaseTaskRepository
import dev.onestep.mobile.tasks.TaskRepository
import dev.onestep.mobile.timer.NoOpFocusSessionRepository
import dev.onestep.mobile.timer.SupabaseFocusSessionRepository
import dev.onestep.mobile.timer.TimerController
import dev.onestep.mobile.timer.TimerRepository
import io.github.jan.supabase.SupabaseClient

class AppContainer(context: Context) {
    val configured: Boolean = BuildConfig.SUPABASE_URL.startsWith("https://") &&
        BuildConfig.SUPABASE_PUBLISHABLE_KEY.isNotBlank()

    val supabaseClient: SupabaseClient? = if (configured) {
        SupabaseFactory.create(
            url = BuildConfig.SUPABASE_URL,
            publishableKey = BuildConfig.SUPABASE_PUBLISHABLE_KEY,
        )
    } else {
        null
    }

    val authRepository: AuthRepository = supabaseClient
        ?.let(::SupabaseAuthRepository)
        ?: UnconfiguredAuthRepository()

    val taskRepository: TaskRepository = supabaseClient
        ?.let(::SupabaseTaskRepository)
        ?: EmptyTaskRepository()

    val timerRepository = TimerRepository(context)
    val timerController = TimerController(context.applicationContext)
    val focusSessionRepository = supabaseClient
        ?.let(::SupabaseFocusSessionRepository)
        ?: NoOpFocusSessionRepository()
}
