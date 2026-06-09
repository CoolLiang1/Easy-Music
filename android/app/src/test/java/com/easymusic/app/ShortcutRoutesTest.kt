package com.easymusic.app

import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ShortcutRoutesTest {
    @Test
    fun buildIntentCreatesMainActivityShortcutIntent() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()

        val intent = ShortcutRoutes.buildIntent(
            context,
            ShortcutRoutes.DESTINATION_RECOMMENDATIONS,
        )

        assertEquals(ShortcutRoutes.ACTION_OPEN_SHORTCUT, intent.action)
        assertEquals(
            ShortcutRoutes.DESTINATION_RECOMMENDATIONS,
            intent.getStringExtra(ShortcutRoutes.EXTRA_DESTINATION),
        )
        assertEquals(
            "com.easymusic.app.MainActivity",
            intent.component?.className,
        )
        assertTrue((intent.flags and Intent.FLAG_ACTIVITY_CLEAR_TOP) != 0)
        assertTrue((intent.flags and Intent.FLAG_ACTIVITY_SINGLE_TOP) != 0)
    }

    @Test
    fun destinationFromIntentFallsBackToLibraryForUnknownDestination() {
        val intent = Intent(ShortcutRoutes.ACTION_OPEN_SHORTCUT)
            .putExtra(ShortcutRoutes.EXTRA_DESTINATION, "unsupported")

        assertEquals(
            ShortcutRoutes.DESTINATION_LIBRARY,
            ShortcutRoutes.destinationFromIntent(intent),
        )
    }

    @Test
    fun destinationFromIntentReadsSupportedDestinations() {
        val destinations = listOf(
            ShortcutRoutes.DESTINATION_LIBRARY,
            ShortcutRoutes.DESTINATION_RECOMMENDATIONS,
            ShortcutRoutes.DESTINATION_CACHED_TRACKS,
            ShortcutRoutes.DESTINATION_NOW_PLAYING,
        )

        for (destination in destinations) {
            val intent = Intent(ShortcutRoutes.ACTION_OPEN_SHORTCUT)
                .putExtra(ShortcutRoutes.EXTRA_DESTINATION, destination)

            assertEquals(destination, ShortcutRoutes.destinationFromIntent(intent))
        }
    }
}
