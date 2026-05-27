package com.easymusic.app.library.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.library.domain.TrackRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class LibraryUiState(
    val tracks: List<TrackResponse> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val needsSignIn: Boolean = false,
)

class LibraryViewModel(
    private val trackRepository: TrackRepository,
    private val bearerTokenProvider: suspend () -> String?,
) : ViewModel() {
    var uiState by mutableStateOf(LibraryUiState(isLoading = true))
        private set

    init {
        loadTracks(isRefresh = false)
    }

    fun refresh() {
        loadTracks(isRefresh = true)
    }

    private fun loadTracks(isRefresh: Boolean) {
        val currentTracks = uiState.tracks
        uiState = uiState.copy(
            isLoading = !isRefresh && currentTracks.isEmpty(),
            isRefreshing = isRefresh,
            errorMessage = null,
            needsSignIn = false,
        )

        viewModelScope.launch {
            val token = withContext(Dispatchers.IO) {
                bearerTokenProvider()
            }

            if (token == null) {
                uiState = LibraryUiState(
                    errorMessage = "Please sign in again to load your library.",
                    needsSignIn = true,
                )
                return@launch
            }

            val result = withContext(Dispatchers.IO) {
                trackRepository.listTracks(token)
            }

            uiState = when (result) {
                is ApiResult.Success -> LibraryUiState(tracks = result.value)
                is ApiResult.Unauthorized -> LibraryUiState(
                    errorMessage = result.message,
                    needsSignIn = true,
                )

                is ApiResult.HttpError -> LibraryUiState(
                    tracks = currentTracks,
                    errorMessage = result.message,
                )

                is ApiResult.NetworkError -> LibraryUiState(
                    tracks = currentTracks,
                    errorMessage = result.message,
                )

                is ApiResult.SerializationError -> LibraryUiState(
                    tracks = currentTracks,
                    errorMessage = result.message,
                )
            }
        }
    }
}
