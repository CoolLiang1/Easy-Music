package com.easymusic.app.player.domain

import com.easymusic.app.cache.domain.CachedPlaybackSource
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.library.data.TrackResponse
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

sealed interface SelectedPlaybackSource {
    data class Cached(
        val track: TrackResponse,
        val audioFile: File,
    ) : SelectedPlaybackSource

    data class Online(
        val track: TrackResponse,
        val bearerToken: String,
        val streamUrl: String,
    ) : SelectedPlaybackSource

    data class Failure(
        val track: TrackResponse,
        val message: String,
    ) : SelectedPlaybackSource
}

class PlaybackSourceSelector(
    private val trackCacheRepository: TrackCacheRepository,
    private val readToken: suspend () -> String?,
    private val streamUrlForTrack: (Int) -> String,
) {
    suspend fun select(
        track: TrackResponse,
        isNetworkAvailable: Boolean,
    ): SelectedPlaybackSource {
        val cachedSource = withContext(Dispatchers.IO) {
            trackCacheRepository.cachedPlaybackSource(track.id)
        }

        if (cachedSource is CachedPlaybackSource.Available) {
            return SelectedPlaybackSource.Cached(
                track = track,
                audioFile = cachedSource.file,
            )
        }

        if (!isNetworkAvailable) {
            return SelectedPlaybackSource.Failure(
                track = track,
                message = "You are offline. This track is not cached on this device.",
            )
        }

        val token = withContext(Dispatchers.IO) {
            readToken()
        }

        if (token == null) {
            return SelectedPlaybackSource.Failure(
                track = track,
                message = "Please sign in again before streaming this track.",
            )
        }

        return SelectedPlaybackSource.Online(
            track = track,
            bearerToken = token,
            streamUrl = streamUrlForTrack(track.id),
        )
    }
}
