package com.easymusic.app.player.domain

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.data.AuthenticatedDataSourceFactory
import kotlinx.coroutines.flow.StateFlow

@OptIn(UnstableApi::class)
class PlayerController(
    context: Context,
    private val dataSourceFactory: AuthenticatedDataSourceFactory = AuthenticatedDataSourceFactory(),
) {
    private val player = SharedPlayerHolder.player(context.applicationContext)

    val uiState: StateFlow<PlayerUiState> = PlaybackStateStore.state

    fun play(
        track: TrackResponse,
        bearerToken: String,
        streamUrl: String,
    ) {
        if (!track.isReady) {
            PlaybackStateStore.update(
                PlayerUiState(
                    track = track,
                    status = PlaybackStatus.Error,
                    errorMessage = "Only ready tracks can stream. This track is ${track.status}.",
                ),
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
        PlaybackStateStore.update(
            PlayerUiState(
                track = track,
                status = PlaybackStatus.Buffering,
                isBuffering = true,
            ),
        )
        player.prepare()
        player.play()
    }

    fun pause() {
        player.pause()
        publishState(player)
    }

    fun resume() {
        if (player.playbackState == Player.STATE_ENDED) {
            player.seekTo(0L)
        }
        player.play()
        publishState(player)
    }

    fun fail(
        track: TrackResponse?,
        message: String,
    ) {
        PlaybackStateStore.update { current ->
            current.copy(
                track = track ?: current.track,
                status = PlaybackStatus.Error,
                isPlaying = false,
                isBuffering = false,
                errorMessage = message,
            )
        }
    }

    fun seekTo(positionMs: Long) {
        player.seekTo(positionMs.coerceAtLeast(0L))
        publishState(player)
    }

    fun updatePosition() {
        publishState(player)
    }

    fun release() {
        player.release()
        SharedPlayerHolder.clear()
        PlaybackStateStore.update(PlayerUiState())
    }

    private object SharedPlayerHolder {
        private var player: ExoPlayer? = null

        fun player(context: Context): ExoPlayer {
            val current = player
            if (current != null) {
                return current
            }

            return ExoPlayer.Builder(context).build().also { created ->
                created.addListener(
                    object : Player.Listener {
                        override fun onPlaybackStateChanged(playbackState: Int) {
                            publishState(created)
                        }

                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            publishState(created)
                        }

                        override fun onPlayerError(error: PlaybackException) {
                            publishState(
                                player = created,
                                errorMessage = error.toPlaybackMessage(),
                            )
                        }
                    },
                )
                player = created
            }
        }

        fun clear() {
            player = null
        }
    }
}

private fun publishState(
    player: Player,
    errorMessage: String? = PlaybackStateStore.state.value.errorMessage,
) {
    val current = PlaybackStateStore.state.value
    val duration = player.duration.takeIf { it > 0 } ?: current.durationMs
    val status = when {
        errorMessage != null -> PlaybackStatus.Error
        player.playbackState == Player.STATE_BUFFERING -> PlaybackStatus.Buffering
        player.playbackState == Player.STATE_ENDED -> PlaybackStatus.Ended
        player.isPlaying -> PlaybackStatus.Playing
        current.track != null -> PlaybackStatus.Paused
        else -> PlaybackStatus.Idle
    }

    PlaybackStateStore.update {
        it.copy(
            status = status,
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
