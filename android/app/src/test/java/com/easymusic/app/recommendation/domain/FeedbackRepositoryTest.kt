package com.easymusic.app.recommendation.domain

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.recommendation.data.FeedbackApi
import com.easymusic.app.recommendation.data.FeedbackBulkRequest
import com.easymusic.app.recommendation.data.FeedbackEventRequest
import com.easymusic.app.recommendation.data.FeedbackResponse
import com.easymusic.app.recommendation.data.FeedbackType
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
class FeedbackRepositoryTest {
    private val storeDirectory = createTempDirectory("feedback-repository-test").toFile()

    @Test
    fun sendFeedbackUsesStoredBearerToken() = runTest {
        val api = FakeFeedbackApi()
        val repository = FeedbackRepository(api, tokenStore("token-123"))
        val event = FeedbackEventRequest(
            clientEventId = "event-1",
            trackId = 42,
            feedbackType = FeedbackType.Like,
            occurredAt = "2026-07-10T08:30:00Z",
        )

        val result = repository.sendFeedbackEvent(event)

        assertTrue(result is ApiResult.Success)
        assertEquals("token-123", api.capturedBearerToken)
        assertEquals(listOf(event), api.capturedRequest?.events)
    }

    @Test
    fun missingTokenReturnsUnauthorizedWithoutCallingApi() = runTest {
        val api = FakeFeedbackApi()
        val repository = FeedbackRepository(api, tokenStore())

        val result = repository.sendFeedbackEvent(
            FeedbackEventRequest(
                trackId = 42,
                feedbackType = FeedbackType.Tired,
                occurredAt = "2026-07-10T08:30:00Z",
            ),
        )

        assertTrue(result is ApiResult.Unauthorized)
        assertNull(api.capturedRequest)
    }

    private suspend fun TestScope.tokenStore(token: String? = null): AuthTokenStore {
        val dataStore = PreferenceDataStoreFactory.create(
            scope = backgroundScope,
            produceFile = { File(storeDirectory, "auth-${System.nanoTime()}.preferences_pb") },
        )
        return AuthTokenStore(dataStore).also { store ->
            token?.let { store.saveToken(it) }
        }
    }

    private class FakeFeedbackApi : FeedbackApi {
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
            return ApiResult.Success(FeedbackResponse(emptyList(), emptyList()))
        }
    }
}
