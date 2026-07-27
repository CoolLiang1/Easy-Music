package com.easymusic.app.library.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.cache.domain.CacheStatus
import com.easymusic.app.cache.domain.CachedTrack
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.library.domain.TrackRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class LibraryUiState(
    val tracks: List<TrackResponse> = emptyList(),
    val searchQuery: String = "",
    val isFilterModeEnabled: Boolean = false,
    val cacheStatesByTrackId: Map<Int, LibraryCacheUiState> = emptyMap(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val needsSignIn: Boolean = false,
)

data class LibraryCacheUiState(
    val status: CacheStatus = CacheStatus.NotCached,
    val lastError: String? = null,
)

class LibraryViewModel(
    private val initialNetworkAvailable: Boolean = true,
    private val trackRepository: TrackRepository,
    private val bearerTokenProvider: suspend () -> String?,
    private val trackCacheRepository: TrackCacheRepository,
) : ViewModel() {
    var uiState by mutableStateOf(LibraryUiState(isLoading = true))
        private set

    init {
        watchCacheStates()
        loadTracks(
            isRefresh = false,
            isNetworkAvailable = initialNetworkAvailable,
        )
    }

    fun refresh(isNetworkAvailable: Boolean = true) {
        loadTracks(
            isRefresh = true,
            isNetworkAvailable = isNetworkAvailable,
        )
    }

    fun updateSearchQuery(query: String) {
        uiState = uiState.copy(searchQuery = query)
    }

    fun setFilterModeEnabled(enabled: Boolean) {
        uiState = uiState.copy(isFilterModeEnabled = enabled)
    }

    private fun loadTracks(
        isRefresh: Boolean,
        isNetworkAvailable: Boolean,
    ) {
        val currentTracks = uiState.tracks
        val currentSearchQuery = uiState.searchQuery
        val currentFilterModeEnabled = uiState.isFilterModeEnabled
        val currentCacheStates = uiState.cacheStatesByTrackId
        if (!isNetworkAvailable) {
            uiState = uiState.copy(
                isLoading = false,
                isRefreshing = false,
                errorMessage = "当前离线。刷新曲库需要连接后端；可打开离线缓存播放这台设备上的音乐。",
                needsSignIn = false,
            )
            return
        }

        uiState = uiState.copy(
            isLoading = !isRefresh && currentTracks.isEmpty(),
            isRefreshing = isRefresh,
            errorMessage = null,
            needsSignIn = false,
        )

        viewModelScope.launch {
            val token = withContext(Dispatchers.IO) {
                bearerTokenProvider()
            }

            if (token == null) {
                uiState = LibraryUiState(
                    tracks = currentTracks,
                    searchQuery = currentSearchQuery,
                    isFilterModeEnabled = currentFilterModeEnabled,
                    cacheStatesByTrackId = currentCacheStates,
                    errorMessage = "请重新登录后加载曲库。",
                    needsSignIn = true,
                )
                return@launch
            }

            val result = withContext(Dispatchers.IO) {
                trackRepository.listTracks(token)
            }

            uiState = when (result) {
                is ApiResult.Success -> LibraryUiState(
                    tracks = result.value,
                    searchQuery = currentSearchQuery,
                    isFilterModeEnabled = currentFilterModeEnabled,
                    cacheStatesByTrackId = uiState.cacheStatesByTrackId,
                )
                is ApiResult.Unauthorized -> LibraryUiState(
                    tracks = currentTracks,
                    searchQuery = currentSearchQuery,
                    isFilterModeEnabled = currentFilterModeEnabled,
                    cacheStatesByTrackId = uiState.cacheStatesByTrackId,
                    errorMessage = result.message,
                    needsSignIn = true,
                )

                is ApiResult.HttpError -> LibraryUiState(
                    tracks = currentTracks,
                    searchQuery = currentSearchQuery,
                    isFilterModeEnabled = currentFilterModeEnabled,
                    cacheStatesByTrackId = uiState.cacheStatesByTrackId,
                    errorMessage = result.message,
                )

                is ApiResult.NetworkError -> LibraryUiState(
                    tracks = currentTracks,
                    searchQuery = currentSearchQuery,
                    isFilterModeEnabled = currentFilterModeEnabled,
                    cacheStatesByTrackId = uiState.cacheStatesByTrackId,
                    errorMessage = result.message,
                )

                is ApiResult.SerializationError -> LibraryUiState(
                    tracks = currentTracks,
                    searchQuery = currentSearchQuery,
                    isFilterModeEnabled = currentFilterModeEnabled,
                    cacheStatesByTrackId = uiState.cacheStatesByTrackId,
                    errorMessage = result.message,
                )
            }
        }
    }

    private fun watchCacheStates() {
        viewModelScope.launch {
            trackCacheRepository.observeTracksById().collect { cachedTracks ->
                uiState = uiState.copy(
                    cacheStatesByTrackId = cachedTracks.mapValues { entry ->
                        entry.value.toLibraryCacheUiState()
                    },
                )
            }
        }
    }

    private fun CachedTrack.toLibraryCacheUiState(): LibraryCacheUiState =
        LibraryCacheUiState(
            status = cacheStatus,
            lastError = lastError,
        )
}
