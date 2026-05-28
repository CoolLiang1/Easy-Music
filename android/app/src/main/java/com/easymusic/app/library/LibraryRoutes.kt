package com.easymusic.app.library

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.cache.data.CacheFileStore
import com.easymusic.app.cache.data.EasyMusicDatabase
import com.easymusic.app.cache.domain.TrackCacheRepository
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.domain.TrackRepository
import com.easymusic.app.library.ui.LibraryScreen
import com.easymusic.app.library.ui.LibraryViewModel

object LibraryRoutes {
    const val LIBRARY = "library"
}

@Composable
fun LibraryRoute(
    onOpenNowPlaying: (TrackResponse) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val tokenStore = remember(context) { AuthTokenStore(context) }
    val viewModel = remember(context) {
        val database = EasyMusicDatabase.getInstance(context)
        LibraryViewModel(
            trackRepository = TrackRepository(
                TrackApi(
                    ApiClient(AppConfig.default()),
                ),
            ),
            bearerTokenProvider = tokenStore::readToken,
            trackCacheRepository = TrackCacheRepository(
                cachedTrackDao = database.cachedTrackDao(),
                cacheFileStore = CacheFileStore(context),
            ),
        )
    }

    LibraryScreen(
        modifier = modifier,
        uiState = viewModel.uiState,
        onRefresh = viewModel::refresh,
        onTrackSelected = onOpenNowPlaying,
    )
}
