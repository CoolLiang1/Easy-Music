package com.easymusic.app.library.data

import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.core.network.ApiResult
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

class TrackApi(
    private val apiClient: ApiClient,
) {
    fun listTracks(bearerToken: String): ApiResult<List<TrackResponse>> =
        apiClient.get(
            path = "/api/tracks",
            bearerToken = bearerToken,
        ).parseJsonArray(TrackResponse::fromJson)

    fun getTrack(
        trackId: Int,
        bearerToken: String,
    ): ApiResult<TrackResponse> = apiClient.get(
        path = "/api/tracks/$trackId",
        bearerToken = bearerToken,
    ).parseJsonObject(TrackResponse::fromJson)

    fun listTags(bearerToken: String): ApiResult<List<TagResponse>> =
        apiClient.get(
            path = "/api/tags",
            bearerToken = bearerToken,
        ).parseJsonArray(TagResponse::fromJson)

    fun streamUrl(trackId: Int): String = apiClient.buildUrl("/api/tracks/$trackId/stream")
}

private inline fun <T> ApiResult<String>.parseJsonObject(
    parser: (JSONObject) -> T,
): ApiResult<T> = when (this) {
    is ApiResult.Success -> try {
        ApiResult.Success(parser(JSONObject(value)))
    } catch (exception: JSONException) {
        ApiResult.SerializationError(
            message = exception.message ?: "Response JSON could not be parsed.",
            body = value,
            cause = exception,
        )
    }

    is ApiResult.Unauthorized -> this
    is ApiResult.HttpError -> this
    is ApiResult.NetworkError -> this
    is ApiResult.SerializationError -> this
}

private inline fun <T> ApiResult<String>.parseJsonArray(
    parser: (JSONObject) -> T,
): ApiResult<List<T>> = when (this) {
    is ApiResult.Success -> try {
        val jsonArray = JSONArray(value)
        val items = buildList {
            for (index in 0 until jsonArray.length()) {
                add(parser(jsonArray.getJSONObject(index)))
            }
        }
        ApiResult.Success(items)
    } catch (exception: JSONException) {
        ApiResult.SerializationError(
            message = exception.message ?: "Response JSON could not be parsed.",
            body = value,
            cause = exception,
        )
    }

    is ApiResult.Unauthorized -> this
    is ApiResult.HttpError -> this
    is ApiResult.NetworkError -> this
    is ApiResult.SerializationError -> this
}
