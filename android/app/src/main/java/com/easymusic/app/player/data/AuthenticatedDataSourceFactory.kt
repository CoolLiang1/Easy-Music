package com.easymusic.app.player.data

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultHttpDataSource

class AuthenticatedDataSourceFactory {
    @OptIn(UnstableApi::class)
    fun create(bearerToken: String): DataSource.Factory {
        return DefaultHttpDataSource.Factory()
            .setDefaultRequestProperties(
                mapOf("Authorization" to "Bearer $bearerToken"),
            )
    }
}
