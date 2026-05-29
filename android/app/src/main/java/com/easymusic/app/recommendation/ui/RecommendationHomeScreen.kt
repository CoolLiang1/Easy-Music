package com.easymusic.app.recommendation.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.library.data.TagResponse
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.recommendation.data.HttpAiRecommendationApi
import com.easymusic.app.recommendation.data.HttpFeedbackApi
import com.easymusic.app.recommendation.data.HttpRecommendationApi
import com.easymusic.app.recommendation.data.FeedbackType
import com.easymusic.app.recommendation.data.RecommendationResult
import com.easymusic.app.recommendation.domain.RecommendationRepository
import java.util.Locale

@Composable
fun RecommendationHomeRoute(
    modifier: Modifier = Modifier,
    config: AppConfig = AppConfig.default(),
    isNetworkAvailable: Boolean = true,
    onTrackSelected: (TrackResponse) -> Unit,
) {
    val context = LocalContext.current
    val viewModel = remember(context, config) {
        val apiClient = ApiClient(config)
        val tokenStore = AuthTokenStore(context)
        RecommendationHomeViewModel(
            initialNetworkAvailable = isNetworkAvailable,
            trackApi = TrackApi(apiClient),
            recommendationRepository = RecommendationRepository(
                recommendationApi = HttpRecommendationApi(apiClient),
                aiRecommendationApi = HttpAiRecommendationApi(apiClient),
                feedbackApi = HttpFeedbackApi(apiClient),
                tokenStore = tokenStore,
            ),
            bearerTokenProvider = tokenStore::readToken,
        )
    }

    RecommendationHomeScreen(
        modifier = modifier,
        uiState = viewModel.uiState,
        isNetworkAvailable = isNetworkAvailable,
        onRefreshTags = { viewModel.refreshTags(isNetworkAvailable) },
        onToggleScenario = viewModel::toggleScenario,
        onToggleState = viewModel::toggleState,
        onToggleType = viewModel::toggleType,
        onToggleDesiredAttribute = viewModel::toggleDesiredAttribute,
        onToggleExcludedAttribute = viewModel::toggleExcludedAttribute,
        onClearSelections = viewModel::clearSelections,
        onRequestRecommendations = { viewModel.requestRecommendations(isNetworkAvailable) },
        onSendFeedback = { trackId, feedbackType ->
            viewModel.sendFeedback(
                trackId = trackId,
                feedbackType = feedbackType,
                isNetworkAvailable = isNetworkAvailable,
            )
        },
        onTrackSelected = onTrackSelected,
    )
}

@Composable
fun RecommendationHomeScreen(
    uiState: RecommendationHomeUiState,
    onRefreshTags: () -> Unit,
    onToggleScenario: (Int) -> Unit,
    onToggleState: (Int) -> Unit,
    onToggleType: (Int) -> Unit,
    onToggleDesiredAttribute: (Int) -> Unit,
    onToggleExcludedAttribute: (Int) -> Unit,
    onClearSelections: () -> Unit,
    onRequestRecommendations: () -> Unit,
    onSendFeedback: (Int, FeedbackType) -> Unit,
    onTrackSelected: (TrackResponse) -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 16.dp),
    ) {
        RecommendationHeader(
            isNetworkAvailable = isNetworkAvailable,
            isLoading = uiState.isLoadingTags,
            onRefreshTags = onRefreshTags,
        )

        Spacer(modifier = Modifier.height(16.dp))

        when {
            uiState.isLoadingTags -> RecommendationLoading()
            uiState.tagErrorMessage != null -> RecommendationError(
                title = if (uiState.needsSignIn) "Sign in required" else "Could not load tags",
                message = uiState.tagErrorMessage,
                actionLabel = if (isNetworkAvailable) "Try Again" else "Offline",
                actionEnabled = isNetworkAvailable,
                onAction = onRefreshTags,
            )

            !uiState.hasAnyTags -> RecommendationEmptyTags(onRefreshTags = onRefreshTags)
            else -> RecommendationControls(
                uiState = uiState,
                isNetworkAvailable = isNetworkAvailable,
                onToggleScenario = onToggleScenario,
                onToggleState = onToggleState,
                onToggleType = onToggleType,
                onToggleDesiredAttribute = onToggleDesiredAttribute,
                onToggleExcludedAttribute = onToggleExcludedAttribute,
                onClearSelections = onClearSelections,
                onRequestRecommendations = onRequestRecommendations,
                onSendFeedback = onSendFeedback,
                onTrackSelected = onTrackSelected,
            )
        }
    }
}

