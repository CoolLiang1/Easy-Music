package com.easymusic.app.player.service

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.session.MediaSession
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlaybackStateStore
import com.easymusic.app.player.domain.PlaybackQueueItem
import com.easymusic.app.player.domain.PlaybackQueueMode
import com.easymusic.app.player.domain.PlaybackQueueSource
import com.easymusic.app.player.domain.PlaybackQueueSourceType
import com.easymusic.app.player.domain.PlaybackSource
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlaybackEventRecorder
import com.easymusic.app.player.domain.PlayerUiState
import com.easymusic.app.player.domain.newPlaybackQueueItemId

object MediaSessionConnector {
    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null
    private var playbackEventRecorder: PlaybackEventRecorder? = null
    private var playbackQueue: List<PlaybackQueueItem> = emptyList()
    private var playbackHistory: List<PlaybackQueueItem> = emptyList()
    private var playbackQueueMode: PlaybackQueueMode? = null
    private var playbackQueueSource: PlaybackQueueSource? = null
    private var baseCycleItems: List<PlaybackQueueItem> = emptyList()
    private var currentQueueItemId: String? = null
    private var repeatPlaylist: Boolean = false
    private var repeatMediaSourceFactory: ((List<PlaybackQueueItem>) -> List<MediaSource>)? = null

    fun player(context: Context): ExoPlayer {
        return ensureSession(context).player as ExoPlayer
    }

    fun session(context: Context): MediaSession {
        return ensureSession(context)
    }

    fun setPlaybackEventRecorder(recorder: PlaybackEventRecorder) {
        playbackEventRecorder = recorder
    }

    fun setPlaybackQueue(
        items: List<PlaybackQueueItem>,
        mode: PlaybackQueueMode?,
        source: PlaybackQueueSource?,
        baseCycleItems: List<PlaybackQueueItem>,
        repeatMediaSourceFactory: ((List<PlaybackQueueItem>) -> List<MediaSource>)? = null,
    ) {
        playbackQueue = items
        playbackHistory = emptyList()
        playbackQueueMode = mode
        playbackQueueSource = source
        this.baseCycleItems = baseCycleItems
        currentQueueItemId = items.firstOrNull()?.queueItemId
        this.repeatMediaSourceFactory = repeatMediaSourceFactory
        repeatPlaylist = false
        player?.repeatMode = Player.REPEAT_MODE_OFF
        publishQueueState()
    }

    fun clearPlaybackQueue() {
        playbackQueue = emptyList()
        playbackHistory = emptyList()
        playbackQueueMode = null
        playbackQueueSource = null
        baseCycleItems = emptyList()
        currentQueueItemId = null
        repeatPlaylist = false
        repeatMediaSourceFactory = null
        player?.repeatMode = Player.REPEAT_MODE_OFF
    }

    fun setRepeatPlaylist(enabled: Boolean) {
        repeatPlaylist = enabled &&
            playbackQueueSource?.type == PlaybackQueueSourceType.Playlist &&
            baseCycleItems.isNotEmpty()
        player?.repeatMode = Player.REPEAT_MODE_OFF
        publishQueueState()
    }

    fun syncPlaylistSourceTracks(
        playlistId: Int,
        playlistName: String,
        tracks: List<TrackResponse>,
    ): List<Int> {
        val source = playbackQueueSource
        if (
            source?.type != PlaybackQueueSourceType.Playlist ||
            source.playlistId != playlistId
        ) {
            return emptyList()
        }

        val playableTracks = tracks.filter { it.isReady }
        val nextSource = source.copy(playlistName = playlistName)
        val playableTrackIds = playableTracks.map { it.id }.toSet()
        val removedIndices = playbackQueue.mapIndexedNotNull { index, item ->
            if (
                index > currentQueueIndex() &&
                item.cycleItem &&
                item.track.id !in playableTrackIds
            ) {
                index
            } else {
                null
            }
        }

        playbackQueueSource = nextSource
        baseCycleItems = orderCycleItems(
            items = playableTracks.map { track ->
                PlaybackQueueItem(
                    queueItemId = newPlaybackQueueItemId(),
                    track = track,
                    playbackSource = PlaybackSource.OnlineStream,
                    cycleItem = true,
                )
            },
            mode = playbackQueueMode,
        )
        playbackQueue = playbackQueue.filterIndexed { index, _ ->
            index !in removedIndices
        }
        repeatPlaylist = repeatPlaylist && baseCycleItems.isNotEmpty()
        player?.repeatMode = Player.REPEAT_MODE_OFF
        publishQueueState()
        return removedIndices
    }

