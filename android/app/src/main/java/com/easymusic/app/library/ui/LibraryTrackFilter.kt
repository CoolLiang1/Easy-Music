package com.easymusic.app.library.ui

import com.easymusic.app.library.data.TrackResponse

/** Quick filters shown above the library list. */
enum class LibraryQuickFilter(val label: String) {
    All("全部"),
    Ready("可播放"),
    Cached("已缓存"),
    Liked("喜欢"),
    Processing("处理中"),
}

/** True when the query matches the track's title, artist, or album. */
internal fun TrackResponse.matchesLibraryQuery(normalizedQuery: String): Boolean =
    listOfNotNull(title, artist, album).any { value -> value.lowercase().contains(normalizedQuery) }

internal fun visibleLibraryTracks(
    tracks: List<TrackResponse>,
    searchQuery: String,
    isFilterModeEnabled: Boolean,
): List<TrackResponse> {
    val normalizedQuery = searchQuery.trim().lowercase()
    if (!isFilterModeEnabled || normalizedQuery.isEmpty()) {
        return tracks
    }

    return tracks.filter { track -> track.matchesLibraryQuery(normalizedQuery) }
}

/** Ids of tracks matching the query; used to highlight matches when filter mode is off. */
internal fun matchingLibraryTrackIds(
    tracks: List<TrackResponse>,
    searchQuery: String,
): Set<Int> {
    val normalizedQuery = searchQuery.trim().lowercase()
    if (normalizedQuery.isEmpty()) return emptySet()
    return tracks.filter { track -> track.matchesLibraryQuery(normalizedQuery) }.map { it.id }.toSet()
}
