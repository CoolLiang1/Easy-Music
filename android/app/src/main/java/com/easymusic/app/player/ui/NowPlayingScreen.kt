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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Button
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
import com.easymusic.app.player.domain.PlayerUiState

@Composable
fun NowPlayingScreen(
    uiState: PlayerUiState,
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
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Now Playing",
                    style = MaterialTheme.typography.headlineMedium,
                )
                Text(
                    text = "Online stream",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedButton(onClick = onBackToLibrary) {
                Text("Library")
            }
        }

        if (track == null) {
            EmptyNowPlaying(onBackToLibrary = onBackToLibrary)
            return@Column
        }

        TrackSummary(track = track)

        if (uiState.isBuffering) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator()
                Text(
                    modifier = Modifier.padding(start = 12.dp),
                    text = "Buffering",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        if (uiState.errorMessage != null) {
            Text(
                text = uiState.errorMessage,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        PlaybackPosition(
            positionMs = uiState.positionMs,
            durationMs = uiState.durationMs,
            onSeekTo = onSeekTo,
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                enabled = track.isReady && !uiState.isPlaying,
                onClick = onPlay,
            ) {
                Text("Play")
            }
            OutlinedButton(
                enabled = uiState.isPlaying,
                onClick = onPause,
            ) {
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
        onBackToLibrary = onBackToLibrary,
        onPlay = viewModel::play,
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
