package com.easymusic.app.cache.domain

import com.easymusic.app.cache.data.CacheDownloadProgress
import com.easymusic.app.cache.data.CacheFileDeleteResult
import com.easymusic.app.cache.data.CacheFileDownloadResult
import com.easymusic.app.cache.data.CacheFileStore
import com.easymusic.app.cache.data.CachedTrackDao
import com.easymusic.app.cache.data.CachedTrackEntity
import com.easymusic.app.library.data.TrackResponse
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.OffsetDateTime
import java.time.ZoneOffset
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

sealed interface TrackCacheResult {
    data class Success(val cachedTrack: CachedTrack) : TrackCacheResult
    data class Failure(val message: String) : TrackCacheResult
}

sealed interface TrackCacheDeleteResult {
    data object Success : TrackCacheDeleteResult
    data class Failure(val message: String) : TrackCacheDeleteResult
}

sealed interface CachedPlaybackSource {
    data class Available(val cachedTrack: CachedTrack, val file: File) : CachedPlaybackSource
    data object Unavailable : CachedPlaybackSource
}

class TrackCacheRepository(
    private val cachedTrackDao: CachedTrackDao,
    private val cacheFileStore: CacheFileStore,
) {
    suspend fun getTrack(trackId: Int): CachedTrack? =
        cachedTrackDao.getTrack(trackId)?.toDomain()

    fun observeTrack(trackId: Int): Flow<CachedTrack?> =
        cachedTrackDao.observeTrack(trackId).map { entity -> entity?.toDomain() }

    fun observeTracksById(): Flow<Map<Int, CachedTrack>> =
        cachedTrackDao.observeTracks().map { tracks ->
            tracks.associate { track -> track.trackId to track.toDomain() }
        }

    fun observeCachedTracks(): Flow<List<CachedTrack>> =
        cachedTrackDao.observeTracksByStatus(CacheStatus.Cached.value).map { tracks ->
            tracks.map { track -> track.toDomain() }
        }

    suspend fun cachedPlaybackSource(trackId: Int): CachedPlaybackSource {
        val cached = cachedTrackDao.getTrack(trackId) ?: return CachedPlaybackSource.Unavailable
        if (cached.cacheStatus != CacheStatus.Cached.value) {
            return CachedPlaybackSource.Unavailable
        }

        val localFilePath = cached.localFilePath
        val file = localFilePath?.let(::File)
        if (file != null && file.isFile && file.canRead() && file.length() > 0L) {
            return CachedPlaybackSource.Available(cached.toDomain(), file)
        }

        cachedTrackDao.upsert(
            cached.copy(
                cacheStatus = CacheStatus.Failed.value,
                lastError = "Cached audio file is missing or unreadable.",
            ),
        )
        return CachedPlaybackSource.Unavailable
    }

    suspend fun cacheTrack(
        track: TrackResponse,
        bearerToken: String,
        streamUrl: String,
        onProgress: (CacheDownloadProgress) -> Unit = {},
    ): TrackCacheResult {
        if (!track.isReady) {
            return TrackCacheResult.Failure("Only ready tracks can be cached.")
        }

        cachedTrackDao.upsert(
            track.toEntity(
                status = CacheStatus.Caching,
                localFilePath = null,
                byteSize = null,
                cachedAt = null,
                lastError = null,
            ),
        )

        val result = try {
            cacheFileStore.downloadTrackStream(
                trackId = track.id,
                streamUrl = streamUrl,
                bearerToken = bearerToken,
                onProgress = onProgress,
            )
        } catch (exception: CancellationException) {
            cachedTrackDao.upsert(
                track.toEntity(
                    status = CacheStatus.Failed,
                    localFilePath = null,
                    byteSize = null,
                    cachedAt = null,
                    lastError = "Cache download was canceled.",
                ),
            )
            throw exception
        }

        return when (result) {
            is CacheFileDownloadResult.Success -> {
                val cached = track.toEntity(
                    status = CacheStatus.Cached,
                    localFilePath = result.file.absolutePath,
                    byteSize = result.byteSize,
                    cachedAt = nowUtc(),
                    lastError = null,
                )
                cachedTrackDao.upsert(cached)
                TrackCacheResult.Success(cached.toDomain())
            }

            is CacheFileDownloadResult.Failure -> {
                cachedTrackDao.upsert(
                    track.toEntity(
                        status = CacheStatus.Failed,
                        localFilePath = null,
                        byteSize = null,
                        cachedAt = null,
                        lastError = result.message,
                    ),
                )
                TrackCacheResult.Failure(result.message)
            }
        }
    }

    suspend fun deleteCachedTrack(trackId: Int): TrackCacheDeleteResult {
        val cached = cachedTrackDao.getTrack(trackId) ?: return TrackCacheDeleteResult.Success

        return when (val fileResult = cacheFileStore.deleteCachedTrackFile(cached.localFilePath)) {
            CacheFileDeleteResult.Deleted,
            CacheFileDeleteResult.Missing,
            -> {
                cachedTrackDao.deleteTrack(trackId)
                TrackCacheDeleteResult.Success
            }

            is CacheFileDeleteResult.Failure -> TrackCacheDeleteResult.Failure(fileResult.message)
        }
    }

    private fun TrackResponse.toEntity(
        status: CacheStatus,
        localFilePath: String?,
        byteSize: Long?,
        cachedAt: String?,
        lastError: String?,
    ): CachedTrackEntity = CachedTrackEntity(
        trackId = id,
        title = title,
        artist = artist,
        album = album,
        durationSeconds = durationSeconds,
        contentType = contentType,
        tagsSnapshotJson = tagsSnapshotJson(),
        sourceUpdatedAt = updatedAt,
        localFilePath = localFilePath,
        byteSize = byteSize,
        cacheStatus = status.value,
        cachedAt = cachedAt,
        lastError = lastError,
    )

    private fun TrackResponse.tagsSnapshotJson(): String =
        JSONArray(
            tags.map { tag ->
                JSONObject()
                    .put("id", tag.id)
                    .put("name", tag.name)
                    .put("group", tag.group)
                    .put("created_at", tag.createdAt)
            },
        ).toString()

    private fun CachedTrackEntity.toDomain(): CachedTrack = CachedTrack(
        trackId = trackId,
        title = title,
        artist = artist,
        album = album,
        durationSeconds = durationSeconds,
        contentType = contentType,
        tagsSnapshotJson = tagsSnapshotJson,
        sourceUpdatedAt = sourceUpdatedAt,
        localFilePath = localFilePath,
        byteSize = byteSize,
        cacheStatus = CacheStatus.entries.firstOrNull { it.value == cacheStatus } ?: CacheStatus.Failed,
        cachedAt = cachedAt,
        lastError = lastError,
    )

    private fun nowUtc(): String = OffsetDateTime.now(ZoneOffset.UTC).toString()
}
