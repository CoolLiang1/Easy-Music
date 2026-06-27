package com.easymusic.app.library.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import com.easymusic.app.cache.domain.CacheStatus
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlaybackStateStore
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlaybackUiSummary
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.domain.toPlaybackUiSummary
import com.easymusic.app.player.ui.MiniPlayer
import com.easymusic.app.ui.theme.BannerTone
import com.easymusic.app.ui.theme.SectionHeader
import com.easymusic.app.ui.theme.StatusBanner
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

@Composable
fun LibraryScreen(
    uiState: LibraryUiState,
    onRefresh: () -> Unit,
    onTrackSelected: (TrackResponse) -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    var selectedTrackId by remember { mutableStateOf<Int?>(null) }
    val context = LocalContext.current
    val playerController = remember(context) { PlayerController(context) }
    val playbackSummary by remember {
        PlaybackStateStore.state
            .map { state -> state.toPlaybackUiSummary() }
            .distinctUntilChanged()
    }.collectAsState(initial = PlaybackUiSummary())

    selectedTrackId?.let { trackId ->
        Column(modifier = modifier.fillMaxSize()) {
            TrackDetailRoute(
                trackId = trackId,
                onBackToLibrary = { selectedTrackId = null },
                onOpenNowPlaying = onTrackSelected,
                isNetworkAvailable = isNetworkAvailable,
                modifier = Modifier.weight(1f),
            )
            LibraryMiniPlayer(
                playerController = playerController,
                onOpenNowPlaying = {
                    PlaybackStateStore.state.value.track?.let(onTrackSelected)
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
            isNetworkAvailable = isNetworkAvailable,
            onRefresh = onRefresh,
        )

        Spacer(modifier = Modifier.height(12.dp))

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
                    cacheStatesByTrackId = uiState.cacheStatesByTrackId,
                    playbackSummary = playbackSummary,
                    errorMessage = uiState.errorMessage,
                    onRefresh = onRefresh,
                    onTrackSelected = { track -> selectedTrackId = track.id },
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        LibraryMiniPlayer(
            playerController = playerController,
            onOpenNowPlaying = {
                PlaybackStateStore.state.value.track?.let(onTrackSelected)
            },
        )
    }
}

@Composable
private fun LibraryHeader(
    isRefreshing: Boolean,
    isNetworkAvailable: Boolean,
    onRefresh: () -> Unit,
) {
    SectionHeader(
        title = "曲库",
        subtitle = if (isNetworkAvailable) "云端音轨、离线缓存状态和当前播放" else "离线时无法刷新云端曲库",
        action = {
            OutlinedButton(
                enabled = !isRefreshing && isNetworkAvailable,
                onClick = onRefresh,
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    when {
                        !isNetworkAvailable -> "离线"
                        isRefreshing -> "刷新中"
                        else -> "刷新"
                    },
                )
            }
        },
    )
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
        Text("正在加载音轨")
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
            text = "还没有音轨",
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            modifier = Modifier.padding(top = 8.dp),
            text = "上传后的音轨会在后端处理完成后显示在这里。",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(
            modifier = Modifier.padding(top = 16.dp),
            onClick = onRefresh,
        ) {
            Text("刷新")
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
            text = "无法加载音轨",
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
            Text("重试")
        }
    }
}

@Composable
private fun TrackList(
    tracks: List<TrackResponse>,
    cacheStatesByTrackId: Map<Int, LibraryCacheUiState>,
    playbackSummary: PlaybackUiSummary,
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
                cacheState = cacheStatesByTrackId[track.id] ?: LibraryCacheUiState(),
                playbackSummary = playbackSummary,
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
    StatusBanner(
        text = message,
        tone = BannerTone.Error,
        action = {
            OutlinedButton(onClick = onRefresh) {
                Text("重试")
            }
        },
    )
}

@Composable
private fun TrackRow(
    track: TrackResponse,
    cacheState: LibraryCacheUiState,
    playbackSummary: PlaybackUiSummary,
    onClick: () -> Unit,
) {
    val isCurrentTrack = playbackSummary.currentTrackId == track.id
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
            Text(
                text = track.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            TrackSubtitle(track = track)

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (isCurrentTrack) {
                    AssistChip(
                        onClick = {},
                        label = { Text(playbackSummary.status.currentTrackChipLabel()) },
                        enabled = true,
                    )
                }
                CacheStatusChip(cacheState = cacheState)
                StatusChip(track = track)
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = track.durationSeconds?.formatDuration() ?: "时长未知",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = track.rowPlaybackLabel(
                        isCurrentTrack = isCurrentTrack,
                        status = playbackSummary.status,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (isCurrentTrack || track.isReady) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }

            val tags = track.tags.take(4)
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
private fun CacheStatusChip(cacheState: LibraryCacheUiState) {
    AssistChip(
        onClick = {},
        label = { Text(cacheState.cacheLabel()) },
        enabled = cacheState.status == CacheStatus.Cached,
    )
}

@Composable
private fun LibraryMiniPlayer(
    playerController: PlayerController,
    onOpenNowPlaying: () -> Unit,
) {
    val uiState by PlaybackStateStore.state.collectAsState()

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
        return if (isReady) "点按打开" else "尚不可播放"
    }

    return when (status) {
        PlaybackStatus.Buffering -> "当前音轨 - 缓冲中"
        PlaybackStatus.Playing -> "当前音轨 - 播放中"
        PlaybackStatus.Paused -> "当前音轨 - 已暂停"
        PlaybackStatus.Ended -> "当前音轨 - 已结束"
        PlaybackStatus.Error -> "当前音轨 - 播放错误"
        PlaybackStatus.Idle -> "当前音轨"
    }
}

private fun PlaybackStatus.currentTrackChipLabel(): String =
    when (this) {
        PlaybackStatus.Buffering -> "缓冲中"
        PlaybackStatus.Playing -> "播放中"
        PlaybackStatus.Paused -> "已暂停"
        PlaybackStatus.Ended -> "已结束"
        PlaybackStatus.Error -> "播放错误"
        PlaybackStatus.Idle -> "已加载"
    }

private fun LibraryCacheUiState.cacheLabel(): String =
    when (status) {
        CacheStatus.NotCached -> "未缓存"
        CacheStatus.Caching -> "缓存中"
        CacheStatus.Cached -> "已缓存"
        CacheStatus.Failed -> "缓存失败"
    }

@Composable
private fun TrackSubtitle(track: TrackResponse) {
    val subtitle = listOfNotNull(track.artist, track.album)
        .filter { value -> value.isNotBlank() }
        .joinToString(separator = " - ")
        .ifBlank { "未知艺人或专辑" }

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
            Text(if (track.isReady) "可播放" else formatStatus(track.status))
        },
        enabled = track.isReady,
    )
}

private fun formatStatus(status: String): String =
    when (status.lowercase()) {
        "uploaded" -> "已上传"
        "processing" -> "处理中"
        "failed" -> "处理失败"
        else -> status
    }

private fun Int.formatDuration(): String {
    val minutes = this / 60
    val seconds = this % 60
    return "$minutes:${seconds.toString().padStart(2, '0')}"
}
