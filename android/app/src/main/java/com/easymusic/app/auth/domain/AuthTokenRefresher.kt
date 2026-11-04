package com.easymusic.app.auth.domain

import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.auth.data.TokenResponse
import com.easymusic.app.core.network.AccessTokenRenewer
import com.easymusic.app.core.network.ApiResult
import kotlinx.coroutines.runBlocking
import org.json.JSONException
import org.json.JSONObject
import java.util.Base64

/**
 * Keeps the owner signed in by exchanging the stored refresh token for a new
 * token pair. Calls are serialized so concurrent 401s rotate the refresh token
 * only once; a rejected refresh token clears the stored session.
 */
class AuthTokenRefresher(
    private val tokenStore: AuthTokenStore,
    private val refreshTokens: (refreshToken: String) -> ApiResult<TokenResponse>,
    private val nowEpochSeconds: () -> Long = { System.currentTimeMillis() / 1000 },
) : AccessTokenRenewer {
    private val lock = Any()

    override fun renewAfterUnauthorized(staleAccessToken: String): String? = synchronized(lock) {
        runBlocking {
            val storedAccessToken = tokenStore.readToken()
            if (storedAccessToken != null && storedAccessToken != staleAccessToken) {
                // Another request already renewed the session.
                storedAccessToken
            } else {
                refreshLocked()
            }
        }
    }

    override fun currentValidAccessToken(): String? = synchronized(lock) {
        runBlocking {
            val storedAccessToken = tokenStore.readToken()
            val expiresAt = storedAccessToken?.let(::accessTokenExpiresAtEpochSeconds)
            val needsRefresh = storedAccessToken == null ||
                (expiresAt != null && expiresAt - nowEpochSeconds() <= EXPIRY_MARGIN_SECONDS)

            if (needsRefresh) {
                refreshLocked() ?: storedAccessToken
            } else {
                storedAccessToken
            }
        }
    }

    private suspend fun refreshLocked(): String? {
        val refreshToken = tokenStore.readRefreshToken() ?: return null

        return when (val result = refreshTokens(refreshToken)) {
            is ApiResult.Success -> {
                tokenStore.saveTokens(
                    accessToken = result.value.accessToken,
                    refreshToken = result.value.refreshToken,
                )
                result.value.accessToken
            }

            is ApiResult.Unauthorized -> {
                tokenStore.clearToken()
                null
            }

            // Keep the session for a later retry when the server is unreachable.
            is ApiResult.HttpError,
            is ApiResult.NetworkError,
            is ApiResult.SerializationError,
            -> null
        }
    }

    companion object {
        /** Renew this long before expiry so long requests do not start with a dying token. */
        const val EXPIRY_MARGIN_SECONDS = 120L

        /** Reads the `exp` claim from the backend's `<base64url payload>.<signature>` token. */
        fun accessTokenExpiresAtEpochSeconds(accessToken: String): Long? {
            val encodedPayload = accessToken.substringBefore('.', missingDelimiterValue = "")
            if (encodedPayload.isEmpty()) {
                return null
            }

            return try {
                val payload = String(Base64.getUrlDecoder().decode(encodedPayload), Charsets.UTF_8)
                JSONObject(payload).optLong("exp").takeIf { it > 0L }
            } catch (_: IllegalArgumentException) {
                null
            } catch (_: JSONException) {
                null
            }
        }
    }
}
