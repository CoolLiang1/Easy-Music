package com.easymusic.app.library.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class TrackDetailUiState(
    val track: TrackResponse? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val errorKind: TrackDetailErrorKind? = null,
)

enum class TrackDetailErrorKind {
    NotFound,
    Unauthorized,
    Other,
}

class TrackDetailViewModel(
    private val trackId: Int,
    private val trackApi: TrackApi,
    private val tokenStore: AuthTokenStore,
) : ViewModel() {
    var uiState by mutableStateOf(TrackDetailUiState(isLoading = true))
        private set

    init {
        loadTrack()
    }

    fun refresh() {
        loadTrack()
    }

    private fun loadTrack() {
        uiState = uiState.copy(
            isLoading = true,
            errorMessage = null,
            errorKind = null,
        )

        viewModelScope.launch {
            val token = withContext(Dispatchers.IO) {
                tokenStore.readToken()
            }

            if (token == null) {
                uiState = TrackDetailUiState(
                    errorMessage = "Please sign in again to view this track.",
                    errorKind = TrackDetailErrorKind.Unauthorized,
                )
                return@launch
            }

            val result = withContext(Dispatchers.IO) {
                trackApi.getTrack(
                    trackId = trackId,
                    bearerToken = token,
                )
            }

            uiState = when (result) {
                is ApiResult.Success -> TrackDetailUiState(track = result.value)
                is ApiResult.Unauthorized -> TrackDetailUiState(
                    errorMessage = result.message,
                    errorKind = TrackDetailErrorKind.Unauthorized,
                )

                is ApiResult.HttpError -> TrackDetailUiState(
                    errorMessage = result.message,
                    errorKind = if (result.statusCode == 404) {
                        TrackDetailErrorKind.NotFound
                    } else {
                        TrackDetailErrorKind.Other
                    },
                )

                is ApiResult.NetworkError -> TrackDetailUiState(
                    errorMessage = result.message,
                    errorKind = TrackDetailErrorKind.Other,
                )

                is ApiResult.SerializationError -> TrackDetailUiState(
                    errorMessage = result.message,
                    errorKind = TrackDetailErrorKind.Other,
                )
            }
        }
    }
}
