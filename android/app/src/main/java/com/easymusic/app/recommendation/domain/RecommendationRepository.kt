package com.easymusic.app.recommendation.domain

import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.recommendation.data.AiParseIntentRequest
import com.easymusic.app.recommendation.data.AiRecommendRequest
import com.easymusic.app.recommendation.data.AiRecommendResponse
import com.easymusic.app.recommendation.data.AiRecommendationApi
import com.easymusic.app.recommendation.data.FeedbackApi
import com.easymusic.app.recommendation.data.FeedbackBulkRequest
import com.easymusic.app.recommendation.data.FeedbackEventRequest
import com.easymusic.app.recommendation.data.FeedbackResponse
import com.easymusic.app.recommendation.data.ParsedIntentResponse
import com.easymusic.app.recommendation.data.RecommendationApi
import com.easymusic.app.recommendation.data.RecommendationRequest
import com.easymusic.app.recommendation.data.RecommendationResponse

class RecommendationRepository(
    private val recommendationApi: RecommendationApi,
    private val aiRecommendationApi: AiRecommendationApi,
    private val feedbackApi: FeedbackApi,
    private val tokenStore: AuthTokenStore,
) {
    suspend fun getRecommendations(
        request: RecommendationRequest,
    ): ApiResult<RecommendationResponse> {
        val token = tokenStore.readToken()
            ?: return ApiResult.Unauthorized("请重新登录后请求推荐。")

        return recommendationApi.getRecommendations(
            bearerToken = token,
            request = request,
        )
    }

    suspend fun parseAiIntent(
        request: AiParseIntentRequest,
    ): ApiResult<ParsedIntentResponse> {
        val token = tokenStore.readToken()
            ?: return ApiResult.Unauthorized("请重新登录后使用 AI 助手。")

        return aiRecommendationApi.parseListeningIntent(
            bearerToken = token,
            request = request,
        )
    }

    suspend fun getAiRecommendations(
        request: AiRecommendRequest,
    ): ApiResult<AiRecommendResponse> {
        val token = tokenStore.readToken()
            ?: return ApiResult.Unauthorized("请重新登录后使用 AI 助手。")

        return aiRecommendationApi.aiRecommend(
            bearerToken = token,
            request = request,
        )
    }

    suspend fun sendFeedbackEvent(
        event: FeedbackEventRequest,
    ): ApiResult<FeedbackResponse> = sendFeedbackEvents(listOf(event))

    suspend fun sendFeedbackEvents(
        events: List<FeedbackEventRequest>,
    ): ApiResult<FeedbackResponse> {
        val token = tokenStore.readToken()
            ?: return ApiResult.Unauthorized("请重新登录后发送推荐反馈。")

        return feedbackApi.sendFeedbackEvents(
            bearerToken = token,
            request = FeedbackBulkRequest(events),
        )
    }
}
