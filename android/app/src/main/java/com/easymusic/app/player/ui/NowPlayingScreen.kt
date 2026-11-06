package com.easymusic.app.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.MusicOff
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlaybackQueueItem
import com.easymusic.app.player.domain.PlaybackQueueMode
import com.easymusic.app.player.domain.PlaybackQueueSourceType
import com.easymusic.app.player.domain.PlaybackSource
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlayerUiState
import com.easymusic.app.player.domain.canSkipToNext
import com.easymusic.app.player.domain.canSkipToPrevious
import com.easymusic.app.ui.components.Banner
import com.easymusic.app.ui.components.BannerTone
import com.easymusic.app.ui.components.EmptyState
import com.easymusic.app.ui.components.LevelMeter
import com.easymusic.app.ui.components.PillTone
import com.easymusic.app.ui.components.StatusPill
import com.easymusic.app.ui.components.TagChip
import com.easymusic.app.ui.components.TrackArtwork
import com.easymusic.app.ui.components.formatPlaybackTime
import com.easymusic.app.ui.components.subtitle
import com.easymusic.app.ui.theme.EasyMusicThemeTokens

@Composable
fun NowPlayingScreen(
    uiState: PlayerUiState,
    isNetworkAvailable: Boolean,
    onBackToLibrary: () -> Unit,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onSeekTo: (Long) -> Unit,
    onRemoveQueueItem: (String) -> Unit,
    onClearQueue: () -> Unit,
    onMoveUpcomingItem: (String, Int) -> Unit,
    onSetRepeatPlaylist: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val track = uiState.track
    var showClearQueueConfirm by remember { mutableStateOf(false) }

    if (track == null) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            EmptyState(
                icon = Icons.Default.MusicOff,
                title = "还没有在播放的音轨",
                message = "在曲库、歌单或推荐里点一首歌开始播放。",
                action = {
                    TextButton(onClick = onBackToLibrary) { Text("去曲库") }
                },
            )
        }
        return
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item(key = "hero") {
            NowPlayingHero(track = track, uiState = uiState, isNetworkAvailable = isNetworkAvailable)
        }

        if (uiState.errorMessage != null) {
            item(key = "error") {
                Banner(text = uiState.errorMessage, tone = BannerTone.Error)
            }
        }

        item(key = "seek") {
            SeekBar(
                positionMs = uiState.positionMs,
                durationMs = uiState.durationMs.takeIf { it > 0L }
                    ?: (track.durationSeconds?.times(1000L) ?: 0L),
                onSeekTo = onSeekTo,
            )
        }

        item(key = "controls") {
            TransportControls(
                uiState = uiState,
                canPlayCurrentTrack = track.isReady &&
                    (isNetworkAvailable || uiState.playbackSource == PlaybackSource.OfflineCache),
                onPlay = onPlay,
                onPause = onPause,
                onPrevious = onPrevious,
                onNext = onNext,
            )
        }

        item(key = "queue-header") {
            QueueHeader(
                uiState = uiState,
                onClearQueueRequest = { showClearQueueConfirm = true },
                onSetRepeatPlaylist = onSetRepeatPlaylist,
            )
        }

        if (uiState.upcoming.isEmpty()) {
            item(key = "queue-empty") {
                Text(
                    text = if (uiState.repeatPlaylist) {
                        "播完后会从头再放一遍这个歌单。"
                    } else {
                        "后面没有更多音轨了。在曲库里用「⋮ → 加入队列」添加。"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            itemsIndexed(
                items = uiState.upcoming,
                key = { _, item -> item.queueItemId },
            ) { index, item ->
                QueueRow(
                    item = item,
                    position = index + 1,
                    canMoveUp = index > 0,
                    canMoveDown = index < uiState.upcoming.lastIndex,
                    onMove = { direction ->
                        val targetIndex = (index + direction).coerceIn(0, uiState.upcoming.lastIndex)
                        if (targetIndex != index) {
                            onMoveUpcomingItem(item.queueItemId, targetIndex)
                        }
                    },
                    onRemove = { onRemoveQueueItem(item.queueItemId) },
                )
            }
        }
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
                    Text("清空并停止", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showClearQueueConfirm = false }) {
                    Text("取消")
                }
            },
            title = { Text("清空播放队列？") },
            text = { Text("当前播放会停止，已排队的音轨都会被移除。") },
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
        onPrevious = viewModel::previous,
        onNext = viewModel::next,
        onSeekTo = viewModel::seekTo,
        onRemoveQueueItem = viewModel::removeQueueItem,
        onClearQueue = viewModel::clearQueue,
        onMoveUpcomingItem = viewModel::moveUpcomingItem,
        onSetRepeatPlaylist = viewModel::setRepeatPlaylist,
    )
}

