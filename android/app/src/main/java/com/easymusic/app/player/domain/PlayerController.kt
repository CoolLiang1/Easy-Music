package com.easymusic.app.player.domain

import android.content.Context
import android.content.Intent
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.data.AuthenticatedDataSourceFactory
import com.easymusic.app.player.service.EasyMusicPlaybackService
import com.easymusic.app.player.service.MediaSessionConnector
import com.easymusic.app.player.service.publishState
import kotlinx.coroutines.flow.StateFlow

@OptIn(UnstableApi::class)
class PlayerController(
    private val context: Context,
    private val dataSourceFactory: AuthenticatedDataSourceFactory = AuthenticatedDataSourceFactory(),
) {
    private val appContext = context.applicationContext

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

        ensureServiceRunning()

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
        val player = MediaSessionConnector.player(appContext)
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
        val player = MediaSessionConnector.player(appContext)
        player.pause()
        publishState(player)
    }

    fun resume() {
        val player = MediaSessionConnector.player(appContext)
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
        val player = MediaSessionConnector.player(appContext)
        player.seekTo(positionMs.coerceAtLeast(0L))
        publishState(player)
    }

    fun updatePosition() {
        val player = MediaSessionConnector.player(appContext)
        publishState(player)
    }

    fun release() {
        MediaSessionConnector.release()
    }

    private fun ensureServiceRunning() {
        appContext.startService(Intent(appContext, EasyMusicPlaybackService::class.java))
    }
}