    fun insertNext(item: PlaybackQueueItem) {
        val currentIndex = currentQueueIndex()
        val insertIndex = if (currentIndex >= 0) currentIndex + 1 else 0
        playbackQueue = playbackQueue.toMutableList().also { queue ->
            queue.add(insertIndex.coerceIn(0, queue.size), item)
        }
        if (playbackQueueSource == null) {
            playbackQueueSource = PlaybackQueueSource(PlaybackQueueSourceType.Manual)
        }
        publishQueueState()
    }

    fun addToQueue(item: PlaybackQueueItem) {
        playbackQueue = playbackQueue + item
        if (playbackQueueSource == null) {
            playbackQueueSource = PlaybackQueueSource(PlaybackQueueSourceType.Manual)
        }
        if (currentQueueItemId == null) {
            currentQueueItemId = item.queueItemId
        }
        publishQueueState()
    }

    fun removeQueueItem(queueItemId: String): Int? {
        val removedIndex = playbackQueue.indexOfFirst { item ->
            item.queueItemId == queueItemId
        }
        if (removedIndex < 0) return null

        val removedCurrent = currentQueueItemId == queueItemId
        playbackQueue = playbackQueue.filterNot { item -> item.queueItemId == queueItemId }
        playbackHistory = playbackHistory.filterNot { item -> item.queueItemId == queueItemId }
        if (removedCurrent) {
            currentQueueItemId = playbackQueue.getOrNull(removedIndex)?.queueItemId
                ?: playbackQueue.getOrNull(removedIndex - 1)?.queueItemId
        }
        publishQueueState()
        return removedIndex
    }

    fun moveUpcomingItem(
        queueItemId: String,
        targetUpcomingIndex: Int,
    ): Pair<Int, Int>? {
        val currentIndex = currentQueueIndex()
        val fromIndex = playbackQueue.indexOfFirst { item ->
            item.queueItemId == queueItemId
        }
        if (currentIndex < 0 || fromIndex <= currentIndex) {
            return null
        }

        val upcomingStartIndex = currentIndex + 1
        val upcomingSize = playbackQueue.size - upcomingStartIndex
        val toIndex = (upcomingStartIndex + targetUpcomingIndex)
            .coerceIn(upcomingStartIndex, playbackQueue.lastIndex)
        if (fromIndex == toIndex || upcomingSize <= 1) {
            return null
        }

        playbackQueue = playbackQueue.toMutableList().also { queue ->
            val item = queue.removeAt(fromIndex)
            queue.add(toIndex, item)
        }
        publishQueueState()
        return fromIndex to toIndex
    }

