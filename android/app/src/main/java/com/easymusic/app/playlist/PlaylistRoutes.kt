package com.easymusic.app.playlist

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.playlist.data.HttpPlaylistApi
import com.easymusic.app.playlist.domain.PlaylistRepository
import com.easymusic.app.playlist.ui.PlaylistsRouteContent
import com.easymusic.app.playlist.ui.PlaylistsViewModel

object PlaylistRoutes {
    const val PLAYLISTS = "playlists"
}

@Composable
fun PlaylistsRoute(
    onTrackSelected: (TrackResponse) -> Unit,
    modifier: Modifier = Modifier,
    isNetworkAvailable: Boolean = true,
) {
    val context = LocalContext.current
    val viewModel = remember(context) {
        PlaylistsViewModel(
            playlistRepository = PlaylistRepository(
                playlistApi = HttpPlaylistApi(ApiClient(AppConfig.default())),
                tokenStore = AuthTokenStore(context),
            ),
            initialNetworkAvailable = isNetworkAvailable,
        )
    }

    PlaylistsRouteContent(
        modifier = modifier,
        viewModel = viewModel,
        isNetworkAvailable = isNetworkAvailable,
        onTrackSelected = onTrackSelected,
    )
}
