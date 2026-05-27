package com.easymusic.app.auth.domain

sealed interface AuthSession {
    data object Checking : AuthSession

    data class Authenticated(
        val bearerToken: String,
    ) : AuthSession

    data object Unauthenticated : AuthSession
}