@Composable
private fun NowPlayingHero(
    track: TrackResponse,
    uiState: PlayerUiState,
    isNetworkAvailable: Boolean,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        TrackArtwork(
            trackId = track.id,
            title = track.title,
            artist = track.artist,
            coverPath = track.coverPath,
            coverVersion = track.updatedAt,
            size = 240.dp,
        )
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (uiState.isPlaying) {
                    LevelMeter(isPlaying = true, height = 16.dp)
                }
                Text(
                    text = track.title,
                    style = MaterialTheme.typography.headlineSmall,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = track.subtitle(),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            StatusPill(
                text = when {
                    uiState.playbackSource == PlaybackSource.OfflineCache -> "离线缓存"
                    isNetworkAvailable -> "在线播放"
                    else -> "离线时无法在线播放"
                },
                tone = when {
                    uiState.playbackSource == PlaybackSource.OfflineCache -> PillTone.Ok
                    isNetworkAvailable -> PillTone.Info
                    else -> PillTone.Error
                },
            )
            StatusPill(
                text = if (uiState.queueMode == null) {
                    uiState.queueSourceLabel()
                } else {
                    "${uiState.queueSourceLabel()} · ${uiState.queueMode.modeLabel()}"
                },
                tone = PillTone.Neutral,
                showDot = false,
            )
            if (uiState.status == PlaybackStatus.Buffering) {
                StatusPill(text = "缓冲中", tone = PillTone.Warn)
            }
        }
        if (track.tags.isNotEmpty()) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                track.tags.take(6).forEach { tag -> TagChip(name = tag.name, group = tag.group) }
            }
        }
    }
}

