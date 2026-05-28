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
import com.easymusic.app.library.LibraryRoute
import com.easymusic.app.library.LibraryRoutes
import com.easymusic.app.library.data.TagResponse
import com.easymusic.app.library.data.TrackResponse
import com.easymusic.app.player.NowPlayingRoute
import com.easymusic.app.player.PlayerRoutes

private const val CACHED_TRACKS_ROUTE = "cached_tracks"

@Composable
fun AppNavGraph(
    modifier: Modifier = Modifier,
    config: AppConfig = AppConfig.default(),
    startRoute: String = AuthRoutes.LOGIN,
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
                    currentRoute = LibraryRoutes.LIBRARY
                }
            }

            AuthSession.Unauthenticated -> currentRoute = AuthRoutes.LOGIN
            AuthSession.Checking -> Unit
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
        )

        LibraryRoutes.LIBRARY -> {
            val authenticated = session as? AuthSession.Authenticated ?: return
            AppScaffold(
                modifier = modifier,
                session = authenticated,
                isLoggingOut = sessionState.isLoggingOut,
                currentRoute = currentRoute,
                onNavigateToLibrary = { currentRoute = LibraryRoutes.LIBRARY },
                onNavigateToCachedTracks = { currentRoute = CACHED_TRACKS_ROUTE },
                pendingPlaybackEventCount = pendingPlaybackEventCount,
                playbackEventSyncMessage = pendingPlaybackEventError,
                onRetryPlaybackEventSync = { PlaybackEventSyncWorker.enqueue(context) },
                onLogout = sessionViewModel::logout,
            ) { contentPadding ->
                LibraryRoute(
                    modifier = Modifier.padding(contentPadding),
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
                onNavigateToCachedTracks = { currentRoute = CACHED_TRACKS_ROUTE },
                pendingPlaybackEventCount = pendingPlaybackEventCount,
                playbackEventSyncMessage = pendingPlaybackEventError,
                onRetryPlaybackEventSync = { PlaybackEventSyncWorker.enqueue(context) },
                onLogout = sessionViewModel::logout,
            ) { contentPadding ->
                NowPlayingRoute(
                    track = nowPlayingTrack,
                    modifier = Modifier.padding(contentPadding),
                    onBackToLibrary = { currentRoute = LibraryRoutes.LIBRARY },
                )
            }
        }

        CACHED_TRACKS_ROUTE -> {
            val authenticated = session as? AuthSession.Authenticated ?: return
            AppScaffold(
                modifier = modifier,
                session = authenticated,
                isLoggingOut = sessionState.isLoggingOut,
                currentRoute = currentRoute,
                onNavigateToLibrary = { currentRoute = LibraryRoutes.LIBRARY },
                onNavigateToCachedTracks = { currentRoute = CACHED_TRACKS_ROUTE },
                pendingPlaybackEventCount = pendingPlaybackEventCount,
                playbackEventSyncMessage = pendingPlaybackEventError,
                onRetryPlaybackEventSync = { PlaybackEventSyncWorker.enqueue(context) },
                onLogout = sessionViewModel::logout,
            ) { contentPadding ->
                CachedTracksRoute(
                    modifier = Modifier.padding(contentPadding),
                    onTrackSelected = { cachedTrack ->
                        nowPlayingTrack = cachedTrack.toTrackResponse()
                        currentRoute = PlayerRoutes.NOW_PLAYING
                    },
                )
            }
        }
    }
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
