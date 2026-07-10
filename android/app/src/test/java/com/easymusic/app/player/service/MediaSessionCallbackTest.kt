package com.easymusic.app.player.service

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaSessionCallbackTest {
    @Test
    fun `allows controller from the application package`() {
        assertTrue(
            isAllowedMediaController(
                appPackageName = "com.easymusic.app",
                controllerPackageName = "com.easymusic.app",
                isTrusted = false,
            ),
        )
    }

    @Test
    fun `allows a trusted system controller`() {
        assertTrue(
            isAllowedMediaController(
                appPackageName = "com.easymusic.app",
                controllerPackageName = "com.android.systemui",
                isTrusted = true,
            ),
        )
    }

    @Test
    fun `rejects an untrusted third party controller`() {
        assertFalse(
            isAllowedMediaController(
                appPackageName = "com.easymusic.app",
                controllerPackageName = "example.untrusted.controller",
                isTrusted = false,
            ),
        )
    }
}
