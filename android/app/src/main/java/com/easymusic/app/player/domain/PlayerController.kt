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
import androidx.media3.exoplayer.source.MediaSource
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
                    errorMessage = "只有已就绪的音轨可以在线播放。当前状态：${track.status}。",
                ),
            )
            return
        }

        val queueItem = PlaybackQueueItem(
            queueItemId = newPlaybackQueueItemId(),
            track = track,
            playbackSource = PlaybackSource.OnlineStream,
        )
        val mediaItem = track.toMediaItem(
            mediaId = queueItem.queueItemId,
            uri = streamUrl,
        )

        val mediaSource = DefaultMediaSourceFactory(dataSourceFactory.create(bearerToken))
            .createMediaSource(mediaItem)
        val player = MediaSessionConnector.player(appContext)
        MediaSessionConnector.setPlaybackEventRecorder(eventRecorder)
        MediaSessionConnector.setPlaybackQueue(
            items = listOf(queueItem),
            mode = null,
            source = PlaybackQueueSource(PlaybackQueueSourceType.SingleTrack),
            baseCycleItems = emptyList(),
        )
        player.setMediaSource(mediaSource)
        startPlayback(
            player = player,
            queueItem = queueItem,
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
                    errorMessage = "只有已就绪的音轨可以播放。当前状态：${track.status}。",
                ),
            )
            return
        }

        val player = MediaSessionConnector.player(appContext)
        MediaSessionConnector.setPlaybackEventRecorder(eventRecorder)
        val queueItem = PlaybackQueueItem(
            queueItemId = newPlaybackQueueItemId(),
            track = track,
            playbackSource = PlaybackSource.OfflineCache,
        )
        MediaSessionConnector.setPlaybackQueue(
            items = listOf(queueItem),
            mode = null,
            source = PlaybackQueueSource(PlaybackQueueSourceType.SingleTrack),
            baseCycleItems = emptyList(),
        )
        player.setMediaItem(
            track.toMediaItem(
                mediaId = queueItem.queueItemId,
                uri = Uri.fromFile(audioFile).toString(),
            ),
        )
        startPlayback(
            player = player,
            queueItem = queueItem,
            playbackSource = PlaybackSource.OfflineCache,
        )
    }

    fun playQueue(
        tracks: List<TrackResponse>,
        bearerToken: String,
        streamUrlForTrack: (Int) -> String,
        mode: PlaybackQueueMode,
        playlistId: Int? = null,
        playlistName: String? = null,
    ) {
        val playableTracks = tracks.filter { it.isReady }
        if (playableTracks.isEmpty()) {
            PlaybackStateStore.update(
                PlayerUiState(
                    status = PlaybackStatus.Error,
                    queueMode = mode,
                    queueSize = 0,
                    errorMessage = "歌单里没有已就绪的可播放音轨。",
                ),
            )
            return
        }

        val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory.create(bearerToken))
        val queueItems = playableTracks.map { track ->
            PlaybackQueueItem(
                queueItemId = newPlaybackQueueItemId(),
                track = track,
                playbackSource = PlaybackSource.OnlineStream,
                cycleItem = true,
            )
        }
        val mediaSources = queueItems.map { item ->
            mediaSourceFactory.createMediaSource(
                item.track.toMediaItem(
                    mediaId = item.queueItemId,
                    uri = streamUrlForTrack(item.track.id),
                ),
            )
        }
        val player = MediaSessionConnector.player(appContext)
        MediaSessionConnector.setPlaybackEventRecorder(eventRecorder)
        val queueSource = PlaybackQueueSource(
            type = PlaybackQueueSourceType.Playlist,
            playlistId = playlistId,
            playlistName = playlistName,
        )
        MediaSessionConnector.setPlaybackQueue(
            items = queueItems,
            mode = mode,
            source = queueSource,
            baseCycleItems = queueItems,
        )
        player.setMediaSources(mediaSources)
        startPlaybackQueue(
            player = player,
            mediaSources = mediaSources,
            queueItems = queueItems,
            mode = mode,
            queueSource = queueSource,
        )
    }

    fun playNext(
        track: TrackResponse,
        bearerToken: String,
        streamUrl: String,
    ) {
        if (!track.isReady) {
            fail(track = track, message = "只有已就绪的音轨可以加入播放队列。")
            return
        }

        val queueItem = PlaybackQueueItem(
            queueItemId = newPlaybackQueueItemId(),
            track = track,
            playbackSource = PlaybackSource.OnlineStream,
        )
        val mediaSource = DefaultMediaSourceFactory(dataSourceFactory.create(bearerToken))
            .createMediaSource(
                track.toMediaItem(
                    mediaId = queueItem.queueItemId,
                    uri = streamUrl,
                ),
            )
        val player = MediaSessionConnector.player(appContext)
        MediaSessionConnector.insertNext(queueItem)
        val insertIndex = (player.currentMediaItemIndex + 1).coerceAtLeast(0)
        player.addMediaSource(insertIndex.coerceAtMost(player.mediaItemCount), mediaSource)
        publishState(player)
    }

    fun addToQueue(
        track: TrackResponse,
        bearerToken: String,
        streamUrl: String,
    ) {
        if (!track.isReady) {
            fail(track = track, message = "只有已就绪的音轨可以加入播放队列。")
            return
        }

        val queueItem = PlaybackQueueItem(
            queueItemId = newPlaybackQueueItemId(),
            track = track,
            playbackSource = PlaybackSource.OnlineStream,
        )
        val mediaSource = DefaultMediaSourceFactory(dataSourceFactory.create(bearerToken))
            .createMediaSource(
                track.toMediaItem(
                    mediaId = queueItem.queueItemId,
                    uri = streamUrl,
                ),
            )
        val player = MediaSessionConnector.player(appContext)
        MediaSessionConnector.addToQueue(queueItem)
        player.addMediaSource(mediaSource)
        publishState(player)
    }

    fun next() {
        val player = MediaSessionConnector.player(appContext)
        if (player.hasNextMediaItem()) {
            player.seekToNextMediaItem()
        } else {
            player.stop()
        }
        publishState(player)
    }

    fun previous() {
        val player = MediaSessionConnector.player(appContext)
        if (PlaybackStateStore.state.value.history.isEmpty()) {
            return
        }
        player.seekToPreviousMediaItem()
        publishState(player)
    }

    fun removeQueueItem(queueItemId: String) {
        val player = MediaSessionConnector.player(appContext)
        val removedIndex = MediaSessionConnector.removeQueueItem(queueItemId)
        if (removedIndex == null) {
            publishState(player)
            return
        }

        if (removedIndex < player.mediaItemCount) {
            player.removeMediaItem(removedIndex)
        }
        if (player.mediaItemCount == 0) {
            player.stop()
            player.clearMediaItems()
        }
        publishState(player)
    }

    fun clearQueue() {
        val player = MediaSessionConnector.player(appContext)
        eventRecorder.recordStopBeforeComplete(
            positionMs = player.currentPosition,
            durationMs = player.duration.takeIf { it > 0L },
        )
        player.stop()
        player.clearMediaItems()
        MediaSessionConnector.clearPlaybackQueue()
        PlaybackStateStore.update(PlayerUiState())
    }

    private fun startPlayback(
        player: Player,
        queueItem: PlaybackQueueItem,
        playbackSource: PlaybackSource,
    ) {
        val previousState = PlaybackStateStore.state.value
        eventRecorder.startTrack(
            trackId = queueItem.track.id,
            playbackSource = playbackSource,
            positionMs = previousState.positionMs,
            durationMs = previousState.durationMs.takeIf { it > 0L }
                ?: queueItem.track.durationSeconds?.times(1000L),
        )
        PlaybackStateStore.update(
            PlayerUiState(
                track = queueItem.track,
                status = PlaybackStatus.Buffering,
                playbackSource = playbackSource,
                queueSource = PlaybackQueueSource(PlaybackQueueSourceType.SingleTrack),
                queueIndex = 0,
                queueSize = 1,
                currentQueueItem = queueItem,
                isBuffering = true,
            ),
        )
        player.prepare()
        player.play()
        ensureServiceRunning()
    }

    private fun startPlaybackQueue(
        player: Player,
        mediaSources: List<MediaSource>,
        queueItems: List<PlaybackQueueItem>,
        mode: PlaybackQueueMode,
        queueSource: PlaybackQueueSource,
    ) {
        val firstItem = queueItems.first()
        eventRecorder.startTrack(
            trackId = firstItem.track.id,
            playbackSource = PlaybackSource.OnlineStream,
            durationMs = firstItem.track.durationSeconds?.times(1000L),
        )
        PlaybackStateStore.update(
            PlayerUiState(
                track = firstItem.track,
                status = PlaybackStatus.Buffering,
                playbackSource = PlaybackSource.OnlineStream,
                queueSource = queueSource,
                queueMode = mode,
                queueIndex = 0,
                queueSize = mediaSources.size,
                currentQueueItem = firstItem,
                upcoming = queueItems.drop(1),
                baseCycleItems = queueItems,
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
                errorMessage = "离线缓存已删除。",
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

    private fun TrackResponse.toMediaItem(
        mediaId: String,
        uri: String,
    ): MediaItem =
        MediaItem.Builder()
            .setMediaId(mediaId)
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
