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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import com.easymusic.app.library.data.LIBRARY_PAGE_SIZE
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.library.data.TrackSortField
import com.easymusic.app.library.data.TrackSortOrder
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
    onSearchQueryChanged: (String) -> Unit,
    onStatusFilterChanged: (String) -> Unit,
    onLikedFilterChanged: (Boolean?) -> Unit,
    onContentTypeFilterChanged: (String) -> Unit,
    onTagFilterChanged: (Int?) -> Unit,
    onSortChanged: (TrackSortField) -> Unit,
    onToggleSortOrder: () -> Unit,
    onClearQuery: () -> Unit,
    onPreviousPage: () -> Unit,
    onNextPage: () -> Unit,
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

        if (uiState.tracks.isNotEmpty()) {
            Spacer(modifier = Modifier.height(12.dp))
            LibraryStats(
                tracks = uiState.tracks,
                cacheStatesByTrackId = uiState.cacheStatesByTrackId,
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        if (!uiState.isLoading) {
            LibraryFilterControls(
                uiState = uiState,
                onSearchQueryChanged = onSearchQueryChanged,
                onStatusFilterChanged = onStatusFilterChanged,
                onLikedFilterChanged = onLikedFilterChanged,
                onContentTypeFilterChanged = onContentTypeFilterChanged,
                onTagFilterChanged = onTagFilterChanged,
                onSortChanged = onSortChanged,
                onToggleSortOrder = onToggleSortOrder,
                onClearQuery = onClearQuery,
                onPreviousPage = onPreviousPage,
                onNextPage = onNextPage,
            )

            Spacer(modifier = Modifier.height(12.dp))
        }

        Column(modifier = Modifier.weight(1f)) {
            when {
                uiState.isLoading -> LibraryLoading()
                uiState.errorMessage != null && uiState.tracks.isEmpty() -> LibraryError(
                    message = uiState.errorMessage,
                    onRefresh = onRefresh,
                )

                uiState.tracks.isEmpty() && uiState.activeFilterCount == 0 ->
                    LibraryEmpty(onRefresh = onRefresh)
                uiState.tracks.isEmpty() -> LibrarySearchEmpty(searchQuery = uiState.searchQuery)
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
        subtitle = if (isNetworkAvailable) "浏览云端音轨，检查缓存与播放状态" else "离线时无法刷新云端曲库；已缓存音轨仍可播放",
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
            text = "在 Web 管理端上传或导入音频后，处理完成的音轨会出现在这里。",
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
private fun LibraryStats(
    tracks: List<TrackResponse>,
    cacheStatesByTrackId: Map<Int, LibraryCacheUiState>,
) {
    val readyCount = tracks.count { track -> track.isReady }
    val cachedCount = tracks.count { track ->
        cacheStatesByTrackId[track.id]?.status == CacheStatus.Cached
    }
    val processingCount = tracks.count { track ->
        track.status.equals("processing", ignoreCase = true) ||
            track.status.equals("uploaded", ignoreCase = true)
    }

    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AssistChip(onClick = {}, label = { Text("本页 ${tracks.size}") })
        AssistChip(onClick = {}, label = { Text("可播放 $readyCount") })
        AssistChip(
            onClick = {},
            label = { Text("已缓存 $cachedCount") },
            enabled = cachedCount > 0,
        )
        if (processingCount > 0) {
            AssistChip(onClick = {}, label = { Text("处理中 $processingCount") })
        }
    }
}

@Composable
private fun LibraryFilterControls(
    uiState: LibraryUiState,
    onSearchQueryChanged: (String) -> Unit,
    onStatusFilterChanged: (String) -> Unit,
    onLikedFilterChanged: (Boolean?) -> Unit,
    onContentTypeFilterChanged: (String) -> Unit,
    onTagFilterChanged: (Int?) -> Unit,
    onSortChanged: (TrackSortField) -> Unit,
    onToggleSortOrder: () -> Unit,
    onClearQuery: () -> Unit,
    onPreviousPage: () -> Unit,
    onNextPage: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = uiState.searchQuery,
            onValueChange = onSearchQueryChanged,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("搜索音轨") },
            placeholder = { Text("标题、艺人、专辑或标签") },
            leadingIcon = {
                Icon(
                    imageVector = Icons.Default.Search,
                    contentDescription = null,
                )
            },
            singleLine = true,
        )
        LibraryFilterRow(
            label = "状态",
            options = listOf("" to "全部", "ready" to "可播放", "processing" to "处理中", "failed" to "失败"),
            selected = uiState.statusFilter,
            onSelected = onStatusFilterChanged,
        )
        LibraryFilterRow(
            label = "喜欢",
            options = listOf(null to "全部", true to "已喜欢", false to "未喜欢"),
            selected = uiState.likedFilter,
            onSelected = onLikedFilterChanged,
        )
        LibraryFilterRow(
            label = "类型",
            options = listOf(
                "" to "全部",
                "song" to "歌曲",
                "mix" to "混音/合集",
                "long_audio" to "长音频",
                "white_noise" to "白噪音",
                "ost" to "OST",
                "other" to "其他",
            ),
            selected = uiState.contentTypeFilter,
            onSelected = onContentTypeFilterChanged,
        )
        if (uiState.tags.isNotEmpty()) {
            LibraryFilterRow(
                label = "标签",
                options = listOf(null to "全部") + uiState.tags.map { tag -> tag.id to tag.name },
                selected = uiState.tagIdFilter,
                onSelected = onTagFilterChanged,
            )
        }
        LibraryFilterRow(
            label = "排序",
            options = listOf(
                TrackSortField.CreatedAt to "创建",
                TrackSortField.UpdatedAt to "更新",
                TrackSortField.Title to "标题",
                TrackSortField.Artist to "艺人",
                TrackSortField.Album to "专辑",
                TrackSortField.Duration to "时长",
            ),
            selected = uiState.sort,
            onSelected = onSortChanged,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "第 ${uiState.offset / LIBRARY_PAGE_SIZE + 1} 页 · 本页 ${uiState.tracks.size} 首 · ${uiState.activeFilterCount} 个筛选",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onToggleSortOrder) {
                    Text(if (uiState.sortOrder == TrackSortOrder.Ascending) "升序" else "降序")
                }
                OutlinedButton(
                    enabled = uiState.activeFilterCount > 0 ||
                        uiState.offset > 0 ||
                        uiState.sort != TrackSortField.CreatedAt ||
                        uiState.sortOrder != TrackSortOrder.Ascending,
                    onClick = onClearQuery,
                ) {
                    Text("清除")
                }
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            OutlinedButton(
                enabled = uiState.offset > 0 && !uiState.isRefreshing,
                onClick = onPreviousPage,
            ) {
                Text("上一页")
            }
            OutlinedButton(
                enabled = uiState.hasNextPage && !uiState.isRefreshing,
                onClick = onNextPage,
            ) {
                Text("下一页")
            }
        }
    }
}

@Composable
private fun <T> LibraryFilterRow(
    label: String,
    options: List<Pair<T, String>>,
    selected: T,
    onSelected: (T) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            options.forEach { (value, optionLabel) ->
                FilterChip(
                    selected = selected == value,
                    onClick = { onSelected(value) },
                    label = { Text(optionLabel) },
                )
            }
        }
    }
}

@Composable
private fun LibrarySearchEmpty(searchQuery: String) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "没有匹配的音轨",
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            modifier = Modifier.padding(top = 8.dp),
            text = "当前关键词：${searchQuery.trim()}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
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
        onPrevious = playerController::previous,
        onNext = playerController::next,
        onTick = playerController::updatePosition,
    )
}

private fun TrackResponse.rowPlaybackLabel(
    isCurrentTrack: Boolean,
    status: PlaybackStatus,
): String {
    if (!isCurrentTrack) {
        return if (isReady) "查看详情" else "查看处理状态"
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
