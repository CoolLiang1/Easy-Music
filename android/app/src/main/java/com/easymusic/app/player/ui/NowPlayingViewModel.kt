package com.easymusic.app.player.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.cache.domain.CachedPlaybackSource
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.domain.PlayerUiState
import com.easymusic.app.player.domain.PlaybackSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class NowPlayingViewModel(
    private val track: TrackResponse?,
    private val trackApi: TrackApi,
    private val tokenStore: AuthTokenStore,
    private val trackCacheRepository: TrackCacheRepository,
    private val playerController: PlayerController,
    private val initialNetworkAvailable: Boolean = true,
) : ViewModel() {
    val uiState: StateFlow<PlayerUiState> = playerController.uiState
    private var positionJob: Job? = null

    init {
        if (track != null && uiState.value.track?.id != track.id) {
            playTrack(
                track = track,
                isNetworkAvailable = initialNetworkAvailable,
            )
        }
        startPositionUpdates()
    }

    fun play(isNetworkAvailable: Boolean = true) {
        if (uiState.value.track != null) {
            val state = uiState.value
            if (!isNetworkAvailable && state.playbackSource != PlaybackSource.OfflineCache) {
                playerController.fail(
                    track = state.track,
                    message = "You are offline. Online playback needs the backend stream; play a cached track instead.",
                )
                return
            }
            playerController.resume()
            return
        }

        track?.let { playTrack(it, isNetworkAvailable) }
    }

    fun pause() {
        playerController.pause()
    }

    fun seekTo(positionMs: Long) {
        playerController.seekTo(positionMs)
    }

    fun dispose() {
        positionJob?.cancel()
    }

    private fun playTrack(
        track: TrackResponse,
        isNetworkAvailable: Boolean,
    ) {
        viewModelScope.launch {
            val cachedSource = withContext(Dispatchers.IO) {
                trackCacheRepository.cachedPlaybackSource(track.id)
            }

            if (cachedSource is CachedPlaybackSource.Available) {
                playerController.playCached(
                    track = track,
                    audioFile = cachedSource.file,
                )
                return@launch
            }

            if (!isNetworkAvailable) {
                playerController.fail(
                    track = track,
                    message = "You are offline. This track is not cached on this device.",
                )
                return@launch
            }

            val token = withContext(Dispatchers.IO) {
                tokenStore.readToken()
            }

            if (token == null) {
                playerController.fail(
                    track = track,
                    message = "Please sign in again before streaming this track.",
                )
                return@launch
            }

            playerController.play(
                track = track,
                bearerToken = token,
                streamUrl = trackApi.streamUrl(track.id),
            )
        }
    }

    private fun startPositionUpdates() {
        positionJob?.cancel()
        positionJob = viewModelScope.launch {
            while (isActive) {
                playerController.updatePosition()
                delay(POSITION_UPDATE_MS)
            }
        }
    }

    override fun onCleared() {
        dispose()
        super.onCleared()
    }

    private companion object {
        const val POSITION_UPDATE_MS = 500L
    }
}
