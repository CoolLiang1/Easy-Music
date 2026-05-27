package com.easymusic.app.core.network

import com.easymusic.app.core.config.AppConfig

class ApiClient(
    val config: AppConfig,
) {
    val baseUrl: String = config.apiBaseUrl.trimEnd('/')
}
