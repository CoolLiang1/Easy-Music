package com.easymusic.app.library.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlaybackStateStore
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.domain.PlayerUiState
import com.easymusic.app.player.ui.MiniPlayer

@Composable
fun LibraryScreen(
    uiState: LibraryUiState,
    onRefresh: () -> Unit,
    onTrackSelected: (TrackResponse) -> Unit,
    modifier: Modifier = Modifier,
) {
    var selectedTrackId by remember { mutableStateOf<Int?>(null) }
    val context = LocalContext.current
    val playerController = remember(context) { PlayerController(context) }
    val playbackState by PlaybackStateStore.state.collectAsState()

    selectedTrackId?.let { trackId ->
        Column(modifier = modifier.fillMaxSize()) {
            TrackDetailRoute(
                trackId = trackId,
                onBackToLibrary = { selectedTrackId = null },
                onOpenNowPlaying = onTrackSelected,
                modifier = Modifier.weight(1f),
            )
            LibraryMiniPlayer(
                uiState = playbackState,
                playerController = playerController,
                onOpenNowPlaying = {
                    playbackState.track?.let(onTrackSelected)
                },
            )
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 16.dp),
    ) {
        LibraryHeader(
            isRefreshing = uiState.isRefreshing,
            onRefresh = onRefresh,
        )

        Spacer(modifier = Modifier.height(16.dp))

        Column(modifier = Modifier.weight(1f)) {
            when {
                uiState.isLoading -> LibraryLoading()
                uiState.errorMessage != null && uiState.tracks.isEmpty() -> LibraryError(
                    message = uiState.errorMessage,
                    onRefresh = onRefresh,
                )

                uiState.tracks.isEmpty() -> LibraryEmpty(onRefresh = onRefresh)
                else -> TrackList(
                    tracks = uiState.tracks,
                    playbackState = playbackState,
                    errorMessage = uiState.errorMessage,
                    onRefresh = onRefresh,
                    onTrackSelected = { track -> selectedTrackId = track.id },
                )
            }
        }

        LibraryMiniPlayer(
            uiState = playbackState,
            playerController = playerController,
            onOpenNowPlaying = {
                playbackState.track?.let(onTrackSelected)
            },
        )
    }
}

@Composable
private fun LibraryHeader(
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Library",
                style = MaterialTheme.typography.headlineMedium,
            )
            Text(
                text = "Cloud tracks",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        OutlinedButton(
            enabled = !isRefreshing,
            onClick = onRefresh,
        ) {
            Text(if (isRefreshing) "Refreshing" else "Refresh")
        }
    }
}

@Composable
private fun LibraryLoading() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Spacer(modifier = Modifier.height(12.dp))
        Text("Loading tracks")
    }
}

@Composable
private fun LibraryEmpty(onRefresh: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "No tracks yet",
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            modifier = Modifier.padding(top = 8.dp),
            text = "Uploaded tracks will appear here after the backend processes them.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(
            modifier = Modifier.padding(top = 16.dp),
            onClick = onRefresh,
        ) {
            Text("Refresh")
        }
    }
}

@Composable
private fun LibraryError(
    message: String,
    onRefresh: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Could not load tracks",
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            modifier = Modifier.padding(top = 8.dp),
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
        Button(
            modifier = Modifier.padding(top = 16.dp),
            onClick = onRefresh,
        ) {
            Text("Try Again")
        }
    }
}

@Composable
private fun TrackList(
    tracks: List<TrackResponse>,
    playbackState: PlayerUiState,
    errorMessage: String?,
    onRefresh: () -> Unit,
    onTrackSelected: (TrackResponse) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (errorMessage != null) {
            item {
                InlineError(
                    message = errorMessage,
                    onRefresh = onRefresh,
                )
            }
        }

        items(
            items = tracks,
            key = { track -> track.id },
        ) { track ->
            TrackRow(
                track = track,
                playbackState = playbackState,
                onClick = { onTrackSelected(track) },
            )
        }
    }
}

@Composable
private fun InlineError(
    message: String,
    onRefresh: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
        shape = MaterialTheme.shapes.small,
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                modifier = Modifier.weight(1f),
                text = message,
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(modifier = Modifier.width(8.dp))
            OutlinedButton(onClick = onRefresh) {
                Text("Retry")
            }
        }
    }
}

@Composable
private fun TrackRow(
    track: TrackResponse,
    playbackState: PlayerUiState,
    onClick: () -> Unit,
) {
    val isCurrentTrack = playbackState.track?.id == track.id
    Card(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
        colors = CardDefaults.cardColors(
            containerColor = if (isCurrentTrack) {
                MaterialTheme.colorScheme.primaryContainer
            } else if (track.isReady) {
                MaterialTheme.colorScheme.surfaceContainer
            } else {
                MaterialTheme.colorScheme.surfaceContainerLow
            },
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = track.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    TrackSubtitle(track = track)
                }
                Spacer(modifier = Modifier.width(12.dp))
                StatusChip(track = track)
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = track.durationSeconds?.formatDuration() ?: "Duration unknown",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = track.rowPlaybackLabel(
                        isCurrentTrack = isCurrentTrack,
                        status = playbackState.status,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (isCurrentTrack || track.isReady) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }

            val tags = track.tags.take(3)
            if (tags.isNotEmpty()) {
                Text(
                    text = tags.joinToString(separator = " / ") { tag -> tag.name },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun LibraryMiniPlayer(
    uiState: PlayerUiState,
    playerController: PlayerController,
    onOpenNowPlaying: () -> Unit,
) {
    MiniPlayer(
        uiState = uiState,
        onOpenNowPlaying = onOpenNowPlaying,
        onPlay = playerController::resume,
        onPause = playerController::pause,
        onTick = playerController::updatePosition,
    )
}

private fun TrackResponse.rowPlaybackLabel(
    isCurrentTrack: Boolean,
    status: PlaybackStatus,
): String {
    if (!isCurrentTrack) {
        return if (isReady) "Tap to open" else "Not playable yet"
    }

    return when (status) {
        PlaybackStatus.Buffering -> "Current track - buffering"
        PlaybackStatus.Playing -> "Current track - playing"
        PlaybackStatus.Paused -> "Current track - paused"
        PlaybackStatus.Ended -> "Current track - finished"
        PlaybackStatus.Error -> "Current track - error"
        PlaybackStatus.Idle -> "Current track"
    }
}

@Composable
private fun TrackSubtitle(track: TrackResponse) {
    val subtitle = listOfNotNull(track.artist, track.album)
        .filter { value -> value.isNotBlank() }
        .joinToString(separator = " - ")
        .ifBlank { "Unknown artist or album" }

    Text(
        text = subtitle,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
private fun StatusChip(track: TrackResponse) {
    AssistChip(
        onClick = {},
        label = {
            Text(if (track.isReady) "Ready" else track.status.replaceFirstChar { it.uppercase() })
        },
        enabled = track.isReady,
    )
}

private fun Int.formatDuration(): String {
    val minutes = this / 60
    val seconds = this % 60
    return "$minutes:${seconds.toString().padStart(2, '0')}"
}
