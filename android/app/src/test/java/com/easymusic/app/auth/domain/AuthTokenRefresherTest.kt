package com.easymusic.app.auth.domain

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.auth.data.TokenResponse
import com.easymusic.app.core.network.ApiResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.util.Base64

@RunWith(RobolectricTestRunner::class)
class AuthTokenRefresherTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    private lateinit var scope: CoroutineScope
    private lateinit var tokenStore: AuthTokenStore
    private val refreshCalls = mutableListOf<String>()

    @Before
    fun setUp() {
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(
            scope = scope,
            produceFile = { File(temporaryFolder.root, "auth.preferences_pb") },
        )
        tokenStore = AuthTokenStore(dataStore)
    }

    @After
    fun tearDown() {
        scope.cancel()
    }

    @Test
    fun renewAfterUnauthorizedStoresRotatedTokens() {
        saveTokens(access = "old-access", refresh = "old-refresh")
        val refresher = refresher(success("new-access", "new-refresh"))

        val renewed = refresher.renewAfterUnauthorized("old-access")

        assertEquals("new-access", renewed)
        assertEquals(listOf("old-refresh"), refreshCalls)
        assertEquals("new-access", runBlocking { tokenStore.readToken() })
        assertEquals("new-refresh", runBlocking { tokenStore.readRefreshToken() })
    }

    @Test
    fun renewAfterUnauthorizedReusesTokenAlreadyRenewedByAnotherRequest() {
        saveTokens(access = "already-renewed", refresh = "refresh")
        val refresher = refresher(success("unused", "unused"))

        val renewed = refresher.renewAfterUnauthorized("stale-access")

        assertEquals("already-renewed", renewed)
        assertEquals(emptyList<String>(), refreshCalls)
    }

    @Test
    fun rejectedRefreshTokenClearsSession() {
        saveTokens(access = "old-access", refresh = "revoked")
        val refresher = refresher(ApiResult.Unauthorized("expired"))

        assertNull(refresher.renewAfterUnauthorized("old-access"))
        assertNull(runBlocking { tokenStore.readToken() })
        assertNull(runBlocking { tokenStore.readRefreshToken() })
    }

    @Test
    fun networkFailureKeepsSessionForLaterRetry() {
        saveTokens(access = "old-access", refresh = "refresh")
        val refresher = refresher(ApiResult.NetworkError("offline"))

        assertNull(refresher.renewAfterUnauthorized("old-access"))
        assertEquals("old-access", runBlocking { tokenStore.readToken() })
        assertEquals("refresh", runBlocking { tokenStore.readRefreshToken() })
    }

    @Test
    fun currentValidAccessTokenKeepsTokenThatIsNotExpiring() {
        val token = accessToken(expiresAt = NOW + 3_600)
        saveTokens(access = token, refresh = "refresh")
        val refresher = refresher(success("new-access", "new-refresh"))

        assertEquals(token, refresher.currentValidAccessToken())
        assertEquals(emptyList<String>(), refreshCalls)
    }

    @Test
    fun currentValidAccessTokenRenewsTokenNearExpiry() {
        saveTokens(access = accessToken(expiresAt = NOW + 30), refresh = "refresh")
        val refresher = refresher(success("new-access", "new-refresh"))

        assertEquals("new-access", refresher.currentValidAccessToken())
        assertEquals(listOf("refresh"), refreshCalls)
    }

    @Test
    fun expiryIsReadFromBackendTokenPayload() {
        assertEquals(
            1_800_000_000L,
            AuthTokenRefresher.accessTokenExpiresAtEpochSeconds(accessToken(1_800_000_000L)),
        )
        assertNull(AuthTokenRefresher.accessTokenExpiresAtEpochSeconds("not-a-token"))
        assertNull(AuthTokenRefresher.accessTokenExpiresAtEpochSeconds("%%%.sig"))
    }

    private fun refresher(result: ApiResult<TokenResponse>) = AuthTokenRefresher(
        tokenStore = tokenStore,
        refreshTokens = { refreshToken ->
            refreshCalls += refreshToken
            result
        },
        nowEpochSeconds = { NOW },
    )

    private fun saveTokens(access: String, refresh: String) = runBlocking {
        tokenStore.saveTokens(accessToken = access, refreshToken = refresh)
    }

    private fun success(access: String, refresh: String): ApiResult<TokenResponse> =
        ApiResult.Success(
            TokenResponse(accessToken = access, tokenType = "bearer", refreshToken = refresh),
        )

    private fun accessToken(expiresAt: Long): String {
        val payload = """{"sub":"1","exp":$expiresAt}"""
        val encoded = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(payload.toByteArray(Charsets.UTF_8))
        return "$encoded.signature"
    }

    private companion object {
        const val NOW = 1_700_000_000L
    }
}
