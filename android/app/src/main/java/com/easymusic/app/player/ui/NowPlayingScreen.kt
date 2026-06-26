package com.easymusic.app.player.ui

import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.CloudQueue
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.OfflinePin
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlaybackQueueItem
import com.easymusic.app.player.domain.PlaybackQueueMode
import com.easymusic.app.player.domain.PlaybackQueueSourceType
import com.easymusic.app.player.domain.PlaybackSource
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlayerUiState
import com.easymusic.app.ui.theme.BannerTone
import com.easymusic.app.ui.theme.SectionHeader
import com.easymusic.app.ui.theme.StatusBanner

@Composable
fun NowPlayingScreen(
    uiState: PlayerUiState,
    isNetworkAvailable: Boolean,
    onBackToLibrary: () -> Unit,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onSeekTo: (Long) -> Unit,
    onRemoveQueueItem: (String) -> Unit,
    onClearQueue: () -> Unit,
    onMoveUpcomingItem: (String, Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val track = uiState.track
    var showClearQueueConfirm by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        SectionHeader(
            title = "播放中",
            subtitle = uiState.playbackSource.sourceLabel(isNetworkAvailable),
            action = {
                OutlinedButton(onClick = onBackToLibrary) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("曲库")
                }
            },
        )

        if (track == null) {
            EmptyNowPlaying(onBackToLibrary = onBackToLibrary)
            return@Column
        }

        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                TrackSummary(track = track)

                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AssistChip(
                        onClick = {},
                        label = { Text(uiState.playbackSource.sourceLabel(isNetworkAvailable)) },
                        leadingIcon = {
                            Icon(
                                imageVector = if (uiState.playbackSource == PlaybackSource.OfflineCache) {
                                    Icons.Default.OfflinePin
                                } else {
                                    Icons.Default.CloudQueue
                                },
                                contentDescription = null,
                            )
                        },
                        enabled = uiState.playbackSource == PlaybackSource.OfflineCache ||
                            isNetworkAvailable,
                    )
                    AssistChip(
                        onClick = {},
                        label = { Text(uiState.queueMode.modeLabel()) },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.QueueMusic,
                                contentDescription = null,
                            )
                        },
                        enabled = true,
                    )
                }
            }
        }

        if (uiState.status == PlaybackStatus.Buffering) {
            StatusBanner(
                text = "正在缓冲音频",
                tone = BannerTone.Warning,
                action = { CircularProgressIndicator() },
            )
        }

        if (uiState.errorMessage != null) {
            StatusBanner(
                text = uiState.errorMessage,
                tone = BannerTone.Error,
            )
        }

        PlaybackPosition(
            positionMs = uiState.positionMs,
            durationMs = uiState.durationMs,
            onSeekTo = onSeekTo,
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                enabled = track.isReady &&
                    !uiState.isPlaying &&
                    (isNetworkAvailable || uiState.playbackSource == PlaybackSource.OfflineCache),
                onClick = onPlay,
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(if (uiState.status == PlaybackStatus.Ended) "重新播放" else "播放")
            }
            OutlinedButton(
                enabled = uiState.isPlaying,
                onClick = onPause,
            ) {
                Icon(
                    imageVector = Icons.Default.Pause,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("暂停")
            }
        }

        QueueManagementSection(
            uiState = uiState,
            onClearQueueRequest = { showClearQueueConfirm = true },
            onMoveUpcomingItem = onMoveUpcomingItem,
            onRemoveQueueItem = onRemoveQueueItem,
        )
    }

    if (showClearQueueConfirm) {
        AlertDialog(
            onDismissRequest = { showClearQueueConfirm = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        showClearQueueConfirm = false
                        onClearQueue()
                    },
                ) {
                    Text("清空")
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearQueueConfirm = false }) {
                    Text("取消")
                }
            },
            title = { Text("清空播放队列？") },
            text = { Text("当前播放会停止，历史、当前和待播列表都会被清空。") },
        )
    }
}

@Composable
fun NowPlayingRouteContent(
    viewModel: NowPlayingViewModel,
    onBackToLibrary: () -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
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
        isNetworkAvailable = isNetworkAvailable,
        onBackToLibrary = onBackToLibrary,
        onPlay = { viewModel.play(isNetworkAvailable) },
        onPause = viewModel::pause,
        onSeekTo = viewModel::seekTo,
        onRemoveQueueItem = viewModel::removeQueueItem,
        onClearQueue = viewModel::clearQueue,
        onMoveUpcomingItem = viewModel::moveUpcomingItem,
    )
}

