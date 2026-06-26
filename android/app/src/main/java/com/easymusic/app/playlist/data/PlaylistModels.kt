package com.easymusic.app.playlist.data

import com.easymusic.app.library.data.TrackResponse
import org.json.JSONObject

data class PlaylistSummaryResponse(
    val id: Int,
    val name: String,
    val trackCount: Int,
    val createdAt: String,
    val updatedAt: String,
) {
    companion object {
        fun fromJson(json: JSONObject): PlaylistSummaryResponse =
            PlaylistSummaryResponse(
                id = json.getInt("id"),
                name = json.getString("name"),
                trackCount = json.getInt("track_count"),
                createdAt = json.getString("created_at"),
                updatedAt = json.getString("updated_at"),
            )
    }
}

data class PlaylistTrackResponse(
    val position: Int,
    val addedAt: String,
    val track: TrackResponse,
) {
    companion object {
        fun fromJson(json: JSONObject): PlaylistTrackResponse =
            PlaylistTrackResponse(
                position = json.getInt("position"),
                addedAt = json.getString("added_at"),
                track = TrackResponse.fromJson(json.getJSONObject("track")),
            )
    }
}

data class PlaylistResponse(
    val id: Int,
    val name: String,
    val trackCount: Int,
    val tracks: List<PlaylistTrackResponse>,
    val createdAt: String,
    val updatedAt: String,
) {
    companion object {
        fun fromJson(json: JSONObject): PlaylistResponse {
            val tracksJson = json.getJSONArray("tracks")
            val tracks = buildList {
                for (index in 0 until tracksJson.length()) {
                    add(PlaylistTrackResponse.fromJson(tracksJson.getJSONObject(index)))
                }
            }

            return PlaylistResponse(
                id = json.getInt("id"),
                name = json.getString("name"),
                trackCount = json.getInt("track_count"),
                tracks = tracks,
                createdAt = json.getString("created_at"),
                updatedAt = json.getString("updated_at"),
            )
        }
    }
}
