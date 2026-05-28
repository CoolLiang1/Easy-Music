package com.easymusic.app.player.service

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import com.easymusic.app.player.domain.PlaybackStateStore
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlayerUiState

object MediaSessionConnector {
    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null

    fun player(context: Context): ExoPlayer {
        return ensureSession(context).player as ExoPlayer
    }

    fun session(context: Context): MediaSession {
        return ensureSession(context)
    }

    fun release() {
        mediaSession?.release()
        mediaSession = null
        player?.release()
        player = null
        PlaybackStateStore.update(PlayerUiState())
    }

    fun releaseIfNoPlaybackSessionNeeded(): Boolean {
        val currentPlayer = player ?: return true
        val shouldRelease = currentPlayer.mediaItemCount == 0 ||
            currentPlayer.playbackState == Player.STATE_IDLE ||
            currentPlayer.playbackState == Player.STATE_ENDED

        if (shouldRelease) {
            release()
        }

        return shouldRelease
    }

    @OptIn(UnstableApi::class)
    private fun ensureSession(context: Context): MediaSession {
        val currentSession = mediaSession
        if (currentSession != null) {
            return currentSession
        }

        val appContext = context.applicationContext
        val createdPlayer = player ?: ExoPlayer.Builder(appContext).build().also { exoPlayer ->
            exoPlayer.addListener(
                object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        publishState(exoPlayer)
                    }

                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        publishState(exoPlayer)
                    }

                    override fun onPlayerError(error: PlaybackException) {
                        publishState(
                            player = exoPlayer,
                            errorMessage = error.toPlaybackMessage(),
                        )
                    }
                },
            )
            player = exoPlayer
        }

        return MediaSession.Builder(appContext, createdPlayer)
            .setMediaButtonPreferences(PlaybackNotificationConfig.mediaButtonPreferences())
            .build()
            .also { session ->
                mediaSession = session
            }
    }
}

fun publishState(
    player: Player,
    errorMessage: String? = PlaybackStateStore.state.value.errorMessage,
) {
    val current = PlaybackStateStore.state.value
    val duration = player.duration.takeIf { it > 0 } ?: current.durationMs
    val status = when {
        errorMessage != null -> PlaybackStatus.Error
        player.playbackState == Player.STATE_IDLE -> PlaybackStatus.Idle
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
