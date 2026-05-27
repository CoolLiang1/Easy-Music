package com.easymusic.app.player

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.library.data.TrackApi
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.ui.NowPlayingRouteContent
import com.easymusic.app.player.ui.NowPlayingViewModel

object PlayerRoutes {
    const val NOW_PLAYING = "now_playing"
}

@Composable
fun NowPlayingRoute(
    track: TrackResponse?,
    onBackToLibrary: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val viewModel = remember(context, track?.id) {
        NowPlayingViewModel(
            track = track,
            trackApi = TrackApi(ApiClient(AppConfig.default())),
            tokenStore = AuthTokenStore(context),
            playerController = PlayerController(context),
        )
    }

    NowPlayingRouteContent(
        modifier = modifier,
        viewModel = viewModel,
        onBackToLibrary = onBackToLibrary,
    )
}
