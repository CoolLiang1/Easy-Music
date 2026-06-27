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
        playbackSession()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession {
        return playbackSession()
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

    private fun playbackSession(): MediaSession {
        val session = MediaSessionConnector.session(this)
        if (!isSessionAdded(session)) {
            addSession(session)
        }
        return session
    }
}
