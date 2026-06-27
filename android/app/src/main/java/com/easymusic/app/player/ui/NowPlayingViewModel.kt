package com.easymusic.app.player.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.domain.PlayerUiState
import com.easymusic.app.player.domain.PlaybackSource
import com.easymusic.app.player.domain.PlaybackSourceSelector
import com.easymusic.app.player.domain.SelectedPlaybackSource
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

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
    private val playbackSourceSelector = PlaybackSourceSelector(
        trackCacheRepository = trackCacheRepository,
        readToken = tokenStore::readToken,
        streamUrlForTrack = trackApi::streamUrl,
    )

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
                    message = "当前离线。在线播放需要连接后端音频流，请改为播放已缓存音轨。",
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

    fun removeQueueItem(queueItemId: String) {
        playerController.removeQueueItem(queueItemId)
    }

    fun clearQueue() {
        playerController.clearQueue()
    }

    fun moveUpcomingItem(
        queueItemId: String,
        targetUpcomingIndex: Int,
    ) {
        playerController.moveUpcomingItem(
            queueItemId = queueItemId,
            targetUpcomingIndex = targetUpcomingIndex,
        )
    }

    fun setRepeatPlaylist(enabled: Boolean) {
        playerController.setRepeatPlaylist(enabled)
    }

    fun dispose() {
        positionJob?.cancel()
    }

    private fun playTrack(
        track: TrackResponse,
        isNetworkAvailable: Boolean,
    ) {
        viewModelScope.launch {
            when (
                val selectedSource = playbackSourceSelector.select(
                    track = track,
                    isNetworkAvailable = isNetworkAvailable,
                )
            ) {
                is SelectedPlaybackSource.Cached -> playerController.playCached(
                    track = selectedSource.track,
                    audioFile = selectedSource.audioFile,
                )

                is SelectedPlaybackSource.Online -> playerController.play(
                    track = selectedSource.track,
                    bearerToken = selectedSource.bearerToken,
                    streamUrl = selectedSource.streamUrl,
                )

                is SelectedPlaybackSource.Failure -> playerController.fail(
                    track = selectedSource.track,
                    message = selectedSource.message,
                )
            }
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
