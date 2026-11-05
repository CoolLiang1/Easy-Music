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
    fun enabledFilterAlsoMatchesArtistAndAlbum() {
        val tracks = listOf(
            track(id = 1, title = "Morning Focus", artist = "Quiet Hands"),
            track(id = 2, title = "Late Night Walk", album = "Quiet Streets"),
            track(id = 3, title = "Run Run Run"),
        )

        val visible = visibleLibraryTracks(
            tracks = tracks,
            searchQuery = "quiet",
            isFilterModeEnabled = true,
        )

        assertEquals(listOf(1, 2), visible.map { it.id })
    }

    @Test
    fun matchingIdsHighlightMatchesWithoutFiltering() {
        val tracks = listOf(
            track(id = 1, title = "Morning Focus"),
            track(id = 2, title = "Late Night Walk"),
        )

        assertEquals(setOf(2), matchingLibraryTrackIds(tracks, " night "))
        assertEquals(emptySet<Int>(), matchingLibraryTrackIds(tracks, "   "))
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
    artist: String? = null,
    album: String? = null,
) = TrackResponse(
    id = id,
    title = title,
    artist = artist,
    album = album,
    durationSeconds = null,
    contentType = "song",
    status = TrackResponse.STATUS_READY,
    liked = false,
    cooldownUntil = null,
    createdAt = "2026-07-01T00:00:00Z",
    updatedAt = "2026-07-01T00:00:00Z",
    tags = emptyList(),
)
