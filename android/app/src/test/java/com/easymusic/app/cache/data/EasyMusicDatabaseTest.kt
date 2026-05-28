package com.easymusic.app.cache.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.easymusic.app.cache.domain.CacheStatus
import com.easymusic.app.cache.domain.OfflinePlaybackEventSyncStatus
import com.easymusic.app.cache.domain.OfflinePlaybackEventType
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EasyMusicDatabaseTest {
    private lateinit var database: EasyMusicDatabase

    private val cachedTrackDao: CachedTrackDao
        get() = database.cachedTrackDao()

    private val offlinePlaybackEventDao: OfflinePlaybackEventDao
        get() = database.offlinePlaybackEventDao()

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, EasyMusicDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun cachedTrackDao_upsertsListsReadsAndDeletesOneTrack() = runTest {
        val initial = cachedTrackEntity(
            title = "Morning Song",
            cacheStatus = CacheStatus.Caching.value,
            localFilePath = null,
            byteSize = null,
            cachedAt = null,
        )
        val updated = initial.copy(
            cacheStatus = CacheStatus.Cached.value,
            localFilePath = "/private/cache/track-42.mp3",
            byteSize = 1234L,
            cachedAt = "2026-05-28T09:30:00Z",
        )

        cachedTrackDao.upsert(initial)
        cachedTrackDao.upsert(updated)

        assertEquals(listOf(updated), cachedTrackDao.listTracks())
        assertEquals(updated, cachedTrackDao.getTrack(42))

        assertEquals(1, cachedTrackDao.deleteTrack(42))
        assertNull(cachedTrackDao.getTrack(42))
    }

    @Test
    fun cachedTrackDao_observesOnlyCachedTracksByStatus() = runTest {
        val cached = cachedTrackEntity(
            trackId = 42,
            title = "Cached Song",
            cacheStatus = CacheStatus.Cached.value,
            localFilePath = "/private/cache/track-42.mp3",
            byteSize = 1234L,
            cachedAt = "2026-05-28T09:30:00Z",
        )
        val failed = cachedTrackEntity(
            trackId = 43,
            title = "Failed Song",
            cacheStatus = CacheStatus.Failed.value,
            localFilePath = null,
            byteSize = null,
            cachedAt = null,
        )

        cachedTrackDao.upsert(failed)
        cachedTrackDao.upsert(cached)

        assertEquals(
            listOf(cached),
            cachedTrackDao.observeTracksByStatus(CacheStatus.Cached.value).first(),
        )
    }

    @Test
    fun offlinePlaybackEventDao_insertsListsAndMarksSyncState() = runTest {
        val pending = playbackEventEntity("event-1", "2026-05-28T09:30:00Z")
        val newer = playbackEventEntity("event-2", "2026-05-28T09:31:00Z")

        offlinePlaybackEventDao.insert(newer)
        offlinePlaybackEventDao.insert(pending)
        offlinePlaybackEventDao.insert(pending)

        assertEquals(listOf(pending, newer), offlinePlaybackEventDao.listPending(limit = 10))

        assertEquals(
            1,
            offlinePlaybackEventDao.markSynced(
                clientEventIds = listOf("event-1"),
                syncedAt = "2026-05-28T09:32:00Z",
            ),
        )
        assertEquals(listOf(newer), offlinePlaybackEventDao.listPending(limit = 10))

        assertEquals(1, offlinePlaybackEventDao.markFailed("event-2", "network unavailable"))
        assertTrue(offlinePlaybackEventDao.listPending(limit = 10).isEmpty())
    }

    private fun cachedTrackEntity(
        trackId: Int = 42,
        title: String,
        cacheStatus: String,
        localFilePath: String?,
        byteSize: Long?,
        cachedAt: String?,
    ): CachedTrackEntity = CachedTrackEntity(
        trackId = trackId,
        title = title,
        artist = "The Testers",
        album = "Foundation",
        durationSeconds = 180,
        contentType = "music",
        tagsSnapshotJson = """[{"id":1,"name":"focus","group":"scenario"}]""",
        sourceUpdatedAt = "2026-05-28T09:00:00Z",
        localFilePath = localFilePath,
        byteSize = byteSize,
        cacheStatus = cacheStatus,
        cachedAt = cachedAt,
        lastError = null,
    )

    private fun playbackEventEntity(
        clientEventId: String,
        occurredAt: String,
    ): OfflinePlaybackEventEntity = OfflinePlaybackEventEntity(
        clientEventId = clientEventId,
        trackId = 42,
        eventType = OfflinePlaybackEventType.Play.value,
        positionSeconds = 12.5,
        durationSeconds = 180.0,
        occurredAt = occurredAt,
        retryCount = 0,
        syncStatus = OfflinePlaybackEventSyncStatus.Pending.value,
        lastError = null,
        syncedAt = null,
    )
}
