package com.easymusic.app.recommendation.domain

import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.recommendation.data.FeedbackApi
import com.easymusic.app.recommendation.data.FeedbackBulkRequest
import com.easymusic.app.recommendation.data.FeedbackEventRequest
import com.easymusic.app.recommendation.data.FeedbackResponse

class FeedbackRepository(
    private val feedbackApi: FeedbackApi,
    private val tokenStore: AuthTokenStore,
) {
    suspend fun sendFeedbackEvent(
        event: FeedbackEventRequest,
    ): ApiResult<FeedbackResponse> {
        val token = tokenStore.readToken()
            ?: return ApiResult.Unauthorized("请重新登录后发送反馈。")

        return feedbackApi.sendFeedbackEvents(
            bearerToken = token,
            request = FeedbackBulkRequest(listOf(event)),
        )
    }
}
