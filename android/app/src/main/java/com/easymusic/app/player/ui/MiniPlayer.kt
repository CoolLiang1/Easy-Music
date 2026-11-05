package com.easymusic.app.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.easymusic.app.player.domain.PlaybackSource
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlayerUiState
import com.easymusic.app.player.domain.canSkipToNext
import com.easymusic.app.ui.components.LevelMeter
import com.easymusic.app.ui.components.TrackArtwork
import com.easymusic.app.ui.components.subtitle
import com.easymusic.app.ui.theme.EasyMusicThemeTokens
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

@Composable
fun MiniPlayer(
    uiState: PlayerUiState,
    onOpenNowPlaying: () -> Unit,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onNext: () -> Unit,
    onTick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val track = uiState.track ?: return
    val colors = EasyMusicThemeTokens.colors

    LaunchedEffect(track.id) {
        while (isActive) {
            onTick()
            delay(POSITION_UPDATE_MS)
        }
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 6.dp),
        color = colors.deck,
        contentColor = colors.onDeck,
        shape = MaterialTheme.shapes.medium,
        shadowElevation = 6.dp,
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onOpenNowPlaying)
                    .semantics { contentDescription = "打开正在播放：${track.title}" }
                    .padding(start = 8.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                TrackArtwork(
                    trackId = track.id,
                    title = track.title,
                    coverPath = track.coverPath,
                    coverVersion = track.updatedAt,
                    size = 42.dp,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        if (uiState.isPlaying) {
                            LevelMeter(isPlaying = true, height = 12.dp)
                        }
                        Text(
                            text = track.title,
                            style = MaterialTheme.typography.titleSmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = when {
                            uiState.status == PlaybackStatus.Error ->
                                uiState.errorMessage ?: "播放出错"
                            uiState.status == PlaybackStatus.Buffering -> "正在缓冲…"
                            uiState.playbackSource == PlaybackSource.OfflineCache ->
                                "${track.subtitle()} · 离线"
                            else -> track.subtitle()
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = if (uiState.status == PlaybackStatus.Error) {
                            MaterialTheme.colorScheme.errorContainer
                        } else {
                            colors.onDeckMuted
                        },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(colors.onDeck),
                    contentAlignment = Alignment.Center,
                ) {
                    if (uiState.status == PlaybackStatus.Buffering) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = colors.deck,
                        )
                    } else {
                        IconButton(
                            onClick = if (uiState.isPlaying) onPause else onPlay,
                            enabled = uiState.isPlaying || track.isReady,
                            colors = IconButtonDefaults.iconButtonColors(contentColor = colors.deck),
                        ) {
                            Icon(
                                imageVector = if (uiState.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                contentDescription = if (uiState.isPlaying) "暂停" else "播放",
                            )
                        }
                    }
                }
                IconButton(
                    enabled = uiState.canSkipToNext(),
                    onClick = onNext,
                    colors = IconButtonDefaults.iconButtonColors(
                        contentColor = colors.onDeck,
                        disabledContentColor = colors.onDeckMuted.copy(alpha = 0.4f),
                    ),
                ) {
                    Icon(imageVector = Icons.Default.SkipNext, contentDescription = "下一首")
                }
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp)
                    .background(colors.onDeck.copy(alpha = 0.14f)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(uiState.progressFraction())
                        .fillMaxHeight()
                        .background(colors.signal),
                )
            }
        }
    }
}

private fun PlayerUiState.progressFraction(): Float {
    if (durationMs <= 0L) {
        return 0f
    }
    return (positionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)
}

private const val POSITION_UPDATE_MS = 500L
