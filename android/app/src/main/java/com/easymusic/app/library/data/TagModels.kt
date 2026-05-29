package com.easymusic.app.library.data

import org.json.JSONObject

data class TagResponse(
    val id: Int,
    val name: String,
    val group: String,
    val createdAt: String,
) {
    companion object {
        fun fromJson(json: JSONObject): TagResponse = TagResponse(
            id = json.getInt("id"),
            name = json.getString("name"),
            group = json.getString("group"),
            createdAt = json.getString("created_at"),
        )
    }
}
