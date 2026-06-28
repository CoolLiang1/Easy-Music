package com.easymusic.app.recommendation.domain

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
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
import com.easymusic.app.recommendation.data.FeedbackType
import com.easymusic.app.recommendation.data.ParsedIntentResponse
import com.easymusic.app.recommendation.data.RecommendationApi
import com.easymusic.app.recommendation.data.RecommendationRequest
import com.easymusic.app.recommendation.data.RecommendationResponse
import org.json.JSONObject
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
            sceneTagIds = listOf(1),
            featureTagIds = listOf(2),
            typeTagIds = listOf(3),
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
            sceneTagIds = listOf(1),
            featureTagIds = listOf(2),
            typeTagIds = listOf(3),
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
        aiRecommendationApi: AiRecommendationApi = FakeAiRecommendationApi(
            ApiResult.Success(AiRecommendResponse(emptyParsedIntent(), "unused", emptyList())),
        ),
        feedbackApi: FeedbackApi = FakeFeedbackApi(
            ApiResult.Success(FeedbackResponse(emptyList(), emptyList())),
        ),
        tokenStore: AuthTokenStore,
    ): RecommendationRepository =
        RecommendationRepository(
            recommendationApi = recommendationApi,
            aiRecommendationApi = aiRecommendationApi,
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

    @Test
    fun parseAiIntentUsesBearerTokenAndRequest() = runTest {
        val parsedIntent = ParsedIntentResponse.fromJson(JSONObject(parsedIntentOkJson()))
        val aiApi = FakeAiRecommendationApi(ApiResult.Success(AiRecommendResponse(parsedIntent, "ai-1", emptyList())))
        val repository = repository(
            aiRecommendationApi = aiApi,
            tokenStore = tokenStore("ai-token"),
        )
        val request = AiParseIntentRequest(text = "calm focus music")

        val result = repository.parseAiIntent(request)

        assertTrue(result is ApiResult.Success)
        val intent = (result as ApiResult.Success).value
        assertEquals("ok", intent.providerStatus)
        assertEquals("ai-token", aiApi.capturedBearerToken)
        assertEquals("calm focus music", aiApi.capturedParseRequest?.text)
    }

    @Test
    fun parseAiIntentReturnsUnauthorizedWithoutToken() = runTest {
        val aiApi = FakeAiRecommendationApi(
            ApiResult.Success(AiRecommendResponse(emptyParsedIntent(), "unused", emptyList())),
        )
        val repository = repository(
            aiRecommendationApi = aiApi,
            tokenStore = tokenStore(),
        )

        val result = repository.parseAiIntent(AiParseIntentRequest(text = "test"))

        assertTrue(result is ApiResult.Unauthorized)
        assertNull(aiApi.capturedParseRequest)
    }

    @Test
    fun getAiRecommendationsUsesBearerTokenAndRequest() = runTest {
        val aiApi = FakeAiRecommendationApi(
            ApiResult.Success(AiRecommendResponse(emptyParsedIntent(), "ai-rec-1", emptyList())),
        )
        val repository = repository(
            aiRecommendationApi = aiApi,
            tokenStore = tokenStore("ai-rec-token"),
        )
        val request = AiRecommendRequest(text = "energetic workout", limit = 2)

        val result = repository.getAiRecommendations(request)

        assertTrue(result is ApiResult.Success)
        val response = (result as ApiResult.Success).value
        assertEquals("ai-rec-1", response.requestId)
        assertEquals("ai-rec-token", aiApi.capturedBearerToken)
        assertEquals(2, aiApi.capturedRecommendRequest?.limit)
    }

    @Test
    fun getAiRecommendationsReturnsUnauthorizedWithoutToken() = runTest {
        val aiApi = FakeAiRecommendationApi(
            ApiResult.Success(AiRecommendResponse(emptyParsedIntent(), "unused", emptyList())),
        )
        val repository = repository(
            aiRecommendationApi = aiApi,
            tokenStore = tokenStore(),
        )

        val result = repository.getAiRecommendations(AiRecommendRequest(text = "test"))

        assertTrue(result is ApiResult.Unauthorized)
        assertNull(aiApi.capturedRecommendRequest)
    }

    private fun emptyParsedIntent(): ParsedIntentResponse =
        ParsedIntentResponse.fromJson(JSONObject(parsedIntentOkJson()))

    private fun parsedIntentOkJson(): String =
        """
        {
          "structured_request": {
            "scene_tag_ids": [],
            "feature_tag_ids": [],
            "type_tag_ids": [],
            "limit": 3,
            "client": null
          },
          "matched_tags": {},
          "unmatched_terms": [],
          "explanation": null,
          "provider_status": "ok"
        }
        """.trimIndent()

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

    private class FakeAiRecommendationApi(
        private val result: ApiResult<AiRecommendResponse>,
    ) : AiRecommendationApi {
        var capturedBearerToken: String? = null
            private set
        var capturedParseRequest: AiParseIntentRequest? = null
            private set
        var capturedRecommendRequest: AiRecommendRequest? = null
            private set

        override fun parseListeningIntent(
            bearerToken: String,
            request: AiParseIntentRequest,
        ): ApiResult<ParsedIntentResponse> {
            capturedBearerToken = bearerToken
            capturedParseRequest = request
            // Return parsedIntent from the result, ignoring the unused AiRecommendResponse wrapper
            return ApiResult.Success(
                (result as? ApiResult.Success)?.value?.parsedIntent
                    ?: emptyParsedIntentStatic(),
            )
        }

        override fun aiRecommend(
            bearerToken: String,
            request: AiRecommendRequest,
        ): ApiResult<AiRecommendResponse> {
            capturedBearerToken = bearerToken
            capturedRecommendRequest = request
            return result
        }

        companion object {
            private fun emptyParsedIntentStatic(): ParsedIntentResponse =
                ParsedIntentResponse.fromJson(
                    JSONObject(
                        """
                        {
                          "structured_request": {
                            "scene_tag_ids": [],
                            "feature_tag_ids": [],
                            "type_tag_ids": [],
                            "limit": 3,
                            "client": null
                          },
                          "matched_tags": {},
                          "unmatched_terms": [],
                          "explanation": null,
                          "provider_status": "ok"
                        }
                        """.trimIndent(),
                    ),
                )
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
