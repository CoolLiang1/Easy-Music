package com.easymusic.app.recommendation.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.library.data.TagResponse
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlaybackStateStore
import com.easymusic.app.player.domain.PlaybackStatus
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.domain.TrackPlaybackLauncher
import com.easymusic.app.recommendation.data.FeedbackType
import com.easymusic.app.recommendation.data.HttpAiRecommendationApi
import com.easymusic.app.recommendation.data.HttpFeedbackApi
import com.easymusic.app.recommendation.data.HttpRecommendationApi
import com.easymusic.app.recommendation.data.RecommendationResult
import com.easymusic.app.recommendation.domain.RecommendationRepository
import com.easymusic.app.ui.LocalShowMessage
import com.easymusic.app.ui.components.Banner
import com.easymusic.app.ui.components.BannerTone
import com.easymusic.app.ui.components.EmptyState
import com.easymusic.app.ui.components.GroupHeading
import com.easymusic.app.ui.components.LevelMeter
import com.easymusic.app.ui.components.LoadingState
import com.easymusic.app.ui.components.RowPlayButton
import com.easymusic.app.ui.components.TagChip
import com.easymusic.app.ui.components.TagToggleChip
import com.easymusic.app.ui.components.TrackArtwork
import com.easymusic.app.ui.components.subtitle
import com.easymusic.app.ui.components.tagGroupLabel
import com.easymusic.app.ui.theme.EasyMusicThemeTokens
import java.util.Locale
import kotlinx.coroutines.launch

@Composable
fun RecommendationHomeRoute(
    modifier: Modifier = Modifier,
    config: AppConfig = AppConfig.default(),
    isNetworkAvailable: Boolean = true,
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
            viewModel.sendAiFeedback(trackId = trackId, feedbackType = feedbackType, isNetworkAvailable = isNetworkAvailable)
        },
        onSendFeedback = { trackId, feedbackType ->
            viewModel.sendFeedback(trackId = trackId, feedbackType = feedbackType, isNetworkAvailable = isNetworkAvailable)
        },
    )
}

private val examplePrompts = listOf(
    "适合专注工作的安静纯音乐",
    "深夜写代码，不要人声",
    "跑步时听的快节奏",
    "下雨天的咖啡馆",
)

@OptIn(ExperimentalMaterial3Api::class)
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
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    val context = LocalContext.current
    val launcher = remember(context) { TrackPlaybackLauncher.create(context) }
    val playerController = remember(context) { PlayerController(context) }
    val playerState by PlaybackStateStore.state.collectAsState()
    val showMessage = LocalShowMessage.current
    val scope = rememberCoroutineScope()
    val onPlay: (TrackResponse) -> Unit = { track ->
        when {
            playerState.track?.id == track.id && playerState.status == PlaybackStatus.Playing -> playerController.pause()
            playerState.track?.id == track.id -> playerController.resume()
            else -> scope.launch { launcher.play(track, isNetworkAvailable).message?.let(showMessage) }
        }
    }
    val playingTrackId = playerState.track?.id
    val isPlaying = playerState.status == PlaybackStatus.Playing

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            listOf("一句话描述", "按标签挑选").forEachIndexed { index, label ->
                SegmentedButton(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = 2),
                    icon = {
                        Icon(
                            imageVector = if (index == 0) Icons.Outlined.AutoAwesome else Icons.Default.Tag,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                    },
                    colors = SegmentedButtonDefaults.colors(
                        activeContainerColor = MaterialTheme.colorScheme.primary,
                        activeContentColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                ) { Text(label) }
            }
        }

        if (!isNetworkAvailable) {
            Banner(tone = BannerTone.Warning, text = "推荐需要连接服务器。离线时可以去「离线」播放已缓存的音轨。")
        }

        if (selectedTab == 0) {
            AiSection(
                aiState = uiState.aiState,
                feedbackStates = uiState.feedbackStates,
                isNetworkAvailable = isNetworkAvailable,
                playingTrackId = playingTrackId,
                isPlaying = isPlaying,
                onTextChanged = onAiTextChanged,
                onRequest = onRequestAiRecommendation,
                onSendFeedback = onSendAiFeedback,
                onPlay = onPlay,
            )
        } else {
            TagSection(
                uiState = uiState,
                isNetworkAvailable = isNetworkAvailable,
                playingTrackId = playingTrackId,
                isPlaying = isPlaying,
                onRefreshTags = onRefreshTags,
                onToggleScene = onToggleScene,
                onToggleType = onToggleType,
                onToggleFeature = onToggleFeature,
                onClearSelections = onClearSelections,
                onRequestRecommendations = onRequestRecommendations,
                onSendFeedback = onSendFeedback,
                onPlay = onPlay,
            )
        }
    }
}

