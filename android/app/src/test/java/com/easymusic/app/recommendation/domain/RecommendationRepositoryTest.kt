package com.easymusic.app.recommendation.domain

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.recommendation.data.FeedbackApi
import com.easymusic.app.recommendation.data.FeedbackBulkRequest
import com.easymusic.app.recommendation.data.FeedbackEventRequest
import com.easymusic.app.recommendation.data.FeedbackResponse
import com.easymusic.app.recommendation.data.FeedbackType
import com.easymusic.app.recommendation.data.RecommendationApi
import com.easymusic.app.recommendation.data.RecommendationRequest
import com.easymusic.app.recommendation.data.RecommendationResponse
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class RecommendationRepositoryTest {
    private val storeDirectory = createTempDirectory("recommendation-repository-test").toFile()

    @Test
    fun getRecommendationsUsesBearerTokenAndStructuredRequest() = runTest {
        val api = FakeRecommendationApi(ApiResult.Success(RecommendationResponse("request-1", emptyList())))
        val repository = repository(
            recommendationApi = api,
            tokenStore = tokenStore("token-123"),
        )
        val request = RecommendationRequest(
            scenarioTagIds = listOf(1),
            stateTagIds = listOf(2),
            typeTagIds = listOf(3),
            attributeTagIds = listOf(4),
            excludeAttributeTagIds = listOf(5),
        )

        val result = repository.getRecommendations(request)

        assertTrue(result is ApiResult.Success)
        assertEquals("token-123", api.capturedBearerToken)
        assertEquals(request, api.capturedRequest)
    }

    @Test
    fun getRecommendationsReturnsUnauthorizedWithoutCallingApiWhenTokenIsMissing() = runTest {
        val api = FakeRecommendationApi(ApiResult.Success(RecommendationResponse("unused", emptyList())))
        val repository = repository(
            recommendationApi = api,
            tokenStore = tokenStore(),
        )

        val result = repository.getRecommendations(RecommendationRequest())

        assertTrue(result is ApiResult.Unauthorized)
        assertNull(api.capturedRequest)
    }

    @Test
    fun sendFeedbackEventsUsesBearerTokenAndBulkRequest() = runTest {
        val feedbackApi = FakeFeedbackApi(ApiResult.Success(FeedbackResponse(emptyList(), emptyList())))
        val repository = repository(
            feedbackApi = feedbackApi,
            tokenStore = tokenStore("token-456"),
        )
        val event = FeedbackEventRequest(
            clientEventId = "feedback-1",
            trackId = 42,
            feedbackType = FeedbackType.SkipRecommendation,
            scenarioTagIds = listOf(1),
            stateTagIds = listOf(2),
            typeTagIds = listOf(3),
            attributeTagIds = listOf(4),
            occurredAt = "2026-05-29T08:00:00Z",
        )

        val result = repository.sendFeedbackEvents(listOf(event))

        assertTrue(result is ApiResult.Success)
        assertEquals("token-456", feedbackApi.capturedBearerToken)
        assertEquals(listOf(event), feedbackApi.capturedRequest?.events)
    }

    @Test
    fun sendFeedbackEventsReturnsUnauthorizedWithoutCallingApiWhenTokenIsMissing() = runTest {
        val feedbackApi = FakeFeedbackApi(ApiResult.Success(FeedbackResponse(emptyList(), emptyList())))
        val repository = repository(
            feedbackApi = feedbackApi,
            tokenStore = tokenStore(),
        )

        val result = repository.sendFeedbackEvent(
            FeedbackEventRequest(
                trackId = 42,
                feedbackType = FeedbackType.NotToday,
                occurredAt = "2026-05-29T08:00:00Z",
            ),
        )

        assertTrue(result is ApiResult.Unauthorized)
        assertNull(feedbackApi.capturedRequest)
    }

    private fun repository(
        recommendationApi: RecommendationApi = FakeRecommendationApi(
            ApiResult.Success(RecommendationResponse("request-unused", emptyList())),
        ),
        feedbackApi: FeedbackApi = FakeFeedbackApi(
            ApiResult.Success(FeedbackResponse(emptyList(), emptyList())),
        ),
        tokenStore: AuthTokenStore,
    ): RecommendationRepository =
        RecommendationRepository(
            recommendationApi = recommendationApi,
            feedbackApi = feedbackApi,
            tokenStore = tokenStore,
        )

    private suspend fun TestScope.tokenStore(token: String? = null): AuthTokenStore {
        val dataStore = PreferenceDataStoreFactory.create(
            scope = backgroundScope,
            produceFile = { File(storeDirectory, "auth-${System.nanoTime()}.preferences_pb") },
        )
        return AuthTokenStore(dataStore).also { tokenStore ->
            token?.let { tokenStore.saveToken(it) }
        }
    }

    private class FakeRecommendationApi(
        private val result: ApiResult<RecommendationResponse>,
    ) : RecommendationApi {
        var capturedBearerToken: String? = null
            private set
        var capturedRequest: RecommendationRequest? = null
            private set

        override fun getRecommendations(
            bearerToken: String,
            request: RecommendationRequest,
        ): ApiResult<RecommendationResponse> {
            capturedBearerToken = bearerToken
            capturedRequest = request
            return result
        }
    }

    private class FakeFeedbackApi(
        private val result: ApiResult<FeedbackResponse>,
    ) : FeedbackApi {
        var capturedBearerToken: String? = null
            private set
        var capturedRequest: FeedbackBulkRequest? = null
            private set

        override fun sendFeedbackEvents(
            bearerToken: String,
            request: FeedbackBulkRequest,
        ): ApiResult<FeedbackResponse> {
            capturedBearerToken = bearerToken
            capturedRequest = request
            return result
        }
    }
}
