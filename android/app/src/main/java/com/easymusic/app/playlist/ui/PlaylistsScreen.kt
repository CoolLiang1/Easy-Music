package com.easymusic.app.playlist.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlaybackQueueMode
import com.easymusic.app.player.domain.PlaybackStateStore
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlaybackUiSummary
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.domain.TrackPlaybackLauncher
import com.easymusic.app.player.domain.toPlaybackUiSummary
import com.easymusic.app.playlist.data.PlaylistResponse
import com.easymusic.app.playlist.data.PlaylistSummaryResponse
import com.easymusic.app.ui.LocalShowMessage
import com.easymusic.app.ui.components.Banner
import com.easymusic.app.ui.components.BannerTone
import com.easymusic.app.ui.components.EmptyState
import com.easymusic.app.ui.components.LevelMeter
import com.easymusic.app.ui.components.LoadingState
import com.easymusic.app.ui.components.PillTone
import com.easymusic.app.ui.components.StatusPill
import com.easymusic.app.ui.components.TrackArtwork
import com.easymusic.app.ui.components.TrackListRow
import com.easymusic.app.ui.components.formatDuration
import com.easymusic.app.ui.components.formatTrackStatus
import com.easymusic.app.ui.components.subtitle
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistsScreen(
    uiState: PlaylistsUiState,
    onRefresh: () -> Unit,
    onPlaylistSelected: (PlaylistSummaryResponse) -> Unit,
    onClosePlaylist: () -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    val context = LocalContext.current
    val playerController = remember(context) { PlayerController(context) }
    val launcher = remember(context) { TrackPlaybackLauncher.create(context) }
    val showMessage = LocalShowMessage.current
    val scope = rememberCoroutineScope()
    val playbackSummary by remember {
        PlaybackStateStore.state
            .map { state -> state.toPlaybackUiSummary() }
            .distinctUntilChanged()
    }.collectAsState(initial = PlaybackUiSummary())

    LaunchedEffect(uiState.selectedPlaylist, playbackSummary.queueSourcePlaylistId) {
        val playlist = uiState.selectedPlaylist
        if (playlist != null && playbackSummary.queueSourcePlaylistId == playlist.id) {
            playerController.syncPlaylistSourceTracks(
                playlistId = playlist.id,
                playlistName = playlist.name,
                tracks = playlist.tracks.map { item -> item.track },
            )
        }
    }

    BackHandler(enabled = uiState.selectedPlaylist != null) { onClosePlaylist() }

    val playPlaylist: (PlaylistResponse, PlaybackQueueMode, Int?) -> Unit = { playlist, mode, startTrackId ->
        scope.launch {
            val ordered = playlist.queueTracks(mode)
            val startIndex = startTrackId?.let { id -> ordered.indexOfFirst { it.id == id } } ?: -1
            val tracks = if (startIndex > 0) ordered.drop(startIndex) else ordered
            val result = launcher.playQueue(
                tracks = tracks,
                mode = mode,
                isNetworkAvailable = isNetworkAvailable,
                playlistId = playlist.id,
                playlistName = playlist.name,
            )
            result.message?.let(showMessage)
        }
    }

    PullToRefreshBox(
        modifier = modifier.fillMaxSize(),
        isRefreshing = uiState.isRefreshing,
        onRefresh = onRefresh,
    ) {
        val selected = uiState.selectedPlaylist
        if (selected != null) {
            PlaylistDetail(
                playlist = selected,
                playbackSummary = playbackSummary,
                isNetworkAvailable = isNetworkAvailable,
                errorMessage = uiState.errorMessage,
                onBack = onClosePlaylist,
                onPlay = { mode -> playPlaylist(selected, mode, null) },
                onTrackClick = { track ->
                    if (playbackSummary.currentTrackId == track.id) {
                        if (playbackSummary.status == PlaybackStatus.Playing) playerController.pause() else playerController.resume()
                    } else {
                        playPlaylist(selected, PlaybackQueueMode.Sequence, track.id)
                    }
                },
            )
        } else {
            PlaylistsOverview(
                uiState = uiState,
                playbackSummary = playbackSummary,
                isNetworkAvailable = isNetworkAvailable,
                onRefresh = onRefresh,
                onPlaylistSelected = onPlaylistSelected,
            )
        }
    }
}

