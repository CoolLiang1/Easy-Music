package com.easymusic.app.cache.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.DownloadForOffline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.easymusic.app.cache.data.CacheFileStore
import com.easymusic.app.cache.data.EasyMusicDatabase
import com.easymusic.app.cache.domain.CacheStatus
import com.easymusic.app.cache.domain.CachedTrack
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlaybackStateStore
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.domain.TrackPlaybackLauncher
import com.easymusic.app.ui.LocalShowMessage
import com.easymusic.app.ui.components.Banner
import com.easymusic.app.ui.components.BannerTone
import com.easymusic.app.ui.components.EmptyState
import com.easymusic.app.ui.components.PillTone
import com.easymusic.app.ui.components.StatusPill
import com.easymusic.app.ui.components.TrackListRow
import com.easymusic.app.ui.components.formatBytes
import com.easymusic.app.ui.components.formatDuration
import com.easymusic.app.ui.components.trackSubtitle
import kotlinx.coroutines.launch

@Composable
fun CachedTracksRoute(
    onBrowseLibrary: () -> Unit,
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
        onBrowseLibrary = onBrowseLibrary,
        onDeleteCachedTrack = viewModel::deleteCachedTrack,
        onClearDeleteError = viewModel::clearDeleteError,
    )
}

@Composable
fun CachedTracksScreen(
    uiState: CachedTracksUiState,
    onBrowseLibrary: () -> Unit,
    onDeleteCachedTrack: (CachedTrack) -> Unit,
    onClearDeleteError: () -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    val context = LocalContext.current
    val launcher = remember(context) { TrackPlaybackLauncher.create(context) }
    val playerController = remember(context) { PlayerController(context) }
    val showMessage = LocalShowMessage.current
    val scope = rememberCoroutineScope()
    val playerState by PlaybackStateStore.state.collectAsState()
    var pendingDelete by remember { mutableStateOf<CachedTrack?>(null) }

    pendingDelete?.let { track ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("删除离线缓存？") },
            text = { Text("只删除这台设备上的「${track.title}」，云端曲库不受影响，之后可以重新缓存。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingDelete = null
                        onDeleteCachedTrack(track)
                    },
                ) { Text("删除", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("取消") }
            },
        )
    }

    Column(modifier = modifier.fillMaxSize()) {
        uiState.deleteErrorMessage?.let { message ->
            Banner(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                text = message,
                tone = BannerTone.Error,
                action = { TextButton(onClick = onClearDeleteError) { Text("知道了") } },
            )
        }

        if (uiState.cachedTracks.isEmpty()) {
            EmptyState(
                icon = Icons.Default.DownloadForOffline,
                title = "还没有离线音轨",
                message = "在曲库里打开一首歌的「详情与离线缓存」，缓存后没有网络也能播放。",
                action = { Button(onClick = onBrowseLibrary) { Text("去曲库") } },
            )
            return@Column
        }

        val totalBytes = uiState.cachedTracks.sumOf { it.byteSize ?: 0L }
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 8.dp, end = 8.dp, top = 4.dp, bottom = 16.dp),
        ) {
            item(key = "summary") {
                Text(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    text = "${uiState.cachedTracks.size} 首 · 占用 ${totalBytes.formatBytes()}" +
                        if (!isNetworkAvailable) " · 离线也能播放" else "",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            items(items = uiState.cachedTracks, key = { it.trackId }) { track ->
                val isCurrent = playerState.track?.id == track.trackId
                val isPlaying = isCurrent && playerState.status == PlaybackStatus.Playing
                val isPlayable = track.cacheStatus == CacheStatus.Cached
                TrackListRow(
                    trackId = track.trackId,
                    title = track.title,
                    artist = track.artist,
                    subtitle = listOfNotNull(
                        trackSubtitle(track.artist),
                        track.durationSeconds?.formatDuration(),
                        track.byteSize?.formatBytes(),
                    ).joinToString(" · "),
                    isCurrent = isCurrent,
                    isPlaying = isPlaying,
                    dimmed = !isPlayable,
                    onClick = {
                        when {
                            !isPlayable -> showMessage("这首还没缓存完成。")
                            isPlaying -> playerController.pause()
                            isCurrent -> playerController.resume()
                            else -> scope.launch {
                                launcher.play(track.toTrackResponse(), isNetworkAvailable).message?.let(showMessage)
                            }
                        }
                    },
                    badges = when (track.cacheStatus) {
                        CacheStatus.Caching -> ({ StatusPill(text = "缓存中", tone = PillTone.Warn) })
                        CacheStatus.Failed -> ({ StatusPill(text = "缓存失败", tone = PillTone.Error) })
                        else -> null
                    },
                    trailing = {
                        IconButton(onClick = { pendingDelete = track }) {
                            Icon(
                                Icons.Default.DeleteOutline,
                                contentDescription = "删除「${track.title}」的缓存",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    },
                )
            }
        }
    }
}

private fun CachedTrack.toTrackResponse(): TrackResponse =
    TrackResponse(
        id = trackId,
        title = title,
        artist = artist,
        album = album,
        durationSeconds = durationSeconds,
        contentType = contentType,
        status = TrackResponse.STATUS_READY,
        liked = false,
        cooldownUntil = null,
        createdAt = cachedAt ?: sourceUpdatedAt,
        updatedAt = sourceUpdatedAt,
        tags = emptyList(),
    )
