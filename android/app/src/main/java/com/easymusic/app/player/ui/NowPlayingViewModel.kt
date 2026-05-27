package com.easymusic.app.player.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.domain.PlayerUiState
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
    private val playerController: PlayerController,
) : ViewModel() {
    val uiState: StateFlow<PlayerUiState> = playerController.uiState
    private var positionJob: Job? = null

    init {
        if (track != null) {
            playTrack(track)
        }
        startPositionUpdates()
    }

    fun play() {
        if (uiState.value.track != null) {
            playerController.resume()
            return
        }

        track?.let(::playTrack)
    }

    fun pause() {
        playerController.pause()
    }

    fun seekTo(positionMs: Long) {
        playerController.seekTo(positionMs)
    }

    fun dispose() {
        positionJob?.cancel()
        playerController.release()
    }

    private fun playTrack(track: TrackResponse) {
        viewModelScope.launch {
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
