package com.easymusic.app.recommendation.data

import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.core.network.ApiResult
import org.json.JSONException
import org.json.JSONObject

interface AiRecommendationApi {
    fun parseListeningIntent(
        bearerToken: String,
        request: AiParseIntentRequest,
    ): ApiResult<ParsedIntentResponse>

    fun aiRecommend(
        bearerToken: String,
        request: AiRecommendRequest,
    ): ApiResult<AiRecommendResponse>
}

class HttpAiRecommendationApi(
    private val apiClient: ApiClient,
) : AiRecommendationApi {
    override fun parseListeningIntent(
        bearerToken: String,
        request: AiParseIntentRequest,
    ): ApiResult<ParsedIntentResponse> =
        apiClient.postJson(
            path = "/api/ai/parse-listening-intent",
            jsonBody = request.toJson(),
            bearerToken = bearerToken,
        ).parseParsedIntentResponse()

    override fun aiRecommend(
        bearerToken: String,
        request: AiRecommendRequest,
    ): ApiResult<AiRecommendResponse> =
        apiClient.postJson(
            path = "/api/ai/recommend",
            jsonBody = request.toJson(),
            bearerToken = bearerToken,
        ).parseAiRecommendResponse()
}

private fun ApiResult<String>.parseParsedIntentResponse(): ApiResult<ParsedIntentResponse> =
    when (this) {
        is ApiResult.Success -> try {
            ApiResult.Success(ParsedIntentResponse.fromJson(JSONObject(value)))
        } catch (exception: JSONException) {
            ApiResult.SerializationError(
                message = exception.message ?: "无法解析 AI 意图响应。",
                body = value,
                cause = exception,
            )
        }

        is ApiResult.Unauthorized -> this
        is ApiResult.HttpError -> this
        is ApiResult.NetworkError -> this
        is ApiResult.SerializationError -> this
    }

private fun ApiResult<String>.parseAiRecommendResponse(): ApiResult<AiRecommendResponse> =
    when (this) {
        is ApiResult.Success -> try {
            ApiResult.Success(AiRecommendResponse.fromJson(JSONObject(value)))
        } catch (exception: JSONException) {
            ApiResult.SerializationError(
                message = exception.message ?: "无法解析 AI 推荐响应。",
                body = value,
                cause = exception,
            )
        }

        is ApiResult.Unauthorized -> this
        is ApiResult.HttpError -> this
        is ApiResult.NetworkError -> this
        is ApiResult.SerializationError -> this
    }
