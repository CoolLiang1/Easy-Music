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
            is ApiResult.Success -> AuthSession.Authenticated(
                bearerToken = token,
                currentUser = result.value,
            )

            is ApiResult.Unauthorized -> {
                tokenStore.clearToken()
                AuthSession.Unauthenticated
            }

            is ApiResult.HttpError,
            is ApiResult.NetworkError,
            is ApiResult.SerializationError,
            -> AuthSession.Unauthenticated
        }
    }

    suspend fun saveToken(tokenResponse: TokenResponse) {
        tokenStore.saveToken(tokenResponse.accessToken)
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
            tokenStore.saveToken(tokenResponse.accessToken)
        }
    }

    suspend fun clearToken() {
        tokenStore.clearToken()
    }

    suspend fun signOutAfterAuthFailure() {
        tokenStore.clearToken()
    }

    suspend fun logout(): ApiResult<Unit> {
        val token = tokenStore.readToken()
        var result: ApiResult<Unit> = ApiResult.Success(Unit)

        try {
            if (token != null) {
                result = authApi.logout(token)
            }
            return result
        } finally {
            tokenStore.clearToken()
        }
    }
}
