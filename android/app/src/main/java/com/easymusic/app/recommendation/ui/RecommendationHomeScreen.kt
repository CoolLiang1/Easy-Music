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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import com.easymusic.app.recommendation.data.MatchedTagItem
import com.easymusic.app.recommendation.data.RecommendationResult
import com.easymusic.app.recommendation.domain.RecommendationRepository
import com.easymusic.app.ui.theme.BannerTone
import com.easymusic.app.ui.theme.SectionHeader
import com.easymusic.app.ui.theme.StatusBanner
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
        onToggleScene = viewModel::toggleScene,
        onToggleFeature = viewModel::toggleFeature,
        onToggleType = viewModel::toggleType,
        onClearSelections = viewModel::clearSelections,
        onRequestRecommendations = { viewModel.requestRecommendations(isNetworkAvailable) },
        onAiTextChanged = viewModel::updateAiText,
        onRequestAiRecommendation = { viewModel.requestAiRecommendation(isNetworkAvailable) },
        onSendAiFeedback = { trackId, feedbackType ->
            viewModel.sendAiFeedback(
                trackId = trackId,
                feedbackType = feedbackType,
                isNetworkAvailable = isNetworkAvailable,
            )
        },
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
    onToggleScene: (Int) -> Unit,
    onToggleFeature: (Int) -> Unit,
    onToggleType: (Int) -> Unit,
    onClearSelections: () -> Unit,
    onRequestRecommendations: () -> Unit,
    onAiTextChanged: (String) -> Unit,
    onRequestAiRecommendation: () -> Unit,
    onSendAiFeedback: (Int, FeedbackType) -> Unit,
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
                title = if (uiState.needsSignIn) "需要登录" else "无法加载标签",
                message = uiState.tagErrorMessage,
                actionLabel = if (isNetworkAvailable) "重试" else "离线",
                actionEnabled = isNetworkAvailable,
                onAction = onRefreshTags,
            )

            !uiState.hasAnyTags -> RecommendationEmptyTags(onRefreshTags = onRefreshTags)
            else -> RecommendationControls(
                uiState = uiState,
                isNetworkAvailable = isNetworkAvailable,
                onToggleScene = onToggleScene,
                onToggleFeature = onToggleFeature,
                onToggleType = onToggleType,
                onClearSelections = onClearSelections,
                onRequestRecommendations = onRequestRecommendations,
                onAiTextChanged = onAiTextChanged,
                onRequestAiRecommendation = onRequestAiRecommendation,
                onSendAiFeedback = onSendAiFeedback,
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
    SectionHeader(
        title = "推荐",
        subtitle = if (isNetworkAvailable) {
            "输入自然语言，或按场景 / 类型 / 特点选择标签"
        } else {
            "推荐标签和推荐请求需要连接后端"
        },
        action = {
            OutlinedButton(
                enabled = !isLoading && isNetworkAvailable,
                onClick = onRefreshTags,
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    when {
                        !isNetworkAvailable -> "离线"
                        isLoading -> "加载中"
                        else -> "重新加载"
                    },
                )
            }
        },
    )
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
        Text("正在加载标签")
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
            text = "还没有推荐标签",
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            modifier = Modifier.padding(top = 8.dp),
            text = "请先在 Web 控制台创建场景、类型或特点标签，然后重新加载。",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(
            modifier = Modifier.padding(top = 16.dp),
            onClick = onRefreshTags,
        ) {
            Text("重新加载标签")
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
    onToggleScene: (Int) -> Unit,
    onToggleFeature: (Int) -> Unit,
    onToggleType: (Int) -> Unit,
    onClearSelections: () -> Unit,
    onRequestRecommendations: () -> Unit,
    onAiTextChanged: (String) -> Unit,
    onRequestAiRecommendation: () -> Unit,
    onSendAiFeedback: (Int, FeedbackType) -> Unit,
    onSendFeedback: (Int, FeedbackType) -> Unit,
    onTrackSelected: (TrackResponse) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        AiAssistantSection(
            aiState = uiState.aiState,
            feedbackStates = uiState.feedbackStates,
            isNetworkAvailable = isNetworkAvailable,
            onTextChanged = onAiTextChanged,
            onRequestRecommendation = onRequestAiRecommendation,
            onSendFeedback = onSendAiFeedback,
            onTrackSelected = onTrackSelected,
        )

        SectionHeader(
            title = "结构化推荐",
            subtitle = "需要可预测匹配时，直接选择已有标签",
        )

        SelectionSummary(uiState = uiState)

        TagSection(
            title = "场景",
            tags = uiState.groupedTags.scenes,
            selectedTagIds = uiState.selectedSceneTagIds,
            emptyText = "暂无场景标签",
            onToggleTag = onToggleScene,
        )
        TagSection(
            title = "类型",
            tags = uiState.groupedTags.types,
            selectedTagIds = uiState.selectedTypeTagIds,
            emptyText = "暂无类型标签",
            onToggleTag = onToggleType,
        )
        TagSection(
            title = "特点",
            tags = uiState.groupedTags.features,
            selectedTagIds = uiState.selectedFeatureTagIds,
            emptyText = "暂无特点标签",
            onToggleTag = onToggleFeature,
        )

        RecommendationStatus(uiState = uiState)
        RecommendationResults(
            uiState = uiState,
            isNetworkAvailable = isNetworkAvailable,
            onSendFeedback = onSendFeedback,
            onTrackSelected = onTrackSelected,
        )

        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedButton(
                enabled = uiState.selectedContextCount > 0 && !uiState.isRequestingRecommendations,
                onClick = onClearSelections,
            ) {
                Text("清空")
            }
            Button(
                modifier = Modifier.padding(start = 12.dp),
                enabled = !uiState.isRequestingRecommendations && isNetworkAvailable,
                onClick = onRequestRecommendations,
            ) {
                Text(
                    when {
                        !isNetworkAvailable -> "离线"
                        uiState.isRequestingRecommendations -> "请求中"
                        else -> "请求推荐"
                    },
                )
            }
        }
    }
}

