package com.easymusic.app.cache.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.cache.domain.CachedTrack
import com.easymusic.app.cache.domain.TrackCacheRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class CachedTracksUiState(
    val cachedTracks: List<CachedTrack> = emptyList(),
)

class CachedTracksViewModel(
    trackCacheRepository: TrackCacheRepository,
) : ViewModel() {
    val uiState: StateFlow<CachedTracksUiState> =
        trackCacheRepository.observeCachedTracks()
            .map { tracks -> CachedTracksUiState(cachedTracks = tracks) }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = CachedTracksUiState(),
            )
}
