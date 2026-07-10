package com.easymusic.app.player

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
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.ui.NowPlayingRouteContent
import com.easymusic.app.player.ui.NowPlayingViewModel
import com.easymusic.app.recommendation.data.HttpFeedbackApi
import com.easymusic.app.recommendation.domain.FeedbackRepository

object PlayerRoutes {
    const val NOW_PLAYING = "now_playing"
}

@Composable
fun NowPlayingRoute(
    track: TrackResponse?,
    onBackToLibrary: () -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    val context = LocalContext.current
    val viewModel = remember(context, track?.id) {
        val database = EasyMusicDatabase.getInstance(context)
        val apiClient = ApiClient(AppConfig.default())
        val tokenStore = AuthTokenStore(context)
        NowPlayingViewModel(
            track = track,
            trackApi = TrackApi(apiClient),
            tokenStore = tokenStore,
            trackCacheRepository = TrackCacheRepository(
                cachedTrackDao = database.cachedTrackDao(),
                cacheFileStore = CacheFileStore(context),
            ),
            playerController = PlayerController(context),
            feedbackRepository = FeedbackRepository(
                feedbackApi = HttpFeedbackApi(apiClient),
                tokenStore = tokenStore,
            ),
            initialNetworkAvailable = isNetworkAvailable,
        )
    }

    NowPlayingRouteContent(
        modifier = modifier,
        viewModel = viewModel,
        isNetworkAvailable = isNetworkAvailable,
        onBackToLibrary = onBackToLibrary,
    )
}
