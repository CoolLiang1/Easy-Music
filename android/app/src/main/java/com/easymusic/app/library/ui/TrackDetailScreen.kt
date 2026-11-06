package com.easymusic.app.library.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.PlaylistAdd
import androidx.compose.material.icons.automirrored.filled.PlaylistPlay
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.OfflinePin
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
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
import com.easymusic.app.player.domain.TrackPlaybackLauncher
import com.easymusic.app.player.domain.toPlaybackUiSummary
import com.easymusic.app.ui.LocalShowMessage
import com.easymusic.app.ui.components.Banner
import com.easymusic.app.ui.components.BannerTone
import com.easymusic.app.ui.components.EmptyState
import com.easymusic.app.ui.components.GroupHeading
import com.easymusic.app.ui.components.KeyValueRow
import com.easymusic.app.ui.components.LevelMeter
import com.easymusic.app.ui.components.LoadingState
import com.easymusic.app.ui.components.PillTone
import com.easymusic.app.ui.components.SectionCard
import com.easymusic.app.ui.components.StatusPill
import com.easymusic.app.ui.components.TagChip
import com.easymusic.app.ui.components.TrackArtwork
import com.easymusic.app.ui.components.formatBytes
import com.easymusic.app.ui.components.formatContentType
import com.easymusic.app.ui.components.formatDateTime
import com.easymusic.app.ui.components.formatDuration
import com.easymusic.app.ui.components.formatTrackStatus
import com.easymusic.app.ui.components.isProcessingStatus
import com.easymusic.app.ui.components.subtitle
import com.easymusic.app.ui.theme.EasyMusicThemeTokens
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

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
    Column(modifier = modifier.fillMaxSize()) {
        TextButton(
            modifier = Modifier.padding(start = 4.dp),
            onClick = onBackToLibrary,
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(6.dp))
            Text("返回曲库")
        }

        when {
            uiState.isLoading -> LoadingState(text = "正在加载音轨…")
            uiState.errorMessage != null -> EmptyState(
                icon = if (isNetworkAvailable) Icons.Default.ErrorOutline else Icons.Default.CloudOff,
                title = when (uiState.errorKind) {
                    TrackDetailErrorKind.NotFound -> "找不到这首音轨"
                    TrackDetailErrorKind.Unauthorized -> "需要重新登录"
                    else -> "无法加载音轨"
                },
                message = uiState.errorMessage,
                action = {
                    Button(enabled = isNetworkAvailable, onClick = onRefresh) {
                        Text(if (isNetworkAvailable) "重试" else "联网后重试")
                    }
                },
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
private fun DetailContent(
    track: TrackResponse,
    playbackSummary: PlaybackUiSummary,
    cacheState: TrackCacheUiState,
    isNetworkAvailable: Boolean,
    onOpenNowPlaying: (TrackResponse) -> Unit,
    onCacheTrack: () -> Unit,
    onDeleteCachedTrack: () -> Unit,
) {
    val context = LocalContext.current
    val showMessage = LocalShowMessage.current
    val scope = rememberCoroutineScope()
    val launcher = remember(context) { TrackPlaybackLauncher.create(context) }
    val playerController = remember(context) { PlayerController(context) }
    val isCurrent = playbackSummary.currentTrackId == track.id
    val isPlaying = isCurrent && playbackSummary.status == PlaybackStatus.Playing
    var showDeleteConfirmation by remember { mutableStateOf(false) }

    if (showDeleteConfirmation) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmation = false },
            title = { Text("删除离线缓存？") },
            text = { Text("只删除这台设备上的「${track.title}」缓存文件，云端曲库不受影响。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteConfirmation = false
                        onDeleteCachedTrack()
                    },
                ) { Text("删除缓存", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmation = false }) { Text("取消") }
            },
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 16.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            TrackArtwork(
                trackId = track.id,
                title = track.title,
                artist = track.artist,
                coverPath = track.coverPath,
                coverVersion = track.updatedAt,
                size = 168.dp,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (isCurrent) LevelMeter(isPlaying = isPlaying, height = 16.dp)
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
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                StatusPill(
                    text = formatTrackStatus(track.status),
                    tone = when {
                        track.isReady -> PillTone.Ok
                        track.status.isProcessingStatus() -> PillTone.Warn
                        else -> PillTone.Error
                    },
                )
                if (cacheState.status == CacheStatus.Cached) {
                    StatusPill(text = "已离线缓存", tone = PillTone.Info)
                }
                if (track.liked) {
                    StatusPill(text = "喜欢", tone = PillTone.Error)
                }
            }
        }

        if (!track.isReady) {
            Banner(
                tone = if (track.status.isProcessingStatus()) BannerTone.Warning else BannerTone.Error,
                text = if (track.status.isProcessingStatus()) {
                    "后台还在转码，完成后才能播放和缓存。"
                } else {
                    "这首处理失败了，可以在 Web 管理端查看原因。"
                },
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                modifier = Modifier.weight(1f),
                enabled = track.isReady,
                onClick = {
                    when {
                        isPlaying -> playerController.pause()
                        isCurrent -> playerController.resume()
                        else -> scope.launch {
                            launcher.play(track, isNetworkAvailable).message?.let(showMessage)
                        }
                    }
                },
            ) {
                Icon(if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow, contentDescription = null)
                Spacer(modifier = Modifier.width(6.dp))
                Text(if (isPlaying) "暂停" else "播放")
            }
            FilledTonalButton(
                modifier = Modifier.weight(1f),
                enabled = track.isReady,
                onClick = {
                    scope.launch { launcher.playNext(track, isNetworkAvailable).message?.let(showMessage) }
                },
            ) {
                Icon(Icons.AutoMirrored.Filled.PlaylistPlay, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("下一首")
            }
            FilledTonalButton(
                modifier = Modifier.weight(1f),
                enabled = track.isReady,
                onClick = {
                    scope.launch { launcher.addToQueue(track, isNetworkAvailable).message?.let(showMessage) }
                },
            ) {
                Icon(Icons.AutoMirrored.Filled.PlaylistAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("加队列")
            }
        }
        if (isCurrent) {
            TextButton(
                modifier = Modifier.align(Alignment.CenterHorizontally),
                onClick = { onOpenNowPlaying(track) },
            ) { Text("打开正在播放") }
        }

        CacheCard(
            track = track,
            cacheState = cacheState,
            isNetworkAvailable = isNetworkAvailable,
            onCacheTrack = onCacheTrack,
            onDeleteRequest = { showDeleteConfirmation = true },
        )

        SectionCard(title = "标签") {
            if (track.tags.isEmpty()) {
                Text(
                    text = "还没有标签。可以在 Web 管理端为它打上场景、类型和特点。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                listOf("scene", "type", "feature").forEach { group ->
                    val tags = track.tags.filter { it.group == group }
                    if (tags.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            GroupHeading(group = group)
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                tags.forEach { tag -> TagChip(name = tag.name, group = tag.group) }
                            }
                        }
                    }
                }
            }
        }

        SectionCard(title = "信息") {
            Column {
                KeyValueRow(label = "类型", value = formatContentType(track.contentType))
                KeyValueRow(label = "时长", value = track.durationSeconds?.formatDuration() ?: "—")
                KeyValueRow(label = "喜欢", value = if (track.liked) "是" else "否")
                KeyValueRow(label = "冷却到", value = track.cooldownUntil?.let(::formatDateTime) ?: "未设置")
                KeyValueRow(label = "添加于", value = formatDateTime(track.createdAt))
                KeyValueRow(label = "更新于", value = formatDateTime(track.updatedAt))
            }
        }
    }
}

