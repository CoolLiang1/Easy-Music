package com.easymusic.app.playlist.data

import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.core.network.ApiResult
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

interface PlaylistApi {
    fun listPlaylists(bearerToken: String): ApiResult<List<PlaylistSummaryResponse>>

    fun getPlaylist(
        playlistId: Int,
        bearerToken: String,
    ): ApiResult<PlaylistResponse>
}

class HttpPlaylistApi(
    private val apiClient: ApiClient,
) : PlaylistApi {
    override fun listPlaylists(
        bearerToken: String,
    ): ApiResult<List<PlaylistSummaryResponse>> =
        apiClient.get(
            path = "/api/playlists",
            bearerToken = bearerToken,
        ).parseJsonArray(PlaylistSummaryResponse::fromJson)

    override fun getPlaylist(
        playlistId: Int,
        bearerToken: String,
    ): ApiResult<PlaylistResponse> =
        apiClient.get(
            path = "/api/playlists/$playlistId",
            bearerToken = bearerToken,
        ).parseJsonObject(PlaylistResponse::fromJson)
}

private inline fun <T> ApiResult<String>.parseJsonObject(
    parser: (JSONObject) -> T,
): ApiResult<T> = when (this) {
    is ApiResult.Success -> try {
        ApiResult.Success(parser(JSONObject(value)))
    } catch (exception: JSONException) {
        ApiResult.SerializationError(
            message = exception.message ?: "无法解析歌单响应。",
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
            message = exception.message ?: "无法解析歌单列表。",
            body = value,
            cause = exception,
        )
    }

    is ApiResult.Unauthorized -> this
    is ApiResult.HttpError -> this
    is ApiResult.NetworkError -> this
    is ApiResult.SerializationError -> this
}
