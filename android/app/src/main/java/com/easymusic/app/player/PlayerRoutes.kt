package com.easymusic.app.player

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

object PlayerRoutes {
    const val NOW_PLAYING = "now_playing"
}

@Composable
fun NowPlayingRoute(
    onBackToLibrary: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Now Playing",
            style = MaterialTheme.typography.headlineMedium,
        )
        Text(
            text = "Playback behavior will be added in a later task.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Button(
            modifier = Modifier.padding(top = 24.dp),
            onClick = onBackToLibrary,
        ) {
            Text("Back to Library")
        }
    }
}
