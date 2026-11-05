package com.easymusic.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/*
 * Easy Music visual language, shared with the Web console:
 * - Warm paper and brown ink come from the app icon.
 * - The icon's orange "signal" marks what is playing right now; the mini
 *   player sits on a light-orange deck instead of a dark bar.
 * - Each tag group (场景 / 类型 / 特点) keeps one hue everywhere.
 */

private val Ink = Color(0xFF3B2619)
private val Text = Color(0xFF2B1D16)
private val Paper = Color(0xFFFBF7F0)
private val Signal = Color(0xFFDD733F)

private val LightColors = lightColorScheme(
    primary = Ink,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFF3E6D6),
    onPrimaryContainer = Ink,
    secondary = Color(0xFFA04A1F),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFF3E9DC),
    onSecondaryContainer = Ink,
    tertiary = Color(0xFF2E6E78),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFE2EFEE),
    onTertiaryContainer = Color(0xFF1D474E),
    background = Paper,
    onBackground = Text,
    surface = Paper,
    onSurface = Text,
    surfaceVariant = Color(0xFFEFE6D9),
    onSurfaceVariant = Color(0xFF6E5B4C),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF7F1E8),
    surfaceContainer = Color.White,
    surfaceContainerHigh = Color(0xFFEFE6D9),
    surfaceContainerHighest = Color(0xFFE7DBCB),
    outline = Color(0xFFD8C9B4),
    outlineVariant = Color(0xFFEBE1D3),
    error = Color(0xFFB4232F),
    onError = Color.White,
    errorContainer = Color(0xFFFBE8E9),
    onErrorContainer = Color(0xFF85151F),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFF0A07A),
    onPrimary = Text,
    primaryContainer = Color(0xFF4A3326),
    onPrimaryContainer = Color(0xFFF7E3D3),
    secondary = Color(0xFFE8875A),
    onSecondary = Text,
    secondaryContainer = Color(0xFF3A2A21),
    onSecondaryContainer = Color(0xFFF4E6D6),
    tertiary = Color(0xFF8CCAD0),
    onTertiary = Color(0xFF0F3438),
    tertiaryContainer = Color(0xFF1D3A3D),
    onTertiaryContainer = Color(0xFFCDEBEE),
    background = Color(0xFF1B130F),
    onBackground = Color(0xFFF4E6D6),
    surface = Color(0xFF1B130F),
    onSurface = Color(0xFFF4E6D6),
    surfaceVariant = Color(0xFF382A22),
    onSurfaceVariant = Color(0xFFC7B19C),
    surfaceContainerLowest = Color(0xFF140E0B),
    surfaceContainerLow = Color(0xFF211813),
    surfaceContainer = Color(0xFF241A15),
    surfaceContainerHigh = Color(0xFF2C211B),
    surfaceContainerHighest = Color(0xFF382A22),
    outline = Color(0xFF5A4638),
    outlineVariant = Color(0xFF3A2C24),
    error = Color(0xFFFFB3B9),
    onError = Color(0xFF5C1219),
    errorContainer = Color(0xFF5C1219),
    onErrorContainer = Color(0xFFFFDADC),
)

/** Colors Material does not model: tag groups, playback signal, and status tones. */
@Immutable
data class EasyMusicColors(
    val signal: Color,
    val onSignal: Color,
    val signalSoft: Color,
    val onSignalSoft: Color,
    val sceneFg: Color,
    val sceneBg: Color,
    val typeFg: Color,
    val typeBg: Color,
    val featureFg: Color,
    val featureBg: Color,
    val ok: Color,
    val okSoft: Color,
    val warn: Color,
    val warnSoft: Color,
    val deck: Color,
    val onDeck: Color,
    val onDeckMuted: Color,
)

private val LightExtended = EasyMusicColors(
    signal = Signal,
    onSignal = Color.White,
    signalSoft = Color(0xFFFBE7DA),
    onSignalSoft = Color(0xFFA04A1F),
    sceneFg = Color(0xFF2E6E78),
    sceneBg = Color(0xFFE2EFEE),
    typeFg = Color(0xFF8A4C70),
    typeBg = Color(0xFFF4E6EE),
    featureFg = Color(0xFF506B28),
    featureBg = Color(0xFFEAF0DD),
    ok = Color(0xFF2F7D4F),
    okSoft = Color(0xFFE2F1E7),
    warn = Color(0xFFA2610F),
    warnSoft = Color(0xFFFBF0DB),
    deck = Color(0xFFFBEADD),
    onDeck = Text,
    onDeckMuted = Color(0xFF7E5A45),
)

private val DarkExtended = EasyMusicColors(
    signal = Color(0xFFE8875A),
    onSignal = Text,
    signalSoft = Color(0xFF4A2A1A),
    onSignalSoft = Color(0xFFFFC9A8),
    sceneFg = Color(0xFF8CCAD0),
    sceneBg = Color(0xFF1D3A3D),
    typeFg = Color(0xFFE2A9CC),
    typeBg = Color(0xFF3E2236),
    featureFg = Color(0xFFB8D08A),
    featureBg = Color(0xFF2E3A1D),
    ok = Color(0xFF8FD8A9),
    okSoft = Color(0xFF1B3A28),
    warn = Color(0xFFF4C27A),
    warnSoft = Color(0xFF3A2A0F),
    deck = Color(0xFF2C211B),
    onDeck = Color(0xFFF4E6D6),
    onDeckMuted = Color(0xFFB39C86),
)

val LocalEasyMusicColors = staticCompositionLocalOf { LightExtended }

object EasyMusicThemeTokens {
    val colors: EasyMusicColors
        @Composable get() = LocalEasyMusicColors.current
}

private val EasyMusicShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

private val BaseTypography = Typography()

private val EasyMusicTypography = BaseTypography.copy(
    headlineLarge = BaseTypography.headlineLarge.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
    headlineMedium = BaseTypography.headlineMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
    headlineSmall = BaseTypography.headlineSmall.copy(fontWeight = FontWeight.Bold, fontSize = 24.sp),
    titleLarge = BaseTypography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
    titleMedium = BaseTypography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
    titleSmall = BaseTypography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
    labelLarge = BaseTypography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
)

@Composable
fun EasyMusicTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(
        LocalEasyMusicColors provides if (darkTheme) DarkExtended else LightExtended,
    ) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkColors else LightColors,
            shapes = EasyMusicShapes,
            typography = EasyMusicTypography,
            content = content,
        )
    }
}
