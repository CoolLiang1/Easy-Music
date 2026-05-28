package com.easymusic.app.player.domain

import com.easymusic.app.cache.data.OfflinePlaybackEventDao
import com.easymusic.app.cache.data.OfflinePlaybackEventEntity
import com.easymusic.app.cache.domain.OfflinePlaybackEventSyncStatus
import com.easymusic.app.cache.domain.OfflinePlaybackEventType
import java.time.Clock
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Job
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch

class PlaybackEventRecorder(
    private val offlinePlaybackEventDao: OfflinePlaybackEventDao,
    private val clock: Clock = Clock.systemUTC(),
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
    private val clientEventIdFactory: () -> String = { UUID.randomUUID().toString() },
) {
    private var activeSession: ActivePlaybackSession? = null
    private val pendingWrites = mutableListOf<Job>()

    @Synchronized
    fun startTrack(
        trackId: Int,
        playbackSource: PlaybackSource,
        positionMs: Long = 0L,
        durationMs: Long? = null,
    ) {
        val previous = activeSession
        if (previous != null && !previous.completed && !previous.stopped && previous.trackId != trackId) {
            enqueueLocked(
                session = previous,
                eventType = OfflinePlaybackEventType.Skip,
                positionMs = positionMs,
                durationMs = durationMs,
            )
        }

        val session = ActivePlaybackSession(
            trackId = trackId,
            playbackSource = playbackSource,
            isPlaying = true,
        )
        activeSession = session
        enqueueLocked(
            session = session,
            eventType = OfflinePlaybackEventType.Play,
            positionMs = 0L,
            durationMs = durationMs,
        )
    }

    @Synchronized
    fun restartCurrent(
        positionMs: Long = 0L,
        durationMs: Long? = null,
    ) {
        val current = activeSession ?: return
        val session = current.copy(
            completed = false,
            stopped = false,
            isPlaying = true,
        )
        activeSession = session
        enqueueLocked(
            session = session,
            eventType = OfflinePlaybackEventType.Play,
            positionMs = positionMs,
            durationMs = durationMs,
        )
    }

    @Synchronized
    fun onIsPlayingChanged(
        isPlaying: Boolean,
        positionMs: Long,
        durationMs: Long?,
        isBuffering: Boolean,
        isEnded: Boolean,
    ) {
        val current = activeSession ?: return
        if (current.completed || current.stopped || isBuffering || isEnded || current.isPlaying == isPlaying) {
            return
        }

        val updated = current.copy(isPlaying = isPlaying)
        activeSession = updated
        enqueueLocked(
            session = updated,
            eventType = if (isPlaying) OfflinePlaybackEventType.Resume else OfflinePlaybackEventType.Pause,
            positionMs = positionMs,
            durationMs = durationMs,
        )
    }

    @Synchronized
    fun recordSeek(
        positionMs: Long,
        durationMs: Long?,
    ) {
        val current = activeSession ?: return
        if (current.completed || current.stopped) {
            return
        }
        enqueueLocked(
            session = current,
            eventType = OfflinePlaybackEventType.Seek,
            positionMs = positionMs,
            durationMs = durationMs,
        )
    }

    @Synchronized
    fun recordComplete(
        positionMs: Long,
        durationMs: Long?,
    ) {
        val current = activeSession ?: return
        if (current.completed || current.stopped) {
            return
        }
        val completed = current.copy(
            completed = true,
            isPlaying = false,
        )
        activeSession = completed
        enqueueLocked(
            session = completed,
            eventType = OfflinePlaybackEventType.Complete,
            positionMs = positionMs,
            durationMs = durationMs,
        )
    }

    @Synchronized
    fun recordStopBeforeComplete(
        positionMs: Long,
        durationMs: Long?,
    ) {
        val current = activeSession ?: return
        if (current.completed || current.stopped) {
            return
        }
        val stopped = current.copy(
            isPlaying = false,
            stopped = true,
        )
        activeSession = stopped
        enqueueLocked(
            session = stopped,
            eventType = OfflinePlaybackEventType.Skip,
            positionMs = positionMs,
            durationMs = durationMs,
        )
    }

    private fun enqueueLocked(
        session: ActivePlaybackSession,
        eventType: OfflinePlaybackEventType,
        positionMs: Long,
        durationMs: Long?,
    ) {
        val event = OfflinePlaybackEventEntity(
            clientEventId = clientEventIdFactory(),
            trackId = session.trackId,
            eventType = eventType.value,
            positionSeconds = positionMs.toSeconds(),
            durationSeconds = durationMs?.takeIf { it > 0L }?.toSeconds(),
            occurredAt = Instant.now(clock).toString(),
            client = CLIENT_ANDROID,
            playbackSource = session.playbackSource.value,
            retryCount = 0,
            syncStatus = OfflinePlaybackEventSyncStatus.Pending.value,
            lastError = null,
            syncedAt = null,
        )
        val job = scope.launch {
            offlinePlaybackEventDao.insert(event)
        }
        pendingWrites += job
        job.invokeOnCompletion {
            synchronized(this) {
                pendingWrites.remove(job)
            }
        }
    }

    suspend fun flushPendingWrites() {
        val jobs = synchronized(this) {
            pendingWrites.toList()
        }
        jobs.joinAll()
    }

    private fun Long.toSeconds(): Double = this.coerceAtLeast(0L) / 1000.0

    private data class ActivePlaybackSession(
        val trackId: Int,
        val playbackSource: PlaybackSource,
        val isPlaying: Boolean = false,
        val completed: Boolean = false,
        val stopped: Boolean = false,
    )

    private companion object {
        const val CLIENT_ANDROID = "android"
    }
}

val PlaybackSource.value: String
    get() = when (this) {
        PlaybackSource.OnlineStream -> "online_stream"
        PlaybackSource.OfflineCache -> "offline_cache"
    }
