package com.easymusic.app.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.ApiClient

@Composable
fun EasyMusicApp(
    config: AppConfig = AppConfig.default(),
) {
    val apiClient = ApiClient(config)

    MaterialTheme {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background,
        ) {
            AppNavGraph()
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun EasyMusicAppPreview() {
    EasyMusicApp()
}
