package com.easymusic.app.library

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

object LibraryRoutes {
    const val LIBRARY = "library"
}

@Composable
fun LibraryRoute(
    onOpenNowPlaying: () -> Unit,
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
            text = "Library",
            style = MaterialTheme.typography.headlineMedium,
        )
        Text(
            text = "Track list behavior will be added in a later task.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Button(
            modifier = Modifier.padding(top = 24.dp),
            onClick = onOpenNowPlaying,
        ) {
            Text("Now Playing")
        }
    }
}
