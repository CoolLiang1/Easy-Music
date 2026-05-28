package com.easymusic.app.cache.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface OfflinePlaybackEventDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(event: OfflinePlaybackEventEntity): Long

    @Query(
        """
        SELECT * FROM offline_playback_events
        WHERE syncStatus = :pendingStatus
        ORDER BY occurredAt ASC
        LIMIT :limit
        """,
    )
    suspend fun listPending(
        pendingStatus: String = "pending",
        limit: Int = 50,
    ): List<OfflinePlaybackEventEntity>

    @Query(
        """
        SELECT COUNT(*) FROM offline_playback_events
        WHERE syncStatus = :pendingStatus
        """,
    )
    fun observePendingCount(
        pendingStatus: String = "pending",
    ): Flow<Int>

    @Query(
        """
        SELECT lastError FROM offline_playback_events
        WHERE syncStatus = :pendingStatus AND lastError IS NOT NULL
        ORDER BY retryCount DESC, occurredAt ASC
        LIMIT 1
        """,
    )
    fun observePendingLastError(
        pendingStatus: String = "pending",
    ): Flow<String?>

    @Query(
        """
        UPDATE offline_playback_events
        SET syncStatus = :syncedStatus,
            syncedAt = :syncedAt,
            lastError = NULL
        WHERE clientEventId IN (:clientEventIds)
        """,
    )
    suspend fun markSynced(
        clientEventIds: List<String>,
        syncedAt: String,
        syncedStatus: String = "synced",
    ): Int

    @Query(
        """
        UPDATE offline_playback_events
        SET syncStatus = :failedStatus,
            retryCount = retryCount + 1,
            lastError = :lastError
        WHERE clientEventId = :clientEventId
        """,
    )
    suspend fun markFailed(
        clientEventId: String,
        lastError: String?,
        failedStatus: String = "failed",
    ): Int

    @Query(
        """
        UPDATE offline_playback_events
        SET syncStatus = :pendingStatus,
            retryCount = retryCount + 1,
            lastError = :lastError
        WHERE clientEventId IN (:clientEventIds)
        """,
    )
    suspend fun markPendingRetry(
        clientEventIds: List<String>,
        lastError: String?,
        pendingStatus: String = "pending",
    ): Int
}
