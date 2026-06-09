package com.easymusic.app.recommendation.ui

import com.easymusic.app.recommendation.data.AiRecommendRequest
import com.easymusic.app.recommendation.data.FeedbackType
import com.easymusic.app.recommendation.data.RecommendationRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RecommendationHomeViewModelTest {

    // -----------------------------------------------------------------------
    // updateAiText
    // -----------------------------------------------------------------------

    @Test
    fun updateAiTextSetsTextInputAndClearsError() {
        val viewModel = createOfflineViewModel()

        viewModel.updateAiText("calm focus music")

        assertEquals("calm focus music", viewModel.uiState.aiState.textInput)
        assertNull(viewModel.uiState.aiState.errorMessage)
    }

    @Test
    fun updateAiTextOverwritesPreviousText() {
        val viewModel = createOfflineViewModel()
        viewModel.updateAiText("first text")
        viewModel.updateAiText("second text")

        assertEquals("second text", viewModel.uiState.aiState.textInput)
    }

    // -----------------------------------------------------------------------
    // requestAiRecommendation — empty text
    // -----------------------------------------------------------------------

    @Test
    fun requestAiRecommendationShowsErrorForEmptyText() {
        val viewModel = createOfflineViewModel()

        viewModel.requestAiRecommendation(isNetworkAvailable = true)

        assertEquals(
            "请先输入想听什么。",
            viewModel.uiState.aiState.errorMessage,
        )
        assertTrue(viewModel.uiState.aiState.results.isEmpty())
    }

    @Test
    fun requestAiRecommendationShowsErrorForBlankText() {
        val viewModel = createOfflineViewModel()
        viewModel.updateAiText("   ")

        viewModel.requestAiRecommendation(isNetworkAvailable = true)

        assertEquals(
            "请先输入想听什么。",
            viewModel.uiState.aiState.errorMessage,
        )
    }

    // -----------------------------------------------------------------------
    // requestAiRecommendation — offline
    // -----------------------------------------------------------------------

    @Test
    fun requestAiRecommendationShowsOfflineError() {
        val viewModel = createOfflineViewModel()
        viewModel.updateAiText("calm music")

        viewModel.requestAiRecommendation(isNetworkAvailable = false)

        assertEquals(
            "当前离线。AI 推荐需要连接后端。",
            viewModel.uiState.aiState.errorMessage,
        )
        assertFalse(viewModel.uiState.aiState.isRequesting)
        assertTrue(viewModel.uiState.aiState.results.isEmpty())
        assertNull(viewModel.uiState.aiState.parsedContext)
    }

    // -----------------------------------------------------------------------
    // AiParsedContext construction
    // -----------------------------------------------------------------------

    @Test
    fun aiParsedContextHoldsStructuredRequestForFeedbackContext() {
        val structuredRequest = RecommendationRequest(
            scenarioTagIds = listOf(1),
            stateTagIds = listOf(2),
            typeTagIds = listOf(3),
            attributeTagIds = listOf(4),
            excludeAttributeTagIds = listOf(5),
        )
        val context = AiParsedContext(
            structuredRequest = structuredRequest,
            explanation = "Test explanation",
            unmatchedTerms = listOf("unknown"),
        )

        assertEquals(listOf(1), context.structuredRequest?.scenarioTagIds)
        assertEquals(listOf(2), context.structuredRequest?.stateTagIds)
        assertEquals(listOf(3), context.structuredRequest?.typeTagIds)
        assertEquals(listOf(4), context.structuredRequest?.attributeTagIds)
        assertEquals(listOf(5), context.structuredRequest?.excludeAttributeTagIds)
        assertEquals("Test explanation", context.explanation)
        assertEquals(listOf("unknown"), context.unmatchedTerms)
    }

    // -----------------------------------------------------------------------
    // AiRecommendRequest construction
    // -----------------------------------------------------------------------

    @Test
    fun aiRecommendRequestUsesAndroidClientByDefault() {
        val request = AiRecommendRequest(text = "calm music")

        assertEquals("calm music", request.text)
        assertEquals(AiRecommendRequest.DEFAULT_AI_LIMIT, request.limit)
        assertEquals(AiRecommendRequest.CLIENT_ANDROID, request.client)
        assertTrue(request.fallbackToEmpty)
    }

    @Test
    fun aiRecommendRequestSerializesCorrectFields() {
        val request = AiRecommendRequest(text = "focus", limit = 2, fallbackToEmpty = false)

        val json = org.json.JSONObject(request.toJson())

        assertEquals("focus", json.getString("text"))
        assertEquals(2, json.getInt("limit"))
        assertEquals("android", json.getString("client"))
        assertFalse(json.getBoolean("fallback_to_empty"))
    }

    // -----------------------------------------------------------------------
    // AiRecommendationUiState defaults
    // -----------------------------------------------------------------------

    @Test
    fun aiRecommendationUiStateHasSensibleDefaults() {
        val state = AiRecommendationUiState()

        assertEquals("", state.textInput)
        assertFalse(state.isRequesting)
        assertNull(state.errorMessage)
        assertNull(state.providerStatus)
        assertNull(state.parsedContext)
        assertTrue(state.results.isEmpty())
    }

    // -----------------------------------------------------------------------
    // Feedback type mapping
    // -----------------------------------------------------------------------

    @Test
    fun aiFeedbackUsesCorrectFeedbackTypes() {
        // Verify FeedbackType values match the expected POST /api/feedback-events contract
        assertEquals("like", FeedbackType.Like.value)
        assertEquals("tired", FeedbackType.Tired.value)
        assertEquals("not_today", FeedbackType.NotToday.value)
        assertEquals("not_suitable_for_context", FeedbackType.NotSuitableForContext.value)
        assertEquals("skip_recommendation", FeedbackType.SkipRecommendation.value)
    }

    // -----------------------------------------------------------------------
    // helpers
    // -----------------------------------------------------------------------

    private fun createOfflineViewModel(): RecommendationHomeViewModel {
        // Create a ViewModel with network disabled so tag loading skips API calls
        return RecommendationHomeViewModel(
            initialNetworkAvailable = false,
            trackApi = com.easymusic.app.library.data.TrackApi(
                com.easymusic.app.core.network.ApiClient(
                    com.easymusic.app.core.config.AppConfig.default(),
                ),
            ),
            recommendationRepository = com.easymusic.app.recommendation.domain.RecommendationRepository(
                recommendationApi = createNoopRecommendationApi(),
                aiRecommendationApi = createNoopAiRecommendationApi(),
                feedbackApi = createNoopFeedbackApi(),
                tokenStore = createTempTokenStore(),
            ),
            bearerTokenProvider = { null },
        )
    }

    private fun createNoopRecommendationApi(): com.easymusic.app.recommendation.data.RecommendationApi =
        object : com.easymusic.app.recommendation.data.RecommendationApi {
            override fun getRecommendations(
                bearerToken: String,
                request: RecommendationRequest,
            ): com.easymusic.app.core.network.ApiResult<com.easymusic.app.recommendation.data.RecommendationResponse> =
                com.easymusic.app.core.network.ApiResult.Success(
                    com.easymusic.app.recommendation.data.RecommendationResponse("unused", emptyList()),
                )
        }

    private fun createNoopAiRecommendationApi(): com.easymusic.app.recommendation.data.AiRecommendationApi =
        object : com.easymusic.app.recommendation.data.AiRecommendationApi {
            override fun parseListeningIntent(
                bearerToken: String,
                request: com.easymusic.app.recommendation.data.AiParseIntentRequest,
            ): com.easymusic.app.core.network.ApiResult<com.easymusic.app.recommendation.data.ParsedIntentResponse> =
                com.easymusic.app.core.network.ApiResult.Success(
                    com.easymusic.app.recommendation.data.ParsedIntentResponse.fromJson(
                        org.json.JSONObject(
                            """
                            {
                              "structured_request": {
                                "scenario_tag_ids": [],
                                "state_tag_ids": [],
                                "type_tag_ids": [],
                                "attribute_tag_ids": [],
                                "exclude_attribute_tag_ids": [],
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
                    ),
                )

            override fun aiRecommend(
                bearerToken: String,
                request: AiRecommendRequest,
            ): com.easymusic.app.core.network.ApiResult<com.easymusic.app.recommendation.data.AiRecommendResponse> =
                com.easymusic.app.core.network.ApiResult.Success(
                    com.easymusic.app.recommendation.data.AiRecommendResponse(
                        com.easymusic.app.recommendation.data.ParsedIntentResponse.fromJson(
                            org.json.JSONObject(
                                """
                                {
                                  "structured_request": {
                                    "scenario_tag_ids": [],
                                    "state_tag_ids": [],
                                    "type_tag_ids": [],
                                    "attribute_tag_ids": [],
                                    "exclude_attribute_tag_ids": [],
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
                        ),
                        "unused",
                        emptyList(),
                    ),
                )
        }

    private fun createNoopFeedbackApi(): com.easymusic.app.recommendation.data.FeedbackApi =
        object : com.easymusic.app.recommendation.data.FeedbackApi {
            override fun sendFeedbackEvents(
                bearerToken: String,
                request: com.easymusic.app.recommendation.data.FeedbackBulkRequest,
            ): com.easymusic.app.core.network.ApiResult<com.easymusic.app.recommendation.data.FeedbackResponse> =
                com.easymusic.app.core.network.ApiResult.Success(
                    com.easymusic.app.recommendation.data.FeedbackResponse(emptyList(), emptyList()),
                )
        }

    private fun createTempTokenStore(): com.easymusic.app.auth.data.AuthTokenStore {
        val dataStore = androidx.datastore.preferences.core.PreferenceDataStoreFactory.create {
            java.io.File(
                kotlin.io.path.createTempDirectory("vm-test-token").toFile(),
                "preferences",
            )
        }
        return com.easymusic.app.auth.data.AuthTokenStore(dataStore)
    }
}
