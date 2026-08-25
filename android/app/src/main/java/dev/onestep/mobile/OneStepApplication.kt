package dev.onestep.mobile

import android.app.Application

class OneStepApplication : Application() {
    val container: AppContainer by lazy { AppContainer(this) }
}

