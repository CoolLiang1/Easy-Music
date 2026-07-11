package com.easymusic.app.library.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TrackQueryTest {
    @Test
    fun pathContainsEncodedFiltersStableSortAndLookaheadLimit() {
        val query = TrackQuery(
            search = " quiet focus ",
            status = "ready",
            liked = true,
            contentType = "song",
            tagId = 9,
            sort = TrackSortField.Title,
            order = TrackSortOrder.Descending,
            offset = 50,
        )

        val path = query.toPath()

        assertTrue(path.startsWith("/api/tracks?"))
        assertTrue(path.contains("q=quiet+focus"))
        assertTrue(path.contains("status=ready"))
        assertTrue(path.contains("liked=true"))
        assertTrue(path.contains("content_type=song"))
        assertTrue(path.contains("tag_id=9"))
        assertTrue(path.contains("sort=title"))
        assertTrue(path.contains("order=desc"))
        assertTrue(path.contains("limit=26"))
        assertTrue(path.contains("offset=50"))
        assertEquals(5, query.activeFilterCount())
    }

    @Test
    fun defaultQueryHasNoFilters() {
        val query = TrackQuery()

        assertEquals(0, query.activeFilterCount())
        assertEquals(
            "/api/tracks?sort=created_at&order=asc&limit=26&offset=0",
            query.toPath(),
        )
    }
}
