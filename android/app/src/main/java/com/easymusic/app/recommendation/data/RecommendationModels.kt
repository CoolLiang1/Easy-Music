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
    val rawText: String? = null,
    val cooldownMode: RecommendationCooldownMode? = null,
    val limit: Int = DEFAULT_LIMIT,
    val client: String = CLIENT_ANDROID,
) {
    fun toJson(): String = JSONObject()
        .put("scenario_tag_ids", scenarioTagIds.toJsonArray())
        .put("state_tag_ids", stateTagIds.toJsonArray())
        .put("type_tag_ids", typeTagIds.toJsonArray())
        .put("attribute_tag_ids", attributeTagIds.toJsonArray())
        .put("exclude_attribute_tag_ids", excludeAttributeTagIds.toJsonArray())
        .apply {
            rawText?.let { put("raw_text", it) }
            cooldownMode?.let { put("cooldown_mode", it.value) }
        }
        .put("limit", limit)
        .put("client", client)
        .toString()

    companion object {
        const val DEFAULT_LIMIT = 3
        const val CLIENT_ANDROID = "android"
    }
}

enum class RecommendationCooldownMode(val value: String) {
    Off("off"),
    Soft("soft"),
    Strict("strict");

    companion object {
        fun fromValueOrNull(value: String): RecommendationCooldownMode? =
            values().firstOrNull { it.value == value }
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
    val explanation: RecommendationExplanation? = null,
    val track: TrackResponse,
) {
    companion object {
        fun fromJson(json: JSONObject): RecommendationResult =
            RecommendationResult(
                rank = json.getInt("rank"),
                score = json.getDouble("score"),
                reason = json.getString("reason"),
                explanation = json.optJSONObject("explanation")?.let {
                    RecommendationExplanation.fromJson(it)
                },
                track = TrackResponse.fromJson(json.getJSONObject("track")),
            )
    }
}

data class RecommendationExplanation(
    val matchedTags: Map<String, List<RecommendationExplanationTag>>,
    val boosts: List<RecommendationExplanationPart>,
    val penalties: List<RecommendationExplanationPart>,
    val feedbackImpacts: List<RecommendationExplanationPart>,
    val avoidanceReasons: List<RecommendationExplanationPart>,
) {
    companion object {
        fun fromJson(json: JSONObject): RecommendationExplanation =
            RecommendationExplanation(
                matchedTags = json.optJSONObject("matched_tags").toMatchedTags(),
                boosts = json.optJSONArray("boosts").toExplanationParts(),
                penalties = json.optJSONArray("penalties").toExplanationParts(),
                feedbackImpacts = json.optJSONArray("feedback_impacts").toExplanationParts(),
                avoidanceReasons = json.optJSONArray("avoidance_reasons").toExplanationParts(),
            )
    }
}

data class RecommendationExplanationTag(
    val id: Int,
    val name: String,
    val group: String,
) {
    companion object {
        fun fromJson(json: JSONObject): RecommendationExplanationTag =
            RecommendationExplanationTag(
                id = json.getInt("id"),
                name = json.getString("name"),
                group = json.getString("group"),
            )
    }
}

data class RecommendationExplanationPart(
    val label: String,
    val scoreDelta: Double?,
) {
    companion object {
        fun fromJson(json: JSONObject): RecommendationExplanationPart =
            RecommendationExplanationPart(
                label = json.getString("label"),
                scoreDelta = if (json.isNull("score_delta")) {
                    null
                } else {
                    json.getDouble("score_delta")
                },
            )
    }
}

internal fun List<Int>.toJsonArray(): JSONArray =
    JSONArray().also { array ->
        forEach { array.put(it) }
    }

private fun JSONObject?.toMatchedTags(): Map<String, List<RecommendationExplanationTag>> {
    if (this == null) {
        return emptyMap()
    }

    val result = linkedMapOf<String, List<RecommendationExplanationTag>>()
    val keys = keys()
    while (keys.hasNext()) {
        val key = keys.next()
        result[key] = optJSONArray(key).toExplanationTags()
    }
    return result
}

private fun JSONArray?.toExplanationTags(): List<RecommendationExplanationTag> {
    if (this == null) {
        return emptyList()
    }

    return buildList {
        for (index in 0 until length()) {
            add(RecommendationExplanationTag.fromJson(getJSONObject(index)))
        }
    }
}

private fun JSONArray?.toExplanationParts(): List<RecommendationExplanationPart> {
    if (this == null) {
        return emptyList()
    }

    return buildList {
        for (index in 0 until length()) {
            add(RecommendationExplanationPart.fromJson(getJSONObject(index)))
        }
    }
}
