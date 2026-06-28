package com.easymusic.app.library.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.cache.data.CacheDownloadProgress
import com.easymusic.app.cache.domain.CacheStatus
import com.easymusic.app.cache.domain.TrackCacheDeleteResult
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.cache.domain.TrackCacheResult
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlayerController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class TrackDetailUiState(
    val track: TrackResponse? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val errorKind: TrackDetailErrorKind? = null,
    val cacheState: TrackCacheUiState = TrackCacheUiState(),
)

data class TrackCacheUiState(
    val status: CacheStatus = CacheStatus.NotCached,
    val bytesDownloaded: Long? = null,
    val totalBytes: Long? = null,
    val byteSize: Long? = null,
    val cachedAt: String? = null,
    val message: String? = null,
    val errorMessage: String? = null,
) {
    val isCaching: Boolean
        get() = status == CacheStatus.Caching
}

enum class TrackDetailErrorKind {
    NotFound,
    Unauthorized,
    Other,
}

class TrackDetailViewModel(
    private val trackId: Int,
    private val trackApi: TrackApi,
    private val tokenStore: AuthTokenStore,
    private val trackCacheRepository: TrackCacheRepository,
    private val playerController: PlayerController,
    private val initialNetworkAvailable: Boolean = true,
) : ViewModel() {
    var uiState by mutableStateOf(TrackDetailUiState(isLoading = true))
        private set

    private var cacheJob: Job? = null

    init {
        watchCacheState()
        loadTrack(initialNetworkAvailable)
        watchTokenForLogout()
    }

    fun refresh(isNetworkAvailable: Boolean = true) {
        loadTrack(isNetworkAvailable)
    }

    fun cacheTrack(isNetworkAvailable: Boolean = true) {
        val track = uiState.track ?: return
        if (!track.isReady || cacheJob?.isActive == true) {
            return
        }

        if (!isNetworkAvailable) {
            uiState = uiState.copy(
                cacheState = TrackCacheUiState(
                    status = CacheStatus.Failed,
                    errorMessage = "当前离线。新的离线缓存下载需要连接后端音频流。",
                ),
            )
            return
        }

        uiState = uiState.copy(
            cacheState = TrackCacheUiState(
                status = CacheStatus.Caching,
                message = "正在开始缓存下载",
            ),
        )

        cacheJob = viewModelScope.launch {
            val token = withContext(Dispatchers.IO) {
                tokenStore.readToken()
            }

            if (token == null) {
                uiState = uiState.copy(
                    cacheState = TrackCacheUiState(
                        status = CacheStatus.Failed,
                        errorMessage = "请重新登录后缓存这个音轨。",
                    ),
                )
                return@launch
            }

            val result = withContext(Dispatchers.IO) {
                trackCacheRepository.cacheTrack(
                    track = track,
                    bearerToken = token,
                    streamUrl = trackApi.streamUrl(track.id),
                    onProgress = ::onCacheProgress,
                )
            }

            uiState = when (result) {
                is TrackCacheResult.Success -> uiState.copy(
                    cacheState = TrackCacheUiState(
                        status = CacheStatus.Cached,
                        bytesDownloaded = result.cachedTrack.byteSize,
                        byteSize = result.cachedTrack.byteSize,
                        cachedAt = result.cachedTrack.cachedAt,
                        message = "已缓存，可离线播放。",
                    ),
                )

                is TrackCacheResult.Failure -> uiState.copy(
                    cacheState = TrackCacheUiState(
                        status = CacheStatus.Failed,
                        errorMessage = result.message,
                    ),
                )
            }
        }
    }

    fun deleteCachedTrack() {
        viewModelScope.launch {
            playerController.stopIfPlayingCachedTrack(trackId)
            uiState = uiState.copy(
                cacheState = uiState.cacheState.copy(
                    message = "正在删除离线缓存",
                    errorMessage = null,
                ),
            )

            uiState = when (val result = withContext(Dispatchers.IO) {
                trackCacheRepository.deleteCachedTrack(trackId)
            }) {
                TrackCacheDeleteResult.Success -> uiState.copy(
                    cacheState = TrackCacheUiState(
                        status = CacheStatus.NotCached,
                        message = "已从这台设备删除离线缓存。",
                    ),
                )

                is TrackCacheDeleteResult.Failure -> uiState.copy(
                    cacheState = uiState.cacheState.copy(
                        errorMessage = result.message,
                    ),
                )
            }
        }
    }

    private fun loadTrack(isNetworkAvailable: Boolean) {
        if (!isNetworkAvailable) {
            uiState = uiState.copy(
                isLoading = false,
                errorMessage = "当前离线。刷新音轨详情需要连接后端。",
                errorKind = TrackDetailErrorKind.Other,
            )
            return
        }

        uiState = uiState.copy(
            isLoading = true,
            errorMessage = null,
            errorKind = null,
        )

        viewModelScope.launch {
            val token = withContext(Dispatchers.IO) {
                tokenStore.readToken()
            }

            if (token == null) {
                uiState = TrackDetailUiState(
                    errorMessage = "请重新登录后查看这个音轨。",
                    errorKind = TrackDetailErrorKind.Unauthorized,
                )
                return@launch
            }

            val result = withContext(Dispatchers.IO) {
                trackApi.getTrack(
                    trackId = trackId,
                    bearerToken = token,
                )
            }

            uiState = when (result) {
                is ApiResult.Success -> {
                    TrackDetailUiState(
                        track = result.value,
                        cacheState = uiState.cacheState,
                    )
                }

                is ApiResult.Unauthorized -> TrackDetailUiState(
                    errorMessage = result.message,
                    errorKind = TrackDetailErrorKind.Unauthorized,
                )

                is ApiResult.HttpError -> TrackDetailUiState(
                    errorMessage = result.message,
                    errorKind = if (result.statusCode == 404) {
                        TrackDetailErrorKind.NotFound
                    } else {
                        TrackDetailErrorKind.Other
                    },
                )

                is ApiResult.NetworkError -> TrackDetailUiState(
                    errorMessage = result.message,
                    errorKind = TrackDetailErrorKind.Other,
                )

                is ApiResult.SerializationError -> TrackDetailUiState(
                    errorMessage = result.message,
                    errorKind = TrackDetailErrorKind.Other,
                )
            }
        }
    }

    private fun onCacheProgress(progress: CacheDownloadProgress) {
        viewModelScope.launch {
            uiState = uiState.copy(
                cacheState = TrackCacheUiState(
                    status = CacheStatus.Caching,
                    bytesDownloaded = progress.bytesDownloaded,
                    totalBytes = progress.totalBytes,
                    message = progress.label(),
                ),
            )
        }
    }

    private fun watchCacheState() {
        viewModelScope.launch {
            trackCacheRepository.observeTrack(trackId).collectLatest { cached ->
                val cacheState = cached?.let {
                    TrackCacheUiState(
                        status = it.cacheStatus,
                        bytesDownloaded = it.byteSize,
                        byteSize = it.byteSize,
                        cachedAt = it.cachedAt,
                        message = if (it.cacheStatus == CacheStatus.Cached) {
                            "已缓存，可离线播放。"
                        } else {
                            null
                        },
                        errorMessage = it.lastError,
                    )
                } ?: TrackCacheUiState()

                uiState = uiState.copy(cacheState = cacheState)
            }
        }
    }

    private fun watchTokenForLogout() {
        viewModelScope.launch {
            tokenStore.token.collect { token ->
                if (token == null && cacheJob?.isActive == true) {
                    cacheJob?.cancelAndJoin()
                    uiState = uiState.copy(
                        cacheState = TrackCacheUiState(
                            status = CacheStatus.Failed,
                            errorMessage = "你已退出登录，缓存下载已停止。",
                        ),
                    )
                }
            }
        }
    }

    private fun CacheDownloadProgress.label(): String =
        if (totalBytes != null) {
            "正在缓存 ${bytesDownloaded.formatBytes()} / ${totalBytes.formatBytes()}"
        } else {
            "正在缓存 ${bytesDownloaded.formatBytes()}"
        }
}

private fun Long.formatBytes(): String =
    when {
        this >= 1_000_000L -> "${this / 1_000_000L} MB"
        this >= 1_000L -> "${this / 1_000L} KB"
        else -> "$this B"
    }
