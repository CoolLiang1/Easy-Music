package com.easymusic.app.library.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.cache.data.CacheDownloadProgress
import com.easymusic.app.cache.domain.CacheStatus
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.cache.domain.TrackCacheResult
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
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
) : ViewModel() {
    var uiState by mutableStateOf(TrackDetailUiState(isLoading = true))
        private set

    private var cacheJob: Job? = null

    init {
        loadTrack()
        watchTokenForLogout()
    }

    fun refresh() {
        loadTrack()
    }

    fun cacheTrack() {
        val track = uiState.track ?: return
        if (!track.isReady || cacheJob?.isActive == true) {
            return
        }

        uiState = uiState.copy(
            cacheState = TrackCacheUiState(
                status = CacheStatus.Caching,
                message = "Starting cache download",
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
                        errorMessage = "Please sign in again to cache this track.",
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
                        message = "Cached for offline playback.",
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

    private fun loadTrack() {
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
                    errorMessage = "Please sign in again to view this track.",
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
                    val cachedTrack = withContext(Dispatchers.IO) {
                        trackCacheRepository.getTrack(trackId)
                    }
                    TrackDetailUiState(
                        track = result.value,
                        cacheState = cachedTrack?.let { cached ->
                            TrackCacheUiState(
                                status = cached.cacheStatus,
                                bytesDownloaded = cached.byteSize,
                                message = if (cached.cacheStatus == CacheStatus.Cached) {
                                    "Cached for offline playback."
                                } else {
                                    null
                                },
                                errorMessage = cached.lastError,
                            )
                        } ?: TrackCacheUiState(),
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

    private fun watchTokenForLogout() {
        viewModelScope.launch {
            tokenStore.token.collect { token ->
                if (token == null && cacheJob?.isActive == true) {
                    cacheJob?.cancelAndJoin()
                    uiState = uiState.copy(
                        cacheState = TrackCacheUiState(
                            status = CacheStatus.Failed,
                            errorMessage = "Cache download stopped because you signed out.",
                        ),
                    )
                }
            }
        }
    }

    private fun CacheDownloadProgress.label(): String =
        if (totalBytes != null) {
            "Caching ${bytesDownloaded.formatBytes()} of ${totalBytes.formatBytes()}"
        } else {
            "Caching ${bytesDownloaded.formatBytes()}"
        }
}

private fun Long.formatBytes(): String =
    when {
        this >= 1_000_000L -> "${this / 1_000_000L} MB"
        this >= 1_000L -> "${this / 1_000L} KB"
        else -> "$this B"
    }
