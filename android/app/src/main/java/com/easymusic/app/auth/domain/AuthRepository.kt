package com.easymusic.app.auth.domain

import com.easymusic.app.auth.data.AuthApi
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.auth.data.TokenResponse
import com.easymusic.app.core.network.ApiResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart

class AuthRepository(
    private val authApi: AuthApi,
    private val tokenStore: AuthTokenStore,
) {
    val session: Flow<AuthSession> = tokenStore.token
        .map { token ->
            if (token == null) {
                AuthSession.Unauthenticated
            } else {
                AuthSession.Authenticated(bearerToken = token)
            }
        }
        .onStart { emit(AuthSession.Checking) }

    suspend fun restoreSession(): AuthSession {
        val token = tokenStore.readToken()
        return if (token == null) {
            AuthSession.Unauthenticated
        } else {
            AuthSession.Authenticated(bearerToken = token)
        }
    }

    suspend fun saveToken(tokenResponse: TokenResponse) {
        tokenStore.saveToken(tokenResponse.accessToken)
    }

    suspend fun clearToken() {
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
