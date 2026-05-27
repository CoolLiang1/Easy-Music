package com.easymusic.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.easymusic.app.auth.AuthRoutes
import com.easymusic.app.auth.LoginRoute
import com.easymusic.app.library.LibraryRoute
import com.easymusic.app.library.LibraryRoutes
import com.easymusic.app.player.NowPlayingRoute
import com.easymusic.app.player.PlayerRoutes

@Composable
fun AppNavGraph(
    modifier: Modifier = Modifier,
    startRoute: String = AuthRoutes.LOGIN,
) {
    var currentRoute by rememberSaveable { mutableStateOf(startRoute) }

    when (currentRoute) {
        AuthRoutes.LOGIN -> LoginRoute(
            modifier = modifier,
            onContinueToLibrary = { currentRoute = LibraryRoutes.LIBRARY },
        )

        LibraryRoutes.LIBRARY -> LibraryRoute(
            modifier = modifier,
            onOpenNowPlaying = { currentRoute = PlayerRoutes.NOW_PLAYING },
        )

        PlayerRoutes.NOW_PLAYING -> NowPlayingRoute(
            modifier = modifier,
            onBackToLibrary = { currentRoute = LibraryRoutes.LIBRARY },
        )
    }
}
