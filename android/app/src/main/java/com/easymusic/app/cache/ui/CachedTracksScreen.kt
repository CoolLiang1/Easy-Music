package com.easymusic.app.cache.ui

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
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
import com.easymusic.app.cache.data.CacheFileStore
import com.easymusic.app.cache.data.EasyMusicDatabase
import com.easymusic.app.cache.domain.CacheStatus
import com.easymusic.app.cache.domain.CachedTrack
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.ui.theme.BannerTone
import com.easymusic.app.ui.theme.SectionHeader
import com.easymusic.app.ui.theme.StatusBanner

@Composable
fun CachedTracksRoute(
    onTrackSelected: (CachedTrack) -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    val context = LocalContext.current
    val viewModel = remember(context) {
        val database = EasyMusicDatabase.getInstance(context)
        CachedTracksViewModel(
            trackCacheRepository = TrackCacheRepository(
                cachedTrackDao = database.cachedTrackDao(),
                cacheFileStore = CacheFileStore(context),
            ),
            playerController = PlayerController(context),
        )
    }
    val uiState by viewModel.uiState.collectAsState()

    CachedTracksScreen(
        modifier = modifier,
        uiState = uiState,
        isNetworkAvailable = isNetworkAvailable,
        onTrackSelected = onTrackSelected,
        onDeleteCachedTrack = viewModel::deleteCachedTrack,
        onClearDeleteError = viewModel::clearDeleteError,
    )
}

@Composable
fun CachedTracksScreen(
    uiState: CachedTracksUiState,
    onTrackSelected: (CachedTrack) -> Unit,
    onDeleteCachedTrack: (CachedTrack) -> Unit,
    onClearDeleteError: () -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    var pendingDelete by remember { mutableStateOf<CachedTrack?>(null) }

    pendingDelete?.let { track ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Delete Cached Copy") },
            text = { Text("Remove the local cached file for \"${track.title}\" from this device?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingDelete = null
                        onDeleteCachedTrack(track)
                    },
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) {
                    Text("Cancel")
                }
            },
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 16.dp),
    ) {
        SectionHeader(
            title = "Cached Tracks",
            subtitle = if (isNetworkAvailable) {
                "Stored on this device"
            } else {
                "Stored on this device and playable while offline"
            },
        )

        Spacer(modifier = Modifier.height(16.dp))

        uiState.deleteErrorMessage?.let { message ->
            StatusBanner(
                text = message,
                tone = BannerTone.Error,
                modifier = Modifier.padding(bottom = 12.dp),
                action = {
                    TextButton(onClick = onClearDeleteError) {
                        Text("Dismiss")
                    }
                },
            )
        }

        if (uiState.cachedTracks.isEmpty()) {
            CachedTracksEmpty()
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 20.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(
                    items = uiState.cachedTracks,
                    key = { track -> track.trackId },
                ) { track ->
                    CachedTrackRow(
                        track = track,
                        onClick = { onTrackSelected(track) },
                        onDeleteClick = { pendingDelete = track },
                    )
                }
            }
        }
    }
}

@Composable
private fun CachedTracksEmpty() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
            Text(
                text = "No cached tracks yet",
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            modifier = Modifier.padding(top = 8.dp),
            text = "Cache a ready track from Track Detail and it will appear here for offline access.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun CachedTrackRow(
    track: CachedTrack,
    onClick: () -> Unit,
    onDeleteClick: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer,
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
                    Text(
                        text = track.artistAlbumLabel(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                AssistChip(
                    onClick = {},
                    label = { Text(track.cacheStatus.label()) },
                    enabled = track.cacheStatus == CacheStatus.Cached,
                )
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
                    text = track.byteSize?.formatBytes() ?: "File size unknown",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Text(
                text = "Cached ${track.cachedAt ?: "time unknown"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Tap card to play offline",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
                OutlinedButton(onClick = onDeleteClick) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Delete Cache")
                }
            }
        }
    }
}

private fun CachedTrack.artistAlbumLabel(): String =
    listOfNotNull(artist, album)
        .filter { value -> value.isNotBlank() }
        .joinToString(separator = " - ")
        .ifBlank { "Unknown artist or album" }

private fun CacheStatus.label(): String =
    when (this) {
        CacheStatus.NotCached -> "Not cached"
        CacheStatus.Caching -> "Caching"
        CacheStatus.Cached -> "Cached"
        CacheStatus.Failed -> "Cache failed"
    }

private fun Int.formatDuration(): String {
    val minutes = this / 60
    val seconds = this % 60
    return "$minutes:${seconds.toString().padStart(2, '0')}"
}

private fun Long.formatBytes(): String =
    when {
        this >= 1_000_000L -> "${this / 1_000_000L} MB"
        this >= 1_000L -> "${this / 1_000L} KB"
        else -> "$this B"
    }
