package com.easymusic.app.recommendation.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.library.data.TagResponse
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.recommendation.data.FeedbackEventRequest
import com.easymusic.app.recommendation.data.FeedbackType
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
    val selectedScenarioTagIds: Set<Int> = emptySet(),
    val selectedStateTagIds: Set<Int> = emptySet(),
    val selectedTypeTagIds: Set<Int> = emptySet(),
    val desiredAttributeTagIds: Set<Int> = emptySet(),
    val excludedAttributeTagIds: Set<Int> = emptySet(),
    val isLoadingTags: Boolean = true,
    val isRequestingRecommendations: Boolean = false,
    val tagErrorMessage: String? = null,
    val recommendationMessage: String? = null,
    val recommendationErrorMessage: String? = null,
    val recommendationResults: List<RecommendationResult> = emptyList(),
    val feedbackStates: Map<Int, RecommendationFeedbackUiState> = emptyMap(),
    val needsSignIn: Boolean = false,
) {
    val hasAnyTags: Boolean
        get() = groupedTags.allTags.isNotEmpty()

    val selectedContextCount: Int
        get() = selectedScenarioTagIds.size +
            selectedStateTagIds.size +
            selectedTypeTagIds.size +
            desiredAttributeTagIds.size +
            excludedAttributeTagIds.size
}

data class RecommendationFeedbackUiState(
    val isSending: Boolean = false,
    val message: String? = null,
    val errorMessage: String? = null,
)

data class RecommendationTagGroups(
    val scenarios: List<TagResponse> = emptyList(),
    val states: List<TagResponse> = emptyList(),
    val types: List<TagResponse> = emptyList(),
    val attributes: List<TagResponse> = emptyList(),
) {
    val allTags: List<TagResponse>
        get() = scenarios + states + types + attributes
}

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

    fun toggleScenario(tagId: Int) {
        uiState = uiState.copy(
            selectedScenarioTagIds = uiState.selectedScenarioTagIds.toggled(tagId),
            recommendationMessage = null,
            recommendationErrorMessage = null,
            recommendationResults = emptyList(),
            feedbackStates = emptyMap(),
        )
    }

    fun toggleState(tagId: Int) {
        uiState = uiState.copy(
            selectedStateTagIds = uiState.selectedStateTagIds.toggled(tagId),
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

    fun toggleDesiredAttribute(tagId: Int) {
        uiState = uiState.copy(
            desiredAttributeTagIds = uiState.desiredAttributeTagIds.toggled(tagId),
            excludedAttributeTagIds = uiState.excludedAttributeTagIds - tagId,
            recommendationMessage = null,
            recommendationErrorMessage = null,
            recommendationResults = emptyList(),
            feedbackStates = emptyMap(),
        )
    }

    fun toggleExcludedAttribute(tagId: Int) {
        uiState = uiState.copy(
            excludedAttributeTagIds = uiState.excludedAttributeTagIds.toggled(tagId),
            desiredAttributeTagIds = uiState.desiredAttributeTagIds - tagId,
            recommendationMessage = null,
            recommendationErrorMessage = null,
            recommendationResults = emptyList(),
            feedbackStates = emptyMap(),
        )
    }

    fun clearSelections() {
        uiState = uiState.copy(
            selectedScenarioTagIds = emptySet(),
            selectedStateTagIds = emptySet(),
            selectedTypeTagIds = emptySet(),
            desiredAttributeTagIds = emptySet(),
            excludedAttributeTagIds = emptySet(),
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
                recommendationErrorMessage = "You are offline. Recommendation requests need the backend.",
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

    fun sendFeedback(
        trackId: Int,
        feedbackType: FeedbackType,
        isNetworkAvailable: Boolean = true,
    ) {
        if (!isNetworkAvailable) {
            uiState = uiState.withFeedbackState(
                trackId = trackId,
                state = RecommendationFeedbackUiState(
                    errorMessage = "You are offline. Recommendation feedback needs the backend.",
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
                                errorMessage = "Feedback response did not include a result.",
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
                tagErrorMessage = "You are offline. Tag loading needs the backend.",
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
                    tagErrorMessage = "Please sign in again to load recommendation tags.",
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
        scenarioTagIds = selectedScenarioTagIds.sorted(),
        stateTagIds = selectedStateTagIds.sorted(),
        typeTagIds = selectedTypeTagIds.sorted(),
        attributeTagIds = desiredAttributeTagIds.sorted(),
        excludeAttributeTagIds = excludedAttributeTagIds.sorted(),
    )

private fun RecommendationHomeUiState.toFeedbackEventRequest(
    trackId: Int,
    feedbackType: FeedbackType,
): FeedbackEventRequest =
    FeedbackEventRequest(
        clientEventId = UUID.randomUUID().toString(),
        trackId = trackId,
        feedbackType = feedbackType,
        scenarioTagIds = selectedScenarioTagIds.sorted(),
        stateTagIds = selectedStateTagIds.sorted(),
        typeTagIds = selectedTypeTagIds.sorted(),
        attributeTagIds = desiredAttributeTagIds.sorted(),
        occurredAt = Instant.now().toString(),
    )

private fun List<TagResponse>.toRecommendationTagGroups(): RecommendationTagGroups =
    RecommendationTagGroups(
        scenarios = filterGroup("scenario"),
        states = filterGroup("state"),
        types = filterGroup("type"),
        attributes = filterGroup("attribute"),
    )

private fun List<TagResponse>.filterGroup(group: String): List<TagResponse> =
    filter { tag -> tag.group == group }.sortedBy { tag -> tag.name.lowercase() }

private fun Set<Int>.toggled(tagId: Int): Set<Int> =
    if (tagId in this) this - tagId else this + tagId

private fun Int.resultMessage(): String =
    when (this) {
        0 -> "No recommendations matched this context yet. Adjust the selected tags and request again."
        1 -> "Recommendation request completed with 1 candidate."
        else -> "Recommendation request completed with $this candidates."
    }

private fun FeedbackType.successMessage(): String =
    when (this) {
        FeedbackType.Like -> "Liked. Playback and cache behavior were not changed."
        FeedbackType.Tired -> "Marked tired. Request again when you want a refreshed recommendation."
        FeedbackType.NotToday -> "Marked not today. Request again to refresh."
        FeedbackType.NotSuitableForContext -> "Marked not suitable for this context. Request again to refresh."
        FeedbackType.SkipRecommendation -> "Skipped for recommendation. Request again to refresh."
    }