@Composable
private fun CacheCard(
    track: TrackResponse,
    cacheState: TrackCacheUiState,
    isNetworkAvailable: Boolean,
    onCacheTrack: () -> Unit,
    onDeleteRequest: () -> Unit,
) {
    val extended = EasyMusicThemeTokens.colors
    SectionCard(
        title = "离线缓存",
        subtitle = "缓存后，没有网络也能在这台设备上播放。",
        trailing = {
            when (cacheState.status) {
                CacheStatus.Cached -> Icon(Icons.Default.OfflinePin, contentDescription = null, tint = extended.ok)
                CacheStatus.Failed -> Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                else -> Unit
            }
        },
    ) {
        when (cacheState.status) {
            CacheStatus.Caching -> {
                val total = cacheState.totalBytes
                val downloaded = cacheState.bytesDownloaded
                if (total != null && total > 0 && downloaded != null) {
                    LinearProgressIndicator(
                        progress = { (downloaded.toFloat() / total).coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth(),
                        color = extended.signal,
                    )
                } else {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth(), color = extended.signal)
                }
                Text(
                    text = cacheState.message ?: "正在缓存…",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            CacheStatus.Cached -> Text(
                text = listOfNotNull(
                    "已缓存",
                    cacheState.byteSize?.formatBytes(),
                    cacheState.cachedAt?.let { "缓存于 ${formatDateTime(it)}" },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodyMedium,
            )

            CacheStatus.Failed -> Text(
                text = cacheState.errorMessage ?: "缓存下载失败。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )

            CacheStatus.NotCached -> Text(
                text = if (track.isReady) "这台设备上还没有缓存。" else "处理完成后才能缓存。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (cacheState.status != CacheStatus.Cached) {
                Button(
                    enabled = track.isReady && !cacheState.isCaching && isNetworkAvailable,
                    onClick = onCacheTrack,
                ) {
                    Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        when {
                            !isNetworkAvailable -> "联网后可缓存"
                            cacheState.isCaching -> "缓存中…"
                            cacheState.status == CacheStatus.Failed -> "重试缓存"
                            else -> "缓存到本机"
                        },
                    )
                }
            }
            if (cacheState.status == CacheStatus.Cached || cacheState.status == CacheStatus.Failed) {
                OutlinedButton(
                    enabled = !cacheState.isCaching,
                    onClick = onDeleteRequest,
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("删除缓存")
                }
            }
        }
    }
}
