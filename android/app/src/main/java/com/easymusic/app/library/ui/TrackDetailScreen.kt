package com.easymusic.app.library.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.cache.data.CacheFileStore
import com.easymusic.app.cache.data.EasyMusicDatabase
import com.easymusic.app.cache.domain.CacheStatus
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlaybackStateStore
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlayerUiState
import com.easymusic.app.player.domain.PlayerController

@Composable
fun TrackDetailRoute(
    trackId: Int,
    onBackToLibrary: () -> Unit,
    onOpenNowPlaying: (TrackResponse) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val viewModel = remember(context, trackId) {
        val database = EasyMusicDatabase.getInstance(context)
        TrackDetailViewModel(
            trackId = trackId,
            trackApi = TrackApi(ApiClient(AppConfig.default())),
            tokenStore = AuthTokenStore(context),
            trackCacheRepository = TrackCacheRepository(
                cachedTrackDao = database.cachedTrackDao(),
                cacheFileStore = CacheFileStore(context),
            ),
            playerController = PlayerController(context),
        )
    }
    val playbackState by PlaybackStateStore.state.collectAsState()

    TrackDetailScreen(
        modifier = modifier,
        uiState = viewModel.uiState,
        playbackState = playbackState,
        onBackToLibrary = onBackToLibrary,
        onRefresh = viewModel::refresh,
        onOpenNowPlaying = onOpenNowPlaying,
        onCacheTrack = viewModel::cacheTrack,
        onDeleteCachedTrack = viewModel::deleteCachedTrack,
    )
}

@Composable
fun TrackDetailScreen(
    uiState: TrackDetailUiState,
    playbackState: PlayerUiState,
    onBackToLibrary: () -> Unit,
    onRefresh: () -> Unit,
    onOpenNowPlaying: (TrackResponse) -> Unit,
    onCacheTrack: () -> Unit,
    onDeleteCachedTrack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Track Detail",
                    style = MaterialTheme.typography.headlineMedium,
                )
                Text(
                    text = "Fresh cloud metadata",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedButton(onClick = onBackToLibrary) {
                Text("Library")
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        when {
            uiState.isLoading -> DetailLoading()
            uiState.errorMessage != null -> DetailError(
                kind = uiState.errorKind,
                message = uiState.errorMessage,
                onRefresh = onRefresh,
            )

            uiState.track != null -> DetailContent(
                track = uiState.track,
                playbackState = playbackState,
                cacheState = uiState.cacheState,
                onOpenNowPlaying = onOpenNowPlaying,
                onCacheTrack = onCacheTrack,
                onDeleteCachedTrack = onDeleteCachedTrack,
            )
        }
    }
}

@Composable
private fun DetailLoading() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Spacer(modifier = Modifier.height(12.dp))
        Text("Loading track detail")
    }
}

