package com.easymusic.app.recommendation.data

import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.core.network.ApiResult
import org.json.JSONException
import org.json.JSONObject

interface RecommendationApi {
    fun getRecommendations(
        bearerToken: String,
        request: RecommendationRequest,
    ): ApiResult<RecommendationResponse>
}

class HttpRecommendationApi(
    private val apiClient: ApiClient,
) : RecommendationApi {
    override fun getRecommendations(
        bearerToken: String,
        request: RecommendationRequest,
    ): ApiResult<RecommendationResponse> =
        apiClient.postJson(
            path = "/api/recommendations",
            jsonBody = request.toJson(),
            bearerToken = bearerToken,
        ).parseRecommendationResponse()
}

private fun ApiResult<String>.parseRecommendationResponse(): ApiResult<RecommendationResponse> =
    when (this) {
        is ApiResult.Success -> try {
            ApiResult.Success(RecommendationResponse.fromJson(JSONObject(value)))
        } catch (exception: JSONException) {
            ApiResult.SerializationError(
                message = exception.message ?: "无法解析推荐响应。",
                body = value,
                cause = exception,
            )
        }

        is ApiResult.Unauthorized -> this
        is ApiResult.HttpError -> this
        is ApiResult.NetworkError -> this
        is ApiResult.SerializationError -> this
    }
