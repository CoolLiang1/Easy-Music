package com.easymusic.app.auth.data

import org.json.JSONObject

data class LoginRequest(
    val username: String,
    val password: String,
) {
    fun toJson(): String = JSONObject()
        .put("username", username)
        .put("password", password)
        .toString()
}

data class TokenResponse(
    val accessToken: String,
    val tokenType: String,
    val refreshToken: String,
) {
    companion object {
        fun fromJson(json: JSONObject): TokenResponse = TokenResponse(
            accessToken = json.getString("access_token"),
            tokenType = json.optString("token_type", "bearer"),
            refreshToken = json.getString("refresh_token"),
        )
    }
}

data class RefreshTokenRequest(
    val refreshToken: String,
) {
    fun toJson(): String = JSONObject()
        .put("refresh_token", refreshToken)
        .toString()
}

data class CurrentUserResponse(
    val id: Int,
    val username: String,
    val createdAt: String,
) {
    companion object {
        fun fromJson(json: JSONObject): CurrentUserResponse = CurrentUserResponse(
            id = json.getInt("id"),
            username = json.getString("username"),
            createdAt = json.getString("created_at"),
        )
    }
}
