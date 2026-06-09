package com.easymusic.app.player.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudQueue
import androidx.compose.material.icons.filled.OfflinePin
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlaybackSource
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlayerUiState
import com.easymusic.app.ui.theme.BannerTone
import com.easymusic.app.ui.theme.SectionHeader
import com.easymusic.app.ui.theme.StatusBanner

@Composable
fun NowPlayingScreen(
    uiState: PlayerUiState,
    isNetworkAvailable: Boolean,
    onBackToLibrary: () -> Unit,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onSeekTo: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val track = uiState.track

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        SectionHeader(
            title = "Now Playing",
            subtitle = uiState.playbackSource.sourceLabel(isNetworkAvailable),
            action = {
                OutlinedButton(onClick = onBackToLibrary) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Library")
                }
            },
        )

        if (track == null) {
            EmptyNowPlaying(onBackToLibrary = onBackToLibrary)
            return@Column
        }

        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                TrackSummary(track = track)

                AssistChip(
                    onClick = {},
                    label = { Text(uiState.playbackSource.sourceLabel(isNetworkAvailable)) },
                    leadingIcon = {
                        Icon(
                            imageVector = if (uiState.playbackSource == PlaybackSource.OfflineCache) {
                                Icons.Default.OfflinePin
                            } else {
                                Icons.Default.CloudQueue
                            },
                            contentDescription = null,
                        )
                    },
                    enabled = uiState.playbackSource == PlaybackSource.OfflineCache || isNetworkAvailable,
                )
            }
        }

        if (uiState.status == PlaybackStatus.Buffering) {
            StatusBanner(
                text = "Buffering audio",
                tone = BannerTone.Warning,
                action = { CircularProgressIndicator() },
            )
        }

        if (uiState.errorMessage != null) {
            StatusBanner(
                text = uiState.errorMessage,
                tone = BannerTone.Error,
            )
        }

        PlaybackPosition(
            positionMs = uiState.positionMs,
            durationMs = uiState.durationMs,
            onSeekTo = onSeekTo,
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                enabled = track.isReady &&
                    !uiState.isPlaying &&
                    (isNetworkAvailable || uiState.playbackSource == PlaybackSource.OfflineCache),
                onClick = onPlay,
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(if (uiState.status == PlaybackStatus.Ended) "Replay" else "Play")
            }
            OutlinedButton(
                enabled = uiState.isPlaying,
                onClick = onPause,
            ) {
                Icon(
                    imageVector = Icons.Default.Pause,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Pause")
            }
        }
    }
}

@Composable
fun NowPlayingRouteContent(
    viewModel: NowPlayingViewModel,
    onBackToLibrary: () -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    val uiState by viewModel.uiState.collectAsState()

    DisposableEffect(viewModel) {
        onDispose {
            viewModel.dispose()
        }
    }

    NowPlayingScreen(
        modifier = modifier,
        uiState = uiState,
        isNetworkAvailable = isNetworkAvailable,
        onBackToLibrary = onBackToLibrary,
        onPlay = { viewModel.play(isNetworkAvailable) },
        onPause = viewModel::pause,
        onSeekTo = viewModel::seekTo,
    )
}

@Composable
private fun EmptyNowPlaying(
    onBackToLibrary: () -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "No track loaded",
                style = MaterialTheme.typography.titleLarge,
            )
            Button(
                modifier = Modifier.padding(top = 16.dp),
                onClick = onBackToLibrary,
            ) {
                Text("Back to Library")
            }
        }
    }
}

@Composable
private fun TrackSummary(track: TrackResponse) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = track.title,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = listOfNotNull(track.artist, track.album)
                .filter { it.isNotBlank() }
                .joinToString(separator = " - ")
                .ifBlank { "Unknown artist or album" },
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun PlaybackPosition(
    positionMs: Long,
    durationMs: Long,
    onSeekTo: (Long) -> Unit,
) {
    Column {
        Slider(
            value = positionMs.toFloat(),
            onValueChange = { value -> onSeekTo(value.toLong()) },
            valueRange = 0f..durationMs.coerceAtLeast(1L).toFloat(),
        )
        Spacer(modifier = Modifier.height(4.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(positionMs.formatTime())
            Text(durationMs.formatTime())
        }
    }
}

private fun Long.formatTime(): String {
    val totalSeconds = (this / 1_000).coerceAtLeast(0L)
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "$minutes:${seconds.toString().padStart(2, '0')}"
}

private fun PlaybackSource.sourceLabel(isNetworkAvailable: Boolean): String =
    when (this) {
        PlaybackSource.OfflineCache -> "Offline cached playback"
        PlaybackSource.OnlineStream -> if (isNetworkAvailable) {
            "Online stream"
        } else {
            "Online stream unavailable while offline"
        }
    }