@Composable
private fun AiSection(
    aiState: AiRecommendationUiState,
    feedbackStates: Map<Int, RecommendationFeedbackUiState>,
    isNetworkAvailable: Boolean,
    playingTrackId: Int?,
    isPlaying: Boolean,
    onTextChanged: (String) -> Unit,
    onRequest: () -> Unit,
    onSendFeedback: (Int, FeedbackType) -> Unit,
    onPlay: (TrackResponse) -> Unit,
) {
    val canSend = aiState.textInput.isNotBlank() && !aiState.isRequesting && isNetworkAvailable

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            text = "说说现在想听什么。AI 只负责理解成标签，选歌仍由规则推荐决定，冷却和反馈照常生效。",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            value = aiState.textInput,
            onValueChange = onTextChanged,
            modifier = Modifier.fillMaxWidth(),
            enabled = !aiState.isRequesting,
            placeholder = { Text("例如：安静的纯音乐，适合专注") },
            minLines = 2,
            maxLines = 4,
            shape = MaterialTheme.shapes.large,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { if (canSend) onRequest() }),
            colors = OutlinedTextFieldDefaults.colors(
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainer,
                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainer,
                unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
            ),
            trailingIcon = {
                if (aiState.isRequesting) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                }
            },
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                modifier = Modifier.weight(1f),
                text = if (aiState.isRequesting) "正在理解你的描述…" else "",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(enabled = canSend, onClick = onRequest) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("帮我挑")
            }
        }

        if (aiState.parsedContext == null && aiState.results.isEmpty() && !aiState.isRequesting) {
            Text("试试这些：", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                examplePrompts.forEach { prompt ->
                    AssistChip(
                        onClick = { onTextChanged(prompt) },
                        label = { Text(prompt) },
                        shape = CircleShape,
                    )
                }
            }
        }

        if (aiState.errorMessage != null && !aiState.isRequesting) {
            Banner(title = "请求失败", text = aiState.errorMessage, tone = BannerTone.Error)
        }

        val providerStatus = aiState.providerStatus
        if (!aiState.isRequesting && providerStatus != null && providerStatus != "ok") {
            Banner(
                title = "AI 暂不可用",
                tone = BannerTone.Warning,
                text = when (providerStatus) {
                    "disabled" -> "服务器上的 AI 功能已关闭（AI_ENABLED），这句话没有被解析。可以切到「按标签挑选」。"
                    "unconfigured" -> "AI 服务还没配置完整（AI_API_KEY / AI_MODEL），可以先按标签挑选。"
                    "error" -> "AI 服务调用出错，请稍后重试，或先按标签挑选。"
                    else -> "AI 服务状态：$providerStatus"
                },
            )
        }

        val context = aiState.parsedContext
        if (context != null && !aiState.isRequesting && providerStatus == "ok") {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.surfaceContainer,
                shape = MaterialTheme.shapes.large,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(
                            Icons.Outlined.AutoAwesome,
                            contentDescription = null,
                            tint = EasyMusicThemeTokens.colors.onSignalSoft,
                            modifier = Modifier.size(18.dp),
                        )
                        Text("AI 理解为", style = MaterialTheme.typography.titleSmall)
                    }
                    val groups = listOf("scene", "type", "feature").filter { context.matchedTags[it].orEmpty().isNotEmpty() }
                    if (groups.isEmpty()) {
                        Text(
                            text = "没有匹配到已有标签，结果没有按标签筛选。",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    groups.forEach { group ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                text = tagGroupLabel(group),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.width(36.dp),
                            )
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                context.matchedTags[group].orEmpty().forEach { tag -> TagChip(name = tag.name, group = group) }
                            }
                        }
                    }
                    if (context.unmatchedTerms.isNotEmpty()) {
                        Text(
                            text = "没匹配上：${context.unmatchedTerms.joinToString("、")}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (!context.explanation.isNullOrBlank()) {
                        Text(text = context.explanation, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }

            if (aiState.results.isEmpty()) {
                EmptyState(
                    icon = Icons.Default.SearchOff,
                    title = "这次没找到合适的音轨",
                    message = "可能符合条件的都在冷却或被反馈过滤了，换个说法再试试。",
                )
            }
        }

        if (aiState.results.isNotEmpty() && !aiState.isRequesting) {
            ResultList(
                results = aiState.results,
                feedbackStates = feedbackStates,
                isNetworkAvailable = isNetworkAvailable,
                playingTrackId = playingTrackId,
                isPlaying = isPlaying,
                onSendFeedback = onSendFeedback,
                onPlay = onPlay,
            )
        }
    }
}

