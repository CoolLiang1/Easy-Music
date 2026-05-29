package com.easymusic.app.cache.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.cache.domain.CacheStatus
import com.easymusic.app.cache.domain.CachedPlaybackSource
import com.easymusic.app.cache.domain.OfflinePlaybackEventSyncStatus
import com.easymusic.app.cache.domain.OfflinePlaybackEventType
import com.easymusic.app.cache.domain.PlaybackEventSyncRepository
import com.easymusic.app.cache.domain.PlaybackEventSyncResult
import com.easymusic.app.cache.domain.TrackCacheDeleteResult
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlaybackEventRecorder
import com.easymusic.app.player.domain.PlaybackSource
import com.easymusic.app.player.domain.PlaybackSourceSelector
import com.easymusic.app.player.domain.SelectedPlaybackSource
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.io.path.createTempDirectory

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class EasyMusicDatabaseTest {
    private lateinit var database: EasyMusicDatabase
    private lateinit var cacheDirectory: File

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
        cacheDirectory = createTempDirectory(prefix = "easy-music-db-test").toFile()
    }

    @After
    fun tearDown() {
        database.close()
        deleteKnownFile("track-42.mp3")
        cacheDirectory.delete()
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
    fun trackCacheRepository_prefersReadableCachedPlaybackSource() = runTest {
        val cachedFile = File(cacheDirectory, "track-42.mp3").apply {
            writeBytes(byteArrayOf(1, 2, 3))
        }
        cachedTrackDao.upsert(
            cachedTrackEntity(
                title = "Cached Song",
                cacheStatus = CacheStatus.Cached.value,
                localFilePath = cachedFile.absolutePath,
                byteSize = 3L,
                cachedAt = "2026-05-28T09:30:00Z",
            ),
        )
        val repository = TrackCacheRepository(
            cachedTrackDao = cachedTrackDao,
            cacheFileStore = CacheFileStore(cacheDirectory),
        )

        val source = repository.cachedPlaybackSource(42)

        val available = source as CachedPlaybackSource.Available
        assertEquals(cachedFile.absolutePath, available.file.absolutePath)
        assertEquals(42, available.cachedTrack.trackId)
    }

    @Test
    fun trackCacheRepository_marksMissingCachedFileFailed() = runTest {
        cachedTrackDao.upsert(
            cachedTrackEntity(
                title = "Missing Song",
                cacheStatus = CacheStatus.Cached.value,
                localFilePath = File(cacheDirectory, "track-42.mp3").absolutePath,
                byteSize = 3L,
                cachedAt = "2026-05-28T09:30:00Z",
            ),
        )
        val repository = TrackCacheRepository(
            cachedTrackDao = cachedTrackDao,
            cacheFileStore = CacheFileStore(cacheDirectory),
        )

        assertEquals(CachedPlaybackSource.Unavailable, repository.cachedPlaybackSource(42))

        val updated = requireNotNull(cachedTrackDao.getTrack(42))
        assertEquals(CacheStatus.Failed.value, updated.cacheStatus)
        assertEquals("Cached audio file is missing or unreadable.", updated.lastError)
    }

    @Test
    fun playbackSourceSelector_prefersCachedFileBeforeReadingOnlineToken() = runTest {
        val cachedFile = File(cacheDirectory, "track-42.mp3").apply {
            writeBytes(byteArrayOf(1, 2, 3))
        }
        cachedTrackDao.upsert(
            cachedTrackEntity(
                title = "Cached Song",
                cacheStatus = CacheStatus.Cached.value,
                localFilePath = cachedFile.absolutePath,
                byteSize = 3L,
                cachedAt = "2026-05-28T09:30:00Z",
            ),
        )
        val selector = PlaybackSourceSelector(
            trackCacheRepository = trackCacheRepository(),
            readToken = { error("Token should not be read when a cached file is available.") },
            streamUrlForTrack = { trackId -> "https://example.test/api/tracks/$trackId/stream" },
        )

        val source = selector.select(
            track = readyTrack(),
            isNetworkAvailable = false,
        )

        val cached = source as SelectedPlaybackSource.Cached
        assertEquals(42, cached.track.id)
        assertEquals(cachedFile.absolutePath, cached.audioFile.absolutePath)
    }

    @Test
    fun playbackSourceSelector_fallsBackToOnlineStreamWhenNoValidCacheExists() = runTest {
        val selector = PlaybackSourceSelector(
            trackCacheRepository = trackCacheRepository(),
            readToken = { "token-online" },
            streamUrlForTrack = { trackId -> "https://example.test/api/tracks/$trackId/stream" },
        )

        val source = selector.select(
            track = readyTrack(),
            isNetworkAvailable = true,
        )

        val online = source as SelectedPlaybackSource.Online
        assertEquals(42, online.track.id)
        assertEquals("token-online", online.bearerToken)
        assertEquals("https://example.test/api/tracks/42/stream", online.streamUrl)
    }

    @Test
    fun playbackSourceSelector_reportsOfflineFailureWhenTrackIsNotCached() = runTest {
        val selector = PlaybackSourceSelector(
            trackCacheRepository = trackCacheRepository(),
            readToken = { "token-online" },
            streamUrlForTrack = { trackId -> "https://example.test/api/tracks/$trackId/stream" },
        )

        val source = selector.select(
            track = readyTrack(),
            isNetworkAvailable = false,
        )

        val failure = source as SelectedPlaybackSource.Failure
        assertEquals(42, failure.track.id)
        assertEquals("You are offline. This track is not cached on this device.", failure.message)
    }

    @Test
    fun trackCacheRepository_deletesOneCachedFileAndRecord() = runTest {
        val cachedFile = File(cacheDirectory, "track-42.mp3").apply {
            writeBytes(byteArrayOf(1, 2, 3))
        }
        cachedTrackDao.upsert(
            cachedTrackEntity(
                title = "Cached Song",
                cacheStatus = CacheStatus.Cached.value,
                localFilePath = cachedFile.absolutePath,
                byteSize = 3L,
                cachedAt = "2026-05-28T09:30:00Z",
            ),
        )
        val repository = TrackCacheRepository(
            cachedTrackDao = cachedTrackDao,
            cacheFileStore = CacheFileStore(cacheDirectory),
        )

        assertEquals(TrackCacheDeleteResult.Success, repository.deleteCachedTrack(42))

        assertTrue(!cachedFile.exists())
        assertNull(cachedTrackDao.getTrack(42))
    }

    @Test
    fun trackCacheRepository_deletesRecordWhenCachedFileIsMissing() = runTest {
        cachedTrackDao.upsert(
            cachedTrackEntity(
                title = "Missing Song",
                cacheStatus = CacheStatus.Cached.value,
                localFilePath = File(cacheDirectory, "track-42.mp3").absolutePath,
                byteSize = 3L,
                cachedAt = "2026-05-28T09:30:00Z",
            ),
        )
        val repository = TrackCacheRepository(
            cachedTrackDao = cachedTrackDao,
            cacheFileStore = CacheFileStore(cacheDirectory),
        )

        assertEquals(TrackCacheDeleteResult.Success, repository.deleteCachedTrack(42))

        assertNull(cachedTrackDao.getTrack(42))
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

    @Test
    fun playbackEventRecorder_recordsDurablePendingPlaybackTransitions() = runTest {
        var nextEventId = 0
        val recorder = PlaybackEventRecorder(
            offlinePlaybackEventDao = offlinePlaybackEventDao,
            clock = Clock.fixed(Instant.parse("2026-05-28T09:30:00Z"), ZoneOffset.UTC),
            scope = this,
            clientEventIdFactory = {
                nextEventId += 1
                "event-$nextEventId"
            },
        )

        recorder.startTrack(
            trackId = 42,
            playbackSource = PlaybackSource.OfflineCache,
            durationMs = 180_000L,
        )
        recorder.onIsPlayingChanged(
            isPlaying = false,
            positionMs = 12_500L,
            durationMs = 180_000L,
            isBuffering = false,
            isEnded = false,
        )
        recorder.onIsPlayingChanged(
            isPlaying = true,
            positionMs = 12_500L,
            durationMs = 180_000L,
            isBuffering = false,
            isEnded = false,
        )
        recorder.recordSeek(positionMs = 30_000L, durationMs = 180_000L)
        recorder.recordComplete(positionMs = 180_000L, durationMs = 180_000L)
        recorder.flushPendingWrites()

        val events = offlinePlaybackEventDao.listPending(limit = 10)

        assertEquals(
            listOf(
                OfflinePlaybackEventType.Play.value,
                OfflinePlaybackEventType.Pause.value,
                OfflinePlaybackEventType.Resume.value,
                OfflinePlaybackEventType.Seek.value,
                OfflinePlaybackEventType.Complete.value,
            ),
            events.map { it.eventType },
        )
        assertTrue(events.all { it.syncStatus == OfflinePlaybackEventSyncStatus.Pending.value })
        assertTrue(events.all { it.client == "android" })
        assertTrue(events.all { it.playbackSource == "offline_cache" })
        assertEquals(30.0, events.first { it.eventType == OfflinePlaybackEventType.Seek.value }.positionSeconds, 0.0)
    }

    @Test
    fun playbackEventSyncRepository_marksAcceptedAndDuplicateEventsSynced() = runTest {
        val tokenStore = testTokenStore("token-success")
        val api = FakePlaybackEventSyncApi(
            result = ApiResult.Success(
                PlaybackEventSyncResponse(
                    accepted = listOf(
                        PlaybackEventAcceptedResponse("event-1", "accepted"),
                        PlaybackEventAcceptedResponse("event-2", "duplicate"),
                    ),
                    failed = emptyList(),
                ),
            ),
        )
        offlinePlaybackEventDao.insert(playbackEventEntity("event-1", "2026-05-28T09:30:00Z"))
        offlinePlaybackEventDao.insert(playbackEventEntity("event-2", "2026-05-28T09:31:00Z"))

        val result = syncRepository(tokenStore, api).syncPendingEvents()

        assertEquals(PlaybackEventSyncResult.Synced(acceptedCount = 2, failedCount = 0), result)
        assertTrue(offlinePlaybackEventDao.listPending(limit = 10).isEmpty())
        assertEquals(listOf("event-1", "event-2"), api.syncedEventIds)
    }

    @Test
    fun playbackEventSyncRepository_recordsValidationFailuresWithoutBlockingAcceptedEvents() = runTest {
        val tokenStore = testTokenStore("token-validation")
        val api = FakePlaybackEventSyncApi(
            result = ApiResult.Success(
                PlaybackEventSyncResponse(
                    accepted = listOf(PlaybackEventAcceptedResponse("event-1", "accepted")),
                    failed = listOf(
                        PlaybackEventFailedResponse(
                            clientEventId = "event-2",
                            trackId = 404,
                            error = "Track does not belong to the current user.",
                        ),
                    ),
                ),
            ),
        )
        offlinePlaybackEventDao.insert(playbackEventEntity("event-1", "2026-05-28T09:30:00Z"))
        offlinePlaybackEventDao.insert(playbackEventEntity("event-2", "2026-05-28T09:31:00Z"))

        val result = syncRepository(tokenStore, api).syncPendingEvents()

        assertEquals(PlaybackEventSyncResult.Synced(acceptedCount = 1, failedCount = 1), result)
        assertTrue(offlinePlaybackEventDao.listPending(limit = 10).isEmpty())
        assertEquals(0, offlinePlaybackEventDao.observePendingCount().first())
    }

    @Test
    fun playbackEventSyncRepository_leavesEventsPendingWhenSignInIsRequired() = runTest {
        val tokenStore = testTokenStore("token-expired")
        val api = FakePlaybackEventSyncApi(
            result = ApiResult.Unauthorized("Authentication is required."),
        )
        offlinePlaybackEventDao.insert(playbackEventEntity("event-1", "2026-05-28T09:30:00Z"))

        val result = syncRepository(tokenStore, api).syncPendingEvents()

        assertEquals(PlaybackEventSyncResult.SignInRequired, result)
        val pending = offlinePlaybackEventDao.listPending(limit = 10).single()
        assertEquals("event-1", pending.clientEventId)
        assertEquals(1, pending.retryCount)
        assertEquals("Sign in is required to sync playback events.", pending.lastError)
    }

    @Test
    fun playbackEventSyncRepository_keepsTransientFailuresPendingForRetry() = runTest {
        val tokenStore = testTokenStore("token-network")
        val api = FakePlaybackEventSyncApi(
            result = ApiResult.NetworkError("network unavailable"),
        )
        offlinePlaybackEventDao.insert(playbackEventEntity("event-1", "2026-05-28T09:30:00Z"))

        val result = syncRepository(tokenStore, api).syncPendingEvents()

        assertEquals(PlaybackEventSyncResult.RetryableFailure("network unavailable"), result)
        val pending = offlinePlaybackEventDao.listPending(limit = 10).single()
        assertEquals("event-1", pending.clientEventId)
        assertEquals(1, pending.retryCount)
        assertEquals("network unavailable", pending.lastError)
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

    private fun readyTrack(): TrackResponse = TrackResponse(
        id = 42,
        title = "Cached Song",
        artist = "The Testers",
        album = "Foundation",
        durationSeconds = 180,
        contentType = "music",
        status = TrackResponse.STATUS_READY,
        liked = false,
        cooldownUntil = null,
        createdAt = "2026-05-28T08:00:00Z",
        updatedAt = "2026-05-28T09:00:00Z",
        tags = emptyList(),
    )

    private fun trackCacheRepository(): TrackCacheRepository = TrackCacheRepository(
        cachedTrackDao = cachedTrackDao,
        cacheFileStore = CacheFileStore(cacheDirectory),
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
        client = "android",
        playbackSource = "offline_cache",
        retryCount = 0,
        syncStatus = OfflinePlaybackEventSyncStatus.Pending.value,
        lastError = null,
        syncedAt = null,
    )

    private suspend fun TestScope.testTokenStore(token: String): AuthTokenStore {
        val dataStore = PreferenceDataStoreFactory.create(
            scope = backgroundScope,
            produceFile = { File(cacheDirectory, "auth-${token.hashCode()}.preferences_pb") },
        )
        return AuthTokenStore(dataStore).also { tokenStore ->
            tokenStore.saveToken(token)
        }
    }

    private fun syncRepository(
        tokenStore: AuthTokenStore,
        api: PlaybackEventSyncApi,
    ): PlaybackEventSyncRepository =
        PlaybackEventSyncRepository(
            offlinePlaybackEventDao = offlinePlaybackEventDao,
            playbackEventSyncApi = api,
            tokenStore = tokenStore,
            clock = Clock.fixed(Instant.parse("2026-05-28T09:32:00Z"), ZoneOffset.UTC),
        )

    private class FakePlaybackEventSyncApi(
        private val result: ApiResult<PlaybackEventSyncResponse>,
    ) : PlaybackEventSyncApi {
        var syncedEventIds: List<String> = emptyList()
            private set

        override fun syncPlaybackEvents(
            bearerToken: String,
            events: List<OfflinePlaybackEventEntity>,
        ): ApiResult<PlaybackEventSyncResponse> {
            syncedEventIds = events.map { it.clientEventId }
            return result
        }
    }

    private fun deleteKnownFile(name: String) {
        val file = File(cacheDirectory, name)
        if (file.exists() && file.isFile) {
            file.delete()
        }
    }
}
