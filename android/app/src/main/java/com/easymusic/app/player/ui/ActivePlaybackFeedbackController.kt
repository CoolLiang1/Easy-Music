package com.easymusic.app.player.ui

import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.recommendation.data.FeedbackEventRequest
import com.easymusic.app.recommendation.data.FeedbackResponse
import com.easymusic.app.recommendation.data.FeedbackType
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class ActivePlaybackFeedbackUiState(
    val trackId: Int? = null,
    val sendingType: FeedbackType? = null,
    val message: String? = null,
    val errorMessage: String? = null,
) {
    val isSending: Boolean
        get() = sendingType != null
}

class ActivePlaybackFeedbackController(
    private val scope: CoroutineScope,
    private val sendEvent: suspend (FeedbackEventRequest) -> ApiResult<FeedbackResponse>,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val now: () -> String = { Instant.now().toString() },
    private val createEventId: () -> String = { UUID.randomUUID().toString() },
) {
    private val mutableState = MutableStateFlow(ActivePlaybackFeedbackUiState())
    val state: StateFlow<ActivePlaybackFeedbackUiState> = mutableState.asStateFlow()
    private var activeTrackId: Int? = null
    private var inFlightTrackId: Int? = null

    fun selectTrack(trackId: Int?) {
        if (activeTrackId == trackId) {
            return
        }

        activeTrackId = trackId
        inFlightTrackId = null
        mutableState.value = ActivePlaybackFeedbackUiState(trackId = trackId)
    }

    fun send(
        feedbackType: FeedbackType,
        isNetworkAvailable: Boolean,
    ) {
        val trackId = activeTrackId ?: return
        if (inFlightTrackId != null) {
            return
        }
        if (feedbackType !in ACTIVE_PLAYBACK_FEEDBACK_TYPES) {
            mutableState.value = ActivePlaybackFeedbackUiState(
                trackId = trackId,
                errorMessage = "当前播放页不支持这类反馈。",
            )
            return
        }
        if (!isNetworkAvailable) {
            mutableState.value = ActivePlaybackFeedbackUiState(
                trackId = trackId,
                errorMessage = "当前离线。播放反馈需要连接后端。",
            )
            return
        }
        inFlightTrackId = trackId
        mutableState.value = ActivePlaybackFeedbackUiState(
            trackId = trackId,
            sendingType = feedbackType,
        )
        val event = FeedbackEventRequest(
            clientEventId = createEventId(),
            trackId = trackId,
            feedbackType = feedbackType,
            sceneTagIds = emptyList(),
            typeTagIds = emptyList(),
            featureTagIds = emptyList(),
            occurredAt = now(),
        )

        scope.launch {
            val result = try {
                withContext(ioDispatcher) {
                    sendEvent(event)
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Exception) {
                ApiResult.NetworkError(
                    message = exception.message ?: "反馈请求失败。",
                    cause = exception,
                )
            }
            if (activeTrackId == trackId) {
                mutableState.value = result.toUiState(trackId, feedbackType)
            }
            if (inFlightTrackId == trackId) {
                inFlightTrackId = null
            }
        }
    }

    private companion object {
        val ACTIVE_PLAYBACK_FEEDBACK_TYPES = setOf(
            FeedbackType.Like,
            FeedbackType.NotToday,
            FeedbackType.Tired,
        )
    }
}

private fun ApiResult<FeedbackResponse>.toUiState(
    trackId: Int,
    feedbackType: FeedbackType,
): ActivePlaybackFeedbackUiState =
    when (this) {
        is ApiResult.Success -> {
            val failed = value.failed.firstOrNull()
            val accepted = value.accepted.firstOrNull()
            when {
                failed != null -> ActivePlaybackFeedbackUiState(
                    trackId = trackId,
                    errorMessage = failed.error,
                )

                accepted != null -> ActivePlaybackFeedbackUiState(
                    trackId = trackId,
                    message = feedbackType.successMessage(),
                )

                else -> ActivePlaybackFeedbackUiState(
                    trackId = trackId,
                    errorMessage = "反馈响应中没有结果。",
                )
            }
        }

        is ApiResult.Unauthorized -> ActivePlaybackFeedbackUiState(
            trackId = trackId,
            errorMessage = message,
        )

        is ApiResult.HttpError -> ActivePlaybackFeedbackUiState(
            trackId = trackId,
            errorMessage = message,
        )

        is ApiResult.NetworkError -> ActivePlaybackFeedbackUiState(
            trackId = trackId,
            errorMessage = message,
        )

        is ApiResult.SerializationError -> ActivePlaybackFeedbackUiState(
            trackId = trackId,
            errorMessage = message,
        )
    }

private fun FeedbackType.successMessage(): String =
    when (this) {
        FeedbackType.Like -> "已标记为喜欢。"
        FeedbackType.NotToday -> "今天不会再推荐这首。"
        FeedbackType.Tired -> "已进入 14 天冷却期。"
        else -> "反馈已记录。"
    }
