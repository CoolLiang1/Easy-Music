package com.easymusic.app.core.config

import com.easymusic.app.BuildConfig

data class AppConfig(
    val apiBaseUrl: String,
) {
    companion object {
        const val EMULATOR_HOST_BASE_URL = "http://10.0.2.2:8000"
        const val ADB_REVERSE_BASE_URL = "http://127.0.0.1:8000"

        private fun configuredBaseUrl(): String =
            BuildConfig.EASY_MUSIC_API_BASE_URL.takeIf { it.isNotBlank() }
                ?: EMULATOR_HOST_BASE_URL

        fun default(): AppConfig = AppConfig(
            apiBaseUrl = configuredBaseUrl(),
        )
    }
}