    fun release() {
        mediaSession?.release()
        mediaSession = null
        player?.release()
        player = null
        clearPlaybackQueue()
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
        val createdPlayer = player ?: ExoPlayer.Builder(appContext)
            .setAudioAttributes(playbackAudioAttributes(), true)
            .setHandleAudioBecomingNoisy(true)
            .build()
            .also { exoPlayer ->
                exoPlayer.addListener(
                    object : Player.Listener {
                        override fun onPlaybackStateChanged(playbackState: Int) {
                            when (playbackState) {
                                Player.STATE_ENDED -> {
                                    playbackEventRecorder?.recordComplete(
                                        positionMs = exoPlayer.currentPosition,
                                        durationMs = exoPlayer.duration.takeIf { it > 0L },
                                    )
                                    if (startPlaylistRepeatRound(exoPlayer)) {
                                        return
                                    }
                                }

                                Player.STATE_IDLE -> {
                                    playbackEventRecorder?.recordStopBeforeComplete(
                                        positionMs = exoPlayer.currentPosition,
                                        durationMs = exoPlayer.duration.takeIf { it > 0L },
                                    )
                                }
                            }
                            publishState(exoPlayer)
                        }

                        override fun onMediaItemTransition(
                            mediaItem: androidx.media3.common.MediaItem?,
                            reason: Int,
                        ) {
                            val queueItem = mediaItem?.mediaId
                                ?.let { queueItemId ->
                                    playbackQueue.firstOrNull {
                                        item -> item.queueItemId == queueItemId
                                    }
                                }
                            if (queueItem != null) {
                                val previousCurrent = currentQueueItem()
                                if (
                                    previousCurrent != null &&
                                    previousCurrent.queueItemId != queueItem.queueItemId &&
                                    playbackHistory.none {
                                        item -> item.queueItemId == previousCurrent.queueItemId
                                    }
                                ) {
                                    val previousIndex = playbackQueue.indexOf(previousCurrent)
                                    val nextIndex = playbackQueue.indexOf(queueItem)
                                    if (nextIndex > previousIndex) {
                                        playbackHistory = playbackHistory + previousCurrent
                                    } else {
                                        playbackHistory = playbackHistory.dropLast(1)
                                    }
                                }
                                currentQueueItemId = queueItem.queueItemId
                                val queueIndex = playbackQueue.indexOfFirst {
                                    it.queueItemId == queueItem.queueItemId
                                }
                                val current = PlaybackStateStore.state.value
                                if (current.currentQueueItem?.queueItemId != queueItem.queueItemId) {
                                    playbackEventRecorder?.startTrack(
                                        trackId = queueItem.track.id,
                                        playbackSource = queueItem.playbackSource,
                                        durationMs = queueItem.track.durationSeconds?.times(1000L),
                                    )
                                }
                                PlaybackStateStore.update {
                                    it.copy(
                                        track = queueItem.track,
                                        playbackSource = queueItem.playbackSource,
                                        queueSource = playbackQueueSource,
                                        queueMode = playbackQueueMode,
                                        queueIndex = queueIndex.coerceAtLeast(0),
                                        queueSize = playbackQueue.size,
                                        history = playbackHistory,
                                        currentQueueItem = queueItem,
                                        upcoming = upcomingAfter(queueItem.queueItemId),
                                        baseCycleItems = baseCycleItems,
                                        repeatPlaylist = repeatPlaylist,
                                        positionMs = 0L,
                                        durationMs = queueItem.track.durationSeconds
                                            ?.times(1000L)
                                            ?: 0L,
                                        errorMessage = null,
                                    )
                                }
                            }
                            publishState(exoPlayer)
                        }

                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            playbackEventRecorder?.onIsPlayingChanged(
                                isPlaying = isPlaying,
                                positionMs = exoPlayer.currentPosition,
                                durationMs = exoPlayer.duration.takeIf { it > 0L },
                                isBuffering = exoPlayer.playbackState == Player.STATE_BUFFERING,
                                isEnded = exoPlayer.playbackState == Player.STATE_ENDED,
                            )
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
            .setCallback(MediaSessionCallback())
            .setMediaButtonPreferences(PlaybackNotificationConfig.mediaButtonPreferences())
            .build()
            .also { session ->
                mediaSession = session
            }
    }

    private fun publishQueueState() {
        val current = currentQueueItem()
        PlaybackStateStore.update {
            it.copy(
                track = current?.track ?: it.track,
                playbackSource = current?.playbackSource ?: it.playbackSource,
                queueSource = playbackQueueSource,
                queueMode = playbackQueueMode,
                queueIndex = currentQueueIndex().coerceAtLeast(0),
                queueSize = playbackQueue.size,
                history = playbackHistory,
                currentQueueItem = current,
                upcoming = current?.queueItemId?.let(::upcomingAfter) ?: playbackQueue,
                baseCycleItems = baseCycleItems,
                repeatPlaylist = repeatPlaylist,
            )
        }
    }

    private fun currentQueueItem(): PlaybackQueueItem? =
        currentQueueItemId?.let { queueItemId ->
            playbackQueue.firstOrNull { item -> item.queueItemId == queueItemId }
        }

    private fun currentQueueIndex(): Int =
        currentQueueItemId?.let { queueItemId ->
            playbackQueue.indexOfFirst { item -> item.queueItemId == queueItemId }
        } ?: -1

    private fun upcomingAfter(queueItemId: String): List<PlaybackQueueItem> {
        val currentIndex = playbackQueue.indexOfFirst { item ->
            item.queueItemId == queueItemId
        }
        if (currentIndex < 0) return emptyList()
        return playbackQueue.drop(currentIndex + 1)
    }

    private fun orderCycleItems(
        items: List<PlaybackQueueItem>,
        mode: PlaybackQueueMode?,
        previousTrackId: Int? = null,
    ): List<PlaybackQueueItem> =
        when (mode) {
            PlaybackQueueMode.Reverse -> items.asReversed()
            PlaybackQueueMode.Shuffle -> {
                val shuffled = items.shuffled().toMutableList()
                if (shuffled.size > 1 && shuffled.firstOrNull()?.track?.id == previousTrackId) {
                    val swapIndex = shuffled.indexOfFirst { item ->
                        item.track.id != previousTrackId
                    }
                    if (swapIndex > 0) {
                        val first = shuffled[0]
                        shuffled[0] = shuffled[swapIndex]
                        shuffled[swapIndex] = first
                    }
                }
                shuffled
            }
            else -> items
        }

    @OptIn(UnstableApi::class)
    fun startPlaylistRepeatRound(exoPlayer: ExoPlayer): Boolean {
        if (
            !repeatPlaylist ||
            playbackQueueSource?.type != PlaybackQueueSourceType.Playlist ||
            baseCycleItems.isEmpty()
        ) {
            return false
        }

        val previousTrackId = currentQueueItem()?.track?.id
        val nextItems = orderCycleItems(
            items = baseCycleItems,
            mode = playbackQueueMode,
            previousTrackId = previousTrackId,
        ).map { item ->
            item.copy(queueItemId = newPlaybackQueueItemId())
        }
        val mediaSources = repeatMediaSourceFactory?.invoke(nextItems) ?: return false
        if (mediaSources.size != nextItems.size) return false

        val firstNewIndex = playbackQueue.size
        playbackQueue = playbackQueue + nextItems
        exoPlayer.addMediaSources(mediaSources)
        exoPlayer.seekTo(firstNewIndex, 0L)
        exoPlayer.prepare()
        exoPlayer.play()
        publishQueueState()
        return true
    }

    private fun playbackAudioAttributes(): AudioAttributes {
        return AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()
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
            queueIndex = currentQueueIndex(player, it.queueIndex),
            queueSize = if (PlaybackStateStore.state.value.queueSize > 0) {
                player.mediaItemCount
            } else {
                it.queueSize
            },
            status = status,
            isPlaying = player.isPlaying,
            isBuffering = player.playbackState == Player.STATE_BUFFERING,
            durationMs = duration.coerceAtLeast(0L),
            positionMs = player.currentPosition.coerceAtLeast(0L),
            errorMessage = errorMessage,
        )
    }
}

private fun currentQueueIndex(
    player: Player,
    fallback: Int,
): Int {
    return player.currentMediaItemIndex.takeIf { it >= 0 } ?: fallback
}

private fun PlaybackException.toPlaybackMessage(): String {
    val responseCode = findInvalidResponseCode()
    return when (responseCode) {
        401 -> "音频流请求未授权，请重新登录。"
        404 -> "没有找到这个音轨的音频流。"
        null -> message ?: "播放失败。"
        else -> "播放失败，HTTP $responseCode。"
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
