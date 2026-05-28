package com.easymusic.app.player.domain

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.easymusic.app.cache.data.EasyMusicDatabase
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.data.AuthenticatedDataSourceFactory
import com.easymusic.app.player.service.EasyMusicPlaybackService
import com.easymusic.app.player.service.MediaSessionConnector
import com.easymusic.app.player.service.publishState
import java.io.File
import kotlinx.coroutines.flow.StateFlow

@OptIn(UnstableApi::class)
class PlayerController(
    private val context: Context,
    private val dataSourceFactory: AuthenticatedDataSourceFactory = AuthenticatedDataSourceFactory(),
    playbackEventRecorder: PlaybackEventRecorder? = null,
) {
    private val appContext = context.applicationContext
    private val eventRecorder = playbackEventRecorder ?: PlaybackEventRecorder(
        EasyMusicDatabase.getInstance(appContext).offlinePlaybackEventDao(),
    )

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

        val mediaItem = track.toMediaItem(streamUrl)

        val mediaSource = DefaultMediaSourceFactory(dataSourceFactory.create(bearerToken))
            .createMediaSource(mediaItem)
        val player = MediaSessionConnector.player(appContext)
        MediaSessionConnector.setPlaybackEventRecorder(eventRecorder)
        player.setMediaSource(mediaSource)
        startPlayback(
            player = player,
            track = track,
            playbackSource = PlaybackSource.OnlineStream,
        )
    }

    fun playCached(
        track: TrackResponse,
        audioFile: File,
    ) {
        if (!track.isReady) {
            PlaybackStateStore.update(
                PlayerUiState(
                    track = track,
                    status = PlaybackStatus.Error,
                    errorMessage = "Only ready tracks can play. This track is ${track.status}.",
                ),
            )
            return
        }

        val player = MediaSessionConnector.player(appContext)
        MediaSessionConnector.setPlaybackEventRecorder(eventRecorder)
        player.setMediaItem(track.toMediaItem(Uri.fromFile(audioFile).toString()))
        startPlayback(
            player = player,
            track = track,
            playbackSource = PlaybackSource.OfflineCache,
        )
    }

    private fun startPlayback(
        player: Player,
        track: TrackResponse,
        playbackSource: PlaybackSource,
    ) {
        val previousState = PlaybackStateStore.state.value
        eventRecorder.startTrack(
            trackId = track.id,
            playbackSource = playbackSource,
            positionMs = previousState.positionMs,
            durationMs = previousState.durationMs.takeIf { it > 0L }
                ?: track.durationSeconds?.times(1000L),
        )
        PlaybackStateStore.update(
            PlayerUiState(
                track = track,
                status = PlaybackStatus.Buffering,
                playbackSource = playbackSource,
                isBuffering = true,
            ),
        )
        player.prepare()
        player.play()
        ensureServiceRunning()
    }

    fun pause() {
        val player = MediaSessionConnector.player(appContext)
        player.pause()
        publishState(player)
    }

    fun resume() {
        val player = MediaSessionConnector.player(appContext)
        if (player.playbackState == Player.STATE_ENDED) {
            eventRecorder.restartCurrent(
                positionMs = 0L,
                durationMs = player.duration.takeIf { it > 0L },
            )
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
        eventRecorder.recordSeek(
            positionMs = player.currentPosition,
            durationMs = player.duration.takeIf { it > 0L },
        )
        publishState(player)
    }

    fun updatePosition() {
        val player = MediaSessionConnector.player(appContext)
        publishState(player)
    }

    fun stopIfPlayingCachedTrack(trackId: Int) {
        val current = PlaybackStateStore.state.value
        if (current.track?.id != trackId || current.playbackSource != PlaybackSource.OfflineCache) {
            return
        }

        val player = MediaSessionConnector.player(appContext)
        eventRecorder.recordStopBeforeComplete(
            positionMs = player.currentPosition,
            durationMs = player.duration.takeIf { it > 0L },
        )
        player.stop()
        player.clearMediaItems()
        PlaybackStateStore.update(
            current.copy(
                status = PlaybackStatus.Idle,
                isPlaying = false,
                isBuffering = false,
                positionMs = 0L,
                errorMessage = "Cached copy was deleted.",
            ),
        )
    }

    fun release() {
        MediaSessionConnector.release()
    }

    private fun ensureServiceRunning() {
        MediaSessionConnector.session(appContext)
        appContext.startForegroundService(Intent(appContext, EasyMusicPlaybackService::class.java))
    }

    private fun TrackResponse.toMediaItem(uri: String): MediaItem =
        MediaItem.Builder()
            .setUri(uri)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setArtist(artist)
                    .setAlbumTitle(album)
                    .build(),
            )
            .build()
}
