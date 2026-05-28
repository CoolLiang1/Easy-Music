package com.easymusic.app.player.service

import android.content.Intent
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class EasyMusicPlaybackService : MediaSessionService() {
    override fun onCreate() {
        super.onCreate()
        MediaSessionConnector.session(this)
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