@Composable
private fun SeekBar(
    positionMs: Long,
    durationMs: Long,
    onSeekTo: (Long) -> Unit,
) {
    var dragValue by remember { mutableStateOf<Float?>(null) }
    val safeDuration = durationMs.coerceAtLeast(1L).toFloat()
    val shownPosition = dragValue ?: positionMs.toFloat().coerceIn(0f, safeDuration)
    val colors = EasyMusicThemeTokens.colors

    Column {
        Slider(
            value = shownPosition,
            onValueChange = { value -> dragValue = value },
            onValueChangeFinished = {
                dragValue?.let { onSeekTo(it.toLong()) }
                dragValue = null
            },
            valueRange = 0f..safeDuration,
            enabled = durationMs > 0L,
            colors = SliderDefaults.colors(
                thumbColor = MaterialTheme.colorScheme.primary,
                activeTrackColor = colors.signal,
                inactiveTrackColor = MaterialTheme.colorScheme.surfaceContainerHighest,
            ),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = shownPosition.toLong().formatPlaybackTime(),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = durationMs.formatPlaybackTime(),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun TransportControls(
    uiState: PlayerUiState,
    canPlayCurrentTrack: Boolean,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(28.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(
            modifier = Modifier.size(52.dp),
            enabled = uiState.canSkipToPrevious(),
            onClick = onPrevious,
        ) {
            Icon(Icons.Default.SkipPrevious, contentDescription = "上一首", modifier = Modifier.size(32.dp))
        }
        FilledIconButton(
            modifier = Modifier.size(72.dp),
            enabled = uiState.isPlaying || canPlayCurrentTrack,
            onClick = if (uiState.isPlaying) onPause else onPlay,
            colors = IconButtonDefaults.filledIconButtonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ),
        ) {
            if (uiState.status == PlaybackStatus.Buffering) {
                CircularProgressIndicator(
                    modifier = Modifier.size(28.dp),
                    strokeWidth = 3.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            } else {
                Icon(
                    imageVector = if (uiState.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = when {
                        uiState.isPlaying -> "暂停"
                        uiState.status == PlaybackStatus.Ended -> "重新播放"
                        else -> "播放"
                    },
                    modifier = Modifier.size(38.dp),
                )
            }
        }
        IconButton(
            modifier = Modifier.size(52.dp),
            enabled = uiState.canSkipToNext(),
            onClick = onNext,
        ) {
            Icon(Icons.Default.SkipNext, contentDescription = "下一首", modifier = Modifier.size(32.dp))
        }
    }
}

@Composable
private fun QueueHeader(
    uiState: PlayerUiState,
    onClearQueueRequest: () -> Unit,
    onSetRepeatPlaylist: (Boolean) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Spacer(modifier = Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = "接下来", style = MaterialTheme.typography.titleMedium)
                Text(
                    text = "已播 ${uiState.history.size} 首 · 待播 ${uiState.upcoming.size} 首",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = onClearQueueRequest) {
                Icon(Icons.Default.DeleteSweep, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("清空")
            }
        }
        if (uiState.queueSource?.type == PlaybackQueueSourceType.Playlist) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MaterialTheme.shapes.medium)
                    .background(MaterialTheme.colorScheme.surfaceContainer)
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(Icons.Default.Repeat, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = "歌单循环", style = MaterialTheme.typography.titleSmall)
                    Text(
                        text = if (uiState.baseCycleItems.isEmpty()) {
                            "这个歌单没有可播放的音轨。"
                        } else {
                            "播完后从头再来；手动插入的音轨只播一次。"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = uiState.repeatPlaylist,
                    enabled = uiState.baseCycleItems.isNotEmpty(),
                    onCheckedChange = onSetRepeatPlaylist,
                )
            }
        }
    }
}

@Composable
private fun QueueRow(
    item: PlaybackQueueItem,
    position: Int,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onMove: (Int) -> Unit,
    onRemove: () -> Unit,
) {
    val dragThresholdPx = with(LocalDensity.current) { 56.dp.toPx() }
    var dragOffset by remember(item.queueItemId) { mutableFloatStateOf(0f) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .padding(start = 4.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Default.DragHandle,
            contentDescription = "拖动调整顺序",
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .size(40.dp)
                .padding(8.dp)
                .pointerInput(item.queueItemId) {
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
                },
        )
        TrackArtwork(
            trackId = item.track.id,
            title = item.track.title,
            artist = item.track.artist,
            coverPath = item.track.coverPath,
            coverVersion = item.track.updatedAt,
            size = 40.dp,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.track.title,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "$position · ${item.track.subtitle()}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(enabled = canMoveUp, onClick = { onMove(-1) }, modifier = Modifier.size(36.dp)) {
            Icon(Icons.Default.ArrowUpward, contentDescription = "上移", modifier = Modifier.size(18.dp))
        }
        IconButton(enabled = canMoveDown, onClick = { onMove(1) }, modifier = Modifier.size(36.dp)) {
            Icon(Icons.Default.ArrowDownward, contentDescription = "下移", modifier = Modifier.size(18.dp))
        }
        IconButton(onClick = onRemove, modifier = Modifier.size(36.dp)) {
            Icon(Icons.Default.Close, contentDescription = "从队列移除", modifier = Modifier.size(18.dp))
        }
    }
}

private fun PlayerUiState.queueSourceLabel(): String =
    when (queueSource?.type) {
        PlaybackQueueSourceType.Playlist -> queueSource.playlistName ?: "歌单"
        PlaybackQueueSourceType.SingleTrack -> "单曲"
        PlaybackQueueSourceType.Manual -> "手动队列"
        PlaybackQueueSourceType.Recommendation -> "推荐"
        null -> "临时队列"
    }

private fun PlaybackQueueMode?.modeLabel(): String =
    when (this) {
        PlaybackQueueMode.Sequence -> "顺序"
        PlaybackQueueMode.Shuffle -> "随机"
        PlaybackQueueMode.Reverse -> "倒序"
        null -> "单曲"
    }
