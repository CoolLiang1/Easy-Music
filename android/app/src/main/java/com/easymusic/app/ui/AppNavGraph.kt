package com.easymusic.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.unit.dp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.easymusic.app.ShortcutRoutes
import com.easymusic.app.auth.AuthRoutes
import com.easymusic.app.auth.data.AuthApi
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.auth.domain.AuthRepository
import com.easymusic.app.auth.domain.AuthSession
import com.easymusic.app.auth.ui.LoginScreen
import com.easymusic.app.auth.ui.LoginViewModel
import com.easymusic.app.auth.ui.SessionViewModel
import com.easymusic.app.cache.data.EasyMusicDatabase
import com.easymusic.app.cache.sync.PlaybackEventSyncWorker
import com.easymusic.app.cache.ui.CachedTracksRoute
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.core.network.ConnectivityObserver
import com.easymusic.app.core.network.ConnectivityStatus
import com.easymusic.app.library.LibraryRoute
import com.easymusic.app.library.LibraryRoutes
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.playlist.PlaylistRoutes
import com.easymusic.app.playlist.PlaylistsRoute
import com.easymusic.app.player.NowPlayingRoute
import com.easymusic.app.player.PlayerRoutes
import com.easymusic.app.player.domain.PlaybackStateStore
import com.easymusic.app.recommendation.ui.RecommendationHomeRoute