@Composable
private fun TagSection(
    uiState: RecommendationHomeUiState,
    isNetworkAvailable: Boolean,
    playingTrackId: Int?,
    isPlaying: Boolean,
    onRefreshTags: () -> Unit,
    onToggleScene: (Int) -> Unit,
    onToggleType: (Int) -> Unit,
    onToggleFeature: (Int) -> Unit,
    onClearSelections: () -> Unit,
    onRequestRecommendations: () -> Unit,
    onSendFeedback: (Int, FeedbackType) -> Unit,
    onPlay: (TrackResponse) -> Unit,
) {
    when {
        uiState.isLoadingTags -> {
            LoadingState(text = "正在加载标签…")
            return
        }

        uiState.tagErrorMessage != null -> {
            EmptyState(
                icon = Icons.Default.ErrorOutline,
                title = if (uiState.needsSignIn) "需要重新登录" else "标签加载失败",
                message = uiState.tagErrorMessage,
                action = { Button(enabled = isNetworkAvailable, onClick = onRefreshTags) { Text("重试") } },
            )
            return
        }

        !uiState.hasAnyTags -> {
            EmptyState(
                icon = Icons.Default.Tag,
                title = "还没有标签",
                message = "先在 Web 管理端创建场景、类型和特点标签，并给音轨打上。",
                action = { TextButton(onClick = onRefreshTags) { Text("重新加载") } },
            )
            return
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TagGroupPicker("scene", uiState.groupedTags.scenes, uiState.selectedSceneTagIds, onToggleScene)
        TagGroupPicker("type", uiState.groupedTags.types, uiState.selectedTypeTagIds, onToggleType)
        TagGroupPicker("feature", uiState.groupedTags.features, uiState.selectedFeatureTagIds, onToggleFeature)

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (uiState.selectedContextCount > 0) {
                TextButton(enabled = !uiState.isRequestingRecommendations, onClick = onClearSelections) { Text("清空") }
            }
            Spacer(modifier = Modifier.weight(1f))
            Button(
                enabled = !uiState.isRequestingRecommendations && isNetworkAvailable,
                onClick = onRequestRecommendations,
            ) {
                if (uiState.isRequestingRecommendations) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("正在挑选…")
                } else {
                    Text(
                        if (uiState.selectedContextCount > 0) "按 ${uiState.selectedContextCount} 个标签推荐" else "随便推荐几首",
                    )
                }
            }
        }

        uiState.recommendationErrorMessage?.let { Banner(text = it, tone = BannerTone.Error) }

        if (uiState.recommendationResults.isEmpty()) {
            if (uiState.recommendationMessage?.startsWith("当前条件还没有匹配的推荐") == true) {
                EmptyState(
                    icon = Icons.Default.SearchOff,
                    title = "这次没找到合适的音轨",
                    message = "调整标签，或减少一些条件再试试。",
                )
            }
        } else {
            ResultList(
                results = uiState.recommendationResults,
                feedbackStates = uiState.feedbackStates,
                isNetworkAvailable = isNetworkAvailable,
                playingTrackId = playingTrackId,
                isPlaying = isPlaying,
                onSendFeedback = onSendFeedback,
                onPlay = onPlay,
            )
        }
    }
}

