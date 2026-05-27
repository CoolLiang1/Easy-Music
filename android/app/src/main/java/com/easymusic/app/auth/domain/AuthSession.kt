package com.easymusic.app.auth.domain

import com.easymusic.app.auth.data.CurrentUserResponse

sealed interface AuthSession {
    data object Checking : AuthSession

    data class Authenticated(
        val bearerToken: String,
        val currentUser: CurrentUserResponse,
    ) : AuthSession

    data object Unauthenticated : AuthSession
}
