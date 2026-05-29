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
) {
    companion object {
        fun fromJson(json: JSONObject): TokenResponse = TokenResponse(
            accessToken = json.getString("access_token"),
            tokenType = json.optString("token_type", "bearer"),
        )
    }
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
