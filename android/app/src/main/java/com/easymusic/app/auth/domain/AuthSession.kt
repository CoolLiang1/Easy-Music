package com.easymusic.app.auth.domain

import com.easymusic.app.auth.data.CurrentUserResponse

sealed interface AuthSession {
    data object Checking : AuthSession

    data class Authenticated(
        val bearerToken: String,
        val currentUser: CurrentUserResponse,
        val isOfflineRestored: Boolean = false,
    ) : AuthSession

    data object Unauthenticated : AuthSession
}
