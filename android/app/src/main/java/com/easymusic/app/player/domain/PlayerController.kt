package com.easymusic.app.player.domain

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.data.AuthenticatedDataSourceFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class PlayerUiState(
    val track: TrackResponse? = null,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val durationMs: Long = 0L,
    val positionMs: Long = 0L,
    val errorMessage: String? = null,
)

class PlayerController(
    context: Context,
    private val dataSourceFactory: AuthenticatedDataSourceFactory = AuthenticatedDataSourceFactory(),
) {
    private val player = ExoPlayer.Builder(context.applicationContext).build()
    private val mutableUiState = MutableStateFlow(PlayerUiState())

    val uiState: StateFlow<PlayerUiState> = mutableUiState.asStateFlow()

    init {
        player.addListener(
            object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    publishState()
                }

                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    publishState()
                }

                override fun onPlayerError(error: PlaybackException) {
                    publishState(errorMessage = error.toPlaybackMessage())
                }
            },
        )
    }

    fun play(
        track: TrackResponse,
        bearerToken: String,
        streamUrl: String,
    ) {
        if (!track.isReady) {
            mutableUiState.value = PlayerUiState(
                track = track,
                errorMessage = "Only ready tracks can stream. This track is ${track.status}.",
            )
            return
        }

        val mediaItem = MediaItem.Builder()
            .setUri(streamUrl)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(track.title)
                    .setArtist(track.artist)
                    .setAlbumTitle(track.album)
                    .build(),
            )
            .build()

        val mediaSource = DefaultMediaSourceFactory(dataSourceFactory.create(bearerToken))
            .createMediaSource(mediaItem)
        player.setMediaSource(mediaSource)
        mutableUiState.value = PlayerUiState(
            track = track,
            isBuffering = true,
        )
        player.prepare()
        player.play()
    }

    fun pause() {
        player.pause()
        publishState()
    }

    fun resume() {
        player.play()
        publishState()
    }

    fun fail(
        track: TrackResponse?,
        message: String,
    ) {
        mutableUiState.value = mutableUiState.value.copy(
            track = track ?: mutableUiState.value.track,
            isPlaying = false,
            isBuffering = false,
            errorMessage = message,
        )
    }

    fun seekTo(positionMs: Long) {
        player.seekTo(positionMs.coerceAtLeast(0L))
        publishState()
    }

    fun updatePosition() {
        publishState()
    }

    fun release() {
        player.release()
    }

    private fun publishState(errorMessage: String? = mutableUiState.value.errorMessage) {
        val duration = player.duration.takeIf { it > 0 } ?: mutableUiState.value.durationMs
        mutableUiState.value = mutableUiState.value.copy(
            isPlaying = player.isPlaying,
            isBuffering = player.playbackState == Player.STATE_BUFFERING,
            durationMs = duration.coerceAtLeast(0L),
            positionMs = player.currentPosition.coerceAtLeast(0L),
            errorMessage = errorMessage,
        )
    }
}

private fun PlaybackException.toPlaybackMessage(): String {
    val responseCode = findInvalidResponseCode()
    return when (responseCode) {
        401 -> "The stream request was unauthorized. Please sign in again."
        404 -> "The stream for this track was not found."
        null -> message ?: "Playback failed."
        else -> "Playback failed with HTTP $responseCode."
    }
}

private fun Throwable.findInvalidResponseCode(): Int? {
    var current: Throwable? = this
    while (current != null) {
        if (current is HttpDataSource.InvalidResponseCodeException) {
            return current.responseCode
        }
        current = current.cause
    }
    return null
}
