package com.easymusic.app.cache.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.cache.domain.CachedTrack
import com.easymusic.app.cache.domain.TrackCacheDeleteResult
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.player.domain.PlayerController
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class CachedTracksUiState(
    val cachedTracks: List<CachedTrack> = emptyList(),
    val deleteErrorMessage: String? = null,
)

class CachedTracksViewModel(
    private val trackCacheRepository: TrackCacheRepository,
    private val playerController: PlayerController,
) : ViewModel() {
    private val deleteErrorMessage = MutableStateFlow<String?>(null)

    val uiState: StateFlow<CachedTracksUiState> =
        combine(
            trackCacheRepository.observeCachedTracks(),
            deleteErrorMessage,
        ) { tracks, error ->
            CachedTracksUiState(
                cachedTracks = tracks,
                deleteErrorMessage = error,
            )
        }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = CachedTracksUiState(),
            )

    fun deleteCachedTrack(track: CachedTrack) {
        viewModelScope.launch {
            deleteErrorMessage.value = null
            playerController.stopIfPlayingCachedTrack(track.trackId)
            when (val result = trackCacheRepository.deleteCachedTrack(track.trackId)) {
                TrackCacheDeleteResult.Success -> Unit
                is TrackCacheDeleteResult.Failure -> deleteErrorMessage.value = result.message
            }
        }
    }

    fun clearDeleteError() {
        deleteErrorMessage.value = null
    }
}
