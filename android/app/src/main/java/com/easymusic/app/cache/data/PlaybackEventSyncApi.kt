package com.easymusic.app.cache.data

import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.core.network.ApiResult
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

interface PlaybackEventSyncApi {
    fun syncPlaybackEvents(
        bearerToken: String,
        events: List<OfflinePlaybackEventEntity>,
    ): ApiResult<PlaybackEventSyncResponse>
}

class HttpPlaybackEventSyncApi(
    private val apiClient: ApiClient,
) : PlaybackEventSyncApi {
    override fun syncPlaybackEvents(
        bearerToken: String,
        events: List<OfflinePlaybackEventEntity>,
    ): ApiResult<PlaybackEventSyncResponse> =
        apiClient.postJson(
            path = "/api/playback-events",
            jsonBody = buildRequestBody(events),
            bearerToken = bearerToken,
        ).parseSyncResponse()

    private fun buildRequestBody(events: List<OfflinePlaybackEventEntity>): String {
        val eventArray = JSONArray()
        events.forEach { event ->
            eventArray.put(
                JSONObject()
                    .put("client_event_id", event.clientEventId)
                    .put("track_id", event.trackId)
                    .put("event_type", event.eventType)
                    .put("position_seconds", event.positionSeconds)
                    .put("duration_seconds", event.durationSeconds)
                    .put("occurred_at", event.occurredAt)
                    .put("client", event.client),
            )
        }
        return JSONObject()
            .put("events", eventArray)
            .toString()
    }
}

data class PlaybackEventSyncResponse(
    val accepted: List<PlaybackEventAcceptedResponse>,
    val failed: List<PlaybackEventFailedResponse>,
)

data class PlaybackEventAcceptedResponse(
    val clientEventId: String,
    val status: String,
)

data class PlaybackEventFailedResponse(
    val clientEventId: String,
    val trackId: Int,
    val error: String,
)

private fun ApiResult<String>.parseSyncResponse(): ApiResult<PlaybackEventSyncResponse> =
    when (this) {
        is ApiResult.Success -> try {
            val root = JSONObject(value)
            ApiResult.Success(
                PlaybackEventSyncResponse(
                    accepted = root.getJSONArray("accepted").toAcceptedEvents(),
                    failed = root.getJSONArray("failed").toFailedEvents(),
                ),
            )
        } catch (exception: JSONException) {
            ApiResult.SerializationError(
                message = exception.message ?: "Playback event sync response could not be parsed.",
                body = value,
                cause = exception,
            )
        }

        is ApiResult.Unauthorized -> this
        is ApiResult.HttpError -> this
        is ApiResult.NetworkError -> this
        is ApiResult.SerializationError -> this
    }

private fun JSONArray.toAcceptedEvents(): List<PlaybackEventAcceptedResponse> =
    buildList {
        for (index in 0 until length()) {
            val item = getJSONObject(index)
            add(
                PlaybackEventAcceptedResponse(
                    clientEventId = item.getString("client_event_id"),
                    status = item.getString("status"),
                ),
            )
        }
    }

private fun JSONArray.toFailedEvents(): List<PlaybackEventFailedResponse> =
    buildList {
        for (index in 0 until length()) {
            val item = getJSONObject(index)
            add(
                PlaybackEventFailedResponse(
                    clientEventId = item.getString("client_event_id"),
                    trackId = item.getInt("track_id"),
                    error = item.getString("error"),
                ),
            )
        }
    }
