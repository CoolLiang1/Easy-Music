package com.easymusic.app.library.ui

import com.easymusic.app.library.data.TrackResponse
import org.junit.Assert.assertEquals
import org.junit.Test

class LibraryTrackFilterTest {
    @Test
    fun filterModeDisabledReturnsAllTracksEvenWithSearchText() {
        val tracks = listOf(
            track(id = 1, title = "Morning Focus"),
            track(id = 2, title = "Late Night Walk"),
        )

        val visible = visibleLibraryTracks(
            tracks = tracks,
            searchQuery = "focus",
            isFilterModeEnabled = false,
        )

        assertEquals(listOf(1, 2), visible.map { it.id })
    }

    @Test
    fun enabledFilterMatchesTitlesIgnoringCaseAndOuterWhitespace() {
        val tracks = listOf(
            track(id = 1, title = "Morning Focus"),
            track(id = 2, title = "Focus Piano"),
            track(id = 3, title = "Late Night Walk"),
        )

        val visible = visibleLibraryTracks(
            tracks = tracks,
            searchQuery = " FOCUS ",
            isFilterModeEnabled = true,
        )

        assertEquals(listOf(1, 2), visible.map { it.id })
    }

    @Test
    fun enabledFilterWithBlankQueryReturnsAllTracks() {
        val tracks = listOf(
            track(id = 1, title = "Morning Focus"),
            track(id = 2, title = "Late Night Walk"),
        )

        val visible = visibleLibraryTracks(
            tracks = tracks,
            searchQuery = "   ",
            isFilterModeEnabled = true,
        )

        assertEquals(listOf(1, 2), visible.map { it.id })
    }
}

private fun track(
    id: Int,
    title: String,
) = TrackResponse(
    id = id,
    title = title,
    artist = null,
    album = null,
    durationSeconds = null,
    contentType = "song",
    status = TrackResponse.STATUS_READY,
    liked = false,
    cooldownUntil = null,
    createdAt = "2026-07-01T00:00:00Z",
    updatedAt = "2026-07-01T00:00:00Z",
    tags = emptyList(),
)
