package dev.onestep.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Purple = Color(0xFF8B5CF6)
private val DarkColors = darkColorScheme(
    primary = Purple,
    secondary = Color(0xFF22C55E),
    background = Color(0xFF09090B),
    surface = Color(0xFF18181B),
    surfaceVariant = Color(0xFF27272A),
    onPrimary = Color.White,
    onBackground = Color(0xFFFAFAFA),
    onSurface = Color(0xFFFAFAFA),
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF6D28D9),
    secondary = Color(0xFF15803D),
    background = Color(0xFFFAFAFA),
    surface = Color.White,
    surfaceVariant = Color(0xFFF4F4F5),
    onPrimary = Color.White,
    onBackground = Color(0xFF18181B),
    onSurface = Color(0xFF18181B),
)

@Composable
fun OneStepTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}