@Composable
private fun QueueManagementSection(
    uiState: PlayerUiState,
    onClearQueueRequest: () -> Unit,
    onMoveUpcomingItem: (String, Int) -> Unit,
    onRemoveQueueItem: (String) -> Unit,
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "播放队列",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = uiState.queueSummary(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                OutlinedButton(
                    enabled = uiState.currentQueueItem != null ||
                        uiState.history.isNotEmpty() ||
                        uiState.upcoming.isNotEmpty(),
                    onClick = onClearQueueRequest,
                ) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("清空")
                }
            }

            QueueMetadata(uiState = uiState)

            Text(
                text = "正在播放",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
            )
            val currentItem = uiState.currentQueueItem
            if (currentItem == null) {
                Text(
                    text = "暂无当前音轨。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                QueueItemCard(
                    item = currentItem,
                    indexLabel = "当前",
                    draggable = false,
                    onMove = {},
                    onRemove = { onRemoveQueueItem(currentItem.queueItemId) },
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "即将播放",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = "${uiState.upcoming.size} 首",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (uiState.upcoming.isEmpty()) {
                Text(
                    text = "队列后面还没有音轨。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                uiState.upcoming.forEachIndexed { index, item ->
                    QueueItemCard(
                        item = item,
                        indexLabel = "${index + 1}",
                        draggable = true,
                        onMove = { direction ->
                            val targetIndex = (index + direction)
                                .coerceIn(0, uiState.upcoming.lastIndex)
                            if (targetIndex != index) {
                                onMoveUpcomingItem(item.queueItemId, targetIndex)
                            }
                        },
                        onRemove = { onRemoveQueueItem(item.queueItemId) },
                    )
                }
            }
        }
    }
}

@Composable
private fun QueueMetadata(uiState: PlayerUiState) {
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AssistChip(
            onClick = {},
            label = { Text(uiState.queueSourceLabel()) },
            enabled = true,
        )
        AssistChip(
            onClick = {},
            label = { Text(uiState.queueMode.modeLabel()) },
            enabled = true,
        )
        AssistChip(
            onClick = {},
            label = { Text("已播 ${uiState.history.size}") },
            enabled = true,
        )
        AssistChip(
            onClick = {},
            label = { Text("待播 ${uiState.upcoming.size}") },
            enabled = true,
        )
        AssistChip(
            onClick = {},
            label = { Text(if (uiState.repeatPlaylist) "重复已开启" else "重复未开启") },
            enabled = true,
        )
    }
}

@Composable
private fun QueueItemCard(
    item: PlaybackQueueItem,
    indexLabel: String,
    draggable: Boolean,
    onMove: (Int) -> Unit,
    onRemove: () -> Unit,
) {
    val dragThresholdPx = with(LocalDensity.current) { 56.dp.toPx() }
    var dragOffset by remember(item.queueItemId) { mutableFloatStateOf(0f) }
    val dragModifier = if (draggable) {
        Modifier.pointerInput(item.queueItemId) {
            detectDragGestures(
                onDragEnd = { dragOffset = 0f },
                onDragCancel = { dragOffset = 0f },
                onDrag = { change, dragAmount ->
                    change.consume()
                    dragOffset += dragAmount.y
                    when {
                        dragOffset >= dragThresholdPx -> {
                            onMove(1)
                            dragOffset = 0f
                        }

                        dragOffset <= -dragThresholdPx -> {
                            onMove(-1)
                            dragOffset = 0f
                        }
                    }
                },
            )
        }
    } else {
        Modifier
    }

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .then(dragModifier),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (draggable) {
                Icon(
                    imageVector = Icons.Default.DragHandle,
                    contentDescription = "拖动调整顺序",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = indexLabel,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.width(42.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.track.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = item.track.subtitle(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            OutlinedButton(onClick = onRemove) {
                Text("移除")
            }
        }
    }
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
                text = "还没有加载音轨",
                style = MaterialTheme.typography.titleLarge,
            )
            Button(
                modifier = Modifier.padding(top = 16.dp),
                onClick = onBackToLibrary,
            ) {
                Text("返回曲库")
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
            text = track.subtitle(),
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

private fun PlayerUiState.queueSummary(): String =
    "${queueSourceLabel()} · ${queueMode.modeLabel()} · 已播 ${history.size} · 待播 ${upcoming.size}"

private fun PlayerUiState.queueSourceLabel(): String =
    when (queueSource?.type) {
        PlaybackQueueSourceType.Playlist -> queueSource.playlistName ?: "歌单队列"
        PlaybackQueueSourceType.SingleTrack -> "单曲播放"
        PlaybackQueueSourceType.Manual -> "手动队列"
        PlaybackQueueSourceType.Recommendation -> "推荐播放"
        null -> "临时队列"
    }

private fun PlaybackQueueMode?.modeLabel(): String =
    when (this) {
        PlaybackQueueMode.Sequence -> "顺序"
        PlaybackQueueMode.Shuffle -> "随机一次"
        PlaybackQueueMode.Reverse -> "倒序"
        null -> "单曲"
    }

private fun TrackResponse.subtitle(): String =
    listOfNotNull(artist, album)
        .filter { it.isNotBlank() }
        .joinToString(separator = " - ")
        .ifBlank { "未知艺人或专辑" }

private fun Long.formatTime(): String {
    val totalSeconds = (this / 1_000).coerceAtLeast(0L)
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "$minutes:${seconds.toString().padStart(2, '0')}"
}

private fun PlaybackSource.sourceLabel(isNetworkAvailable: Boolean): String =
    when (this) {
        PlaybackSource.OfflineCache -> "离线缓存播放"
        PlaybackSource.OnlineStream -> if (isNetworkAvailable) {
            "在线播放"
        } else {
            "离线时无法在线播放"
        }
    }