@Composable
private fun TagGroupPicker(
    group: String,
    tags: List<TagResponse>,
    selectedIds: Set<Int>,
    onToggle: (Int) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        GroupHeading(group = group, count = selectedIds.size.takeIf { it > 0 })
        if (tags.isEmpty()) {
            Text(
                text = "这个分组还没有标签。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                tags.forEach { tag ->
                    TagToggleChip(
                        name = tag.name,
                        group = group,
                        selected = tag.id in selectedIds,
                        onClick = { onToggle(tag.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ResultList(
    results: List<RecommendationResult>,
    feedbackStates: Map<Int, RecommendationFeedbackUiState>,
    isNetworkAvailable: Boolean,
    playingTrackId: Int?,
    isPlaying: Boolean,
    onSendFeedback: (Int, FeedbackType) -> Unit,
    onPlay: (TrackResponse) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        results.take(3).forEachIndexed { index, result ->
            ResultCard(
                result = result,
                isPrimary = index == 0,
                isNetworkAvailable = isNetworkAvailable,
                isCurrent = playingTrackId == result.track.id,
                isPlaying = isPlaying,
                feedbackState = feedbackStates[result.track.id],
                onSendFeedback = { type -> onSendFeedback(result.track.id, type) },
                onPlay = { onPlay(result.track) },
            )
        }
    }
}

@Composable
private fun ResultCard(
    result: RecommendationResult,
    isPrimary: Boolean,
    isNetworkAvailable: Boolean,
    isCurrent: Boolean,
    isPlaying: Boolean,
    feedbackState: RecommendationFeedbackUiState?,
    onSendFeedback: (FeedbackType) -> Unit,
    onPlay: () -> Unit,
) {
    val extended = EasyMusicThemeTokens.colors
    val track = result.track
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (isPrimary) extended.signalSoft.copy(alpha = 0.6f) else MaterialTheme.colorScheme.surfaceContainer,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, if (isPrimary) extended.signal.copy(alpha = 0.45f) else MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TrackArtwork(
                    trackId = track.id,
                    title = track.title,
                    artist = track.artist,
                    coverPath = track.coverPath,
                    coverVersion = track.updatedAt,
                    size = if (isPrimary) 72.dp else 52.dp,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (isPrimary) "最佳匹配" else "备选 ${result.rank}",
                        style = MaterialTheme.typography.labelMedium,
                        color = if (isPrimary) extended.onSignalSoft else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (isCurrent) LevelMeter(isPlaying = isPlaying, height = 12.dp)
                        Text(
                            text = track.title,
                            style = if (isPrimary) MaterialTheme.typography.titleLarge else MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = "${track.subtitle()} · 评分 ${String.format(Locale.US, "%.1f", result.score)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                RowPlayButton(
                    isCurrent = isCurrent,
                    isPlaying = isCurrent && isPlaying,
                    enabled = track.isReady,
                    contentDescription = "播放「${track.title}」",
                    onClick = onPlay,
                )
            }

            Text(
                text = result.explanation
                    ?.let(::formatRecommendationExplanationForDisplay)
                    ?.takeIf { it.isNotBlank() }
                    ?: formatRecommendationReasonForDisplay(result.reason),
                style = MaterialTheme.typography.bodyMedium,
            )

            if (track.tags.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    track.tags.take(6).forEach { tag -> TagChip(name = tag.name, group = tag.group) }
                }
            }

            val isSending = feedbackState?.isSending == true
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(0.dp)) {
                listOf(
                    FeedbackType.Like to "喜欢",
                    FeedbackType.NotToday to "今天不听",
                    FeedbackType.Tired to "听腻了",
                    FeedbackType.NotSuitableForContext to "不适合",
                    FeedbackType.SkipRecommendation to "跳过",
                ).forEach { (type, label) ->
                    AssistChip(
                        enabled = isNetworkAvailable && !isSending,
                        onClick = { onSendFeedback(type) },
                        label = { Text(label) },
                        shape = CircleShape,
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = MaterialTheme.colorScheme.surfaceContainer,
                        ),
                    )
                }
            }
            when {
                isSending -> Text("正在发送反馈…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                feedbackState?.errorMessage != null -> Text(feedbackState.errorMessage, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                feedbackState?.message != null -> Text(feedbackState.message, style = MaterialTheme.typography.bodySmall, color = extended.ok)
            }
        }
    }
}
