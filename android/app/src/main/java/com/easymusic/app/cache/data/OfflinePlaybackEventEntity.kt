package com.easymusic.app.cache.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "offline_playback_events",
    indices = [
        Index(value = ["syncStatus"]),
        Index(value = ["trackId"]),
    ],
)
data class OfflinePlaybackEventEntity(
    @PrimaryKey val clientEventId: String,
    val trackId: Int,
    val eventType: String,
    val positionSeconds: Double,
    val durationSeconds: Double?,
    val occurredAt: String,
    val retryCount: Int = 0,
    val syncStatus: String,
    val lastError: String?,
    val syncedAt: String?,
)
