package com.easymusic.app.library.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.easymusic.app.cache.domain.CacheStatus
import com.easymusic.app.cache.domain.CachedTrack
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.core.network.ApiResult
import com.easymusic.app.library.data.LIBRARY_PAGE_SIZE
import com.easymusic.app.library.data.TagResponse
import com.easymusic.app.library.data.TrackQuery
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.library.data.TrackSortField
import com.easymusic.app.library.data.TrackSortOrder
import com.easymusic.app.library.domain.TrackRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class LibraryUiState(
    val tracks: List<TrackResponse> = emptyList(),
    val tags: List<TagResponse> = emptyList(),
    val searchQuery: String = "",
    val appliedSearchQuery: String = "",
    val statusFilter: String = "",
    val likedFilter: Boolean? = null,
    val contentTypeFilter: String = "",
    val tagIdFilter: Int? = null,
    val sort: TrackSortField = TrackSortField.CreatedAt,
    val sortOrder: TrackSortOrder = TrackSortOrder.Ascending,
    val offset: Int = 0,
    val hasNextPage: Boolean = false,
    val cacheStatesByTrackId: Map<Int, LibraryCacheUiState> = emptyMap(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val needsSignIn: Boolean = false,
) {
    val activeFilterCount: Int
        get() = toTrackQuery().activeFilterCount()
}

data class LibraryCacheUiState(
    val status: CacheStatus = CacheStatus.NotCached,
    val lastError: String? = null,
)

class LibraryViewModel(
    private val initialNetworkAvailable: Boolean = true,
    private val trackRepository: TrackRepository,
    private val bearerTokenProvider: suspend () -> String?,
    private val trackCacheRepository: TrackCacheRepository,
) : ViewModel() {
    var uiState by mutableStateOf(LibraryUiState(isLoading = true))
        private set
    private var latestNetworkAvailable = initialNetworkAvailable
    private var searchJob: Job? = null
    private var trackRequestSequence = 0

    init {
        watchCacheStates()
        loadTags(initialNetworkAvailable)
        loadTracks(
            isRefresh = false,
            isNetworkAvailable = initialNetworkAvailable,
        )
    }

    fun refresh(isNetworkAvailable: Boolean = true) {
        latestNetworkAvailable = isNetworkAvailable
        loadTags(isNetworkAvailable)
        loadTracks(
            isRefresh = true,
            isNetworkAvailable = isNetworkAvailable,
        )
    }

    fun updateSearchQuery(query: String) {
        uiState = uiState.copy(searchQuery = query, offset = 0)
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(300)
            uiState = uiState.copy(appliedSearchQuery = query.trim(), offset = 0)
            loadTracks(isRefresh = true, isNetworkAvailable = latestNetworkAvailable)
        }
    }

    fun updateStatusFilter(status: String) {
        uiState = uiState.copy(statusFilter = status, offset = 0)
        reloadForQueryChange()
    }

    fun updateLikedFilter(liked: Boolean?) {
        uiState = uiState.copy(likedFilter = liked, offset = 0)
        reloadForQueryChange()
    }

    fun updateContentTypeFilter(contentType: String) {
        uiState = uiState.copy(contentTypeFilter = contentType, offset = 0)
        reloadForQueryChange()
    }

    fun updateTagFilter(tagId: Int?) {
        uiState = uiState.copy(tagIdFilter = tagId, offset = 0)
        reloadForQueryChange()
    }

    fun updateSort(sort: TrackSortField) {
        uiState = uiState.copy(sort = sort, offset = 0)
        reloadForQueryChange()
    }

    fun toggleSortOrder() {
        uiState = uiState.copy(
            sortOrder = if (uiState.sortOrder == TrackSortOrder.Ascending) {
                TrackSortOrder.Descending
            } else {
                TrackSortOrder.Ascending
            },
            offset = 0,
        )
        reloadForQueryChange()
    }

    fun previousPage() {
        if (uiState.offset == 0) return
        uiState = uiState.copy(offset = (uiState.offset - LIBRARY_PAGE_SIZE).coerceAtLeast(0))
        reloadForQueryChange()
    }

    fun nextPage() {
        if (!uiState.hasNextPage) return
        uiState = uiState.copy(offset = uiState.offset + LIBRARY_PAGE_SIZE)
        reloadForQueryChange()
    }

    fun clearQuery() {
        searchJob?.cancel()
        uiState = uiState.copy(
            searchQuery = "",
            appliedSearchQuery = "",
            statusFilter = "",
            likedFilter = null,
            contentTypeFilter = "",
            tagIdFilter = null,
            sort = TrackSortField.CreatedAt,
            sortOrder = TrackSortOrder.Ascending,
            offset = 0,
        )
        reloadForQueryChange()
    }

    private fun loadTracks(
        isRefresh: Boolean,
        isNetworkAvailable: Boolean,
    ) {
        latestNetworkAvailable = isNetworkAvailable
        if (!isNetworkAvailable) {
            uiState = uiState.copy(
                isLoading = false,
                isRefreshing = false,
                errorMessage = "当前离线。刷新曲库需要连接后端；可打开离线缓存播放这台设备上的音乐。",
                needsSignIn = false,
            )
            return
        }

        uiState = uiState.copy(
            isLoading = !isRefresh && uiState.tracks.isEmpty(),
            isRefreshing = isRefresh,
            errorMessage = null,
            needsSignIn = false,
        )

        val requestSequence = ++trackRequestSequence
        val query = uiState.toTrackQuery()

        viewModelScope.launch {
            val token = withContext(Dispatchers.IO) {
                bearerTokenProvider()
            }

            if (token == null) {
                if (requestSequence != trackRequestSequence) return@launch
                uiState = uiState.copy(
                    isLoading = false,
                    isRefreshing = false,
                    errorMessage = "请重新登录后加载曲库。",
                    needsSignIn = true,
                )
                return@launch
            }

            val result = withContext(Dispatchers.IO) {
                trackRepository.queryTracks(token, query)
            }

            if (requestSequence != trackRequestSequence) return@launch

            uiState = when (result) {
                is ApiResult.Success -> uiState.copy(
                    tracks = result.value.tracks,
                    hasNextPage = result.value.hasNextPage,
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

    private fun loadTags(isNetworkAvailable: Boolean) {
        if (!isNetworkAvailable) return
        viewModelScope.launch {
            val token = withContext(Dispatchers.IO) { bearerTokenProvider() } ?: return@launch
            when (val result = withContext(Dispatchers.IO) { trackRepository.listTags(token) }) {
                is ApiResult.Success -> uiState = uiState.copy(tags = result.value)
                else -> Unit
            }
        }
    }

    private fun reloadForQueryChange() {
        loadTracks(isRefresh = true, isNetworkAvailable = latestNetworkAvailable)
    }

    private fun watchCacheStates() {
        viewModelScope.launch {
            trackCacheRepository.observeTracksById().collect { cachedTracks ->
                uiState = uiState.copy(
                    cacheStatesByTrackId = cachedTracks.mapValues { entry ->
                        entry.value.toLibraryCacheUiState()
                    },
                )
            }
        }
    }

    private fun CachedTrack.toLibraryCacheUiState(): LibraryCacheUiState =
        LibraryCacheUiState(
            status = cacheStatus,
            lastError = lastError,
        )
}

private fun LibraryUiState.toTrackQuery(): TrackQuery =
    TrackQuery(
        search = appliedSearchQuery,
        status = statusFilter,
        liked = likedFilter,
        contentType = contentTypeFilter,
        tagId = tagIdFilter,
        sort = sort,
        order = sortOrder,
        offset = offset,
    )
