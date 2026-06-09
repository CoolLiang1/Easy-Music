package com.easymusic.app.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DownloadDone
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.easymusic.app.auth.domain.AuthSession
import com.easymusic.app.library.LibraryRoutes
import com.easymusic.app.ShortcutRoutes
import com.easymusic.app.ui.theme.BannerTone
import com.easymusic.app.ui.theme.StatusBanner

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppScaffold(
    session: AuthSession.Authenticated,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
    isLoggingOut: Boolean = false,
    currentRoute: String? = null,
    onNavigateToLibrary: (() -> Unit)? = null,
    onNavigateToCachedTracks: (() -> Unit)? = null,
    onNavigateToRecommendations: (() -> Unit)? = null,
    isNetworkAvailable: Boolean = true,
    pendingPlaybackEventCount: Int = 0,
    playbackEventSyncMessage: String? = null,
    onRetryPlaybackEventSync: (() -> Unit)? = null,
    content: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Easy Music")
                        Text(
                            text = if (session.isOfflineRestored) {
                                "Offline session"
                            } else {
                                session.currentUser.username
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    if (pendingPlaybackEventCount > 0) {
                        Text(
                            modifier = Modifier.padding(end = 8.dp),
                            text = playbackEventSyncMessage
                                ?: "$pendingPlaybackEventCount events pending",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (onRetryPlaybackEventSync != null) {
                            IconButton(onClick = onRetryPlaybackEventSync) {
                                Icon(
                                    imageVector = Icons.Default.Sync,
                                    contentDescription = "Retry playback event sync",
                                )
                            }
                        }
                    }
                    IconButton(
                        modifier = Modifier.padding(end = 8.dp),
                        enabled = !isLoggingOut,
                        onClick = onLogout,
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Logout,
                            contentDescription = if (isLoggingOut) "Signing out" else "Sign out",
                        )
                    }
                },
            )
        },
        bottomBar = {
            if (
                onNavigateToLibrary != null ||
                onNavigateToCachedTracks != null ||
                onNavigateToRecommendations != null
            ) {
                NavigationBar {
                    onNavigateToLibrary?.let {
                        NavigationBarItem(
                            selected = currentRoute == LibraryRoutes.LIBRARY,
                            onClick = it,
                            icon = {
                                Icon(
                                    imageVector = Icons.Default.LibraryMusic,
                                    contentDescription = null,
                                )
                            },
                            label = { Text("Library") },
                        )
                    }
                    onNavigateToCachedTracks?.let {
                        NavigationBarItem(
                            selected = currentRoute == ShortcutRoutes.DESTINATION_CACHED_TRACKS,
                            onClick = it,
                            icon = {
                                Icon(
                                    imageVector = Icons.Default.DownloadDone,
                                    contentDescription = null,
                                )
                            },
                            label = { Text("Cached") },
                        )
                    }
                    onNavigateToRecommendations?.let {
                        NavigationBarItem(
                            selected = currentRoute == ShortcutRoutes.DESTINATION_RECOMMENDATIONS,
                            onClick = it,
                            icon = {
                                Icon(
                                    imageVector = Icons.Default.Psychology,
                                    contentDescription = null,
                                )
                            },
                            label = { Text("Recommend") },
                        )
                    }
                }
            }
        },
        content = { paddingValues ->
            Column(modifier = Modifier.padding(paddingValues)) {
                if (!isNetworkAvailable || session.isOfflineRestored) {
                    StatusBanner(
                        text = if (!isNetworkAvailable) {
                            "Offline: library refresh, login, online playback, and new cache downloads need network. Cached Tracks still works."
                        } else {
                            "Session restored without reaching the backend. Server actions may need you to reconnect."
                        },
                        tone = if (!isNetworkAvailable) BannerTone.Warning else BannerTone.Neutral,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
                Box(modifier = Modifier.weight(1f)) {
                    content(PaddingValues(0.dp))
                }
            }
        },
    )
}
