package com.easymusic.app.player.ui

import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.recommendation.data.FeedbackAcceptedResponse
import com.easymusic.app.recommendation.data.FeedbackEventRequest
import com.easymusic.app.recommendation.data.FeedbackResponse
import com.easymusic.app.recommendation.data.FeedbackType
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ActivePlaybackFeedbackControllerTest {
    @Test
    fun sendBuildsGlobalContextEventAndPreventsDuplicateInFlightTaps() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val result = CompletableDeferred<ApiResult<FeedbackResponse>>()
        val events = mutableListOf<FeedbackEventRequest>()
        val controller = ActivePlaybackFeedbackController(
            scope = this,
            sendEvent = { event ->
                events += event
                result.await()
            },
            ioDispatcher = dispatcher,
            now = { "2026-07-10T08:30:00Z" },
            createEventId = { "android-feedback-1" },
        )
        controller.selectTrack(42)

        controller.send(FeedbackType.Tired, isNetworkAvailable = true)
        controller.send(FeedbackType.Like, isNetworkAvailable = true)
        runCurrent()

        assertEquals(1, events.size)
        assertEquals(
            FeedbackEventRequest(
                clientEventId = "android-feedback-1",
                trackId = 42,
                feedbackType = FeedbackType.Tired,
                sceneTagIds = emptyList(),
                typeTagIds = emptyList(),
                featureTagIds = emptyList(),
                occurredAt = "2026-07-10T08:30:00Z",
            ),
            events.single(),
        )
        assertTrue(controller.state.value.isSending)

        result.complete(
            ApiResult.Success(
                FeedbackResponse(
                    accepted = listOf(
                        FeedbackAcceptedResponse(
                            clientEventId = "android-feedback-1",
                            status = "accepted",
                        ),
                    ),
                    failed = emptyList(),
                ),
            ),
        )
        advanceUntilIdle()

        assertFalse(controller.state.value.isSending)
        assertEquals("已进入 14 天冷却期。", controller.state.value.message)
        assertNull(controller.state.value.errorMessage)
    }

    @Test
    fun offlineFeedbackShowsErrorWithoutSending() = runTest {
        var sendCount = 0
        val controller = ActivePlaybackFeedbackController(
            scope = this,
            sendEvent = {
                sendCount += 1
                ApiResult.Success(FeedbackResponse(emptyList(), emptyList()))
            },
            ioDispatcher = StandardTestDispatcher(testScheduler),
        )
        controller.selectTrack(9)

        controller.send(FeedbackType.NotToday, isNetworkAvailable = false)
        advanceUntilIdle()

        assertEquals(0, sendCount)
        assertEquals("当前离线。播放反馈需要连接后端。", controller.state.value.errorMessage)
    }

    @Test
    fun lateResponseDoesNotOverwriteNewTrackState() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val result = CompletableDeferred<ApiResult<FeedbackResponse>>()
        val controller = ActivePlaybackFeedbackController(
            scope = this,
            sendEvent = { result.await() },
            ioDispatcher = dispatcher,
        )
        controller.selectTrack(1)
        controller.send(FeedbackType.Like, isNetworkAvailable = true)
        runCurrent()

        controller.selectTrack(2)
        result.complete(
            ApiResult.Success(
                FeedbackResponse(
                    accepted = listOf(FeedbackAcceptedResponse("old", "accepted")),
                    failed = emptyList(),
                ),
            ),
        )
        advanceUntilIdle()

        assertEquals(2, controller.state.value.trackId)
        assertNull(controller.state.value.message)
        assertNull(controller.state.value.errorMessage)
        assertFalse(controller.state.value.isSending)
    }
}
