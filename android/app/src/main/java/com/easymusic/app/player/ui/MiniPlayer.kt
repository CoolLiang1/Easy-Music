package com.easymusic.app.player.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.OpenInFull
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlayerUiState
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

@Composable
fun MiniPlayer(
    uiState: PlayerUiState,
    onOpenNowPlaying: () -> Unit,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onTick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val track = uiState.track ?: return

    LaunchedEffect(track.id) {
        while (isActive) {
            onTick()
            delay(POSITION_UPDATE_MS)
        }
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        tonalElevation = 3.dp,
        shadowElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = track.title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = uiState.status.label(),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (uiState.status == PlaybackStatus.Error) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                if (uiState.isPlaying) {
                    OutlinedButton(onClick = onPause) {
                        Icon(
                            imageVector = Icons.Default.Pause,
                            contentDescription = null,
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("暂停")
                    }
                } else {
                    Button(
                        enabled = track.isReady,
                        onClick = onPlay,
                    ) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = null,
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("播放")
                    }
                }
                Spacer(modifier = Modifier.width(8.dp))
                OutlinedButton(onClick = onOpenNowPlaying) {
                    Icon(
                        imageVector = Icons.Default.OpenInFull,
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("播放中")
                }
            }

            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth(),
                progress = { uiState.progressFraction() },
            )
        }
    }
}

private fun PlaybackStatus.label(): String =
    when (this) {
        PlaybackStatus.Idle -> "就绪"
        PlaybackStatus.Buffering -> "缓冲中"
        PlaybackStatus.Playing -> "播放中"
        PlaybackStatus.Paused -> "已暂停"
        PlaybackStatus.Ended -> "已结束"
        PlaybackStatus.Error -> "播放错误"
    }

private fun PlayerUiState.progressFraction(): Float {
    if (durationMs <= 0L) {
        return 0f
    }
    return (positionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)
}

private const val POSITION_UPDATE_MS = 500L
