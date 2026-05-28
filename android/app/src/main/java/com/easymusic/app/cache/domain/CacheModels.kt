package com.easymusic.app.cache.domain

enum class CacheStatus(val value: String) {
    NotCached("not_cached"),
    Caching("caching"),
    Cached("cached"),
    Failed("failed"),
}

enum class OfflinePlaybackEventType(val value: String) {
    Play("play"),
    Pause("pause"),
    Resume("resume"),
    Seek("seek"),
    Skip("skip"),
    Complete("complete"),
}

enum class OfflinePlaybackEventSyncStatus(val value: String) {
    Pending("pending"),
    Synced("synced"),
    Failed("failed"),
}

data class CachedTrack(
    val trackId: Int,
    val title: String,
    val artist: String?,
    val album: String?,
    val durationSeconds: Int?,
    val contentType: String,
    val tagsSnapshotJson: String?,
    val sourceUpdatedAt: String,
    val localFilePath: String?,
    val byteSize: Long?,
    val cacheStatus: CacheStatus,
    val cachedAt: String?,
    val lastError: String?,
)

data class OfflinePlaybackEvent(
    val clientEventId: String,
    val trackId: Int,
    val eventType: OfflinePlaybackEventType,
    val positionSeconds: Double,
    val durationSeconds: Double?,
    val occurredAt: String,
    val client: String,
    val playbackSource: String?,
    val retryCount: Int,
    val syncStatus: OfflinePlaybackEventSyncStatus,
    val lastError: String?,
    val syncedAt: String?,
)
