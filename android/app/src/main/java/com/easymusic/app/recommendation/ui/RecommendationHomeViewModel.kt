package com.easymusic.app.recommendation.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.library.data.TagResponse
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.recommendation.data.AiRecommendRequest
import com.easymusic.app.recommendation.data.AiRecommendResponse
import com.easymusic.app.recommendation.data.FeedbackEventRequest
import com.easymusic.app.recommendation.data.FeedbackType
import com.easymusic.app.recommendation.data.MatchedTagItem
import com.easymusic.app.recommendation.data.ParsedIntentResponse
import com.easymusic.app.recommendation.data.RecommendationRequest
import com.easymusic.app.recommendation.data.RecommendationResult
import com.easymusic.app.recommendation.domain.RecommendationRepository
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class RecommendationHomeUiState(
    val groupedTags: RecommendationTagGroups = RecommendationTagGroups(),
    val selectedSceneTagIds: Set<Int> = emptySet(),
    val selectedTypeTagIds: Set<Int> = emptySet(),
    val selectedFeatureTagIds: Set<Int> = emptySet(),
    val isLoadingTags: Boolean = true,
    val isRequestingRecommendations: Boolean = false,
    val tagErrorMessage: String? = null,
    val recommendationMessage: String? = null,
    val recommendationErrorMessage: String? = null,
    val recommendationResults: List<RecommendationResult> = emptyList(),
    val feedbackStates: Map<Int, RecommendationFeedbackUiState> = emptyMap(),
    val needsSignIn: Boolean = false,
    val aiState: AiRecommendationUiState = AiRecommendationUiState(),
) {
    val hasAnyTags: Boolean
        get() = groupedTags.allTags.isNotEmpty()

    val selectedContextCount: Int
        get() = selectedSceneTagIds.size +
            selectedTypeTagIds.size +
            selectedFeatureTagIds.size
}

data class RecommendationFeedbackUiState(
    val isSending: Boolean = false,
    val message: String? = null,
    val errorMessage: String? = null,
)

data class RecommendationTagGroups(
    val scenes: List<TagResponse> = emptyList(),
    val types: List<TagResponse> = emptyList(),
    val features: List<TagResponse> = emptyList(),
) {
    val allTags: List<TagResponse>
        get() = scenes + types + features
}

data class AiRecommendationUiState(
    val textInput: String = "",
    val isRequesting: Boolean = false,
    val errorMessage: String? = null,
    val providerStatus: String? = null,
    val parsedContext: AiParsedContext? = null,
    val results: List<RecommendationResult> = emptyList(),
)

data class AiParsedContext(
    val matchedTags: Map<String, List<MatchedTagItem>> = emptyMap(),
    val unmatchedTerms: List<String> = emptyList(),
    val explanation: String? = null,
    val structuredRequest: RecommendationRequest? = null,
)

