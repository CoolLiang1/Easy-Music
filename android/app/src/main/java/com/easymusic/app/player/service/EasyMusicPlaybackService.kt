package com.easymusic.app.player.service

import android.content.Intent
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

@OptIn(UnstableApi::class)
class EasyMusicPlaybackService : MediaSessionService() {
    override fun onCreate() {
        super.onCreate()
        setMediaNotificationProvider(PlaybackNotificationConfig.provider(this))
        setShowNotificationForIdlePlayer(SHOW_NOTIFICATION_FOR_IDLE_PLAYER_NEVER)
        MediaSessionConnector.session(this)
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int {
        val result = super.onStartCommand(intent, flags, startId)
        MediaSessionConnector.currentSession()?.let { session ->
            onUpdateNotification(session, true)
        }
        return result
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession {
        return MediaSessionConnector.session(this)
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (MediaSessionConnector.releaseIfNoPlaybackSessionNeeded()) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        MediaSessionConnector.release()
        super.onDestroy()
    }
}
