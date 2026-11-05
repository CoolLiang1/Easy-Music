package com.easymusic.app.library.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.PlaylistAdd
import androidx.compose.material.icons.automirrored.filled.PlaylistPlay
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.OfflinePin
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.easymusic.app.cache.domain.CacheStatus
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlaybackStateStore
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlaybackUiSummary
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.domain.TrackPlaybackLauncher
import com.easymusic.app.player.domain.toPlaybackUiSummary
import com.easymusic.app.ui.LocalShowMessage
import com.easymusic.app.ui.components.Banner
import com.easymusic.app.ui.components.BannerTone
import com.easymusic.app.ui.components.EmptyState
import com.easymusic.app.ui.components.LoadingState
import com.easymusic.app.ui.components.PillTone
import com.easymusic.app.ui.components.RowPlayButton
import com.easymusic.app.ui.components.StatusPill
import com.easymusic.app.ui.components.TrackListRow
import com.easymusic.app.ui.components.formatDuration
import com.easymusic.app.ui.components.formatTrackStatus
import com.easymusic.app.ui.components.isProcessingStatus
import com.easymusic.app.ui.components.subtitle
import com.easymusic.app.ui.theme.EasyMusicThemeTokens
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    uiState: LibraryUiState,
    onFilterModeChanged: (Boolean) -> Unit,
    onRefresh: () -> Unit,
    onSearchQueryChanged: (String) -> Unit,
    onTrackSelected: (TrackResponse) -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    var selectedTrackId by rememberSaveable { mutableStateOf<Int?>(null) }
    var quickFilter by rememberSaveable { mutableStateOf(LibraryQuickFilter.All) }
    val context = LocalContext.current
    val showMessage = LocalShowMessage.current
    val scope = rememberCoroutineScope()
    val launcher = remember(context) { TrackPlaybackLauncher.create(context) }
    val playerController = remember(context) { PlayerController(context) }
    val playbackSummary by remember {
        PlaybackStateStore.state
            .map { state -> state.toPlaybackUiSummary() }
            .distinctUntilChanged()
    }.collectAsState(initial = PlaybackUiSummary())

    BackHandler(enabled = selectedTrackId != null) { selectedTrackId = null }

    selectedTrackId?.let { trackId ->
        TrackDetailRoute(
            trackId = trackId,
            onBackToLibrary = { selectedTrackId = null },
            onOpenNowPlaying = onTrackSelected,
            isNetworkAvailable = isNetworkAvailable,
            modifier = modifier.fillMaxSize(),
        )
        return
    }

    val counts = remember(uiState.tracks, uiState.cacheStatesByTrackId) {
        LibraryQuickFilter.entries.associateWith { filter ->
            uiState.tracks.count { track -> track.matchesQuickFilter(filter, uiState.cacheStatesByTrackId) }
        }
    }
    val searchVisible = remember(uiState.tracks, uiState.searchQuery, uiState.isFilterModeEnabled) {
        visibleLibraryTracks(
            tracks = uiState.tracks,
            searchQuery = uiState.searchQuery,
            isFilterModeEnabled = uiState.isFilterModeEnabled,
        )
    }
    val visibleTracks = remember(searchVisible, quickFilter, uiState.cacheStatesByTrackId) {
        searchVisible.filter { track -> track.matchesQuickFilter(quickFilter, uiState.cacheStatesByTrackId) }
    }
    val highlightIds = remember(uiState.tracks, uiState.searchQuery, uiState.isFilterModeEnabled) {
        if (uiState.isFilterModeEnabled) emptySet() else matchingLibraryTrackIds(uiState.tracks, uiState.searchQuery)
    }
    val listState = rememberLazyListState()

    LaunchedEffect(highlightIds) {
        val firstMatch = visibleTracks.indexOfFirst { it.id in highlightIds }
        if (firstMatch >= 0) listState.animateScrollToItem(firstMatch)
    }

    val playTrack: (TrackResponse) -> Unit = { track ->
        if (playbackSummary.currentTrackId == track.id) {
            if (playbackSummary.status == PlaybackStatus.Playing) {
                playerController.pause()
            } else {
                playerController.resume()
            }
        } else {
            scope.launch {
                launcher.play(track, isNetworkAvailable).message?.let(showMessage)
            }
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        if (uiState.tracks.isNotEmpty()) {
            LibraryControls(
                searchQuery = uiState.searchQuery,
                isFilterModeEnabled = uiState.isFilterModeEnabled,
                matchCount = if (uiState.isFilterModeEnabled) searchVisible.size else highlightIds.size,
                quickFilter = quickFilter,
                counts = counts,
                onSearchQueryChanged = onSearchQueryChanged,
                onFilterModeChanged = onFilterModeChanged,
                onQuickFilterChanged = { quickFilter = it },
            )
        }

        PullToRefreshBox(
            modifier = Modifier.weight(1f),
            isRefreshing = uiState.isRefreshing,
            onRefresh = onRefresh,
        ) {
            when {
                uiState.isLoading -> LoadingState(text = "正在加载曲库…")
                uiState.errorMessage != null && uiState.tracks.isEmpty() -> EmptyState(
                    icon = if (isNetworkAvailable) Icons.Default.Info else Icons.Default.CloudOff,
                    title = if (uiState.needsSignIn) "需要重新登录" else "曲库加载失败",
                    message = uiState.errorMessage,
                    action = {
                        Button(enabled = isNetworkAvailable, onClick = onRefresh) { Text("重试") }
                    },
                )

                uiState.tracks.isEmpty() -> EmptyState(
                    icon = Icons.Default.LibraryMusic,
                    title = "曲库还是空的",
                    message = "在 Web 管理端上传或导入音频，处理完成后会出现在这里。下拉即可刷新。",
                    action = { OutlinedButton(onClick = onRefresh) { Text("刷新") } },
                )

                visibleTracks.isEmpty() -> EmptyState(
                    icon = Icons.Default.SearchOff,
                    title = "没有符合条件的音轨",
                    message = "换个关键词，或切回「全部」。",
                    action = {
                        OutlinedButton(
                            onClick = {
                                onSearchQueryChanged("")
                                quickFilter = LibraryQuickFilter.All
                            },
                        ) { Text("清除筛选") }
                    },
                )

                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    state = listState,
                    contentPadding = PaddingValues(start = 8.dp, end = 8.dp, bottom = 16.dp),
                ) {
                    if (uiState.errorMessage != null) {
                        item(key = "error") {
                            Banner(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                text = uiState.errorMessage,
                                tone = BannerTone.Error,
                            )
                        }
                    }
                    items(items = visibleTracks, key = { track -> track.id }) { track ->
                        LibraryTrackRow(
                            track = track,
                            cacheState = uiState.cacheStatesByTrackId[track.id],
                            playbackSummary = playbackSummary,
                            highlighted = track.id in highlightIds,
                            onPlay = { playTrack(track) },
                            onOpenDetail = { selectedTrackId = track.id },
                            onPlayNext = {
                                scope.launch {
                                    launcher.playNext(track, isNetworkAvailable).message?.let(showMessage)
                                }
                            },
                            onAddToQueue = {
                                scope.launch {
                                    launcher.addToQueue(track, isNetworkAvailable).message?.let(showMessage)
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LibraryControls(
    searchQuery: String,
    isFilterModeEnabled: Boolean,
    matchCount: Int,
    quickFilter: LibraryQuickFilter,
    counts: Map<LibraryQuickFilter, Int>,
    onSearchQueryChanged: (String) -> Unit,
    onFilterModeChanged: (Boolean) -> Unit,
    onQuickFilterChanged: (LibraryQuickFilter) -> Unit,
) {
    Column(
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 4.dp),
    ) {
        OutlinedTextField(
            value = searchQuery,
            onValueChange = onSearchQueryChanged,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("搜索标题、艺人或专辑") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon = {
                if (searchQuery.isNotEmpty()) {
                    IconButton(onClick = { onSearchQueryChanged("") }) {
                        Icon(Icons.Default.Close, contentDescription = "清除搜索")
                    }
                }
            },
            singleLine = true,
            shape = CircleShape,
            colors = OutlinedTextFieldDefaults.colors(
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainer,
                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainer,
                unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
            ),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Switch(checked = isFilterModeEnabled, onCheckedChange = onFilterModeChanged)
            Text(
                modifier = Modifier
                    .padding(start = 10.dp)
                    .weight(1f),
                text = "只显示匹配项",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (searchQuery.isNotBlank()) {
                Text(
                    text = when {
                        matchCount == 0 -> "没有匹配"
                        isFilterModeEnabled -> "找到 $matchCount 首"
                        else -> "高亮 $matchCount 首"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(top = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            LibraryQuickFilter.entries
                .filter { filter ->
                    filter == LibraryQuickFilter.All || filter == quickFilter || (counts[filter] ?: 0) > 0
                }
                .forEach { filter ->
                    FilterChip(
                        selected = quickFilter == filter,
                        onClick = { onQuickFilterChanged(filter) },
                        label = { Text("${filter.label} ${counts[filter] ?: 0}") },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primary,
                            selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                        ),
                    )
                }
        }
    }
}

@Composable
private fun LibraryTrackRow(
    track: TrackResponse,
    cacheState: LibraryCacheUiState?,
    playbackSummary: PlaybackUiSummary,
    highlighted: Boolean,
    onPlay: () -> Unit,
    onOpenDetail: () -> Unit,
    onPlayNext: () -> Unit,
    onAddToQueue: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val isCurrent = playbackSummary.currentTrackId == track.id
    val isPlaying = isCurrent && playbackSummary.status == PlaybackStatus.Playing
    val extended = EasyMusicThemeTokens.colors

    TrackListRow(
        trackId = track.id,
        title = track.title,
        subtitle = listOfNotNull(
            track.subtitle(),
            track.durationSeconds?.formatDuration(),
        ).joinToString(" · "),
        coverPath = track.coverPath,
        coverVersion = track.updatedAt,
        isCurrent = isCurrent,
        isPlaying = isPlaying,
        highlighted = highlighted,
        dimmed = !track.isReady,
        onClick = { if (track.isReady) onPlay() else onOpenDetail() },
        onLongClick = { menuOpen = true },
        badges = {
            if (!track.isReady) {
                StatusPill(
                    text = formatTrackStatus(track.status),
                    tone = if (track.status.isProcessingStatus()) PillTone.Warn else PillTone.Error,
                )
            }
            if (cacheState?.status == CacheStatus.Cached) {
                Icon(
                    Icons.Default.OfflinePin,
                    contentDescription = "已缓存",
                    tint = extended.ok,
                    modifier = Modifier.size(15.dp),
                )
            }
            if (track.liked) {
                Icon(
                    Icons.Default.Favorite,
                    contentDescription = "喜欢",
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(14.dp),
                )
            }
        },
        trailing = {
            Box {
                IconButton(onClick = { menuOpen = true }) {
                    Icon(Icons.Default.MoreVert, contentDescription = "「${track.title}」的更多操作")
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(
                        enabled = track.isReady,
                        leadingIcon = { Icon(Icons.AutoMirrored.Filled.PlaylistPlay, contentDescription = null) },
                        text = { Text("下一首播放") },
                        onClick = {
                            menuOpen = false
                            onPlayNext()
                        },
                    )
                    DropdownMenuItem(
                        enabled = track.isReady,
                        leadingIcon = { Icon(Icons.AutoMirrored.Filled.PlaylistAdd, contentDescription = null) },
                        text = { Text("加入播放队列") },
                        onClick = {
                            menuOpen = false
                            onAddToQueue()
                        },
                    )
                    DropdownMenuItem(
                        leadingIcon = { Icon(Icons.Default.Info, contentDescription = null) },
                        text = { Text("详情与离线缓存") },
                        onClick = {
                            menuOpen = false
                            onOpenDetail()
                        },
                    )
                }
            }
            RowPlayButton(
                isCurrent = isCurrent,
                isPlaying = isPlaying,
                enabled = track.isReady,
                contentDescription = if (isPlaying) "暂停「${track.title}」" else "播放「${track.title}」",
                onClick = onPlay,
            )
        },
    )
}

private fun TrackResponse.matchesQuickFilter(
    filter: LibraryQuickFilter,
    cacheStates: Map<Int, LibraryCacheUiState>,
): Boolean =
    when (filter) {
        LibraryQuickFilter.All -> true
        LibraryQuickFilter.Ready -> isReady
        LibraryQuickFilter.Cached -> cacheStates[id]?.status == CacheStatus.Cached
        LibraryQuickFilter.Liked -> liked
        LibraryQuickFilter.Processing -> status.isProcessingStatus()
    }