class RecommendationHomeViewModel(
    private val initialNetworkAvailable: Boolean = true,
    private val trackApi: TrackApi,
    private val recommendationRepository: RecommendationRepository,
    private val bearerTokenProvider: suspend () -> String?,
) : ViewModel() {
    var uiState by mutableStateOf(RecommendationHomeUiState())
        private set

    init {
        loadTags(initialNetworkAvailable)
    }

    fun refreshTags(isNetworkAvailable: Boolean = true) {
        loadTags(isNetworkAvailable)
    }

    fun toggleScene(tagId: Int) {
        uiState = uiState.copy(
            selectedSceneTagIds = uiState.selectedSceneTagIds.toggled(tagId),
            recommendationMessage = null,
            recommendationErrorMessage = null,
            recommendationResults = emptyList(),
            feedbackStates = emptyMap(),
        )
    }

    fun toggleType(tagId: Int) {
        uiState = uiState.copy(
            selectedTypeTagIds = uiState.selectedTypeTagIds.toggled(tagId),
            recommendationMessage = null,
            recommendationErrorMessage = null,
            recommendationResults = emptyList(),
            feedbackStates = emptyMap(),
        )
    }

    fun toggleFeature(tagId: Int) {
        uiState = uiState.copy(
            selectedFeatureTagIds = uiState.selectedFeatureTagIds.toggled(tagId),
            recommendationMessage = null,
            recommendationErrorMessage = null,
            recommendationResults = emptyList(),
            feedbackStates = emptyMap(),
        )
    }

    fun clearSelections() {
        uiState = uiState.copy(
            selectedSceneTagIds = emptySet(),
            selectedTypeTagIds = emptySet(),
            selectedFeatureTagIds = emptySet(),
            recommendationMessage = null,
            recommendationErrorMessage = null,
            recommendationResults = emptyList(),
            feedbackStates = emptyMap(),
        )
    }

    fun requestRecommendations(isNetworkAvailable: Boolean = true) {
        if (!isNetworkAvailable) {
            uiState = uiState.copy(
                recommendationMessage = null,
                recommendationErrorMessage = "当前离线。推荐请求需要连接后端。",
                recommendationResults = emptyList(),
                feedbackStates = emptyMap(),
            )
            return
        }

        if (uiState.isRequestingRecommendations) {
            return
        }

        uiState = uiState.copy(
            isRequestingRecommendations = true,
            recommendationMessage = null,
            recommendationErrorMessage = null,
            recommendationResults = emptyList(),
            feedbackStates = emptyMap(),
        )

        viewModelScope.launch {
            val request = uiState.toRecommendationRequest()
            val result = withContext(Dispatchers.IO) {
                recommendationRepository.getRecommendations(request)
            }

            uiState = when (result) {
                is ApiResult.Success -> uiState.copy(
                    isRequestingRecommendations = false,
                    recommendationMessage = result.value.results.size.resultMessage(),
                    recommendationErrorMessage = null,
                    recommendationResults = result.value.results.take(RecommendationRequest.DEFAULT_LIMIT),
                    feedbackStates = emptyMap(),
                    needsSignIn = false,
                )

                is ApiResult.Unauthorized -> uiState.copy(
                    isRequestingRecommendations = false,
                    recommendationErrorMessage = result.message,
                    needsSignIn = true,
                )

                is ApiResult.HttpError -> uiState.copy(
                    isRequestingRecommendations = false,
                    recommendationErrorMessage = result.message,
                )

                is ApiResult.NetworkError -> uiState.copy(
                    isRequestingRecommendations = false,
                    recommendationErrorMessage = result.message,
                )

                is ApiResult.SerializationError -> uiState.copy(
                    isRequestingRecommendations = false,
                    recommendationErrorMessage = result.message,
                )
            }
        }
    }

    fun updateAiText(text: String) {
        uiState = uiState.copy(
            aiState = uiState.aiState.copy(
                textInput = text,
                errorMessage = null,
            ),
        )
    }

    fun requestAiRecommendation(isNetworkAvailable: Boolean = true) {
        val text = uiState.aiState.textInput.trim()
        if (text.isEmpty()) {
            uiState = uiState.copy(
                aiState = uiState.aiState.copy(
                    errorMessage = "请先输入想听什么。",
                ),
            )
            return
        }

        if (!isNetworkAvailable) {
            uiState = uiState.copy(
                aiState = uiState.aiState.copy(
                    errorMessage = "当前离线。AI 推荐需要连接后端。",
                    isRequesting = false,
                    results = emptyList(),
                    parsedContext = null,
                ),
            )
            return
        }

        if (uiState.aiState.isRequesting) {
            return
        }

        uiState = uiState.copy(
            aiState = uiState.aiState.copy(
                isRequesting = true,
                errorMessage = null,
                results = emptyList(),
                parsedContext = null,
                providerStatus = null,
            ),
        )

        viewModelScope.launch {
            val request = AiRecommendRequest(text = text)
            val result = withContext(Dispatchers.IO) {
                recommendationRepository.getAiRecommendations(request)
            }

            uiState = when (result) {
                is ApiResult.Success -> {
                    val response: AiRecommendResponse = result.value
                    val parsed = response.parsedIntent
                    uiState.copy(
                        aiState = uiState.aiState.copy(
                            isRequesting = false,
                            errorMessage = null,
                            providerStatus = parsed.providerStatus,
                            parsedContext = AiParsedContext(
                                matchedTags = parsed.matchedTags,
                                unmatchedTerms = parsed.unmatchedTerms,
                                explanation = parsed.explanation,
                                structuredRequest = parsed.structuredRequest,
                            ),
                            results = response.results.take(AiRecommendRequest.DEFAULT_AI_LIMIT),
                        ),
                        feedbackStates = emptyMap(),
                        needsSignIn = false,
                    )
                }

                is ApiResult.Unauthorized -> uiState.copy(
                    aiState = uiState.aiState.copy(
                        isRequesting = false,
                        errorMessage = result.message,
                    ),
                    needsSignIn = true,
                )

                is ApiResult.HttpError -> uiState.copy(
                    aiState = uiState.aiState.copy(
                        isRequesting = false,
                        errorMessage = result.message,
                    ),
                )

                is ApiResult.NetworkError -> uiState.copy(
                    aiState = uiState.aiState.copy(
                        isRequesting = false,
                        errorMessage = result.message,
                    ),
                )

                is ApiResult.SerializationError -> uiState.copy(
                    aiState = uiState.aiState.copy(
                        isRequesting = false,
                        errorMessage = result.message,
                    ),
                )
            }
        }
    }

    fun sendAiFeedback(
        trackId: Int,
        feedbackType: FeedbackType,
        isNetworkAvailable: Boolean = true,
    ) {
        if (!isNetworkAvailable) {
            uiState = uiState.withFeedbackState(
                trackId = trackId,
                state = RecommendationFeedbackUiState(
                    errorMessage = "当前离线。推荐反馈需要连接后端。",
                ),
            )
            return
        }

        val currentFeedbackState = uiState.feedbackStates[trackId]
        if (currentFeedbackState?.isSending == true) {
            return
        }

        val parsedRequest = uiState.aiState.parsedContext?.structuredRequest
        val event = FeedbackEventRequest(
            clientEventId = UUID.randomUUID().toString(),
            trackId = trackId,
            feedbackType = feedbackType,
            sceneTagIds = parsedRequest?.sceneTagIds ?: emptyList(),
            typeTagIds = parsedRequest?.typeTagIds ?: emptyList(),
            featureTagIds = parsedRequest?.featureTagIds ?: emptyList(),
            occurredAt = Instant.now().toString(),
        )

        uiState = uiState.withFeedbackState(
            trackId = trackId,
            state = RecommendationFeedbackUiState(isSending = true),
        )

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                recommendationRepository.sendFeedbackEvent(event)
            }

            uiState = when (result) {
                is ApiResult.Success -> {
                    val accepted = result.value.accepted.firstOrNull()
                    val failed = result.value.failed.firstOrNull()
                    when {
                        accepted != null -> uiState.withFeedbackState(
                            trackId = trackId,
                            state = RecommendationFeedbackUiState(
                                message = feedbackType.successMessage(),
                            ),
                        )

                        failed != null -> uiState.withFeedbackState(
                            trackId = trackId,
                            state = RecommendationFeedbackUiState(
                                errorMessage = failed.error,
                            ),
                        )

                        else -> uiState.withFeedbackState(
                            trackId = trackId,
                            state = RecommendationFeedbackUiState(
                                errorMessage = "反馈响应中没有结果。",
                            ),
                        )
                    }
                }

                is ApiResult.Unauthorized -> uiState.withFeedbackState(
                    trackId = trackId,
                    state = RecommendationFeedbackUiState(errorMessage = result.message),
                ).copy(needsSignIn = true)

                is ApiResult.HttpError -> uiState.withFeedbackState(
                    trackId = trackId,
                    state = RecommendationFeedbackUiState(errorMessage = result.message),
                )

                is ApiResult.NetworkError -> uiState.withFeedbackState(
                    trackId = trackId,
                    state = RecommendationFeedbackUiState(errorMessage = result.message),
                )

                is ApiResult.SerializationError -> uiState.withFeedbackState(
                    trackId = trackId,
                    state = RecommendationFeedbackUiState(errorMessage = result.message),
                )
            }
        }
    }

    fun sendFeedback(
        trackId: Int,
        feedbackType: FeedbackType,
        isNetworkAvailable: Boolean = true,
    ) {
        if (!isNetworkAvailable) {
            uiState = uiState.withFeedbackState(
                trackId = trackId,
                state = RecommendationFeedbackUiState(
                    errorMessage = "当前离线。推荐反馈需要连接后端。",
                ),
            )
            return
        }

        val currentFeedbackState = uiState.feedbackStates[trackId]
        if (currentFeedbackState?.isSending == true) {
            return
        }

        val event = uiState.toFeedbackEventRequest(
            trackId = trackId,
            feedbackType = feedbackType,
        )

        uiState = uiState.withFeedbackState(
            trackId = trackId,
            state = RecommendationFeedbackUiState(isSending = true),
        )

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                recommendationRepository.sendFeedbackEvent(event)
            }

            uiState = when (result) {
                is ApiResult.Success -> {
                    val accepted = result.value.accepted.firstOrNull()
                    val failed = result.value.failed.firstOrNull()
                    when {
                        accepted != null -> uiState.withFeedbackState(
                            trackId = trackId,
                            state = RecommendationFeedbackUiState(
                                message = feedbackType.successMessage(),
                            ),
                        )

                        failed != null -> uiState.withFeedbackState(
                            trackId = trackId,
                            state = RecommendationFeedbackUiState(
                                errorMessage = failed.error,
                            ),
                        )

                        else -> uiState.withFeedbackState(
                            trackId = trackId,
                            state = RecommendationFeedbackUiState(
                                errorMessage = "反馈响应中没有结果。",
                            ),
                        )
                    }
                }

                is ApiResult.Unauthorized -> uiState.withFeedbackState(
                    trackId = trackId,
                    state = RecommendationFeedbackUiState(errorMessage = result.message),
                ).copy(needsSignIn = true)

                is ApiResult.HttpError -> uiState.withFeedbackState(
                    trackId = trackId,
                    state = RecommendationFeedbackUiState(errorMessage = result.message),
                )

                is ApiResult.NetworkError -> uiState.withFeedbackState(
                    trackId = trackId,
                    state = RecommendationFeedbackUiState(errorMessage = result.message),
                )

                is ApiResult.SerializationError -> uiState.withFeedbackState(
                    trackId = trackId,
                    state = RecommendationFeedbackUiState(errorMessage = result.message),
                )
            }
        }
    }

    private fun loadTags(isNetworkAvailable: Boolean) {
        if (!isNetworkAvailable) {
            uiState = uiState.copy(
                isLoadingTags = false,
                tagErrorMessage = "当前离线。加载标签需要连接后端。",
                needsSignIn = false,
            )
            return
        }

        uiState = uiState.copy(
            isLoadingTags = true,
            tagErrorMessage = null,
            needsSignIn = false,
        )

        viewModelScope.launch {
            val token = withContext(Dispatchers.IO) {
                bearerTokenProvider()
            }

            if (token == null) {
                uiState = uiState.copy(
                    isLoadingTags = false,
                    tagErrorMessage = "请重新登录后加载推荐标签。",
                    needsSignIn = true,
                )
                return@launch
            }

            val result = withContext(Dispatchers.IO) {
                trackApi.listTags(token)
            }

            uiState = when (result) {
                is ApiResult.Success -> uiState.copy(
                    groupedTags = result.value.toRecommendationTagGroups(),
                    isLoadingTags = false,
                    tagErrorMessage = null,
                    needsSignIn = false,
                )

                is ApiResult.Unauthorized -> uiState.copy(
                    isLoadingTags = false,
                    tagErrorMessage = result.message,
                    needsSignIn = true,
                )

                is ApiResult.HttpError -> uiState.copy(
                    isLoadingTags = false,
                    tagErrorMessage = result.message,
                )

                is ApiResult.NetworkError -> uiState.copy(
                    isLoadingTags = false,
                    tagErrorMessage = result.message,
                )

                is ApiResult.SerializationError -> uiState.copy(
                    isLoadingTags = false,
                    tagErrorMessage = result.message,
                )
            }
        }
    }
}

