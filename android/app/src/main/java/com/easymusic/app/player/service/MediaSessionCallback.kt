package com.easymusic.app.player.service

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession

@OptIn(UnstableApi::class)
class MediaSessionCallback(
    private val appPackageName: String,
) : MediaSession.Callback {
    override fun onConnect(
        session: MediaSession,
        controller: MediaSession.ControllerInfo,
    ): MediaSession.ConnectionResult {
        return if (
            isAllowedMediaController(
                appPackageName = appPackageName,
                controllerPackageName = controller.packageName,
                isTrusted = controller.isTrusted,
            )
        ) {
            super.onConnect(session, controller)
        } else {
            MediaSession.ConnectionResult.reject()
        }
    }
}

internal fun isAllowedMediaController(
    appPackageName: String,
    controllerPackageName: String,
    isTrusted: Boolean,
): Boolean = isTrusted || controllerPackageName == appPackageName