@Composable
private fun RecommendationHeader(
    isNetworkAvailable: Boolean,
    isLoading: Boolean,
    onRefreshTags: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Recommendations",
                style = MaterialTheme.typography.headlineMedium,
            )
            Text(
                text = if (isNetworkAvailable) {
                    "Choose tags, then request a structured recommendation"
                } else {
                    "Recommendation tags and requests need the backend"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = if (isNetworkAvailable) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    MaterialTheme.colorScheme.error
                },
            )
        }
        OutlinedButton(
            enabled = !isLoading && isNetworkAvailable,
            onClick = onRefreshTags,
        ) {
            Text(
                when {
                    !isNetworkAvailable -> "Offline"
                    isLoading -> "Loading"
                    else -> "Reload Tags"
                },
            )
        }
    }
}

@Composable
private fun RecommendationLoading() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 80.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Spacer(modifier = Modifier.height(12.dp))
        Text("Loading tags")
    }
}

@Composable
private fun RecommendationEmptyTags(onRefreshTags: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 80.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "No recommendation tags yet",
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            modifier = Modifier.padding(top = 8.dp),
            text = "Create scenario, state, type, or attribute tags from the Web console, then reload.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(
            modifier = Modifier.padding(top = 16.dp),
            onClick = onRefreshTags,
        ) {
            Text("Reload Tags")
        }
    }
}

@Composable
private fun RecommendationError(
    title: String,
    message: String,
    actionLabel: String,
    actionEnabled: Boolean,
    onAction: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 80.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            modifier = Modifier.padding(top = 8.dp),
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
        Button(
            modifier = Modifier.padding(top = 16.dp),
            enabled = actionEnabled,
            onClick = onAction,
        ) {
            Text(actionLabel)
        }
    }
}

@Composable
private fun RecommendationControls(
    uiState: RecommendationHomeUiState,
    isNetworkAvailable: Boolean,
    onToggleScenario: (Int) -> Unit,
    onToggleState: (Int) -> Unit,
    onToggleType: (Int) -> Unit,
    onToggleDesiredAttribute: (Int) -> Unit,
    onToggleExcludedAttribute: (Int) -> Unit,
    onClearSelections: () -> Unit,
    onRequestRecommendations: () -> Unit,
    onSendFeedback: (Int, FeedbackType) -> Unit,
    onTrackSelected: (TrackResponse) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        TagSection(
            title = "Scenario",
            tags = uiState.groupedTags.scenarios,
            selectedTagIds = uiState.selectedScenarioTagIds,
            emptyText = "No scenario tags",
            onToggleTag = onToggleScenario,
        )
        TagSection(
            title = "State",
            tags = uiState.groupedTags.states,
            selectedTagIds = uiState.selectedStateTagIds,
            emptyText = "No state tags",
            onToggleTag = onToggleState,
        )
        TagSection(
            title = "Type",
            tags = uiState.groupedTags.types,
            selectedTagIds = uiState.selectedTypeTagIds,
            emptyText = "No type tags",
            onToggleTag = onToggleType,
        )
        AttributeSection(
            tags = uiState.groupedTags.attributes,
            desiredTagIds = uiState.desiredAttributeTagIds,
            excludedTagIds = uiState.excludedAttributeTagIds,
            onToggleDesired = onToggleDesiredAttribute,
            onToggleExcluded = onToggleExcludedAttribute,
        )

        RecommendationStatus(uiState = uiState)
        RecommendationResults(
            uiState = uiState,
            isNetworkAvailable = isNetworkAvailable,
            onSendFeedback = onSendFeedback,
            onTrackSelected = onTrackSelected,
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedButton(
                enabled = uiState.selectedContextCount > 0 && !uiState.isRequestingRecommendations,
                onClick = onClearSelections,
            ) {
                Text("Clear")
            }
            Button(
                modifier = Modifier.padding(start = 12.dp),
                enabled = !uiState.isRequestingRecommendations && isNetworkAvailable,
                onClick = onRequestRecommendations,
            ) {
                Text(
                    when {
                        !isNetworkAvailable -> "Offline"
                        uiState.isRequestingRecommendations -> "Requesting"
                        else -> "Request Recommendation"
                    },
                )
            }
        }
    }
}

