package com.easymusic.app.auth.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.auth.domain.AuthRepository
import com.easymusic.app.core.network.ApiResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class LoginUiState(
    val username: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
)

class LoginViewModel(
    private val authRepository: AuthRepository,
) : ViewModel() {
    var uiState by mutableStateOf(LoginUiState())
        private set

    fun onUsernameChange(username: String) {
        uiState = uiState.copy(
            username = username,
            errorMessage = null,
        )
    }

    fun onPasswordChange(password: String) {
        uiState = uiState.copy(
            password = password,
            errorMessage = null,
        )
    }

    fun submit(onLoginSuccess: () -> Unit) {
        val username = uiState.username.trim()
        val password = uiState.password

        if (uiState.isLoading) {
            return
        }

        if (username.isBlank() || password.isBlank()) {
            uiState = uiState.copy(errorMessage = "Enter your username and password.")
            return
        }

        uiState = uiState.copy(isLoading = true, errorMessage = null)

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                authRepository.login(
                    username = username,
                    password = password,
                )
            }

            when (result) {
                is ApiResult.Success -> {
                    uiState = uiState.copy(
                        isLoading = false,
                        password = "",
                    )
                    onLoginSuccess()
                }

                is ApiResult.Unauthorized -> {
                    uiState = uiState.copy(
                        isLoading = false,
                        errorMessage = "Invalid username or password.",
                    )
                }

                is ApiResult.HttpError -> {
                    uiState = uiState.copy(
                        isLoading = false,
                        errorMessage = result.message,
                    )
                }

                is ApiResult.NetworkError -> {
                    uiState = uiState.copy(
                        isLoading = false,
                        errorMessage = result.message,
                    )
                }

                is ApiResult.SerializationError -> {
                    uiState = uiState.copy(
                        isLoading = false,
                        errorMessage = "Login response could not be read.",
                    )
                }
            }
        }
    }
}
