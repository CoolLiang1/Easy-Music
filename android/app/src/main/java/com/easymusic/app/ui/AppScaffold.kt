package com.easymusic.app.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
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
                    Text("Easy Music")
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
        content = content,
    )
}
