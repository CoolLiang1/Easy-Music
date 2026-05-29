package com.easymusic.app.auth.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.auth.domain.AuthRepository
import com.easymusic.app.auth.domain.AuthSession
import com.easymusic.app.core.network.ApiResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class SessionUiState(
    val session: AuthSession = AuthSession.Checking,
    val isLoggingOut: Boolean = false,
    val message: String? = null,
)

class SessionViewModel(
    private val authRepository: AuthRepository,
) : ViewModel() {
    var uiState by mutableStateOf(SessionUiState())
        private set

    init {
        restoreSession()
    }

    fun restoreSession() {
        uiState = uiState.copy(
            session = AuthSession.Checking,
            message = null,
        )

        viewModelScope.launch {
            val session = withContext(Dispatchers.IO) {
                authRepository.restoreSession()
            }
            uiState = uiState.copy(session = session)
        }
    }

    fun logout() {
        if (uiState.isLoggingOut) {
            return
        }

        uiState = uiState.copy(
            isLoggingOut = true,
            message = null,
        )

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                authRepository.logout()
            }

            val message = when (result) {
                is ApiResult.Success -> null
                is ApiResult.Unauthorized -> null
                is ApiResult.HttpError -> result.message
                is ApiResult.NetworkError -> result.message
                is ApiResult.SerializationError -> result.message
            }

            uiState = SessionUiState(
                session = AuthSession.Unauthenticated,
                isLoggingOut = false,
                message = message,
            )
        }
    }

    fun signOutAfterAuthFailure() {
        uiState = uiState.copy(
            session = AuthSession.Checking,
            message = null,
        )

        viewModelScope.launch {
            withContext(Dispatchers.IO) {
                authRepository.signOutAfterAuthFailure()
            }
            uiState = SessionUiState(session = AuthSession.Unauthenticated)
        }
    }
}
