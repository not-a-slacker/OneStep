package dev.onestep.mobile.timer

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class TimerController(
    private val context: Context,
) {
    fun start() = send(TimerService.ACTION_START, foreground = true)
    fun pause() = send(TimerService.ACTION_PAUSE)
    fun reset() = send(TimerService.ACTION_RESET)

    private fun send(action: String, foreground: Boolean = false) {
        val intent = Intent(context, TimerService::class.java).setAction(action)
        if (foreground) {
            ContextCompat.startForegroundService(context, intent)
        } else {
            context.startService(intent)
        }
    }
}