@Composable
private fun SelectionSummary(uiState: RecommendationHomeUiState) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceContainer,
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = MaterialTheme.shapes.small,
    ) {
        FlowRow(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SummaryChip(label = "场景 ${uiState.selectedSceneTagIds.size}")
            SummaryChip(label = "类型 ${uiState.selectedTypeTagIds.size}")
            SummaryChip(label = "特点 ${uiState.selectedFeatureTagIds.size}")
        }
    }
}

@Composable
private fun SummaryChip(label: String) {
    FilterChip(
        selected = false,
        onClick = {},
        label = { Text(label) },
    )
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
        if (uiState.recommendationMessage?.startsWith("当前条件还没有匹配的推荐") == true) {
            EmptyRecommendationResults()
        }
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        results.firstOrNull()?.let { result ->
            Text(
                text = "首选推荐",
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
                text = "备选推荐",
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
                text = "没有匹配的推荐",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "调整已选标签后，再次请求推荐。",
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
                text = result.explanation
                    ?.let(::formatRecommendationExplanationForDisplay)
                    ?.takeIf { it.isNotBlank() }
                    ?: formatRecommendationReasonForDisplay(result.reason),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            RecommendationFeedbackActions(
                feedbackState = feedbackState,
                isNetworkAvailable = isNetworkAvailable,
                onSendFeedback = onSendFeedback,
            )
            Text(
                text = "点按播放",
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
                label = "喜欢",
                enabled = isNetworkAvailable && !isSending,
                onClick = { onSendFeedback(FeedbackType.Like) },
            )
            FeedbackButton(
                label = "听腻了",
                enabled = isNetworkAvailable && !isSending,
                onClick = { onSendFeedback(FeedbackType.Tired) },
            )
            FeedbackButton(
                label = "今天不听",
                enabled = isNetworkAvailable && !isSending,
                onClick = { onSendFeedback(FeedbackType.NotToday) },
            )
            FeedbackButton(
                label = "不适合",
                enabled = isNetworkAvailable && !isSending,
                onClick = { onSendFeedback(FeedbackType.NotSuitableForContext) },
            )
            FeedbackButton(
                label = "跳过",
                enabled = isNetworkAvailable && !isSending,
                onClick = { onSendFeedback(FeedbackType.SkipRecommendation) },
            )
        }

        when {
            isSending -> Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator()
                Text(
                    modifier = Modifier.padding(start = 12.dp),
                    text = "正在发送反馈",
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
            text = "$title · ${tags.size}",
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

// ---------------------------------------------------------------------------
// AI Assistant section
// ---------------------------------------------------------------------------

@Composable
private fun AiAssistantSection(
    aiState: AiRecommendationUiState,
    feedbackStates: Map<Int, RecommendationFeedbackUiState>,
    isNetworkAvailable: Boolean,
    onTextChanged: (String) -> Unit,
    onRequestRecommendation: () -> Unit,
    onSendFeedback: (Int, FeedbackType) -> Unit,
    onTrackSelected: (TrackResponse) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionHeader(
            title = "AI 助手",
            subtitle = "自然语言会先解析成场景 / 类型 / 特点，再走规则推荐",
        )

        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedTextField(
                value = aiState.textInput,
                onValueChange = onTextChanged,
                modifier = Modifier.fillMaxWidth(),
                enabled = !aiState.isRequesting && isNetworkAvailable,
                label = { Text("描述现在想听什么") },
                placeholder = { Text("例如：安静的纯音乐，适合专注") },
                singleLine = true,
            )
            Button(
                modifier = Modifier.align(Alignment.End),
                enabled = aiState.textInput.isNotBlank() &&
                    !aiState.isRequesting &&
                    isNetworkAvailable,
                onClick = onRequestRecommendation,
            ) {
                Icon(
                    imageVector = Icons.Default.Search,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    when {
                        !isNetworkAvailable -> "离线"
                        aiState.isRequesting -> "..."
                        else -> "获取推荐"
                    },
                )
            }
        }

        // AI loading
        if (aiState.isRequesting) {
            AiLoadingBanner()
        }

        // AI error
        if (aiState.errorMessage != null && !aiState.isRequesting) {
            AiErrorBanner(message = aiState.errorMessage)
        }

        // Provider status (non-ok)
        if (!aiState.isRequesting && aiState.providerStatus != null &&
            aiState.providerStatus != "ok"
        ) {
            AiProviderStatusBanner(status = aiState.providerStatus)
        }

        // Parsed context
        if (aiState.parsedContext != null && !aiState.isRequesting) {
            AiParsedContextSection(context = aiState.parsedContext)
        }

        // AI results
        if (aiState.results.isNotEmpty() && !aiState.isRequesting) {
            AiResultsSection(
                results = aiState.results,
                isNetworkAvailable = isNetworkAvailable,
                feedbackStates = feedbackStates,
                onSendFeedback = onSendFeedback,
                onTrackSelected = onTrackSelected,
            )
        }

        // Empty AI results
        if (aiState.results.isEmpty() && aiState.providerStatus == "ok" &&
            aiState.parsedContext != null && !aiState.isRequesting
        ) {
            EmptyAiResults()
        }
    }
}

@Composable
private fun AiLoadingBanner() {
    StatusBanner(
        text = "AI 正在解析你的请求…",
        tone = BannerTone.Warning,
        action = {
            CircularProgressIndicator(modifier = Modifier.height(16.dp).width(16.dp))
        },
    )
}

@Composable
private fun AiErrorBanner(message: String) {
    StatusBanner(text = message, tone = BannerTone.Error)
}

@Composable
private fun AiProviderStatusBanner(status: String) {
    val message = when (status) {
        "disabled" -> "AI 服务已禁用。请在后端配置中设置 AI_ENABLED=true。"
        "unconfigured" -> "AI 服务尚未配置。请检查 AI_API_KEY 和 AI_MODEL。"
        "error" -> "AI 服务发生错误。请查看后端日志。"
        else -> "AI 服务状态：$status"
    }

    StatusBanner(text = message, tone = BannerTone.Error)
}

@Composable
private fun AiParsedContextSection(context: AiParsedContext) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // AI explanation
        if (!context.explanation.isNullOrBlank()) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                shape = MaterialTheme.shapes.small,
            ) {
                Text(
                    modifier = Modifier.padding(12.dp),
                    text = context.explanation,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        // Matched tags by group
        val groupOrder = listOf("scene", "type", "feature")
        val groupLabels = mapOf(
            "scene" to "场景",
            "type" to "类型",
            "feature" to "特点",
        )

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            groupOrder.forEach { group ->
                val items = context.matchedTags[group].orEmpty()
                items.forEach { tag ->
                    FilterChip(
                        selected = true,
                        onClick = {},
                        label = {
                            Text("${groupLabels[group] ?: group}: ${tag.name}")
                        },
                    )
                }
            }
        }

        // Unmatched terms
        if (context.unmatchedTerms.isNotEmpty()) {
            Text(
                text = "未匹配：${context.unmatchedTerms.joinToString(", ")}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun AiResultsSection(
    results: List<RecommendationResult>,
    isNetworkAvailable: Boolean,
    feedbackStates: Map<Int, RecommendationFeedbackUiState>,
    onSendFeedback: (Int, FeedbackType) -> Unit,
    onTrackSelected: (TrackResponse) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        results.firstOrNull()?.let { result ->
            Text(
                text = "AI 推荐",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            RecommendationResultCard(
                result = result,
                isPrimary = true,
                isNetworkAvailable = isNetworkAvailable,
                feedbackState = feedbackStates[result.track.id],
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
                text = "AI 备选",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            alternatives.forEach { result ->
                RecommendationResultCard(
                    result = result,
                    isPrimary = false,
                    isNetworkAvailable = isNetworkAvailable,
                    feedbackState = feedbackStates[result.track.id],
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
private fun EmptyAiResults() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceContainer,
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = MaterialTheme.shapes.small,
    ) {
        Text(
            modifier = Modifier.padding(16.dp),
            text = "没有匹配你请求的推荐。可以换个说法，或检查是否存在带有匹配标签的可播放音轨。",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun TrackResponse.artistAlbumLabel(): String =
    listOfNotNull(artist, album)
        .filter { value -> value.isNotBlank() }
        .joinToString(separator = " - ")
        .ifBlank { "未知艺人或专辑" }

private fun Double.formatScore(): String =
    String.format(Locale.US, "%.1f", this)

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
                    text = "正在请求推荐",
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
