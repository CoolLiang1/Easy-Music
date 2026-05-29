package com.easymusic.app.recommendation.data

import com.easymusic.app.library.data.TrackResponse
import org.json.JSONArray
import org.json.JSONObject

data class RecommendationRequest(
    val scenarioTagIds: List<Int> = emptyList(),
    val stateTagIds: List<Int> = emptyList(),
    val typeTagIds: List<Int> = emptyList(),
    val attributeTagIds: List<Int> = emptyList(),
    val excludeAttributeTagIds: List<Int> = emptyList(),
    val limit: Int = DEFAULT_LIMIT,
    val client: String = CLIENT_ANDROID,
) {
    fun toJson(): String = JSONObject()
        .put("scenario_tag_ids", scenarioTagIds.toJsonArray())
        .put("state_tag_ids", stateTagIds.toJsonArray())
        .put("type_tag_ids", typeTagIds.toJsonArray())
        .put("attribute_tag_ids", attributeTagIds.toJsonArray())
        .put("exclude_attribute_tag_ids", excludeAttributeTagIds.toJsonArray())
        .put("limit", limit)
        .put("client", client)
        .toString()

    companion object {
        const val DEFAULT_LIMIT = 3
        const val CLIENT_ANDROID = "android"
    }
}

data class RecommendationResponse(
    val requestId: String,
    val results: List<RecommendationResult>,
) {
    companion object {
        fun fromJson(json: JSONObject): RecommendationResponse {
            val resultsJson = json.getJSONArray("results")
            val results = buildList {
                for (index in 0 until resultsJson.length()) {
                    add(RecommendationResult.fromJson(resultsJson.getJSONObject(index)))
                }
            }

            return RecommendationResponse(
                requestId = json.getString("request_id"),
                results = results,
            )
        }
    }
}

data class RecommendationResult(
    val rank: Int,
    val score: Double,
    val reason: String,
    val track: TrackResponse,
) {
    companion object {
        fun fromJson(json: JSONObject): RecommendationResult =
            RecommendationResult(
                rank = json.getInt("rank"),
                score = json.getDouble("score"),
                reason = json.getString("reason"),
                track = TrackResponse.fromJson(json.getJSONObject("track")),
            )
    }
}

internal fun List<Int>.toJsonArray(): JSONArray =
    JSONArray().also { array ->
        forEach { array.put(it) }
    }
