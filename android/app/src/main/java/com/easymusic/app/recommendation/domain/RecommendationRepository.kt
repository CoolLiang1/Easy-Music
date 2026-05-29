package com.easymusic.app.recommendation.domain

import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.recommendation.data.FeedbackApi
import com.easymusic.app.recommendation.data.FeedbackBulkRequest
import com.easymusic.app.recommendation.data.FeedbackEventRequest
import com.easymusic.app.recommendation.data.FeedbackResponse
import com.easymusic.app.recommendation.data.RecommendationApi
import com.easymusic.app.recommendation.data.RecommendationRequest
import com.easymusic.app.recommendation.data.RecommendationResponse

class RecommendationRepository(
    private val recommendationApi: RecommendationApi,
    private val feedbackApi: FeedbackApi,
    private val tokenStore: AuthTokenStore,
) {
    suspend fun getRecommendations(
        request: RecommendationRequest,
    ): ApiResult<RecommendationResponse> {
        val token = tokenStore.readToken()
            ?: return ApiResult.Unauthorized("Please sign in again to request recommendations.")

        return recommendationApi.getRecommendations(
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
            ?: return ApiResult.Unauthorized("Please sign in again to send recommendation feedback.")

        return feedbackApi.sendFeedbackEvents(
            bearerToken = token,
            request = FeedbackBulkRequest(events),
        )
    }
}
