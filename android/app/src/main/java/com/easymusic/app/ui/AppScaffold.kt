package com.easymusic.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.DownloadDone
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.easymusic.app.ShortcutRoutes
import com.easymusic.app.auth.domain.AuthSession
import com.easymusic.app.library.LibraryRoutes
import com.easymusic.app.player.domain.PlaybackStateStore
import com.easymusic.app.player.domain.PlayerController
import com.easymusic.app.player.ui.MiniPlayer
import com.easymusic.app.playlist.PlaylistRoutes
import com.easymusic.app.ui.components.Banner
import com.easymusic.app.ui.components.BannerTone
import kotlinx.coroutines.launch

/** Lets any screen show a short message without owning a SnackbarHostState. */
val LocalShowMessage = staticCompositionLocalOf<(String) -> Unit> { {} }

private data class TopLevelDestination(
    val route: String,
    val label: String,
    val icon: ImageVector,
)

private val topLevelDestinations = listOf(
    TopLevelDestination(LibraryRoutes.LIBRARY, "曲库", Icons.Default.LibraryMusic),
    TopLevelDestination(PlaylistRoutes.PLAYLISTS, "歌单", Icons.AutoMirrored.Filled.QueueMusic),
    TopLevelDestination(ShortcutRoutes.DESTINATION_RECOMMENDATIONS, "推荐", Icons.Outlined.AutoAwesome),
    TopLevelDestination(ShortcutRoutes.DESTINATION_CACHED_TRACKS, "离线", Icons.Default.DownloadDone),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppScaffold(
    session: AuthSession.Authenticated,
    title: String,
    currentRoute: String,
    onNavigate: (String) -> Unit,
    onOpenNowPlaying: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
    isLoggingOut: Boolean = false,
    onBack: (() -> Unit)? = null,
    showNavigation: Boolean = true,
    isNetworkAvailable: Boolean = true,
    pendingPlaybackEventCount: Int = 0,
    playbackEventSyncMessage: String? = null,
    onRetryPlaybackEventSync: (() -> Unit)? = null,
    content: @Composable (PaddingValues) -> Unit,
) {
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val showMessage: (String) -> Unit = { message ->
        scope.launch {
            snackbarHostState.currentSnackbarData?.dismiss()
            snackbarHostState.showSnackbar(message)
        }
    }
    var isAccountMenuOpen by remember { mutableStateOf(false) }
    var showLogoutConfirm by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val playerController = remember(context) { PlayerController(context) }
    val playerState by PlaybackStateStore.state.collectAsState()

    CompositionLocalProvider(LocalShowMessage provides showMessage) {
        Scaffold(
            modifier = modifier,
            snackbarHost = { SnackbarHost(snackbarHostState) },
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.background,
                    ),
                    navigationIcon = {
                        if (onBack != null) {
                            IconButton(onClick = onBack) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                            }
                        } else {
                            BrandMark(modifier = Modifier.padding(start = 14.dp, end = 4.dp))
                        }
                    },
                    title = { Text(title, style = MaterialTheme.typography.titleLarge) },
                    actions = {
                        if (pendingPlaybackEventCount > 0) {
                            IconButton(
                                onClick = {
                                    onRetryPlaybackEventSync?.invoke()
                                    showMessage(
                                        playbackEventSyncMessage
                                            ?: "正在同步 $pendingPlaybackEventCount 条离线播放记录",
                                    )
                                },
                            ) {
                                BadgedBox(badge = { Badge { Text(pendingPlaybackEventCount.toString()) } }) {
                                    Icon(Icons.Default.CloudSync, contentDescription = "离线播放记录待同步")
                                }
                            }
                        }
                        Box {
                            IconButton(onClick = { isAccountMenuOpen = true }) {
                                Icon(Icons.Default.AccountCircle, contentDescription = "账号")
                            }
                            DropdownMenu(
                                expanded = isAccountMenuOpen,
                                onDismissRequest = { isAccountMenuOpen = false },
                            ) {
                                DropdownMenuItem(
                                    enabled = false,
                                    text = {
                                        Column {
                                            Text(
                                                session.currentUser.username,
                                                style = MaterialTheme.typography.titleSmall,
                                                color = MaterialTheme.colorScheme.onSurface,
                                            )
                                            Text(
                                                if (session.isOfflineRestored) "离线会话" else "已登录",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    },
                                    onClick = {},
                                )
                                HorizontalDivider()
                                DropdownMenuItem(
                                    enabled = !isLoggingOut,
                                    leadingIcon = { Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null) },
                                    text = { Text(if (isLoggingOut) "正在退出…" else "退出登录") },
                                    onClick = {
                                        isAccountMenuOpen = false
                                        showLogoutConfirm = true
                                    },
                                )
                            }
                        }
                    },
                )
            },
            bottomBar = {
                Column {
                    if (currentRoute != ShortcutRoutes.DESTINATION_NOW_PLAYING) {
                        MiniPlayer(
                            uiState = playerState,
                            onOpenNowPlaying = onOpenNowPlaying,
                            onPlay = playerController::resume,
                            onPause = playerController::pause,
                            onNext = playerController::next,
                            onTick = playerController::updatePosition,
                        )
                    }
                    if (showNavigation) {
                        NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
                            topLevelDestinations.forEach { destination ->
                                NavigationBarItem(
                                    selected = currentRoute == destination.route,
                                    onClick = { onNavigate(destination.route) },
                                    icon = { Icon(destination.icon, contentDescription = null) },
                                    label = { Text(destination.label) },
                                    colors = NavigationBarItemDefaults.colors(
                                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                    ),
                                )
                            }
                        }
                    }
                }
            },
        ) { paddingValues ->
            Column(modifier = Modifier.padding(paddingValues)) {
                if (!isNetworkAvailable || session.isOfflineRestored) {
                    Banner(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                        tone = if (!isNetworkAvailable) BannerTone.Warning else BannerTone.Info,
                        text = if (!isNetworkAvailable) {
                            "当前离线：只能播放已缓存的音轨，刷新和在线播放需要网络。"
                        } else {
                            "会话是在离线时恢复的，联网后服务器操作才能使用。"
                        },
                    )
                }
                Box(modifier = Modifier.weight(1f)) {
                    content(PaddingValues(0.dp))
                }
            }
        }
    }

    if (showLogoutConfirm) {
        AlertDialog(
            onDismissRequest = { showLogoutConfirm = false },
            title = { Text("退出登录？") },
            text = { Text("已缓存的音轨会保留在这台设备上，下次登录后仍可播放。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLogoutConfirm = false
                        onLogout()
                    },
                ) { Text("退出登录") }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutConfirm = false }) { Text("取消") }
            },
        )
    }
}

/** Small ink tile with a note, echoing the launcher icon. */
@Composable
fun BrandMark(
    modifier: Modifier = Modifier,
    size: androidx.compose.ui.unit.Dp = 30.dp,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.28f))
            .background(com.easymusic.app.ui.theme.EasyMusicThemeTokens.colors.deck),
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Default.MusicNote,
            contentDescription = null,
            tint = com.easymusic.app.ui.theme.EasyMusicThemeTokens.colors.signal,
            modifier = Modifier.size(size * 0.6f),
        )
    }
}
