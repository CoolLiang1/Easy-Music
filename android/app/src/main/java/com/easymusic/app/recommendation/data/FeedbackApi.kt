package com.easymusic.app.recommendation.data

import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.core.network.ApiResult
import org.json.JSONException
import org.json.JSONObject

interface FeedbackApi {
    fun sendFeedbackEvents(
        bearerToken: String,
        request: FeedbackBulkRequest,
    ): ApiResult<FeedbackResponse>
}

class HttpFeedbackApi(
    private val apiClient: ApiClient,
) : FeedbackApi {
    override fun sendFeedbackEvents(
        bearerToken: String,
        request: FeedbackBulkRequest,
    ): ApiResult<FeedbackResponse> =
        apiClient.postJson(
            path = "/api/feedback-events",
            jsonBody = request.toJson(),
            bearerToken = bearerToken,
        ).parseFeedbackResponse()
}

private fun ApiResult<String>.parseFeedbackResponse(): ApiResult<FeedbackResponse> =
    when (this) {
        is ApiResult.Success -> try {
            ApiResult.Success(FeedbackResponse.fromJson(JSONObject(value)))
        } catch (exception: JSONException) {
            ApiResult.SerializationError(
                message = exception.message ?: "Feedback response could not be parsed.",
                body = value,
                cause = exception,
            )
        }

        is ApiResult.Unauthorized -> this
        is ApiResult.HttpError -> this
        is ApiResult.NetworkError -> this
        is ApiResult.SerializationError -> this
    }
