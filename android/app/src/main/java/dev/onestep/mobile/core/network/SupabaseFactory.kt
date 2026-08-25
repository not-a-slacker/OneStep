package dev.onestep.mobile.core.network

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.FlowType
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest

object SupabaseFactory {
    fun create(url: String, publishableKey: String): SupabaseClient =
        createSupabaseClient(
            supabaseUrl = url,
            supabaseKey = publishableKey,
        ) {
            install(Auth) {
                scheme = "onestep"
                host = "auth"
                flowType = FlowType.PKCE
                alwaysAutoRefresh = true
                autoLoadFromStorage = true
            }
            install(Postgrest)
        }
}

