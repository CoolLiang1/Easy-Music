package com.easymusic.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.easymusic.app.ui.EasyMusicApp

class MainActivity : ComponentActivity() {
    private var shortcutStartRoute by mutableStateOf(ShortcutRoutes.DESTINATION_LIBRARY)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        shortcutStartRoute = ShortcutRoutes.destinationFromIntent(intent)

        setContent {
            EasyMusicApp(startRoute = shortcutStartRoute)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        shortcutStartRoute = ShortcutRoutes.destinationFromIntent(intent)
    }
}
