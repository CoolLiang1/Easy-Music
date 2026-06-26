package com.easymusic.app.playlist.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.playlist.data.PlaylistResponse
import com.easymusic.app.playlist.data.PlaylistSummaryResponse
import com.easymusic.app.playlist.domain.PlaylistRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class PlaylistsUiState(
    val playlists: List<PlaylistSummaryResponse> = emptyList(),
    val selectedPlaylist: PlaylistResponse? = null,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val needsSignIn: Boolean = false,
)

class PlaylistsViewModel(
    private val playlistRepository: PlaylistRepository,
    private val initialNetworkAvailable: Boolean = true,
) : ViewModel() {
    var uiState by mutableStateOf(PlaylistsUiState(isLoading = true))
        private set

    init {
        loadPlaylists(
            isRefresh = false,
            isNetworkAvailable = initialNetworkAvailable,
        )
    }

    fun refresh(isNetworkAvailable: Boolean = true) {
        loadPlaylists(
            isRefresh = true,
            isNetworkAvailable = isNetworkAvailable,
        )
    }

    fun selectPlaylist(
        playlistId: Int,
        isNetworkAvailable: Boolean = true,
    ) {
        if (!isNetworkAvailable) {
            uiState = uiState.copy(
                errorMessage = "当前离线。歌单详情需要连接后端后加载。",
                needsSignIn = false,
            )
            return
        }

        uiState = uiState.copy(
            isRefreshing = true,
            errorMessage = null,
            needsSignIn = false,
        )

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                playlistRepository.getPlaylist(playlistId)
            }

            uiState = when (result) {
                is ApiResult.Success -> uiState.copy(
                    selectedPlaylist = result.value,
                    isLoading = false,
                    isRefreshing = false,
                    errorMessage = null,
                    needsSignIn = false,
                )

                is ApiResult.Unauthorized -> uiState.copy(
                    isLoading = false,
                    isRefreshing = false,
                    errorMessage = result.message,
                    needsSignIn = true,
                )

                is ApiResult.HttpError -> uiState.copy(
                    isLoading = false,
                    isRefreshing = false,
                    errorMessage = result.message,
                )

                is ApiResult.NetworkError -> uiState.copy(
                    isLoading = false,
                    isRefreshing = false,
                    errorMessage = result.message,
                )

                is ApiResult.SerializationError -> uiState.copy(
                    isLoading = false,
                    isRefreshing = false,
                    errorMessage = result.message,
                )
            }
        }
    }

    fun closePlaylist() {
        uiState = uiState.copy(selectedPlaylist = null, errorMessage = null)
    }

    private fun loadPlaylists(
        isRefresh: Boolean,
        isNetworkAvailable: Boolean,
    ) {
        val currentPlaylists = uiState.playlists
        val currentSelectedPlaylist = uiState.selectedPlaylist
        if (!isNetworkAvailable) {
            uiState = uiState.copy(
                isLoading = false,
                isRefreshing = false,
                errorMessage = "当前离线。刷新歌单需要连接后端；已打开的播放仍由现有缓存/在线逻辑处理。",
                needsSignIn = false,
            )
            return
        }

        uiState = uiState.copy(
            isLoading = !isRefresh && currentPlaylists.isEmpty(),
            isRefreshing = isRefresh,
            errorMessage = null,
            needsSignIn = false,
        )

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                playlistRepository.listPlaylists()
            }

            uiState = when (result) {
                is ApiResult.Success -> PlaylistsUiState(
                    playlists = result.value,
                    selectedPlaylist = currentSelectedPlaylist?.takeIf { selected ->
                        result.value.any { playlist -> playlist.id == selected.id }
                    },
                )

                is ApiResult.Unauthorized -> PlaylistsUiState(
                    playlists = currentPlaylists,
                    selectedPlaylist = currentSelectedPlaylist,
                    errorMessage = result.message,
                    needsSignIn = true,
                )

                is ApiResult.HttpError -> PlaylistsUiState(
                    playlists = currentPlaylists,
                    selectedPlaylist = currentSelectedPlaylist,
                    errorMessage = result.message,
                )

                is ApiResult.NetworkError -> PlaylistsUiState(
                    playlists = currentPlaylists,
                    selectedPlaylist = currentSelectedPlaylist,
                    errorMessage = result.message,
                )

                is ApiResult.SerializationError -> PlaylistsUiState(
                    playlists = currentPlaylists,
                    selectedPlaylist = currentSelectedPlaylist,
                    errorMessage = result.message,
                )
            }
        }
    }
}
