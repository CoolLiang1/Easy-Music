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

    private fun loadTracks(
        isRefresh: Boolean,
        isNetworkAvailable: Boolean,
    ) {
        val currentTracks = uiState.tracks
        val currentCacheStates = uiState.cacheStatesByTrackId
        if (!isNetworkAvailable) {
            uiState = uiState.copy(
                isLoading = false,
                isRefreshing = false,
                errorMessage = "You are offline. Library refresh needs the backend; open Cached Tracks to play music stored on this device.",
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
                    cacheStatesByTrackId = currentCacheStates,
                    errorMessage = "Please sign in again to load your library.",
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
                    cacheStatesByTrackId = uiState.cacheStatesByTrackId,
                )
                is ApiResult.Unauthorized -> LibraryUiState(
                    tracks = currentTracks,
                    cacheStatesByTrackId = uiState.cacheStatesByTrackId,
                    errorMessage = result.message,
                    needsSignIn = true,
                )

                is ApiResult.HttpError -> LibraryUiState(
                    tracks = currentTracks,
                    cacheStatesByTrackId = uiState.cacheStatesByTrackId,
                    errorMessage = result.message,
                )

                is ApiResult.NetworkError -> LibraryUiState(
                    tracks = currentTracks,
                    cacheStatesByTrackId = uiState.cacheStatesByTrackId,
                    errorMessage = result.message,
                )

                is ApiResult.SerializationError -> LibraryUiState(
                    tracks = currentTracks,
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
