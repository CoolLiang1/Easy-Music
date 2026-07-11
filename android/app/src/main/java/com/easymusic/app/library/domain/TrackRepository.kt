package com.easymusic.app.library.domain

import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.library.data.TagResponse
import com.easymusic.app.library.data.TrackQuery
import com.easymusic.app.library.data.TrackQueryResult

class TrackRepository(
    private val trackApi: TrackApi,
) {
    fun listTracks(bearerToken: String): ApiResult<List<TrackResponse>> =
        trackApi.listTracks(bearerToken)

    fun queryTracks(
        bearerToken: String,
        query: TrackQuery,
    ): ApiResult<TrackQueryResult> = trackApi.queryTracks(bearerToken, query)

    fun listTags(bearerToken: String): ApiResult<List<TagResponse>> =
        trackApi.listTags(bearerToken)
}
