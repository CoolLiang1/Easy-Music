package com.easymusic.app

import android.content.Context
import android.content.Intent

object ShortcutRoutes {
    const val ACTION_OPEN_SHORTCUT = "com.easymusic.app.action.OPEN_SHORTCUT"
    const val EXTRA_DESTINATION = "com.easymusic.app.extra.SHORTCUT_DESTINATION"

    const val DESTINATION_LIBRARY = "library"
    const val DESTINATION_RECOMMENDATIONS = "recommendations"
    const val DESTINATION_CACHED_TRACKS = "cached_tracks"
    const val DESTINATION_NOW_PLAYING = "now_playing"

    fun destinationFromIntent(intent: Intent?): String =
        routeForDestination(intent?.getStringExtra(EXTRA_DESTINATION))

    fun buildIntent(context: Context, destination: String): Intent =
        Intent(context, MainActivity::class.java)
            .setAction(ACTION_OPEN_SHORTCUT)
            .putExtra(EXTRA_DESTINATION, routeForDestination(destination))
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)

    fun routeForDestination(destination: String?): String =
        when (destination) {
            DESTINATION_LIBRARY -> DESTINATION_LIBRARY
            DESTINATION_RECOMMENDATIONS -> DESTINATION_RECOMMENDATIONS
            DESTINATION_CACHED_TRACKS -> DESTINATION_CACHED_TRACKS
            DESTINATION_NOW_PLAYING -> DESTINATION_NOW_PLAYING
            else -> DESTINATION_LIBRARY
        }
}