private fun RecommendationHomeUiState.withFeedbackState(
    trackId: Int,
    state: RecommendationFeedbackUiState,
): RecommendationHomeUiState =
    copy(feedbackStates = feedbackStates + (trackId to state))

private fun RecommendationHomeUiState.toRecommendationRequest(): RecommendationRequest =
    RecommendationRequest(
        sceneTagIds = selectedSceneTagIds.sorted(),
        typeTagIds = selectedTypeTagIds.sorted(),
        featureTagIds = selectedFeatureTagIds.sorted(),
    )

private fun RecommendationHomeUiState.toFeedbackEventRequest(
    trackId: Int,
    feedbackType: FeedbackType,
): FeedbackEventRequest =
    FeedbackEventRequest(
        clientEventId = UUID.randomUUID().toString(),
        trackId = trackId,
        feedbackType = feedbackType,
        sceneTagIds = selectedSceneTagIds.sorted(),
        typeTagIds = selectedTypeTagIds.sorted(),
        featureTagIds = selectedFeatureTagIds.sorted(),
        occurredAt = Instant.now().toString(),
    )

private fun List<TagResponse>.toRecommendationTagGroups(): RecommendationTagGroups =
    RecommendationTagGroups(
        scenes = filterGroup("scene"),
        types = filterGroup("type"),
        features = filterGroup("feature"),
    )

private fun List<TagResponse>.filterGroup(group: String): List<TagResponse> =
    filter { tag -> tag.group == group }.sortedBy { tag -> tag.name.lowercase() }

private fun Set<Int>.toggled(tagId: Int): Set<Int> =
    if (tagId in this) this - tagId else this + tagId

private fun Int.resultMessage(): String =
    when (this) {
        0 -> "当前条件还没有匹配的推荐。调整已选标签后再试一次。"
        1 -> "推荐请求完成，找到 1 个候选音轨。"
        else -> "推荐请求完成，找到 $this 个候选音轨。"
    }

private fun FeedbackType.successMessage(): String =
    when (this) {
        FeedbackType.Like -> "已标记喜欢。播放和离线缓存不会受影响。"
        FeedbackType.Dislike -> "已标记不喜欢。再次请求可刷新推荐。"
        FeedbackType.Tired -> "已标记听腻了。再次请求可刷新推荐。"
        FeedbackType.NotToday -> "已标记今天不听。再次请求可刷新推荐。"
        FeedbackType.NotSuitableForContext -> "已标记不适合当前场景。再次请求可刷新推荐。"
        FeedbackType.SkipRecommendation -> "已跳过这个推荐。再次请求可刷新推荐。"
    }
