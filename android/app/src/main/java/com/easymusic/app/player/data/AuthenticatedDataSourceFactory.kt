package com.easymusic.app.player.data

import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultHttpDataSource

class AuthenticatedDataSourceFactory {
    fun create(bearerToken: String): DataSource.Factory {
        return DefaultHttpDataSource.Factory()
            .setDefaultRequestProperties(
                mapOf("Authorization" to "Bearer $bearerToken"),
            )
    }
}
