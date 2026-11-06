package com.easymusic.app.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.easymusic.app.ui.theme.EasyMusicThemeTokens

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TrackListRow(
    trackId: Int,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    coverPath: String? = null,
    coverVersion: String? = null,
    artist: String? = null,
    isCurrent: Boolean = false,
    isPlaying: Boolean = false,
    highlighted: Boolean = false,
    dimmed: Boolean = false,
    leadingLabel: String? = null,
    onLongClick: (() -> Unit)? = null,
    badges: (@Composable RowScope.() -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val extended = EasyMusicThemeTokens.colors
    val background = when {
        highlighted -> extended.signalSoft
        isCurrent -> extended.signalSoft.copy(alpha = 0.55f)
        else -> Color.Transparent
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .background(background)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(start = 8.dp, end = 2.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (leadingLabel != null) {
            Box(modifier = Modifier.width(22.dp), contentAlignment = Alignment.Center) {
                if (isCurrent) {
                    LevelMeter(isPlaying = isPlaying, height = 14.dp)
                } else {
                    Text(
                        text = leadingLabel,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        Box {
            TrackArtwork(
                trackId = trackId,
                title = title,
                artist = artist,
                coverPath = coverPath,
                coverVersion = coverVersion,
                size = 48.dp,
            )
            if (isCurrent && leadingLabel == null) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(MaterialTheme.shapes.small)
                        .background(Color.Black.copy(alpha = 0.35f)),
                    contentAlignment = Alignment.Center,
                ) {
                    LevelMeter(isPlaying = isPlaying, height = 16.dp)
                }
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = when {
                    isCurrent -> extended.onSignalSoft
                    dimmed -> MaterialTheme.colorScheme.onSurfaceVariant
                    else -> MaterialTheme.colorScheme.onSurface
                },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(
                modifier = Modifier.padding(top = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                badges?.invoke(this)
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        trailing?.invoke(this)
    }
}

/** Round play/pause button for list rows. */
@Composable
fun RowPlayButton(
    isCurrent: Boolean,
    isPlaying: Boolean,
    enabled: Boolean,
    contentDescription: String,
    onClick: () -> Unit,
) {
    val extended = EasyMusicThemeTokens.colors
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.size(40.dp),
        colors = IconButtonDefaults.iconButtonColors(
            containerColor = if (isCurrent) extended.signal else MaterialTheme.colorScheme.surfaceContainerHigh,
            contentColor = if (isCurrent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            disabledContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.5f),
        ),
    ) {
        Icon(
            imageVector = if (isCurrent && isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
            contentDescription = contentDescription,
            modifier = Modifier.size(22.dp),
        )
    }
}
