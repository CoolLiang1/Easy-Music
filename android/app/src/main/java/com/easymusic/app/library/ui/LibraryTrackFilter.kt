package com.easymusic.app.library.ui

import com.easymusic.app.library.data.TrackResponse

internal fun visibleLibraryTracks(
    tracks: List<TrackResponse>,
    searchQuery: String,
    isFilterModeEnabled: Boolean,
): List<TrackResponse> {
    val normalizedQuery = searchQuery.trim().lowercase()
    if (!isFilterModeEnabled || normalizedQuery.isEmpty()) {
        return tracks
    }

    return tracks.filter { track ->
        track.title.lowercase().contains(normalizedQuery)
    }
}
