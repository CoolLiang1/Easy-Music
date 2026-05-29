package com.easymusic.app.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.easymusic.app.auth.domain.AuthSession

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
                        if (session.isOfflineRestored) {
                            Text(
                                text = "Offline session",
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                },
                actions = {
                    if (onNavigateToLibrary != null) {
                        TextButton(
                            enabled = currentRoute != "library",
                            onClick = onNavigateToLibrary,
                        ) {
                            Text("Library")
                        }
                    }
                    if (onNavigateToCachedTracks != null) {
                        TextButton(
                            enabled = currentRoute != "cached_tracks",
                            onClick = onNavigateToCachedTracks,
                        ) {
                            Text("Cached")
                        }
                    }
                    if (onNavigateToRecommendations != null) {
                        TextButton(
                            enabled = currentRoute != "recommendations",
                            onClick = onNavigateToRecommendations,
                        ) {
                            Text("Recommend")
                        }
                    }
                    if (pendingPlaybackEventCount > 0) {
                        Text(
                            modifier = Modifier.padding(end = 8.dp),
                            text = playbackEventSyncMessage
                                ?: "$pendingPlaybackEventCount events pending",
                        )
                        if (onRetryPlaybackEventSync != null) {
                            TextButton(onClick = onRetryPlaybackEventSync) {
                                Text("Sync")
                            }
                        }
                    }
                    Text(
                        modifier = Modifier.padding(end = 8.dp),
                        text = session.currentUser.username,
                    )
                    Button(
                        modifier = Modifier.padding(end = 8.dp),
                        enabled = !isLoggingOut,
                        onClick = onLogout,
                    ) {
                        Text(if (isLoggingOut) "Signing Out" else "Sign Out")
                    }
                },
            )
        },
        content = { paddingValues ->
            Column(modifier = Modifier.padding(paddingValues)) {
                if (!isNetworkAvailable || session.isOfflineRestored) {
                    OfflineBanner(
                        text = if (!isNetworkAvailable) {
                            "Offline: library refresh, login, online playback, and new cache downloads need network. Cached Tracks still works."
                        } else {
                            "Session restored without reaching the backend. Server actions may need you to reconnect."
                        },
                    )
                }
                Box(modifier = Modifier.weight(1f)) {
                    content(PaddingValues(0.dp))
                }
            }
        },
    )
}

@Composable
private fun OfflineBanner(text: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
    ) {
        Row(modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}
