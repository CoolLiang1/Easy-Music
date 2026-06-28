package com.easymusic.app.player.domain

import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.service.MediaSessionConnector
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackQueueStateTest {
    @After
    fun tearDown() {
        MediaSessionConnector.clearPlaybackQueue()
        PlaybackStateStore.update(PlayerUiState())
    }

    @Test
    fun duplicateTracksRemainDistinctQueueItems() {
        val track = track(id = 42)
        val first = queueItem("queue-a", track)
        val duplicate = queueItem("queue-b", track)

        MediaSessionConnector.setPlaybackQueue(
            items = listOf(first, duplicate),
            mode = PlaybackQueueMode.Sequence,
            source = PlaybackQueueSource(PlaybackQueueSourceType.Playlist, playlistId = 7),
            baseCycleItems = listOf(first, duplicate),
        )

        val state = PlaybackStateStore.state.value
        assertEquals(42, state.currentQueueItem?.track?.id)
        assertEquals("queue-a", state.currentQueueItem?.queueItemId)
        assertEquals(listOf("queue-b"), state.upcoming.map { it.queueItemId })
        assertEquals(listOf(42), state.upcoming.map { it.track.id })
        assertNotEquals(
            state.currentQueueItem?.queueItemId,
            state.upcoming.single().queueItemId,
        )
    }

    @Test
    fun playNextInsertsAtUpcomingHeadWithoutReplacingCurrent() {
        val first = queueItem("queue-a", track(id = 1))
        val tail = queueItem("queue-c", track(id = 3))
        val next = queueItem("queue-b", track(id = 2))

        MediaSessionConnector.setPlaybackQueue(
            items = listOf(first, tail),
            mode = PlaybackQueueMode.Sequence,
            source = PlaybackQueueSource(PlaybackQueueSourceType.Playlist, playlistId = 7),
            baseCycleItems = listOf(first, tail),
        )

        MediaSessionConnector.insertNext(next)

        val state = PlaybackStateStore.state.value
        assertEquals("queue-a", state.currentQueueItem?.queueItemId)
        assertEquals(listOf("queue-b", "queue-c"), state.upcoming.map { it.queueItemId })
    }

    @Test
    fun removingCurrentPromotesNextQueueItem() {
        val first = queueItem("queue-a", track(id = 1))
        val second = queueItem("queue-b", track(id = 2))
        val third = queueItem("queue-c", track(id = 3))

        MediaSessionConnector.setPlaybackQueue(
            items = listOf(first, second, third),
            mode = PlaybackQueueMode.Sequence,
            source = PlaybackQueueSource(PlaybackQueueSourceType.Playlist, playlistId = 7),
            baseCycleItems = listOf(first, second, third),
        )

        val removedIndex = MediaSessionConnector.removeQueueItem("queue-a")

        val state = PlaybackStateStore.state.value
        assertEquals(0, removedIndex)
        assertEquals("queue-b", state.currentQueueItem?.queueItemId)
        assertEquals(listOf("queue-c"), state.upcoming.map { it.queueItemId })
    }

    @Test
    fun movingUpcomingItemDoesNotMoveCurrent() {
        val first = queueItem("queue-a", track(id = 1))
        val second = queueItem("queue-b", track(id = 2))
        val third = queueItem("queue-c", track(id = 2))

        MediaSessionConnector.setPlaybackQueue(
            items = listOf(first, second, third),
            mode = PlaybackQueueMode.Sequence,
            source = PlaybackQueueSource(PlaybackQueueSourceType.Playlist, playlistId = 7),
            baseCycleItems = listOf(first, second, third),
        )

        val move = MediaSessionConnector.moveUpcomingItem(
            queueItemId = "queue-c",
            targetUpcomingIndex = 0,
        )

        val state = PlaybackStateStore.state.value
        assertEquals(2 to 1, move)
        assertEquals("queue-a", state.currentQueueItem?.queueItemId)
        assertEquals(listOf("queue-c", "queue-b"), state.upcoming.map { it.queueItemId })
        assertEquals(listOf(2, 2), state.upcoming.map { it.track.id })
    }

    @Test
    fun playbackUiSummaryIgnoresHighFrequencyPositionFields() {
        val current = PlayerUiState(
            track = track(id = 7),
            status = PlaybackStatus.Playing,
            queueSource = PlaybackQueueSource(
                type = PlaybackQueueSourceType.Playlist,
                playlistId = 11,
            ),
            positionMs = 1_000L,
            durationMs = 180_000L,
        )

        val tick = current.copy(positionMs = 1_500L)

        assertEquals(current.toPlaybackUiSummary(), tick.toPlaybackUiSummary())
    }

    @Test
    fun skipAvailabilityFollowsQueueHistoryAndRepeatState() {
        val current = queueItem("queue-a", track(id = 1))
        val previous = queueItem("queue-history", track(id = 2))
        val next = queueItem("queue-b", track(id = 3))

        assertFalse(PlayerUiState(currentQueueItem = current).canSkipToPrevious())
        assertFalse(PlayerUiState(currentQueueItem = current).canSkipToNext())

        assertTrue(
            PlayerUiState(
                currentQueueItem = current,
                history = listOf(previous),
            ).canSkipToPrevious(),
        )
        assertTrue(
            PlayerUiState(
                currentQueueItem = current,
                upcoming = listOf(next),
            ).canSkipToNext(),
        )
        assertTrue(
            PlayerUiState(
                currentQueueItem = current,
                baseCycleItems = listOf(current),
                repeatPlaylist = true,
            ).canSkipToNext(),
        )
    }

    private fun queueItem(
        queueItemId: String,
        track: TrackResponse,
    ): PlaybackQueueItem =
        PlaybackQueueItem(
            queueItemId = queueItemId,
            track = track,
            playbackSource = PlaybackSource.OnlineStream,
            cycleItem = true,
        )

    private fun track(id: Int): TrackResponse =
        TrackResponse(
            id = id,
            title = "Track $id",
            artist = "Artist",
            album = "Album",
            durationSeconds = 180,
            contentType = "song",
            status = TrackResponse.STATUS_READY,
            liked = false,
            cooldownUntil = null,
            createdAt = "2026-06-26T09:00:00Z",
            updatedAt = "2026-06-26T09:30:00Z",
            tags = emptyList(),
        )
}
