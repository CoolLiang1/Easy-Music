package com.easymusic.app.playlist.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.player.domain.PlaybackQueueMode
import com.easymusic.app.player.domain.PlaybackStateStore
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlaybackUiSummary
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.domain.toPlaybackUiSummary
import com.easymusic.app.player.ui.MiniPlayer
import com.easymusic.app.playlist.data.PlaylistResponse
import com.easymusic.app.playlist.data.PlaylistSummaryResponse
import com.easymusic.app.playlist.data.PlaylistTrackResponse
import com.easymusic.app.ui.theme.BannerTone
import com.easymusic.app.ui.theme.SectionHeader
import com.easymusic.app.ui.theme.StatusBanner
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

@Composable
fun PlaylistsScreen(
    uiState: PlaylistsUiState,
    onRefresh: () -> Unit,
    onPlaylistSelected: (PlaylistSummaryResponse) -> Unit,
    onClosePlaylist: () -> Unit,
    onTrackSelected: (TrackResponse) -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    val context = LocalContext.current
    val playerController = androidx.compose.runtime.remember(context) { PlayerController(context) }
    val tokenStore = remember(context) { AuthTokenStore(context) }
    val trackApi = remember { TrackApi(ApiClient(AppConfig.default())) }
    val coroutineScope = rememberCoroutineScope()
    val playbackSummary by remember {
        PlaybackStateStore.state
            .map { state -> state.toPlaybackUiSummary() }
            .distinctUntilChanged()
    }.collectAsState(initial = PlaybackUiSummary())

    LaunchedEffect(uiState.selectedPlaylist, playbackSummary.queueSourcePlaylistId) {
        val playlist = uiState.selectedPlaylist
        if (
            playlist != null &&
            playbackSummary.queueSourcePlaylistId == playlist.id
        ) {
            playerController.syncPlaylistSourceTracks(
                playlistId = playlist.id,
                playlistName = playlist.name,
                tracks = playlist.tracks.map { item -> item.track },
            )
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 16.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            uiState.selectedPlaylist?.let { playlist ->
                PlaylistDetail(
                    playlist = playlist,
                    playbackSummary = playbackSummary,
                    isRefreshing = uiState.isRefreshing,
                    isNetworkAvailable = isNetworkAvailable,
                    errorMessage = uiState.errorMessage,
                    onBack = onClosePlaylist,
                    onRefresh = onRefresh,
                    onPlayPlaylist = { mode ->
                        coroutineScope.launch {
                            val bearerToken = tokenStore.readToken()
                            if (bearerToken == null) {
                                playerController.fail(
                                    track = null,
                                    message = "请重新登录后再播放歌单。",
                                )
                            } else {
                                playerController.playQueue(
                                    tracks = playlist.queueTracks(mode),
                                    bearerToken = bearerToken,
                                    streamUrlForTrack = trackApi::streamUrl,
                                    mode = mode,
                                    playlistId = playlist.id,
                                    playlistName = playlist.name,
                                )
                            }
                        }
                    },
                    onTrackSelected = onTrackSelected,
                )
            } ?: PlaylistsOverview(
                uiState = uiState,
                isNetworkAvailable = isNetworkAvailable,
                onRefresh = onRefresh,
                onPlaylistSelected = onPlaylistSelected,
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        PlaylistMiniPlayer(
            playerController = playerController,
            onOpenNowPlaying = {
                PlaybackStateStore.state.value.track?.let(onTrackSelected)
            },
        )
    }
}

@Composable
fun PlaylistsRouteContent(
    viewModel: PlaylistsViewModel,
    onTrackSelected: (TrackResponse) -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    DisposableEffect(viewModel) {
        onDispose {}
    }

    PlaylistsScreen(
        modifier = modifier,
        uiState = viewModel.uiState,
        isNetworkAvailable = isNetworkAvailable,
        onRefresh = {
            val selectedPlaylistId = viewModel.uiState.selectedPlaylist?.id
            if (selectedPlaylistId == null) {
                viewModel.refresh(isNetworkAvailable)
            } else {
                viewModel.selectPlaylist(
                    playlistId = selectedPlaylistId,
                    isNetworkAvailable = isNetworkAvailable,
                )
            }
        },
        onPlaylistSelected = { playlist ->
            viewModel.selectPlaylist(
                playlistId = playlist.id,
                isNetworkAvailable = isNetworkAvailable,
            )
        },
        onClosePlaylist = viewModel::closePlaylist,
        onTrackSelected = onTrackSelected,
    )
}

@Composable
private fun PlaylistsOverview(
    uiState: PlaylistsUiState,
    isNetworkAvailable: Boolean,
    onRefresh: () -> Unit,
    onPlaylistSelected: (PlaylistSummaryResponse) -> Unit,
) {
    SectionHeader(
        title = "歌单",
        subtitle = if (isNetworkAvailable) "浏览手动歌单，并按顺序、随机或倒序播放" else "离线时无法刷新云端歌单；当前播放不受影响",
        action = {
            OutlinedButton(
                enabled = !uiState.isRefreshing && isNetworkAvailable,
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
                        uiState.isRefreshing -> "刷新中"
                        else -> "刷新"
                    },
                )
            }
        },
    )

    Spacer(modifier = Modifier.height(12.dp))

    if (uiState.playlists.isNotEmpty()) {
        PlaylistsStats(playlists = uiState.playlists)
        Spacer(modifier = Modifier.height(12.dp))
    }

    when {
        uiState.isLoading -> LoadingState(text = "正在加载歌单")
        uiState.errorMessage != null && uiState.playlists.isEmpty() -> ErrorState(
            title = "无法加载歌单",
            message = uiState.errorMessage,
            onRefresh = onRefresh,
        )

        uiState.playlists.isEmpty() -> EmptyState(
            title = "还没有歌单",
            message = "可以先在 Web 管理端创建歌单，然后回到这里播放。",
            onRefresh = onRefresh,
        )

        else -> PlaylistList(
            playlists = uiState.playlists,
            errorMessage = uiState.errorMessage,
            onRefresh = onRefresh,
            onPlaylistSelected = onPlaylistSelected,
        )
    }
}

