package com.easymusic.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

private val LightColors = lightColorScheme(
    primary = androidx.compose.ui.graphics.Color(0xFF276A63),
    onPrimary = androidx.compose.ui.graphics.Color(0xFFFFFFFF),
    primaryContainer = androidx.compose.ui.graphics.Color(0xFFD7F3EE),
    onPrimaryContainer = androidx.compose.ui.graphics.Color(0xFF0A201D),
    secondary = androidx.compose.ui.graphics.Color(0xFF6D5D2E),
    onSecondary = androidx.compose.ui.graphics.Color(0xFFFFFFFF),
    secondaryContainer = androidx.compose.ui.graphics.Color(0xFFF7E5B3),
    onSecondaryContainer = androidx.compose.ui.graphics.Color(0xFF241B04),
    tertiary = androidx.compose.ui.graphics.Color(0xFF7A4E5B),
    onTertiary = androidx.compose.ui.graphics.Color(0xFFFFFFFF),
    tertiaryContainer = androidx.compose.ui.graphics.Color(0xFFFFD9E3),
    onTertiaryContainer = androidx.compose.ui.graphics.Color(0xFF30111A),
    background = androidx.compose.ui.graphics.Color(0xFFFAFCFB),
    surface = androidx.compose.ui.graphics.Color(0xFFFAFCFB),
    surfaceContainer = androidx.compose.ui.graphics.Color(0xFFEFF3F1),
    surfaceContainerLow = androidx.compose.ui.graphics.Color(0xFFF5F8F7),
    surfaceContainerHighest = androidx.compose.ui.graphics.Color(0xFFE3E9E7),
)

private val DarkColors = darkColorScheme(
    primary = androidx.compose.ui.graphics.Color(0xFF9FD8D0),
    onPrimary = androidx.compose.ui.graphics.Color(0xFF003733),
    primaryContainer = androidx.compose.ui.graphics.Color(0xFF0E514B),
    onPrimaryContainer = androidx.compose.ui.graphics.Color(0xFFD7F3EE),
    secondary = androidx.compose.ui.graphics.Color(0xFFE0C782),
    onSecondary = androidx.compose.ui.graphics.Color(0xFF3A2F07),
    secondaryContainer = androidx.compose.ui.graphics.Color(0xFF554615),
    onSecondaryContainer = androidx.compose.ui.graphics.Color(0xFFF7E5B3),
    tertiary = androidx.compose.ui.graphics.Color(0xFFE8B8C6),
    onTertiary = androidx.compose.ui.graphics.Color(0xFF472631),
    tertiaryContainer = androidx.compose.ui.graphics.Color(0xFF603B46),
    onTertiaryContainer = androidx.compose.ui.graphics.Color(0xFFFFD9E3),
    background = androidx.compose.ui.graphics.Color(0xFF101413),
    surface = androidx.compose.ui.graphics.Color(0xFF101413),
    surfaceContainer = androidx.compose.ui.graphics.Color(0xFF1C2220),
    surfaceContainerLow = androidx.compose.ui.graphics.Color(0xFF161B1A),
    surfaceContainerHighest = androidx.compose.ui.graphics.Color(0xFF27302D),
)

private val EasyMusicShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(8.dp),
    large = RoundedCornerShape(8.dp),
    extraLarge = RoundedCornerShape(8.dp),
)

@Composable
fun EasyMusicTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        shapes = EasyMusicShapes,
        content = content,
    )
}

@Composable
fun SectionHeader(
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        action?.invoke()
    }
}

@Composable
fun StatusBanner(
    text: String,
    modifier: Modifier = Modifier,
    tone: BannerTone = BannerTone.Neutral,
    action: (@Composable () -> Unit)? = null,
) {
    val colors = when (tone) {
        BannerTone.Neutral -> MaterialTheme.colorScheme.surfaceContainer
        BannerTone.Positive -> MaterialTheme.colorScheme.primaryContainer
        BannerTone.Warning -> MaterialTheme.colorScheme.secondaryContainer
        BannerTone.Error -> MaterialTheme.colorScheme.errorContainer
    }
    val contentColor = when (tone) {
        BannerTone.Neutral -> MaterialTheme.colorScheme.onSurface
        BannerTone.Positive -> MaterialTheme.colorScheme.onPrimaryContainer
        BannerTone.Warning -> MaterialTheme.colorScheme.onSecondaryContainer
        BannerTone.Error -> MaterialTheme.colorScheme.onErrorContainer
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = colors,
        contentColor = contentColor,
        shape = MaterialTheme.shapes.small,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                modifier = Modifier.weight(1f),
                text = text,
                style = MaterialTheme.typography.bodyMedium,
            )
            action?.invoke()
        }
    }
}

@Composable
fun EmptyState(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        action?.invoke()
    }
}

enum class BannerTone {
    Neutral,
    Positive,
    Warning,
    Error,
}
