package com.easymusic.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
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
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.ApiClient
import com.easymusic.app.library.LibraryRoute
import com.easymusic.app.library.LibraryRoutes
import com.easymusic.app.player.NowPlayingRoute
import com.easymusic.app.player.PlayerRoutes

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
    val session by authRepository.session.collectAsState(initial = AuthSession.Checking)
    var currentRoute by rememberSaveable { mutableStateOf(startRoute) }

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
                loginViewModel.submit {
                    currentRoute = LibraryRoutes.LIBRARY
                }
            },
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