@Composable
private fun PlaylistsStats(playlists: List<PlaylistSummaryResponse>) {
    val totalTracks = playlists.sumOf { playlist -> playlist.trackCount }
    val emptyCount = playlists.count { playlist -> playlist.trackCount == 0 }

    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AssistChip(onClick = {}, label = { Text("歌单 ${playlists.size}") })
        AssistChip(onClick = {}, label = { Text("音轨 $totalTracks") })
        if (emptyCount > 0) {
            AssistChip(onClick = {}, label = { Text("空歌单 $emptyCount") })
        }
    }
}

@Composable
private fun PlaylistList(
    playlists: List<PlaylistSummaryResponse>,
    errorMessage: String?,
    onRefresh: () -> Unit,
    onPlaylistSelected: (PlaylistSummaryResponse) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (errorMessage != null) {
            item {
                StatusBanner(
                    text = errorMessage,
                    tone = BannerTone.Error,
                    action = {
                        OutlinedButton(onClick = onRefresh) {
                            Text("重试")
                        }
                    },
                )
            }
        }

        items(
            items = playlists,
            key = { playlist -> playlist.id },
        ) { playlist ->
            PlaylistCard(
                playlist = playlist,
                onClick = { onPlaylistSelected(playlist) },
            )
        }
    }
}

@Composable
private fun PlaylistCard(
    playlist: PlaylistSummaryResponse,
    onClick: () -> Unit,
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
            Text(
                text = playlist.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${playlist.trackCount} 首音轨",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            playlist.description
                ?.takeIf { description -> description.isNotBlank() }
                ?.let { description ->
                    Text(
                        text = description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
        }
    }
}

@Composable
private fun PlaylistDetail(
    playlist: PlaylistResponse,
    playbackSummary: PlaybackUiSummary,
    isRefreshing: Boolean,
    isNetworkAvailable: Boolean,
    errorMessage: String?,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onPlayPlaylist: (PlaybackQueueMode) -> Unit,
    onTrackSelected: (TrackResponse) -> Unit,
) {
    SectionHeader(
        title = playlist.name,
        subtitle = playlist.description
            ?.takeIf { description -> description.isNotBlank() }
            ?: "${playlist.trackCount} 首音轨",
        action = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("歌单")
                }
                OutlinedButton(
                    enabled = !isRefreshing && isNetworkAvailable,
                    onClick = onRefresh,
                ) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (isRefreshing) "刷新中" else "刷新")
                }
            }
        },
    )

    Spacer(modifier = Modifier.height(12.dp))

    PlaylistPlaybackActions(
        enabled = playlist.tracks.isNotEmpty() && isNetworkAvailable,
        trackCount = playlist.tracks.count { item -> item.track.isReady },
        onPlayPlaylist = onPlayPlaylist,
    )

    Spacer(modifier = Modifier.height(12.dp))

    when {
        errorMessage != null -> StatusBanner(
            text = errorMessage,
            tone = BannerTone.Error,
        )

        playlist.tracks.isEmpty() -> EmptyState(
            title = "歌单里还没有音轨",
            message = "可以在 Web 管理端把音轨加入这个歌单。",
            onRefresh = onRefresh,
        )

        else -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(
                items = playlist.tracks,
                key = { item -> item.track.id },
            ) { item ->
                PlaylistTrackCard(
                    item = item,
                    playbackSummary = playbackSummary,
                    onClick = { onTrackSelected(item.track) },
                )
            }
        }
    }
}