@Composable
private fun DetailError(
    kind: TrackDetailErrorKind?,
    message: String,
    onRefresh: () -> Unit,
) {
    val title = when (kind) {
        TrackDetailErrorKind.NotFound -> "Track not found"
        TrackDetailErrorKind.Unauthorized -> "Sign in required"
        TrackDetailErrorKind.Other,
        null,
        -> "Could not load track"
    }

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = title,
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
private fun DetailContent(
    track: TrackResponse,
    playbackState: PlayerUiState,
    cacheState: TrackCacheUiState,
    onOpenNowPlaying: (TrackResponse) -> Unit,
    onCacheTrack: () -> Unit,
    onDeleteCachedTrack: () -> Unit,
) {
    val isCurrentTrack = playbackState.track?.id == track.id
    var showDeleteConfirmation by remember { mutableStateOf(false) }

    if (showDeleteConfirmation) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmation = false },
            title = { Text("Delete Cached Copy") },
            text = { Text("Remove the local cached file for \"${track.title}\" from this device?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteConfirmation = false
                        onDeleteCachedTrack()
                    },
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmation = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = track.title,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                MetadataRow(label = "Artist", value = track.artist.orUnknown())
                MetadataRow(label = "Album", value = track.album.orUnknown())
                MetadataRow(label = "Duration", value = track.durationSeconds?.formatDuration() ?: "Unknown")
                MetadataRow(label = "Content Type", value = track.contentType)
                MetadataRow(label = "Liked", value = if (track.liked) "Yes" else "No")
                MetadataRow(label = "Cooldown", value = track.cooldownUntil ?: "None")
                MetadataRow(label = "Created", value = track.createdAt)
                MetadataRow(label = "Updated", value = track.updatedAt)
            }
        }

        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "Playback",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = if (isCurrentTrack) {
                        playbackState.detailPlaybackLabel()
                    } else if (track.isReady) {
                        "Ready to stream."
                    } else {
                        "Only ready tracks can stream. This track is ${track.status}."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    enabled = track.isReady,
                    onClick = { onOpenNowPlaying(track) },
                ) {
                    Text(if (isCurrentTrack) "Open Now Playing" else "Play")
                }
            }
        }

        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "Offline Cache",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = track.cacheLabel(cacheState),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (cacheState.status == CacheStatus.Failed) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
                CacheMetadata(cacheState = cacheState)
                Button(
                    enabled = track.isReady &&
                        !cacheState.isCaching &&
                        cacheState.status != CacheStatus.Cached,
                    onClick = onCacheTrack,
                ) {
                    Text(
                        when {
                            !track.isReady -> "Cache Unavailable"
                            cacheState.status == CacheStatus.Cached -> "Cached"
                            cacheState.status == CacheStatus.Failed -> "Retry Cache"
                            else -> "Cache Track"
                        },
                    )
                }
                if (cacheState.status == CacheStatus.Cached || cacheState.status == CacheStatus.Failed) {
                    OutlinedButton(
                        enabled = !cacheState.isCaching,
                        onClick = { showDeleteConfirmation = true },
                    ) {
                        Text("Delete Cache")
                    }
                }
            }
        }

        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = "Tags",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                if (track.tags.isEmpty()) {
                    Text(
                        text = "No tags",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        track.tags.forEach { tag ->
                            AssistChip(
                                onClick = {},
                                label = { Text(tag.name) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CacheMetadata(cacheState: TrackCacheUiState) {
    if (cacheState.status != CacheStatus.Cached) {
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        MetadataRow(
            label = "File Size",
            value = cacheState.byteSize?.formatBytes() ?: "Unknown",
        )
        MetadataRow(
            label = "Cached",
            value = cacheState.cachedAt ?: "Unknown",
        )
    }
}

@Composable
private fun MetadataRow(
    label: String,
    value: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            modifier = Modifier
                .weight(1f)
                .padding(start = 16.dp),
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private fun String?.orUnknown(): String =
    if (isNullOrBlank()) "Unknown" else this

private fun TrackResponse.cacheLabel(cacheState: TrackCacheUiState): String {
    if (!isReady) {
        return "Only ready tracks can be cached. This track is $status."
    }

    return when (cacheState.status) {
        CacheStatus.NotCached -> "Not cached on this device."
        CacheStatus.Caching -> cacheState.message ?: "Caching track"
        CacheStatus.Cached -> cacheState.message ?: "Cached for offline playback."
        CacheStatus.Failed -> cacheState.errorMessage ?: "Cache download failed."
    }
}

private fun Long.formatBytes(): String =
    when {
        this >= 1_000_000L -> "${this / 1_000_000L} MB"
        this >= 1_000L -> "${this / 1_000L} KB"
        else -> "$this B"
    }

private fun PlayerUiState.detailPlaybackLabel(): String =
    when (status) {
        PlaybackStatus.Buffering -> "This track is buffering."
        PlaybackStatus.Playing -> "This track is playing."
        PlaybackStatus.Paused -> "This track is paused."
        PlaybackStatus.Ended -> "Playback finished for this track."
        PlaybackStatus.Error -> errorMessage ?: "Playback failed for this track."
        PlaybackStatus.Idle -> "This track is loaded."
    }

private fun Int.formatDuration(): String {
    val minutes = this / 60
    val seconds = this % 60
    return "$minutes:${seconds.toString().padStart(2, '0')}"
}
