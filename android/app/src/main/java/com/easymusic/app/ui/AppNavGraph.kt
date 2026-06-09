package com.easymusic.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import com.easymusic.app.cache.domain.CachedTrack
import com.easymusic.app.cache.sync.PlaybackEventSyncWorker
import com.easymusic.app.cache.ui.CachedTracksRoute
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.core.network.ConnectivityObserver
import com.easymusic.app.core.network.ConnectivityStatus
import com.easymusic.app.library.LibraryRoute
import com.easymusic.app.library.LibraryRoutes
import com.easymusic.app.library.data.TagResponse
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.NowPlayingRoute
import com.easymusic.app.player.PlayerRoutes
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

    when (currentRoute) {
        AuthRoutes.LOGIN -> LoginScreen(
            modifier = modifier,
            uiState = loginViewModel.uiState,
            onUsernameChange = loginViewModel::onUsernameChange,
            onPasswordChange = loginViewModel::onPasswordChange,
            onSubmit = {
                loginViewModel.submit(sessionViewModel::restoreSession)
            },
            isNetworkAvailable = isNetworkAvailable,
        )

        LibraryRoutes.LIBRARY -> {
            val authenticated = session as? AuthSession.Authenticated ?: return
            AppScaffold(
                modifier = modifier,
                session = authenticated,
                isLoggingOut = sessionState.isLoggingOut,
                currentRoute = currentRoute,
                onNavigateToLibrary = { currentRoute = LibraryRoutes.LIBRARY },
                onNavigateToCachedTracks = {
                    currentRoute = ShortcutRoutes.DESTINATION_CACHED_TRACKS
                },
                onNavigateToRecommendations = {
                    currentRoute = ShortcutRoutes.DESTINATION_RECOMMENDATIONS
                },
                isNetworkAvailable = isNetworkAvailable,
                pendingPlaybackEventCount = pendingPlaybackEventCount,
                playbackEventSyncMessage = pendingPlaybackEventError,
                onRetryPlaybackEventSync = { PlaybackEventSyncWorker.enqueue(context) },
                onLogout = sessionViewModel::logout,
            ) { contentPadding ->
                LibraryRoute(
                    modifier = Modifier.padding(contentPadding),
                    isNetworkAvailable = isNetworkAvailable,
                    onOpenNowPlaying = { track ->
                        nowPlayingTrack = track
                        currentRoute = PlayerRoutes.NOW_PLAYING
                    },
                )
            }
        }

        PlayerRoutes.NOW_PLAYING -> {
            val authenticated = session as? AuthSession.Authenticated ?: return
            AppScaffold(
                modifier = modifier,
                session = authenticated,
                isLoggingOut = sessionState.isLoggingOut,
                currentRoute = currentRoute,
                onNavigateToLibrary = { currentRoute = LibraryRoutes.LIBRARY },
                onNavigateToCachedTracks = {
                    currentRoute = ShortcutRoutes.DESTINATION_CACHED_TRACKS
                },
                onNavigateToRecommendations = {
                    currentRoute = ShortcutRoutes.DESTINATION_RECOMMENDATIONS
                },
                isNetworkAvailable = isNetworkAvailable,
                pendingPlaybackEventCount = pendingPlaybackEventCount,
                playbackEventSyncMessage = pendingPlaybackEventError,
                onRetryPlaybackEventSync = { PlaybackEventSyncWorker.enqueue(context) },
                onLogout = sessionViewModel::logout,
            ) { contentPadding ->
                NowPlayingRoute(
                    track = nowPlayingTrack,
                    modifier = Modifier.padding(contentPadding),
                    isNetworkAvailable = isNetworkAvailable,
                    onBackToLibrary = { currentRoute = LibraryRoutes.LIBRARY },
                )
            }
        }

        ShortcutRoutes.DESTINATION_CACHED_TRACKS -> {
            val authenticated = session as? AuthSession.Authenticated ?: return
            AppScaffold(
                modifier = modifier,
                session = authenticated,
                isLoggingOut = sessionState.isLoggingOut,
                currentRoute = currentRoute,
                onNavigateToLibrary = { currentRoute = LibraryRoutes.LIBRARY },
                onNavigateToCachedTracks = {
                    currentRoute = ShortcutRoutes.DESTINATION_CACHED_TRACKS
                },
                onNavigateToRecommendations = {
                    currentRoute = ShortcutRoutes.DESTINATION_RECOMMENDATIONS
                },
                isNetworkAvailable = isNetworkAvailable,
                pendingPlaybackEventCount = pendingPlaybackEventCount,
                playbackEventSyncMessage = pendingPlaybackEventError,
                onRetryPlaybackEventSync = { PlaybackEventSyncWorker.enqueue(context) },
                onLogout = sessionViewModel::logout,
            ) { contentPadding ->
                CachedTracksRoute(
                    modifier = Modifier.padding(contentPadding),
                    isNetworkAvailable = isNetworkAvailable,
                    onTrackSelected = { cachedTrack ->
                        nowPlayingTrack = cachedTrack.toTrackResponse()
                        currentRoute = PlayerRoutes.NOW_PLAYING
                    },
                )
            }
        }

        ShortcutRoutes.DESTINATION_RECOMMENDATIONS -> {
            val authenticated = session as? AuthSession.Authenticated ?: return
            AppScaffold(
                modifier = modifier,
                session = authenticated,
                isLoggingOut = sessionState.isLoggingOut,
                currentRoute = currentRoute,
                onNavigateToLibrary = { currentRoute = LibraryRoutes.LIBRARY },
                onNavigateToCachedTracks = {
                    currentRoute = ShortcutRoutes.DESTINATION_CACHED_TRACKS
                },
                onNavigateToRecommendations = {
                    currentRoute = ShortcutRoutes.DESTINATION_RECOMMENDATIONS
                },
                isNetworkAvailable = isNetworkAvailable,
                pendingPlaybackEventCount = pendingPlaybackEventCount,
                playbackEventSyncMessage = pendingPlaybackEventError,
                onRetryPlaybackEventSync = { PlaybackEventSyncWorker.enqueue(context) },
                onLogout = sessionViewModel::logout,
            ) { contentPadding ->
                RecommendationHomeRoute(
                    modifier = Modifier.padding(contentPadding),
                    config = config,
                    isNetworkAvailable = isNetworkAvailable,
                    onTrackSelected = { track ->
                        nowPlayingTrack = track
                        currentRoute = PlayerRoutes.NOW_PLAYING
                    },
                )
            }
        }
    }
}

private fun authenticatedRouteOrLibrary(route: String): String =
    when (route) {
        LibraryRoutes.LIBRARY,
        ShortcutRoutes.DESTINATION_CACHED_TRACKS,
        ShortcutRoutes.DESTINATION_RECOMMENDATIONS,
        ShortcutRoutes.DESTINATION_NOW_PLAYING,
        -> route

        else -> LibraryRoutes.LIBRARY
    }

private fun CachedTrack.toTrackResponse(): TrackResponse =
    TrackResponse(
        id = trackId,
        title = title,
        artist = artist,
        album = album,
        durationSeconds = durationSeconds,
        contentType = contentType,
        status = TrackResponse.STATUS_READY,
        liked = false,
        cooldownUntil = null,
        createdAt = cachedAt ?: sourceUpdatedAt,
        updatedAt = sourceUpdatedAt,
        tags = emptyList<TagResponse>(),
    )

@Composable
private fun SessionChecking(
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator()
    }
}
