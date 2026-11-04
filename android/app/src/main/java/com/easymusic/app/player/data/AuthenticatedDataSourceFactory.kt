package com.easymusic.app.player.data

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import com.easymusic.app.core.network.AccessTokenRenewal

class AuthenticatedDataSourceFactory {
    /**
     * Adds the bearer header each time a stream is opened (on Media3's loading
     * thread), renewing the access token first when it is about to expire, so
     * long listening sessions keep working after the token lifetime passes.
     */
    @OptIn(UnstableApi::class)
    fun create(bearerToken: String): DataSource.Factory {
        return ResolvingDataSource.Factory(DefaultHttpDataSource.Factory()) { dataSpec ->
            val token = AccessTokenRenewal.renewer?.currentValidAccessToken() ?: bearerToken
            dataSpec.withAdditionalHeaders(mapOf("Authorization" to "Bearer $token"))
        }
    }
}
