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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
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
import com.easymusic.app.player.domain.PlaybackUiSummary
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.domain.toPlaybackUiSummary
import com.easymusic.app.ui.theme.SectionHeader
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

@Composable
fun TrackDetailRoute(
    trackId: Int,
    onBackToLibrary: () -> Unit,
    onOpenNowPlaying: (TrackResponse) -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
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
            initialNetworkAvailable = isNetworkAvailable,
        )
    }
    val playbackSummary by remember {
        PlaybackStateStore.state
            .map { state -> state.toPlaybackUiSummary() }
            .distinctUntilChanged()
    }.collectAsState(initial = PlaybackUiSummary())

    TrackDetailScreen(
        modifier = modifier,
        uiState = viewModel.uiState,
        playbackSummary = playbackSummary,
        onBackToLibrary = onBackToLibrary,
        onRefresh = { viewModel.refresh(isNetworkAvailable) },
        onOpenNowPlaying = onOpenNowPlaying,
        onCacheTrack = { viewModel.cacheTrack(isNetworkAvailable) },
        onDeleteCachedTrack = viewModel::deleteCachedTrack,
        isNetworkAvailable = isNetworkAvailable,
    )
}

@Composable
fun TrackDetailScreen(
    uiState: TrackDetailUiState,
    playbackSummary: PlaybackUiSummary,
    onBackToLibrary: () -> Unit,
    onRefresh: () -> Unit,
    onOpenNowPlaying: (TrackResponse) -> Unit,
    onCacheTrack: () -> Unit,
    onDeleteCachedTrack: () -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 16.dp),
    ) {
        SectionHeader(
            title = "音轨详情",
            subtitle = if (isNetworkAvailable) "云端元数据和本地离线缓存状态" else "离线时无法获取云端元数据",
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

        Spacer(modifier = Modifier.height(16.dp))

        when {
            uiState.isLoading -> DetailLoading()
            uiState.errorMessage != null -> DetailError(
                kind = uiState.errorKind,
                message = uiState.errorMessage,
                isNetworkAvailable = isNetworkAvailable,
                onRefresh = onRefresh,
            )

            uiState.track != null -> DetailContent(
                track = uiState.track,
                playbackSummary = playbackSummary,
                cacheState = uiState.cacheState,
                isNetworkAvailable = isNetworkAvailable,
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
        Text("正在加载音轨详情")
    }
}

@Composable
private fun DetailError(
    kind: TrackDetailErrorKind?,
    message: String,
    isNetworkAvailable: Boolean,
    onRefresh: () -> Unit,
) {
    val title = when (kind) {
        TrackDetailErrorKind.NotFound -> "未找到音轨"
        TrackDetailErrorKind.Unauthorized -> "需要登录"
        TrackDetailErrorKind.Other,
        null,
        -> "无法加载音轨"
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
            enabled = isNetworkAvailable,
            onClick = onRefresh,
        ) {
            Text(if (isNetworkAvailable) "重试" else "离线")
        }
    }
}

@Composable
private fun DetailContent(
    track: TrackResponse,
    playbackSummary: PlaybackUiSummary,
    cacheState: TrackCacheUiState,
    isNetworkAvailable: Boolean,
    onOpenNowPlaying: (TrackResponse) -> Unit,
    onCacheTrack: () -> Unit,
    onDeleteCachedTrack: () -> Unit,
) {
    val isCurrentTrack = playbackSummary.currentTrackId == track.id
    var showDeleteConfirmation by remember { mutableStateOf(false) }

    if (showDeleteConfirmation) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmation = false },
            title = { Text("删除离线缓存") },
            text = { Text("要从这台设备删除“${track.title}”的本地缓存文件吗？") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteConfirmation = false
                        onDeleteCachedTrack()
                    },
                ) {
                    Text("删除")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmation = false }) {
                    Text("取消")
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
                MetadataRow(label = "艺人", value = track.artist.orUnknown())
                MetadataRow(label = "专辑", value = track.album.orUnknown())
                MetadataRow(label = "时长", value = track.durationSeconds?.formatDuration() ?: "未知")
                MetadataRow(label = "内容类型", value = track.contentType)
                MetadataRow(label = "喜欢", value = if (track.liked) "是" else "否")
                MetadataRow(label = "冷却截止", value = track.cooldownUntil ?: "无")
                MetadataRow(label = "创建时间", value = track.createdAt)
                MetadataRow(label = "更新时间", value = track.updatedAt)
            }
        }

        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "播放",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = if (isCurrentTrack) {
                        playbackSummary.detailPlaybackLabel()
                    } else if (track.isReady) {
                        "已可在线播放。"
                    } else {
                        "只有可播放音轨才能在线播放。当前状态：${formatStatus(track.status)}。"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AssistChip(
                        onClick = {},
                        label = { Text(if (track.isReady) "可播放" else formatStatus(track.status)) },
                        enabled = track.isReady,
                    )
                    if (isCurrentTrack) {
                        AssistChip(
                            onClick = {},
                            label = { Text(playbackSummary.status.detailChipLabel()) },
                            enabled = true,
                        )
                    }
                }
                Button(
                    enabled = track.isReady,
                    onClick = { onOpenNowPlaying(track) },
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (isCurrentTrack) "打开播放中" else "播放")
                }
            }
        }

        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "离线缓存",
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
                        cacheState.status != CacheStatus.Cached &&
                        isNetworkAvailable,
                    onClick = onCacheTrack,
                ) {
                    Icon(
                        imageVector = Icons.Default.Download,
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        when {
                            !isNetworkAvailable -> "离线"
                            !track.isReady -> "暂不可缓存"
                            cacheState.status == CacheStatus.Cached -> "已缓存"
                            cacheState.status == CacheStatus.Failed -> "重试缓存"
                            else -> "缓存音轨"
                        },
                    )
                }
                if (cacheState.status == CacheStatus.Cached || cacheState.status == CacheStatus.Failed) {
                    OutlinedButton(
                        enabled = !cacheState.isCaching,
                        onClick = { showDeleteConfirmation = true },
                    ) {
                        Text("删除缓存")
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
                    text = "标签",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                if (track.tags.isEmpty()) {
                    Text(
                        text = "暂无标签",
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
            label = "文件大小",
            value = cacheState.byteSize?.formatBytes() ?: "未知",
        )
        MetadataRow(
            label = "缓存时间",
            value = cacheState.cachedAt ?: "未知",
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
    if (isNullOrBlank()) "未知" else this

private fun TrackResponse.cacheLabel(cacheState: TrackCacheUiState): String {
    if (!isReady) {
        return "只有可播放音轨才能缓存。当前状态：${formatStatus(status)}。"
    }

    return when (cacheState.status) {
        CacheStatus.NotCached -> "这台设备尚未缓存。"
        CacheStatus.Caching -> cacheState.message ?: "正在缓存音轨"
        CacheStatus.Cached -> cacheState.message ?: "已缓存，可离线播放。"
        CacheStatus.Failed -> cacheState.errorMessage ?: "缓存下载失败。"
    }
}

private fun Long.formatBytes(): String =
    when {
        this >= 1_000_000L -> "${this / 1_000_000L} MB"
        this >= 1_000L -> "${this / 1_000L} KB"
        else -> "$this B"
    }

private fun PlaybackUiSummary.detailPlaybackLabel(): String =
    when (status) {
        PlaybackStatus.Buffering -> "这个音轨正在缓冲。"
        PlaybackStatus.Playing -> "这个音轨正在播放。"
        PlaybackStatus.Paused -> "这个音轨已暂停。"
        PlaybackStatus.Ended -> "这个音轨已播放结束。"
        PlaybackStatus.Error -> errorMessage ?: "这个音轨播放失败。"
        PlaybackStatus.Idle -> "这个音轨已加载。"
    }

private fun PlaybackStatus.detailChipLabel(): String =
    when (this) {
        PlaybackStatus.Buffering -> "缓冲中"
        PlaybackStatus.Playing -> "播放中"
        PlaybackStatus.Paused -> "已暂停"
        PlaybackStatus.Ended -> "已结束"
        PlaybackStatus.Error -> "错误"
        PlaybackStatus.Idle -> "已加载"
    }

private fun Int.formatDuration(): String {
    val minutes = this / 60
    val seconds = this % 60
    return "$minutes:${seconds.toString().padStart(2, '0')}"
}

private fun formatStatus(status: String): String =
    when (status.lowercase()) {
        "uploaded" -> "已上传"
        "processing" -> "处理中"
        "ready" -> "可播放"
        "failed" -> "处理失败"
        else -> status
    }
