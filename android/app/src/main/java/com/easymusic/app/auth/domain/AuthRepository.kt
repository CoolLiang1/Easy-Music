package com.easymusic.app.auth.domain

import com.easymusic.app.auth.data.AuthApi
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.auth.data.LoginRequest
import com.easymusic.app.auth.data.TokenResponse
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.core.network.map

class AuthRepository(
    private val authApi: AuthApi,
    private val tokenStore: AuthTokenStore,
) {
    suspend fun restoreSession(): AuthSession {
        val token = tokenStore.readToken()
        if (token == null) {
            return AuthSession.Unauthenticated
        }

        return when (val result = authApi.me(token)) {
            is ApiResult.Success -> {
                tokenStore.saveCurrentUser(result.value)
                AuthSession.Authenticated(
                    // The request may have renewed an expired token.
                    bearerToken = tokenStore.readToken() ?: token,
                    currentUser = result.value,
                )
            }

            is ApiResult.Unauthorized -> {
                tokenStore.clearToken()
                AuthSession.Unauthenticated
            }

            is ApiResult.HttpError,
            is ApiResult.NetworkError,
            is ApiResult.SerializationError,
            -> {
                val currentUser = tokenStore.readCurrentUser()
                if (currentUser != null) {
                    AuthSession.Authenticated(
                        bearerToken = token,
                        currentUser = currentUser,
                        isOfflineRestored = true,
                    )
                } else {
                    AuthSession.Unauthenticated
                }
            }
        }
    }

    suspend fun saveToken(tokenResponse: TokenResponse) {
        tokenStore.saveTokens(
            accessToken = tokenResponse.accessToken,
            refreshToken = tokenResponse.refreshToken,
        )
    }

    suspend fun login(
        username: String,
        password: String,
    ): ApiResult<Unit> {
        return authApi.login(
            LoginRequest(
                username = username,
                password = password,
            ),
        ).map { tokenResponse ->
            tokenStore.saveTokens(
                accessToken = tokenResponse.accessToken,
                refreshToken = tokenResponse.refreshToken,
            )
        }
    }

    suspend fun clearToken() {
        tokenStore.clearToken()
    }

    suspend fun signOutAfterAuthFailure() {
        tokenStore.clearToken()
    }

    suspend fun logout(): ApiResult<Unit> {
        val refreshToken = tokenStore.readRefreshToken()
        var result: ApiResult<Unit> = ApiResult.Success(Unit)

        try {
            if (refreshToken != null) {
                result = authApi.logout(refreshToken)
            }
            return result
        } finally {
            tokenStore.clearToken()
        }
    }
}