@Composable
private fun PlaylistPlaybackActions(
    enabled: Boolean,
    trackCount: Int,
    onPlayPlaylist: (PlaybackQueueMode) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = if (trackCount > 0) "将 $trackCount 首可播放音轨加入本机播放队列" else "歌单里还没有可播放音轨",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Button(
                enabled = enabled && trackCount > 0,
                onClick = { onPlayPlaylist(PlaybackQueueMode.Sequence) },
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("顺序播放")
            }
            OutlinedButton(
                enabled = enabled && trackCount > 0,
                onClick = { onPlayPlaylist(PlaybackQueueMode.Shuffle) },
            ) {
                Text("随机播放")
            }
            OutlinedButton(
                enabled = enabled && trackCount > 0,
                onClick = { onPlayPlaylist(PlaybackQueueMode.Reverse) },
            ) {
                Text("倒序播放")
            }
        }
    }
}

@Composable
private fun PlaylistTrackCard(
    item: PlaylistTrackResponse,
    playbackSummary: PlaybackUiSummary,
    onClick: () -> Unit,
) {
    val track = item.track
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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = track.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = track.subtitle(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "#${item.position}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                AssistChip(
                    onClick = {},
                    label = { Text(if (track.isReady) "可播放" else formatStatus(track.status)) },
                    leadingIcon = {
                        if (track.isReady) {
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = null,
                            )
                        }
                    },
                    enabled = track.isReady,
                )
                if (isCurrentTrack) {
                    AssistChip(
                        onClick = {},
                        label = { Text(playbackSummary.status.currentTrackChipLabel()) },
                        enabled = true,
                    )
                }
            }

            Text(
                text = track.durationSeconds?.formatDuration() ?: "时长未知",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PlaylistMiniPlayer(
    playerController: PlayerController,
    onOpenNowPlaying: () -> Unit,
) {
    val uiState by PlaybackStateStore.state.collectAsState()

    MiniPlayer(
        uiState = uiState,
        onOpenNowPlaying = onOpenNowPlaying,
        onPlay = playerController::resume,
        onPause = playerController::pause,
        onPrevious = playerController::previous,
        onNext = playerController::next,
        onTick = playerController::updatePosition,
    )
}

@Composable
private fun LoadingState(text: String) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Spacer(modifier = Modifier.height(12.dp))
        Text(text)
    }
}

@Composable
private fun ErrorState(
    title: String,
    message: String,
    onRefresh: () -> Unit,
) {
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
            Text("重试")
        }
    }
}

@Composable
private fun EmptyState(
    title: String,
    message: String,
    onRefresh: () -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
            )
            Text(
                modifier = Modifier.padding(top = 8.dp),
                text = message,
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
}

private fun TrackResponse.subtitle(): String =
    listOfNotNull(artist, album)
        .filter { value -> value.isNotBlank() }
        .joinToString(separator = " - ")
        .ifBlank { "未知艺人或专辑" }

private fun PlaylistResponse.queueTracks(mode: PlaybackQueueMode): List<TrackResponse> {
    val orderedTracks = tracks
        .sortedBy { item -> item.position }
        .map { item -> item.track }
        .filter { track -> track.isReady }

    return when (mode) {
        PlaybackQueueMode.Sequence -> orderedTracks
        PlaybackQueueMode.Shuffle -> orderedTracks.shuffled()
        PlaybackQueueMode.Reverse -> orderedTracks.asReversed()
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
