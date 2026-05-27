package com.easymusic.app.library.data

import org.json.JSONObject

data class TrackResponse(
    val id: Int,
    val title: String,
    val artist: String?,
    val album: String?,
    val durationSeconds: Int?,
    val contentType: String,
    val status: String,
    val liked: Boolean,
    val cooldownUntil: String?,
    val createdAt: String,
    val updatedAt: String,
    val tags: List<TagResponse>,
) {
    val isReady: Boolean
        get() = status == STATUS_READY

    companion object {
        const val STATUS_READY = "ready"

        fun fromJson(json: JSONObject): TrackResponse {
            val tagsJson = json.getJSONArray("tags")
            val tags = buildList {
                for (index in 0 until tagsJson.length()) {
                    add(TagResponse.fromJson(tagsJson.getJSONObject(index)))
                }
            }

            return TrackResponse(
                id = json.getInt("id"),
                title = json.getString("title"),
                artist = json.optionalString("artist"),
                album = json.optionalString("album"),
                durationSeconds = json.optionalInt("duration_seconds"),
                contentType = json.getString("content_type"),
                status = json.getString("status"),
                liked = json.getBoolean("liked"),
                cooldownUntil = json.optionalString("cooldown_until"),
                createdAt = json.getString("created_at"),
                updatedAt = json.getString("updated_at"),
                tags = tags,
            )
        }
    }
}

internal fun JSONObject.optionalString(name: String): String? =
    if (isNull(name)) null else getString(name)

internal fun JSONObject.optionalInt(name: String): Int? =
    if (isNull(name)) null else getInt(name)
