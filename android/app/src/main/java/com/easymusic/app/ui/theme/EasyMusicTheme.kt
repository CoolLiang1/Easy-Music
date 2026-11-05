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
 * - Ink (from the app icon) is the primary color.
 * - Amber "signal" marks what is playing right now.
 * - Each tag group (场景 / 类型 / 特点) keeps one hue everywhere.
 */

private val Ink = Color(0xFF15303A)
private val Ink3 = Color(0xFF2E5562)
private val Paper = Color(0xFFF1F2EE)
private val Signal = Color(0xFFF0A43A)

private val LightColors = lightColorScheme(
    primary = Ink,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCE7EA),
    onPrimaryContainer = Ink,
    secondary = Color(0xFF8A5A10),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE4ECEE),
    onSecondaryContainer = Ink,
    tertiary = Color(0xFF23708A),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFE1EEF2),
    onTertiaryContainer = Color(0xFF134656),
    background = Paper,
    onBackground = Ink,
    surface = Paper,
    onSurface = Ink,
    surfaceVariant = Color(0xFFECEEE8),
    onSurfaceVariant = Color(0xFF4B5E65),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF7F8F5),
    surfaceContainer = Color.White,
    surfaceContainerHigh = Color(0xFFECEEE8),
    surfaceContainerHighest = Color(0xFFE3E6DF),
    outline = Color(0xFFC8CDC4),
    outlineVariant = Color(0xFFE0E3DC),
    error = Color(0xFFB4232F),
    onError = Color.White,
    errorContainer = Color(0xFFFBE8E9),
    onErrorContainer = Color(0xFF85151F),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFCFE3E7),
    onPrimary = Ink,
    primaryContainer = Color(0xFF26404A),
    onPrimaryContainer = Color(0xFFDCE7EA),
    secondary = Signal,
    onSecondary = Ink,
    secondaryContainer = Color(0xFF26404A),
    onSecondaryContainer = Color(0xFFDCE7EA),
    tertiary = Color(0xFF8CC6D8),
    onTertiary = Color(0xFF0D3542),
    tertiaryContainer = Color(0xFF184A5A),
    onTertiaryContainer = Color(0xFFD3EBF3),
    background = Color(0xFF0F1C21),
    onBackground = Color(0xFFE6EEF0),
    surface = Color(0xFF0F1C21),
    onSurface = Color(0xFFE6EEF0),
    surfaceVariant = Color(0xFF1E343C),
    onSurfaceVariant = Color(0xFFA9BEC4),
    surfaceContainerLowest = Color(0xFF0B161A),
    surfaceContainerLow = Color(0xFF132328),
    surfaceContainer = Color(0xFF172A31),
    surfaceContainerHigh = Color(0xFF1E343C),
    surfaceContainerHighest = Color(0xFF26404A),
    outline = Color(0xFF3E5961),
    outlineVariant = Color(0xFF26404A),
    error = Color(0xFFFFB3B9),
    onError = Color(0xFF5C1219),
    errorContainer = Color(0xFF5C1219),
    onErrorContainer = Color(0xFFFFDADC),
)

/** Colors Material does not model: tag groups, playback signal, and status tones. */
@Immutable
data class EasyMusicColors(
    val signal: Color,
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
    signalSoft = Color(0xFFFDF1DD),
    onSignalSoft = Color(0xFF8A5A10),
    sceneFg = Color(0xFF23708A),
    sceneBg = Color(0xFFE1EEF2),
    typeFg = Color(0xFF7A4E9A),
    typeBg = Color(0xFFEFE8F5),
    featureFg = Color(0xFF3D7A4F),
    featureBg = Color(0xFFE3EFE6),
    ok = Color(0xFF2F7D4F),
    okSoft = Color(0xFFE2F1E7),
    warn = Color(0xFFA2610F),
    warnSoft = Color(0xFFFBF0DB),
    deck = Ink,
    onDeck = Color.White,
    onDeckMuted = Color(0xFFA9BEC4),
)

private val DarkExtended = EasyMusicColors(
    signal = Signal,
    signalSoft = Color(0xFF3A2A0F),
    onSignalSoft = Color(0xFFFCD9A0),
    sceneFg = Color(0xFF8CC6D8),
    sceneBg = Color(0xFF173A46),
    typeFg = Color(0xFFCDB0E3),
    typeBg = Color(0xFF33254A),
    featureFg = Color(0xFF9DD3AC),
    featureBg = Color(0xFF1D3A27),
    ok = Color(0xFF8FD8A9),
    okSoft = Color(0xFF1B3A28),
    warn = Color(0xFFF4C27A),
    warnSoft = Color(0xFF3A2A0F),
    deck = Color(0xFF1E343C),
    onDeck = Color(0xFFE6EEF0),
    onDeckMuted = Color(0xFFA9BEC4),
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
