package com.easymusic.app.cache.domain

import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.cache.data.OfflinePlaybackEventDao
import com.easymusic.app.cache.data.PlaybackEventSyncApi
import com.easymusic.app.core.network.ApiResult
import java.time.Clock
import java.time.Instant
import kotlinx.coroutines.flow.Flow

class PlaybackEventSyncRepository(
    private val offlinePlaybackEventDao: OfflinePlaybackEventDao,
    private val playbackEventSyncApi: PlaybackEventSyncApi,
    private val tokenStore: AuthTokenStore,
    private val clock: Clock = Clock.systemUTC(),
    private val batchSize: Int = DEFAULT_BATCH_SIZE,
) {
    fun observePendingCount(): Flow<Int> = offlinePlaybackEventDao.observePendingCount()

    fun observePendingLastError(): Flow<String?> = offlinePlaybackEventDao.observePendingLastError()

    suspend fun syncPendingEvents(): PlaybackEventSyncResult {
        val pendingEvents = offlinePlaybackEventDao.listPending(limit = batchSize)
        if (pendingEvents.isEmpty()) {
            return PlaybackEventSyncResult.NoPendingEvents
        }

        val token = tokenStore.readToken()
        if (token.isNullOrBlank()) {
            offlinePlaybackEventDao.markPendingRetry(
                clientEventIds = pendingEvents.map { it.clientEventId },
                lastError = SIGN_IN_REQUIRED_MESSAGE,
            )
            return PlaybackEventSyncResult.SignInRequired
        }

        return when (val result = playbackEventSyncApi.syncPlaybackEvents(token, pendingEvents)) {
            is ApiResult.Success -> {
                val acceptedIds = result.value.accepted.map { it.clientEventId }
                val syncedAt = Instant.now(clock).toString()
                if (acceptedIds.isNotEmpty()) {
                    offlinePlaybackEventDao.markSynced(
                        clientEventIds = acceptedIds,
                        syncedAt = syncedAt,
                    )
                }

                result.value.failed.forEach { failed ->
                    offlinePlaybackEventDao.markFailed(
                        clientEventId = failed.clientEventId,
                        lastError = failed.error,
                    )
                }

                PlaybackEventSyncResult.Synced(
                    acceptedCount = acceptedIds.size,
                    failedCount = result.value.failed.size,
                )
            }

            is ApiResult.Unauthorized -> {
                offlinePlaybackEventDao.markPendingRetry(
                    clientEventIds = pendingEvents.map { it.clientEventId },
                    lastError = SIGN_IN_REQUIRED_MESSAGE,
                )
                PlaybackEventSyncResult.SignInRequired
            }

            is ApiResult.NetworkError -> markRetryableFailure(pendingEvents.map { it.clientEventId }, result.message)
            is ApiResult.HttpError -> markRetryableFailure(pendingEvents.map { it.clientEventId }, result.message)
            is ApiResult.SerializationError -> markRetryableFailure(pendingEvents.map { it.clientEventId }, result.message)
        }
    }

    private suspend fun markRetryableFailure(
        clientEventIds: List<String>,
        message: String,
    ): PlaybackEventSyncResult.RetryableFailure {
        offlinePlaybackEventDao.markPendingRetry(
            clientEventIds = clientEventIds,
            lastError = message,
        )
        return PlaybackEventSyncResult.RetryableFailure(message)
    }

    private companion object {
        const val DEFAULT_BATCH_SIZE = 25
        const val SIGN_IN_REQUIRED_MESSAGE = "Sign in is required to sync playback events."
    }
}

sealed interface PlaybackEventSyncResult {
    data object NoPendingEvents : PlaybackEventSyncResult

    data class Synced(
        val acceptedCount: Int,
        val failedCount: Int,
    ) : PlaybackEventSyncResult

    data object SignInRequired : PlaybackEventSyncResult

    data class RetryableFailure(
        val message: String,
    ) : PlaybackEventSyncResult
}
