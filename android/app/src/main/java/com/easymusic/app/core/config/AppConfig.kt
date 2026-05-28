package com.easymusic.app.core.config

data class AppConfig(
    val apiBaseUrl: String,
) {
    companion object {
        const val EMULATOR_HOST_BASE_URL = "http://10.0.2.2:8000"
        const val ADB_REVERSE_BASE_URL = "http://127.0.0.1:8000"

        fun default(): AppConfig = AppConfig(
            apiBaseUrl = EMULATOR_HOST_BASE_URL,
        )
    }
}
