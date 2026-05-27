package com.easymusic.app.library.domain

import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse

class TrackRepository(
    private val trackApi: TrackApi,
) {
    fun listTracks(bearerToken: String): ApiResult<List<TrackResponse>> =
        trackApi.listTracks(bearerToken)
}
