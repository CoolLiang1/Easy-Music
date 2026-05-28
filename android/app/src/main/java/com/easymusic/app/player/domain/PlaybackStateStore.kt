package com.easymusic.app.player.domain

import com.easymusic.app.library.data.TrackResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class PlaybackStatus {
    Idle,
    Buffering,
    Playing,
    Paused,
    Ended,
    Error,
}

enum class PlaybackSource {
    OnlineStream,
    OfflineCache,
}

data class PlayerUiState(
    val track: TrackResponse? = null,
    val status: PlaybackStatus = PlaybackStatus.Idle,
    val playbackSource: PlaybackSource = PlaybackSource.OnlineStream,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val durationMs: Long = 0L,
    val positionMs: Long = 0L,
    val errorMessage: String? = null,
)

object PlaybackStateStore {
    private val mutableState = MutableStateFlow(PlayerUiState())

    val state: StateFlow<PlayerUiState> = mutableState.asStateFlow()

    fun update(value: PlayerUiState) {
        mutableState.value = value
    }

    fun update(transform: (PlayerUiState) -> PlayerUiState) {
        mutableState.value = transform(mutableState.value)
    }
}