@Composable
private fun RecommendationResults(
    uiState: RecommendationHomeUiState,
    isNetworkAvailable: Boolean,
    onSendFeedback: (Int, FeedbackType) -> Unit,
    onTrackSelected: (TrackResponse) -> Unit,
) {
    val results = uiState.recommendationResults
    if (results.isEmpty()) {
        if (uiState.recommendationMessage?.startsWith("No recommendations") == true) {
            EmptyRecommendationResults()
        }
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        results.firstOrNull()?.let { result ->
            Text(
                text = "Primary Recommendation",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            RecommendationResultCard(
                result = result,
                isPrimary = true,
                isNetworkAvailable = isNetworkAvailable,
                feedbackState = uiState.feedbackStates[result.track.id],
                onSendFeedback = { feedbackType ->
                    onSendFeedback(result.track.id, feedbackType)
                },
                onClick = { onTrackSelected(result.track) },
            )
        }

        val alternatives = results.drop(1).take(2)
        if (alternatives.isNotEmpty()) {
            Text(
                modifier = Modifier.padding(top = 4.dp),
                text = "Alternatives",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            alternatives.forEach { result ->
                RecommendationResultCard(
                    result = result,
                    isPrimary = false,
                    isNetworkAvailable = isNetworkAvailable,
                    feedbackState = uiState.feedbackStates[result.track.id],
                    onSendFeedback = { feedbackType ->
                        onSendFeedback(result.track.id, feedbackType)
                    },
                    onClick = { onTrackSelected(result.track) },
                )
            }
        }
    }
}

@Composable
private fun EmptyRecommendationResults() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceContainer,
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = MaterialTheme.shapes.small,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = "No matching recommendation",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Adjust the selected tags, then request recommendations again.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun RecommendationResultCard(
    result: RecommendationResult,
    isPrimary: Boolean,
    isNetworkAvailable: Boolean,
    feedbackState: RecommendationFeedbackUiState?,
    onSendFeedback: (FeedbackType) -> Unit,
    onClick: () -> Unit,
) {
    val track = result.track
    Card(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
        colors = CardDefaults.cardColors(
            containerColor = if (isPrimary) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceContainer
            },
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = track.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = track.artistAlbumLabel(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    modifier = Modifier.padding(start = 12.dp),
                    text = "#${result.rank} / ${result.score.formatScore()}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }

            val tags = track.tags.take(4)
            if (tags.isNotEmpty()) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    tags.forEach { tag ->
                        FilterChip(
                            selected = false,
                            onClick = {},
                            label = { Text(tag.name) },
                        )
                    }
                }
            }

            Text(
                text = result.reason,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            RecommendationFeedbackActions(
                feedbackState = feedbackState,
                isNetworkAvailable = isNetworkAvailable,
                onSendFeedback = onSendFeedback,
            )
            Text(
                text = "Tap to play",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun RecommendationFeedbackActions(
    feedbackState: RecommendationFeedbackUiState?,
    isNetworkAvailable: Boolean,
    onSendFeedback: (FeedbackType) -> Unit,
) {
    val isSending = feedbackState?.isSending == true
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FeedbackButton(
                label = "Like",
                enabled = isNetworkAvailable && !isSending,
                onClick = { onSendFeedback(FeedbackType.Like) },
            )
            FeedbackButton(
                label = "Tired",
                enabled = isNetworkAvailable && !isSending,
                onClick = { onSendFeedback(FeedbackType.Tired) },
            )
            FeedbackButton(
                label = "Not Today",
                enabled = isNetworkAvailable && !isSending,
                onClick = { onSendFeedback(FeedbackType.NotToday) },
            )
            FeedbackButton(
                label = "Not Suitable",
                enabled = isNetworkAvailable && !isSending,
                onClick = { onSendFeedback(FeedbackType.NotSuitableForContext) },
            )
            FeedbackButton(
                label = "Skip",
                enabled = isNetworkAvailable && !isSending,
                onClick = { onSendFeedback(FeedbackType.SkipRecommendation) },
            )
        }

        when {
            isSending -> Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator()
                Text(
                    modifier = Modifier.padding(start = 12.dp),
                    text = "Sending feedback",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            feedbackState?.errorMessage != null -> Text(
                text = feedbackState.errorMessage,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )

            feedbackState?.message != null -> Text(
                text = feedbackState.message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun FeedbackButton(
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    OutlinedButton(
        enabled = enabled,
        onClick = onClick,
    ) {
        Text(label)
    }
}

@Composable
private fun TagSection(
    title: String,
    tags: List<TagResponse>,
    selectedTagIds: Set<Int>,
    emptyText: String,
    onToggleTag: (Int) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        if (tags.isEmpty()) {
            Text(
                text = emptyText,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                tags.forEach { tag ->
                    FilterChip(
                        selected = tag.id in selectedTagIds,
                        onClick = { onToggleTag(tag.id) },
                        label = { Text(tag.name) },
                    )
                }
            }
        }
    }
}

private fun TrackResponse.artistAlbumLabel(): String =
    listOfNotNull(artist, album)
        .filter { value -> value.isNotBlank() }
        .joinToString(separator = " - ")
        .ifBlank { "Unknown artist or album" }

private fun Double.formatScore(): String =
    String.format(Locale.US, "%.1f", this)

@Composable
private fun AttributeSection(
    tags: List<TagResponse>,
    desiredTagIds: Set<Int>,
    excludedTagIds: Set<Int>,
    onToggleDesired: (Int) -> Unit,
    onToggleExcluded: (Int) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            text = "Attributes",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        if (tags.isEmpty()) {
            Text(
                text = "No attribute tags",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return
        }
        AttributeChipRow(
            title = "Desired",
            tags = tags,
            selectedTagIds = desiredTagIds,
            onToggleTag = onToggleDesired,
        )
        AttributeChipRow(
            title = "Excluded",
            tags = tags,
            selectedTagIds = excludedTagIds,
            onToggleTag = onToggleExcluded,
        )
    }
}

@Composable
private fun AttributeChipRow(
    title: String,
    tags: List<TagResponse>,
    selectedTagIds: Set<Int>,
    onToggleTag: (Int) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            tags.forEach { tag ->
                FilterChip(
                    selected = tag.id in selectedTagIds,
                    onClick = { onToggleTag(tag.id) },
                    label = { Text(tag.name) },
                )
            }
        }
    }
}

@Composable
private fun RecommendationStatus(uiState: RecommendationHomeUiState) {
    val errorMessage = uiState.recommendationErrorMessage
    val message = uiState.recommendationMessage

    when {
        uiState.isRequestingRecommendations -> Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
            shape = MaterialTheme.shapes.small,
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator()
                Text(
                    modifier = Modifier.padding(start = 12.dp),
                    text = "Requesting recommendation",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        errorMessage != null -> Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
            shape = MaterialTheme.shapes.small,
        ) {
            Text(
                modifier = Modifier.padding(12.dp),
                text = errorMessage,
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        message != null -> Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
            shape = MaterialTheme.shapes.small,
        ) {
            Text(
                modifier = Modifier.padding(12.dp),
                text = message,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
