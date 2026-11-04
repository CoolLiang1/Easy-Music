package com.easymusic.app

import android.app.Application
import com.easymusic.app.auth.data.AuthApi
import com.easymusic.app.auth.data.AuthTokenStore
import com.easymusic.app.auth.domain.AuthTokenRefresher
import com.easymusic.app.core.config.AppConfig
import com.easymusic.app.core.network.AccessTokenRenewal
import com.easymusic.app.core.network.ApiClient

class EasyMusicApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // One renewer for the whole process: UI, playback service, and workers.
        AccessTokenRenewal.renewer = AuthTokenRefresher(
            tokenStore = AuthTokenStore(this),
            refreshTokens = AuthApi(ApiClient(AppConfig.default()))::refresh,
        )
    }
}