@Composable
fun PlaylistsRouteContent(
    viewModel: PlaylistsViewModel,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    PlaylistsScreen(
        modifier = modifier,
        uiState = viewModel.uiState,
        isNetworkAvailable = isNetworkAvailable,
        onRefresh = {
            val selectedPlaylistId = viewModel.uiState.selectedPlaylist?.id
            if (selectedPlaylistId == null) {
                viewModel.refresh(isNetworkAvailable)
            } else {
                viewModel.selectPlaylist(playlistId = selectedPlaylistId, isNetworkAvailable = isNetworkAvailable)
            }
        },
        onPlaylistSelected = { playlist ->
            viewModel.selectPlaylist(playlistId = playlist.id, isNetworkAvailable = isNetworkAvailable)
        },
        onClosePlaylist = viewModel::closePlaylist,
    )
}

@Composable
private fun PlaylistsOverview(
    uiState: PlaylistsUiState,
    playbackSummary: PlaybackUiSummary,
    isNetworkAvailable: Boolean,
    onRefresh: () -> Unit,
    onPlaylistSelected: (PlaylistSummaryResponse) -> Unit,
) {
    when {
        uiState.isLoading -> LoadingState(text = "正在加载歌单…")
        uiState.errorMessage != null && uiState.playlists.isEmpty() -> EmptyState(
            icon = Icons.Default.ErrorOutline,
            title = if (uiState.needsSignIn) "需要重新登录" else "歌单加载失败",
            message = uiState.errorMessage,
            action = { Button(enabled = isNetworkAvailable, onClick = onRefresh) { Text("重试") } },
        )

        uiState.playlists.isEmpty() -> EmptyState(
            icon = Icons.AutoMirrored.Filled.QueueMusic,
            title = "还没有歌单",
            message = "在 Web 管理端创建歌单并加入音轨，下拉即可刷新。",
            action = { OutlinedButton(onClick = onRefresh) { Text("刷新") } },
        )

        else -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 8.dp, end = 8.dp, top = 4.dp, bottom = 16.dp),
        ) {
            item(key = "summary") {
                Text(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    text = "${uiState.playlists.size} 个歌单 · 共 ${uiState.playlists.sumOf { it.trackCount }} 首",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (uiState.errorMessage != null) {
                item(key = "error") {
                    Banner(
                        modifier = Modifier.padding(8.dp),
                        text = uiState.errorMessage,
                        tone = BannerTone.Error,
                    )
                }
            }
            items(items = uiState.playlists, key = { it.id }) { playlist ->
                val isSource = playbackSummary.queueSourcePlaylistId == playlist.id
                TrackListRow(
                    trackId = playlist.id,
                    title = playlist.name,
                    subtitle = listOfNotNull(
                        "${playlist.trackCount} 首",
                        playlist.description?.takeIf { it.isNotBlank() },
                    ).joinToString(" · "),
                    onClick = { onPlaylistSelected(playlist) },
                    badges = if (isSource) {
                        {
                            LevelMeter(
                                isPlaying = playbackSummary.status == PlaybackStatus.Playing,
                                height = 12.dp,
                            )
                        }
                    } else {
                        null
                    },
                    trailing = {
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(end = 8.dp),
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun PlaylistDetail(
    playlist: PlaylistResponse,
    playbackSummary: PlaybackUiSummary,
    isNetworkAvailable: Boolean,
    errorMessage: String?,
    onBack: () -> Unit,
    onPlay: (PlaybackQueueMode) -> Unit,
    onTrackClick: (TrackResponse) -> Unit,
) {
    val playableCount = playlist.tracks.count { it.track.isReady }
    val totalSeconds = playlist.tracks.sumOf { it.track.durationSeconds ?: 0 }
    val canPlay = playableCount > 0 && isNetworkAvailable
    var moreOpen by remember { mutableStateOf(false) }
    val sortedTracks = remember(playlist) { playlist.tracks.sortedBy { it.position } }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 8.dp, end = 8.dp, bottom = 16.dp),
    ) {
        item(key = "back") {
            TextButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("全部歌单")
            }
        }
        item(key = "hero") {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val coverTrack = sortedTracks.firstOrNull { it.track.coverPath != null }?.track
                TrackArtwork(
                    trackId = coverTrack?.id ?: playlist.id,
                    title = coverTrack?.title ?: playlist.name,
                    coverPath = coverTrack?.coverPath,
                    coverVersion = coverTrack?.updatedAt,
                    size = 112.dp,
                )
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "歌单",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = playlist.name,
                        style = MaterialTheme.typography.headlineSmall,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    playlist.description?.takeIf { it.isNotBlank() }?.let { description ->
                        Text(
                            text = description,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = listOfNotNull(
                            "${playlist.trackCount} 首",
                            totalSeconds.takeIf { it > 0 }?.let { formatTotal(it) },
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        item(key = "actions") {
            Row(
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Button(modifier = Modifier.weight(1f), enabled = canPlay, onClick = { onPlay(PlaybackQueueMode.Sequence) }) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("播放")
                }
                FilledTonalButton(modifier = Modifier.weight(1f), enabled = canPlay, onClick = { onPlay(PlaybackQueueMode.Shuffle) }) {
                    Icon(Icons.Default.Shuffle, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("随机播放")
                }
                Box {
                    IconButton(onClick = { moreOpen = true }) {
                        Icon(Icons.Default.MoreVert, contentDescription = "更多播放方式")
                    }
                    DropdownMenu(expanded = moreOpen, onDismissRequest = { moreOpen = false }) {
                        DropdownMenuItem(
                            enabled = canPlay,
                            leadingIcon = { Icon(Icons.Default.SwapVert, contentDescription = null) },
                            text = { Text("倒序播放") },
                            onClick = {
                                moreOpen = false
                                onPlay(PlaybackQueueMode.Reverse)
                            },
                        )
                    }
                }
            }
        }
        if (!isNetworkAvailable) {
            item(key = "offline") {
                Banner(
                    modifier = Modifier.padding(horizontal = 8.dp),
                    tone = BannerTone.Warning,
                    text = "歌单连续播放需要网络。已缓存的单曲可以在「离线」里播放。",
                )
            }
        }
        if (errorMessage != null) {
            item(key = "error") {
                Banner(modifier = Modifier.padding(8.dp), text = errorMessage, tone = BannerTone.Error)
            }
        }
        if (sortedTracks.isEmpty()) {
            item(key = "empty") {
                EmptyState(
                    icon = Icons.Default.MusicNote,
                    title = "歌单里还没有音轨",
                    message = "在 Web 管理端把音轨加入这个歌单后，下拉刷新。",
                )
            }
        } else {
            itemsIndexed(items = sortedTracks, key = { _, item -> item.track.id }) { index, item ->
                val track = item.track
                val isCurrent = playbackSummary.currentTrackId == track.id
                TrackListRow(
                    trackId = track.id,
                    title = track.title,
                    subtitle = listOfNotNull(track.subtitle(), track.durationSeconds?.formatDuration()).joinToString(" · "),
                    coverPath = track.coverPath,
                    coverVersion = track.updatedAt,
                    leadingLabel = "${index + 1}",
                    isCurrent = isCurrent,
                    isPlaying = isCurrent && playbackSummary.status == PlaybackStatus.Playing,
                    dimmed = !track.isReady,
                    onClick = { if (track.isReady) onTrackClick(track) },
                    badges = if (!track.isReady) {
                        { StatusPill(text = formatTrackStatus(track.status), tone = PillTone.Warn) }
                    } else {
                        null
                    },
                )
            }
            item(key = "hint") {
                Text(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    text = "点一首歌会从这首开始播放歌单。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun formatTotal(totalSeconds: Int): String {
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    return if (hours > 0) "$hours 小时 $minutes 分钟" else "$minutes 分钟"
}

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
