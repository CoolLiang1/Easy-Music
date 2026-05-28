package com.easymusic.app.cache.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "cached_tracks")
data class CachedTrackEntity(
    @PrimaryKey val trackId: Int,
    val title: String,
    val artist: String?,
    val album: String?,
    val durationSeconds: Int?,
    val contentType: String,
    val tagsSnapshotJson: String?,
    val sourceUpdatedAt: String,
    val localFilePath: String?,
    val byteSize: Long?,
    val cacheStatus: String,
    val cachedAt: String?,
    val lastError: String?,
)