@Composable
fun AppNavGraph(
    modifier: Modifier = Modifier,
    config: AppConfig = AppConfig.default(),
    startRoute: String = ShortcutRoutes.DESTINATION_LIBRARY,
) {
    val context = LocalContext.current
    val authRepository = remember(context, config) {
        AuthRepository(
            authApi = AuthApi(ApiClient(config)),
            tokenStore = AuthTokenStore(context),
        )
    }
    val loginViewModel = remember(authRepository) {
        LoginViewModel(authRepository)
    }
    val sessionViewModel = remember(authRepository) {
        SessionViewModel(authRepository)
    }
    val sessionState = sessionViewModel.uiState
    val session = sessionState.session
    val connectivityObserver = remember(context) {
        ConnectivityObserver(context)
    }
    val connectivityStatus by connectivityObserver.observe()
        .collectAsState(initial = connectivityObserver.currentStatus)
    val isNetworkAvailable = connectivityStatus == ConnectivityStatus.Available
    val offlinePlaybackEventDao = remember(context) {
        EasyMusicDatabase.getInstance(context).offlinePlaybackEventDao()
    }
    val pendingPlaybackEventCount by offlinePlaybackEventDao.observePendingCount().collectAsState(initial = 0)
    val pendingPlaybackEventError by offlinePlaybackEventDao.observePendingLastError().collectAsState(initial = null)
    var currentRoute by rememberSaveable { mutableStateOf(startRoute) }
    var nowPlayingTrack by remember { mutableStateOf<TrackResponse?>(null) }
    var returnRoute by rememberSaveable { mutableStateOf(LibraryRoutes.LIBRARY) }

    LaunchedEffect(session, pendingPlaybackEventCount) {
        if (session is AuthSession.Authenticated && pendingPlaybackEventCount > 0) {
            PlaybackEventSyncWorker.enqueue(context)
        }
    }

    LaunchedEffect(session) {
        when (session) {
            is AuthSession.Authenticated -> {
                if (currentRoute == AuthRoutes.LOGIN) {
                    currentRoute = authenticatedRouteOrLibrary(startRoute)
                }
            }

            AuthSession.Unauthenticated -> currentRoute = AuthRoutes.LOGIN
            AuthSession.Checking -> Unit
        }
    }

    LaunchedEffect(startRoute, session) {
        if (session is AuthSession.Authenticated) {
            currentRoute = authenticatedRouteOrLibrary(startRoute)
        }
    }

    if (session == AuthSession.Checking) {
        SessionChecking(modifier = modifier)
        return
    }

    if (currentRoute == AuthRoutes.LOGIN) {
        LoginScreen(
            modifier = modifier,
            uiState = loginViewModel.uiState,
            onUsernameChange = loginViewModel::onUsernameChange,
            onPasswordChange = loginViewModel::onPasswordChange,
            onSubmit = {
                loginViewModel.submit(sessionViewModel::restoreSession)
            },
            isNetworkAvailable = isNetworkAvailable,
        )
        return
    }

    val authenticated = session as? AuthSession.Authenticated ?: return
    val isNowPlaying = currentRoute == PlayerRoutes.NOW_PLAYING
    val openNowPlaying: (TrackResponse?) -> Unit = { track ->
        nowPlayingTrack = track ?: PlaybackStateStore.state.value.track
        if (currentRoute != PlayerRoutes.NOW_PLAYING) {
            returnRoute = currentRoute
        }
        currentRoute = PlayerRoutes.NOW_PLAYING
    }
    val navigateTopLevel: (String) -> Unit = { route -> currentRoute = route }

    BackHandler(enabled = currentRoute != LibraryRoutes.LIBRARY) {
        currentRoute = if (isNowPlaying) returnRoute else LibraryRoutes.LIBRARY
    }

    AppScaffold(
        modifier = modifier,
        session = authenticated,
        title = routeTitle(currentRoute),
        currentRoute = currentRoute,
        onNavigate = navigateTopLevel,
        onOpenNowPlaying = { openNowPlaying(null) },
        onBack = if (isNowPlaying) ({ currentRoute = returnRoute }) else null,
        showNavigation = !isNowPlaying,
        isLoggingOut = sessionState.isLoggingOut,
        isNetworkAvailable = isNetworkAvailable,
        pendingPlaybackEventCount = pendingPlaybackEventCount,
        playbackEventSyncMessage = pendingPlaybackEventError,
        onRetryPlaybackEventSync = { PlaybackEventSyncWorker.enqueue(context) },
        onLogout = sessionViewModel::logout,
    ) { contentPadding ->
        val contentModifier = Modifier.padding(contentPadding)
        when (currentRoute) {
            PlaylistRoutes.PLAYLISTS -> PlaylistsRoute(
                modifier = contentModifier,
                isNetworkAvailable = isNetworkAvailable,
            )

            PlayerRoutes.NOW_PLAYING -> NowPlayingRoute(
                track = nowPlayingTrack,
                modifier = contentModifier,
                isNetworkAvailable = isNetworkAvailable,
                onBackToLibrary = { currentRoute = LibraryRoutes.LIBRARY },
            )

            ShortcutRoutes.DESTINATION_CACHED_TRACKS -> CachedTracksRoute(
                modifier = contentModifier,
                isNetworkAvailable = isNetworkAvailable,
                onBrowseLibrary = { currentRoute = LibraryRoutes.LIBRARY },
            )

            ShortcutRoutes.DESTINATION_RECOMMENDATIONS -> RecommendationHomeRoute(
                modifier = contentModifier,
                config = config,
                isNetworkAvailable = isNetworkAvailable,
            )

            else -> LibraryRoute(
                modifier = contentModifier,
                isNetworkAvailable = isNetworkAvailable,
                onOpenNowPlaying = { track -> openNowPlaying(track) },
            )
        }
    }
}

private fun routeTitle(route: String): String =
    when (route) {
        PlaylistRoutes.PLAYLISTS -> "歌单"
        PlayerRoutes.NOW_PLAYING -> "正在播放"
        ShortcutRoutes.DESTINATION_CACHED_TRACKS -> "离线缓存"
        ShortcutRoutes.DESTINATION_RECOMMENDATIONS -> "推荐"
        else -> "曲库"
    }

private fun authenticatedRouteOrLibrary(route: String): String =
    when (route) {
        LibraryRoutes.LIBRARY,
        PlaylistRoutes.PLAYLISTS,
        ShortcutRoutes.DESTINATION_CACHED_TRACKS,
        ShortcutRoutes.DESTINATION_RECOMMENDATIONS,
        ShortcutRoutes.DESTINATION_NOW_PLAYING,
        -> route

        else -> LibraryRoutes.LIBRARY
    }

@Composable
private fun SessionChecking(
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.foundation.layout.Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(16.dp),
        ) {
            BrandMark(size = 56.dp)
            CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
        }
    }
}
