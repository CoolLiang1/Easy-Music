package com.easymusic.app.player.domain

import com.easymusic.app.library.data.TrackResponse
import java.util.UUID
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

enum class PlaybackQueueMode {
    Sequence,
    Shuffle,
    Reverse,
}

enum class PlaybackQueueSourceType {
    Playlist,
    SingleTrack,
    Manual,
    Recommendation,
}

data class PlaybackQueueSource(
    val type: PlaybackQueueSourceType,
    val playlistId: Int? = null,
    val playlistName: String? = null,
)

data class PlaybackQueueItem(
    val queueItemId: String,
    val track: TrackResponse,
    val playbackSource: PlaybackSource,
    val cycleItem: Boolean = false,
)

data class PlayerUiState(
    val track: TrackResponse? = null,
    val status: PlaybackStatus = PlaybackStatus.Idle,
    val playbackSource: PlaybackSource = PlaybackSource.OnlineStream,
    val queueSource: PlaybackQueueSource? = null,
    val queueMode: PlaybackQueueMode? = null,
    val queueIndex: Int = 0,
    val queueSize: Int = 0,
    val history: List<PlaybackQueueItem> = emptyList(),
    val currentQueueItem: PlaybackQueueItem? = null,
    val upcoming: List<PlaybackQueueItem> = emptyList(),
    val baseCycleItems: List<PlaybackQueueItem> = emptyList(),
    val repeatPlaylist: Boolean = false,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val durationMs: Long = 0L,
    val positionMs: Long = 0L,
    val errorMessage: String? = null,
)

data class PlaybackUiSummary(
    val currentTrackId: Int? = null,
    val status: PlaybackStatus = PlaybackStatus.Idle,
    val queueSourcePlaylistId: Int? = null,
    val errorMessage: String? = null,
)

fun PlayerUiState.toPlaybackUiSummary(): PlaybackUiSummary =
    PlaybackUiSummary(
        currentTrackId = track?.id,
        status = status,
        queueSourcePlaylistId = queueSource?.playlistId,
        errorMessage = errorMessage,
    )

fun PlayerUiState.canSkipToPrevious(): Boolean =
    history.isNotEmpty()

fun PlayerUiState.canSkipToNext(): Boolean =
    currentQueueItem != null &&
        (upcoming.isNotEmpty() || repeatPlaylist && baseCycleItems.isNotEmpty())

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

fun newPlaybackQueueItemId(): String = "android-queue-item-${UUID.randomUUID()}"
